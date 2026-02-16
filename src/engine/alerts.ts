import { differenceInHours, subDays } from 'date-fns';
import type { FeedRecord, Alert, TwinsSyncStatus, BabyName } from '../types';
import { PROFILES, SYNC_THRESHOLDS, getSlotId } from '../data/knowledge';
import { computeSlotVolume } from './predictor';

export function generateAlerts(
  feeds: FeedRecord[],
  syncStatus: TwinsSyncStatus | null,
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date();

  for (const baby of ['colette', 'isaure'] as BabyName[]) {
    const profile = PROFILES[baby];
    const babyFeeds = feeds
      .filter((f) => f.baby === baby)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (babyFeeds.length === 0) continue;

    const lastFeed = babyFeeds[babyFeeds.length - 1];
    const hoursSinceLastFeed = differenceInHours(now, lastFeed.timestamp);

    // Skip real-time alerts when data is stale (no active tracking).
    // No manual entry ≠ baby hasn't eaten — we just don't have fresh data.
    // Beyond p90 interval, assume baby ate normally and stay on projections.
    if (hoursSinceLastFeed >= profile.stats.p90H) continue;

    // --- SMALL FEED ---
    // Uses data-driven slot volume (same as predictor) for accurate comparison
    if (lastFeed.type === 'bottle' && lastFeed.volumeMl > 0) {
      const lastSlotId = getSlotId(lastFeed.timestamp.getHours());
      const slotVol = computeSlotVolume(lastSlotId, baby, feeds, now);
      const ratio = lastFeed.volumeMl / slotVol.meanMl;
      if (ratio < 0.5) {
        alerts.push({
          id: `very-small-${baby}-${lastFeed.id}`,
          type: 'VERY_SMALL_FEED',
          severity: 'warning',
          baby,
          message: `${profile.name} n'a pris que ${lastFeed.volumeMl}ml (moyenne : ${slotVol.meanMl}ml). Surveillez le prochain repas.`,
          actionSuggested: 'Proposer un complément dans 1-2h si elle réclame.',
          timestamp: now,
          dismissed: false,
        });
      } else if (ratio < 0.7) {
        alerts.push({
          id: `small-${baby}-${lastFeed.id}`,
          type: 'SMALL_FEED',
          severity: 'info',
          baby,
          message: `${profile.name} a mangé un peu moins que d'habitude (${lastFeed.volumeMl}ml vs ~${slotVol.meanMl}ml).`,
          timestamp: now,
          dismissed: false,
        });
      }
    }

    // --- GROWTH SPURT ---
    // Thresholds kept in sync with patterns.ts GROWTH detection
    const feeds48h = babyFeeds.filter(
      (f) => f.type === 'bottle' && f.volumeMl > 0 && differenceInHours(now, f.timestamp) <= 48,
    );
    const feeds14d = babyFeeds.filter(
      (f) => f.type === 'bottle' && f.volumeMl > 0 && f.timestamp >= subDays(now, 14),
    );

    if (feeds48h.length >= 4 && feeds14d.length >= 10) {
      const avg48 = feeds48h.reduce((s, f) => s + f.volumeMl, 0) / feeds48h.length;
      const avg14 = feeds14d.reduce((s, f) => s + f.volumeMl, 0) / feeds14d.length;

      if (avg48 > avg14 * 1.25) {
        alerts.push({
          id: `growth-${baby}`,
          type: 'GROWTH_SPURT',
          severity: 'info',
          baby,
          message: `${profile.name} mange ~${Math.round(avg48)}ml en moyenne (vs ${Math.round(avg14)}ml habituels). Possible pic de croissance.`,
          timestamp: now,
          dismissed: false,
        });
      } else if (avg48 < avg14 * 0.75) {
        alerts.push({
          id: `appetite-drop-${baby}`,
          type: 'APPETITE_DROP',
          severity: 'warning',
          baby,
          message: `${profile.name} mange moins que d'habitude (~${Math.round(avg48)}ml vs ${Math.round(avg14)}ml). À surveiller si ça persiste.`,
          timestamp: now,
          dismissed: false,
        });
      }
    }
  }

  // --- TWINS DESYNC ---
  if (syncStatus && syncStatus.gapMinutes > SYNC_THRESHOLDS.desyncAlert) {
    alerts.push({
      id: 'twins-desync',
      type: 'TWINS_DESYNC',
      severity: 'info',
      message: `Les jumelles sont décalées de ${Math.round(syncStatus.gapMinutes)} minutes. ${syncStatus.suggestion ?? ''}`,
      timestamp: now,
      dismissed: false,
    });
  }

  return alerts;
}
