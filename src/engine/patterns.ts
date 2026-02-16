import { differenceInMinutes, differenceInHours, subDays } from 'date-fns';
import type { BabyName, FeedRecord, SleepRecord, DetectedPattern } from '../types';
import { PROFILES } from '../data/knowledge';

export function detectPatterns(
  baby: BabyName,
  allFeeds: FeedRecord[],
  allSleeps: SleepRecord[],
  now: Date,
): DetectedPattern[] {
  const babyFeeds = allFeeds
    .filter((f) => f.baby === baby)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const babySleeps = allSleeps.filter((s) => s.baby === baby);
  const patterns: DetectedPattern[] = [];

  if (babyFeeds.length < 3) return patterns;

  // --- CLUSTER FEEDING ---
  // ≥3 feeds in last 3 hours
  const recentFeeds = babyFeeds.filter(
    (f) => differenceInMinutes(now, f.timestamp) <= 180,
  );
  if (recentFeeds.length >= 3) {
    patterns.push({
      id: 'CLUSTER',
      label: 'Cluster feeding',
      description: '3+ repas en moins de 3h — l\'intervalle après sera probablement plus long',
      baby,
      detectedAt: now,
      timingModifier: 1.30,
    });
  }

  // --- COMPENSATION ---
  // Last feed < 70% of slot average
  const lastFeed = babyFeeds[babyFeeds.length - 1];
  const profile = PROFILES[baby];
  const lastHour = lastFeed.timestamp.getHours();
  const lastSlot = profile.slots.find((s) => s.hours.includes(lastHour));
  if (lastSlot && lastFeed.type === 'bottle' && lastFeed.volumeMl > 0) {
    const ratio = lastFeed.volumeMl / lastSlot.meanMl;
    if (ratio < 0.7) {
      patterns.push({
        id: 'COMPENSATION',
        label: 'Compensation',
        description: 'Repas précédent < 70% de la moyenne — prochain repas probablement plus tôt',
        baby,
        detectedAt: now,
        timingModifier: 0.75,
      });
    }
  }

  // --- EVENING EFFECT ---
  // Aligned with evening slot definition in knowledge.ts (hours 18-21)
  const hour = now.getHours();
  if (hour >= 18 && hour < 22) {
    patterns.push({
      id: 'EVENING',
      label: 'Effet soirée',
      description: 'Créneau soirée (18h-21h) — intervalles plus courts, volumes plus importants',
      baby,
      detectedAt: now,
      timingModifier: 0.85,
      volumeModifier: 1.10,
    });
  }

  // --- NIGHT LIGHT ---
  if (hour >= 22 || hour < 6) {
    patterns.push({
      id: 'NIGHT_LIGHT',
      label: 'Mode nuit',
      description: 'Créneau nocturne — intervalles plus longs, volumes réduits',
      baby,
      detectedAt: now,
      timingModifier: 1.20,
      volumeModifier: 0.85,
    });
  }

  // --- POST NAP ---
  // Check if a nap >45min ended in the last 30 min
  const recentNap = babySleeps.find((s) => {
    if (!s.endTime || s.durationMin < 45) return false;
    return differenceInMinutes(now, s.endTime) <= 30 && differenceInMinutes(now, s.endTime) >= 0;
  });
  if (recentNap) {
    patterns.push({
      id: 'POST_NAP',
      label: 'Post-sieste',
      description: 'Sieste >45 min terminée récemment — volume potentiellement plus élevé',
      baby,
      detectedAt: now,
      timingModifier: 0.85,
      volumeModifier: 1.10,
    });
  }

  // --- GROWTH SPURT ---
  // Compare 48h avg vs 14d avg
  const feedsLast48h = babyFeeds.filter(
    (f) => f.type === 'bottle' && f.volumeMl > 0 && differenceInHours(now, f.timestamp) <= 48,
  );
  const feedsLast14d = babyFeeds.filter(
    (f) => f.type === 'bottle' && f.volumeMl > 0 && f.timestamp >= subDays(now, 14),
  );

  if (feedsLast48h.length >= 4 && feedsLast14d.length >= 10) {
    const avg48h = feedsLast48h.reduce((sum, f) => sum + f.volumeMl, 0) / feedsLast48h.length;
    const avg14d = feedsLast14d.reduce((sum, f) => sum + f.volumeMl, 0) / feedsLast14d.length;

    if (avg48h > avg14d * 1.25) {
      patterns.push({
        id: 'GROWTH',
        label: 'Pic de croissance',
        description: 'Appétit augmenté de >25% sur 48h — possible pic de croissance',
        baby,
        detectedAt: now,
        timingModifier: 0.80,
        volumeModifier: 1.15,
      });
    }
  }

  // --- DESYNC (twin-specific, informational only — no timing/volume modifier) ---
  const otherBaby: BabyName = baby === 'colette' ? 'isaure' : 'colette';
  const otherFeeds = allFeeds
    .filter((f) => f.baby === otherBaby)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (babyFeeds.length > 0 && otherFeeds.length > 0) {
    const lastOther = otherFeeds[otherFeeds.length - 1];
    const gap = Math.abs(differenceInMinutes(lastFeed.timestamp, lastOther.timestamp));
    if (gap > 60) {
      patterns.push({
        id: 'DESYNC',
        label: 'Désynchronisation',
        description: `Écart de ${gap} min avec ${otherBaby === 'colette' ? 'Colette' : 'Isaure'}`,
        baby,
        detectedAt: now,
      });
    }
  }

  return patterns;
}
