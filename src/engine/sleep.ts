import { differenceInMinutes, startOfDay } from 'date-fns';
import type { SleepRecord, FeedRecord, BabyName, NightSession } from '../types';
import { DEFAULT_SLEEP, NIGHT_SLEEP, WAKE_WINDOWS } from '../data/knowledge';
import { recencyWeight, weightedMedian, weightedAvg, percentile, filterRecentFeeds, filterRecentSleeps } from './recency';

export interface SleepPrediction {
  predictedTime: Date;
  confidenceMin: number;
  estimatedDurationMin: number;
  hint?: string;
}

export type SleepStatus = 'naps_remaining' | 'naps_done' | 'rescue_nap' | 'night_active';
export type SleepQuality = 'good' | 'fair' | 'poor';

export interface SleepAnalysis {
  baby: BabyName;
  totalSleepToday: number; // minutes
  napsToday: number;
  nextNap: SleepPrediction | null;
  bedtime: SleepPrediction | null;
  /** Data-driven median inter-nap interval (minutes), null if insufficient data */
  medianInterNapMin: number | null;
  /** Data-driven average nap duration (minutes) */
  avgNapDurationMin: number;
  /** Estimated bedtime (always set, even if past — used for timeline display) */
  estimatedBedtimeDate: Date;
  /** Current sleep status for UI display */
  sleepStatus: SleepStatus;
  /** Expected total day sleep in minutes (napsPerDay × avgNapDuration) */
  expectedDaySleepMin: number;
  /** Quality of today's day sleep relative to expected */
  sleepQuality: SleepQuality;
  /** Today's nap records (for display/deletion in UI) */
  todayNapRecords: SleepRecord[];
  /** Night progress when a night session is active */
  nightProgress?: {
    durationSoFarMin: number;
    feedCount: number;
    lastFeedAgoMin: number | null;
    expectedWakeTime: Date;
    medianNightDurationMin: number;
  };
}

// ── Helpers ──

/**
 * Find the last feed before a given time, within maxMinBefore minutes.
 */
function findLastFeedBefore(
  feeds: FeedRecord[],
  before: Date,
  maxMinBefore: number,
): FeedRecord | null {
  const minTime = before.getTime() - maxMinBefore * 60_000;
  let best: FeedRecord | null = null;
  for (const f of feeds) {
    const t = f.timestamp.getTime();
    if (t >= minTime && t < before.getTime()) {
      if (!best || t > best.timestamp.getTime()) best = f;
    }
  }
  return best;
}

/**
 * Compute IQR-based confidence interval.
 * Returns IQR / 2, bounded [15, 45]. Fallback 30 if < 3 data points.
 */
function iqrConfidence(values: number[]): number {
  if (values.length < 3) return 30;
  const p25 = percentile(values, 25);
  const p75 = percentile(values, 75);
  const iqr = p75 - p25;
  return Math.max(15, Math.min(45, Math.round(iqr / 2)));
}

/**
 * Compute positional inter-nap intervals.
 * Groups naps by day, then computes the median interval after nap at position N.
 */
function computePositionalInterNap(
  allNaps: SleepRecord[],
  now: Date,
): Map<number, number> {
  // Group naps by day
  const napsByDay = new Map<string, SleepRecord[]>();
  for (const nap of allNaps) {
    const dayKey = startOfDay(nap.startTime).toISOString();
    const list = napsByDay.get(dayKey) ?? [];
    list.push(nap);
    napsByDay.set(dayKey, list);
  }

  // For each day with >=2 naps, compute interval after nap N (0-indexed)
  const intervalsByPosition = new Map<number, { values: number[]; weights: number[] }>();

  for (const dayNaps of napsByDay.values()) {
    if (dayNaps.length < 2) continue;
    const sorted = [...dayNaps].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const endTime = sorted[i].endTime;
      if (!endTime) continue;
      const gap = differenceInMinutes(sorted[i + 1].startTime, endTime);
      if (gap > 0 && gap < 360) {
        const entry = intervalsByPosition.get(i) ?? { values: [], weights: [] };
        entry.values.push(gap);
        entry.weights.push(recencyWeight(sorted[i + 1].startTime, now));
        intervalsByPosition.set(i, entry);
      }
    }
  }

  // Compute weighted median per position
  const result = new Map<number, number>();
  for (const [pos, data] of intervalsByPosition) {
    if (data.values.length >= 3) {
      result.set(pos, weightedMedian(data.values, data.weights));
    }
  }
  return result;
}

// ── Main analysis ──

export function analyzeSleep(
  baby: BabyName,
  rawSleeps: SleepRecord[],
  rawFeeds: FeedRecord[],
  now: Date,
  activeNight?: NightSession,
): SleepAnalysis {
  const defaults = DEFAULT_SLEEP[baby];
  const sleeps = filterRecentSleeps(rawSleeps, now);
  const feeds = filterRecentFeeds(rawFeeds, now);

  const babySleeps = sleeps
    .filter((s) => s.baby === baby)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const babyFeeds = feeds
    .filter((f) => f.baby === baby)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // ── Night active mode: early return with progress ──
  if (activeNight && !activeNight.endTime) {
    // Compute median night duration from historical data
    const histNightSleeps = babySleeps.filter(
      (s) => s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin,
    );
    const nightDurations = histNightSleeps.map((s) => s.durationMin);
    const nightWeights = histNightSleeps.map((s) => recencyWeight(s.startTime, now));
    const medianNightDuration = nightDurations.length >= 3
      ? Math.round(weightedMedian(nightDurations, nightWeights))
      : defaults.nightDurationMin;

    const durationSoFarMin = Math.round((now.getTime() - activeNight.startTime.getTime()) / 60_000);
    const nightFeeds = activeNight.feeds;
    const lastFeed = nightFeeds.length > 0 ? nightFeeds[nightFeeds.length - 1] : null;
    const lastFeedAgoMin = lastFeed ? Math.round((now.getTime() - lastFeed.timestamp.getTime()) / 60_000) : null;
    const expectedWakeTime = new Date(activeNight.startTime.getTime() + medianNightDuration * 60_000);

    // Still compute today's naps for context (même fenêtre étendue)
    const todayStart = new Date(now);
    todayStart.setHours(6, 0, 0, 0);
    const todayNaps = babySleeps.filter(
      (s) =>
        s.startTime >= todayStart &&
        s.startTime.getHours() >= 6 &&
        s.durationMin < NIGHT_SLEEP.minDurationMin,
    );
    const totalSleepToday = todayNaps.reduce((sum, s) => sum + s.durationMin, 0);

    return {
      baby,
      totalSleepToday,
      napsToday: todayNaps.length,
      nextNap: null,
      bedtime: null,
      medianInterNapMin: null,
      avgNapDurationMin: defaults.napDurationMin,
      estimatedBedtimeDate: activeNight.startTime,
      sleepStatus: 'night_active',
      expectedDaySleepMin: defaults.napsPerDay * defaults.napDurationMin,
      sleepQuality: 'good',
      todayNapRecords: todayNaps,
      nightProgress: {
        durationSoFarMin,
        feedCount: nightFeeds.length,
        lastFeedAgoMin,
        expectedWakeTime,
        medianNightDurationMin: medianNightDuration,
      },
    };
  }

  // Today's naps (depuis 6h, excluant les vrais sommeils de nuit)
  // Les siestes tardives (21h-23h59) sont incluses tant que leur durée
  // est inférieure à NIGHT_SLEEP.minDurationMin (6h) — elles impactent
  // le calcul du coucher via lastNapForBedtime.
  const todayStart = new Date(now);
  todayStart.setHours(6, 0, 0, 0);
  const todayNaps = babySleeps.filter(
    (s) =>
      s.startTime >= todayStart &&
      s.startTime.getHours() >= 6 &&
      s.durationMin < NIGHT_SLEEP.minDurationMin,
  );

  const totalSleepToday = todayNaps.reduce((sum, s) => sum + s.durationMin, 0);
  const napsToday = todayNaps.length;

  // ── Compute median feed→nap latency from history (weighted by recency) ──
  // Même fenêtre que todayNaps : depuis 6h, excluant les vrais sommeils de nuit
  const allNaps = babySleeps.filter(
    (s) =>
      s.startTime.getHours() >= 6 &&
      s.durationMin < NIGHT_SLEEP.minDurationMin,
  );

  // ── Passe unique sur allNaps : latences, intervalles, durées ──
  const latencies: number[] = [];
  const latencyWeights: number[] = [];
  const interNapIntervals: number[] = [];
  const interNapWeights: number[] = [];
  const napDurations: number[] = [];
  const napDurWeights: number[] = [];

  for (let i = 0; i < allNaps.length; i++) {
    const nap = allNaps[i];
    const w = recencyWeight(nap.startTime, now);

    // Latence dernier repas → sieste
    const lastFeed = findLastFeedBefore(babyFeeds, nap.startTime, 180);
    if (lastFeed) {
      const latency = differenceInMinutes(nap.startTime, lastFeed.timestamp);
      if (latency > 0) { latencies.push(latency); latencyWeights.push(w); }
    }

    // Intervalle inter-siestes
    if (i > 0) {
      const prev = allNaps[i - 1];
      if (prev.endTime) {
        const gap = differenceInMinutes(nap.startTime, prev.endTime);
        if (gap > 0 && gap < 360) { interNapIntervals.push(gap); interNapWeights.push(w); }
      }
    }

    // Durée de sieste
    napDurations.push(nap.durationMin);
    napDurWeights.push(w);
  }

  const medianLatency = latencies.length >= 3 ? weightedMedian(latencies, latencyWeights) : null;
  const medianInterNap =
    interNapIntervals.length >= 3 ? weightedMedian(interNapIntervals, interNapWeights) : null;

  // ── Compute positional inter-nap intervals ──
  const positionalInterNap = computePositionalInterNap(allNaps, now);

  // ── Compute average nap duration from history (weighted by recency) ──
  const avgNapDuration =
    napDurations.length >= 3
      ? Math.round(weightedAvg(napDurations, napDurWeights))
      : defaults.napDurationMin;

  // ── Expected day sleep & quality ──
  const expectedDaySleepMin = defaults.napsPerDay * avgNapDuration;
  const sleepRatio = expectedDaySleepMin > 0 ? totalSleepToday / expectedDaySleepMin : 1;
  const sleepQuality: SleepQuality =
    sleepRatio >= 0.9 ? 'good' : sleepRatio >= 0.7 ? 'fair' : 'poor';

  // ── IQR-based confidence for naps ──
  const napConfidence = iqrConfidence(interNapIntervals);

  // ── Determine sleep status ──
  const lastTodayNap = todayNaps.length > 0 ? todayNaps[todayNaps.length - 1] : null;
  const lastNapShort = lastTodayNap ? lastTodayNap.durationMin < 25 : false;
  const sleepDeficit = expectedDaySleepMin - totalSleepToday;

  // rescue_nap uniquement quand le quota n'est PAS encore atteint ET que la
  // dernière sieste était courte (→ réessai plus tôt). Une fois le quota atteint,
  // on passe directement à naps_done — afficher un "rattrapage" après 3 siestes
  // est confus et ne correspond pas à ce que les parents voient.
  let sleepStatus: SleepStatus;
  if (napsToday >= defaults.napsPerDay) {
    sleepStatus = 'naps_done';
  } else if (lastNapShort) {
    sleepStatus = 'rescue_nap';
  } else {
    sleepStatus = 'naps_remaining';
  }

  // ── Next nap prediction ──
  let nextNap: SleepPrediction | null = null;

  // Max start hour for a nap — hard cap regardless of status (no nap after 21h).
  // Also ensures we stay on the same calendar day as 'now'.
  const NAP_CUTOFF_HOUR = 17.5; // used only for naps_done
  const NAP_MAX_HOUR = 21.0;    // hard cap for all statuses

  // night_active returns early above — sleepStatus is always a daytime value here
  {
    let predictedTime: Date | null = null;
    let hint: string | undefined;

    const lastFeedToday = babyFeeds.filter(
      (f) => f.timestamp >= todayStart && f.timestamp <= now,
    );
    const mostRecentFeed =
      lastFeedToday.length > 0
        ? lastFeedToday[lastFeedToday.length - 1]
        : null;

    if (sleepStatus === 'rescue_nap') {
      // Rescue nap: use reduced wake window (70% of median)
      if (lastTodayNap?.endTime) {
        const baseInterval = positionalInterNap.get(napsToday - 1) ?? medianInterNap ?? ((WAKE_WINDOWS.optimalMin + WAKE_WINDOWS.optimalMax) / 2);
        const reducedInterval = baseInterval * 0.7;
        const fromNap = new Date(lastTodayNap.endTime.getTime() + reducedInterval * 60_000);
        if (fromNap > now) {
          predictedTime = fromNap;
        } else {
          // Rescue nap is overdue — suggest now + 15min
          predictedTime = new Date(now.getTime() + 15 * 60_000);
        }
      }
      hint = lastNapShort
        ? 'Sieste courte — réveil plus tôt que prévu'
        : 'Sieste de rattrapage — déficit de sommeil';
    } else {
      // Normal nap prediction using positional interval or fallback chain

      // Helper : rejette un temps si après le cutoff ou hors du jour courant
      const beforeCutoff = (t: Date) => {
        const isSameDay = t.toDateString() === now.toDateString();
        const hourOfDay = t.getHours() + t.getMinutes() / 60;
        return isSameDay && hourOfDay < NAP_MAX_HOUR &&
          (sleepStatus !== 'naps_done' || hourOfDay < NAP_CUTOFF_HOUR);
      };

      if (lastTodayNap?.endTime) {
        // ── Stratégies A : sieste déjà saisie aujourd'hui ──
        // B et C ne s'appliquent pas ici — elles ignoreraient la sieste existante.
        // Le cutoff est appliqué inline sur chaque stratégie pour que A4 serve
        // de filet de secours même si A1/A2/A3 donnent une heure après 17h30.

        // A1: intervalle positionnel (meilleur)
        const positionalInterval = positionalInterNap.get(napsToday - 1);
        if (positionalInterval !== undefined) {
          let interval = positionalInterval;
          if (lastNapShort) {
            interval = interval * 0.7;
            hint = 'Sieste courte — réveil plus tôt que prévu';
          }
          const fromNap = new Date(lastTodayNap.endTime.getTime() + interval * 60_000);
          if (fromNap > now && beforeCutoff(fromNap)) predictedTime = fromNap;
        }

        // A2: médiane globale inter-siestes
        if (!predictedTime && medianInterNap !== null) {
          let interval = medianInterNap;
          if (lastNapShort) {
            interval = interval * 0.7;
            hint = 'Sieste courte — réveil plus tôt que prévu';
          }
          const fromNap = new Date(lastTodayNap.endTime.getTime() + interval * 60_000);
          if (fromNap > now && beforeCutoff(fromNap)) predictedTime = fromNap;
        }

        // A3: fenêtre d'éveil par défaut
        if (!predictedTime) {
          let wakeWindowMin = (WAKE_WINDOWS.optimalMin + WAKE_WINDOWS.optimalMax) / 2;
          if (lastNapShort) {
            wakeWindowMin = wakeWindowMin * 0.7;
            hint = 'Sieste courte — réveil plus tôt que prévu';
          }
          const fromWake = new Date(lastTodayNap.endTime.getTime() + wakeWindowMin * 60_000);
          if (fromWake > now && beforeCutoff(fromWake)) predictedTime = fromWake;
        }

        // A4: toutes les stratégies épuisées → sieste en retard ou post-cutoff
        if (!predictedTime) {
          const nowPlus15 = new Date(now.getTime() + 15 * 60_000);
          if (beforeCutoff(nowPlus15)) {
            predictedTime = nowPlus15;
            hint = 'Sieste en retard — dès que possible';
          }
        }
      } else {
        // ── Stratégies B/C : aucune sieste aujourd'hui (projections pures) ──

        // B: dernier repas + latence médiane repas→sieste
        if (mostRecentFeed && medianLatency !== null) {
          const fromFeed = new Date(
            mostRecentFeed.timestamp.getTime() + medianLatency * 60_000,
          );
          if (fromFeed > now) predictedTime = fromFeed;
        }

        // C: créneaux par défaut (bestNapTimes)
        if (!predictedTime) {
          const currentH = now.getHours() + now.getMinutes() / 60;
          for (let i = napsToday; i < defaults.bestNapTimes.length; i++) {
            const window = defaults.bestNapTimes[i];
            if (currentH < window.endH) {
              const midH = (window.startH + window.endH) / 2;
              predictedTime = new Date(now);
              predictedTime.setHours(Math.floor(midH), Math.round((midH % 1) * 60), 0, 0);
              if (predictedTime <= now) {
                predictedTime = new Date(now.getTime() + 15 * 60_000);
              }
              break;
            }
          }
        }
      }
    }

    if (predictedTime) {
      const estimatedDurationMin = sleepStatus === 'rescue_nap'
        ? Math.min(30, Math.round(avgNapDuration * 0.6))
        : avgNapDuration;

      nextNap = {
        predictedTime,
        confidenceMin: napConfidence,
        estimatedDurationMin,
        hint,
      };
    }
  }

  // ── Bedtime prediction ──
  let bedtime: SleepPrediction | null = null;

  // Compute median bedtime from history (night sleeps starting >= 19h)
  const nightSleeps = babySleeps.filter(
    (s) => s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin,
  );

  const bedtimeMinutes = nightSleeps.map(
    (s) => s.startTime.getHours() * 60 + s.startTime.getMinutes(),
  );
  const nightDurations = nightSleeps.map((s) => s.durationMin);
  const nightWeights = nightSleeps.map((s) => recencyWeight(s.startTime, now));

  const medianBedtimeMin =
    bedtimeMinutes.length >= 3
      ? weightedMedian(bedtimeMinutes, nightWeights)
      : defaults.typicalBedtimeHour * 60;

  const avgNightDuration =
    nightDurations.length >= 3
      ? Math.round(weightedAvg(nightDurations, nightWeights))
      : defaults.nightDurationMin;

  // IQR-based confidence for bedtime
  const bedtimeConfidence = iqrConfidence(bedtimeMinutes);

  // ── Data-driven wake window: median(nightStart − lastNapEnd) from history ──
  // Plus fiable que le hardcode 60 min — suit la réalité de chaque bébé.
  const wakeWindowsBeforeNight: number[] = [];
  const wakeWindowWeights: number[] = [];
  const napsByDayMap = new Map<string, SleepRecord[]>();
  const nightByDayMap = new Map<string, SleepRecord>();

  for (const s of babySleeps) {
    const dayKey = startOfDay(s.startTime).toISOString();
    if (s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin >= NIGHT_SLEEP.minDurationMin) {
      nightByDayMap.set(dayKey, s);
    } else if (s.startTime.getHours() >= 6 && s.durationMin < NIGHT_SLEEP.minDurationMin) {
      const list = napsByDayMap.get(dayKey) ?? [];
      list.push(s);
      napsByDayMap.set(dayKey, list);
    }
  }

  for (const [dayKey, dayNaps] of napsByDayMap.entries()) {
    const night = nightByDayMap.get(dayKey);
    if (!night) continue;
    const lastNapOfDay = [...dayNaps].sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];
    if (!lastNapOfDay.endTime) continue;
    const ww = differenceInMinutes(night.startTime, lastNapOfDay.endTime);
    if (ww > 30 && ww < 240) {
      wakeWindowsBeforeNight.push(ww);
      wakeWindowWeights.push(recencyWeight(night.startTime, now));
    }
  }

  // Default 90 min (cohérent avec les fenêtres d'éveil à 4–6 mois)
  const medianWakeWindowBeforeNight =
    wakeWindowsBeforeNight.length >= 3
      ? Math.round(weightedMedian(wakeWindowsBeforeNight, wakeWindowWeights))
      : 90;

  let bedtimeDate = new Date(now);
  bedtimeDate.setHours(
    Math.floor(medianBedtimeMin / 60),
    Math.round(medianBedtimeMin % 60),
    0,
    0,
  );

  // ── Déficit de sommeil → avance le coucher ──
  // Déclenché si le quota est atteint OU si la journée est effectivement
  // terminée (≥17h) — évite d'attendre une sieste qui n'arrivera pas.
  const dayEffectivelyDone = napsToday >= defaults.napsPerDay || now.getHours() >= 17;
  if (dayEffectivelyDone && sleepDeficit > 30) {
    // ~15 min par 30 min de déficit, plafonné à 60 min (au lieu de 30 min)
    const pullMin = Math.min(60, Math.round(sleepDeficit * 0.5));
    bedtimeDate = new Date(bedtimeDate.getTime() - pullMin * 60_000);
  }

  // ── Dernière sieste → ajustement bidirectionnel ──
  // Utilise la fenêtre d'éveil calculée depuis les données (au lieu du hardcode 60 min).
  // Peut avancer OU reculer le coucher selon l'heure réelle de fin de sieste.
  const lastNapForBedtime = todayNaps.length > 0 ? todayNaps[todayNaps.length - 1] : null;
  if (lastNapForBedtime?.endTime) {
    const napBasedBedtime = new Date(
      lastNapForBedtime.endTime.getTime() + medianWakeWindowBeforeNight * 60_000,
    );
    const diffMin = differenceInMinutes(napBasedBedtime, bedtimeDate);

    if (diffMin > 0) {
      // Sieste tardive → repousse le coucher, mais pas au-delà du jour courant
      if (napBasedBedtime.toDateString() === now.toDateString()) {
        bedtimeDate = napBasedBedtime;
      }
      // Si napBasedBedtime tombe le lendemain, on garde la médiane historique
    } else if (diffMin < -15) {
      // Sieste plus tôt que d'habitude → avance légèrement le coucher
      // 40% de la différence, plafonné à 45 min d'avance sur la médiane historique
      const pullMin = Math.min(45, Math.round(Math.abs(diffMin) * 0.4));
      bedtimeDate = new Date(bedtimeDate.getTime() - pullMin * 60_000);
    }
  }

  // Sanity floor: bedtime can never be before 18h
  const floor18h = new Date(now);
  floor18h.setHours(18, 0, 0, 0);
  if (bedtimeDate < floor18h) {
    bedtimeDate = floor18h;
  }

  // Only show bedtime if it's still ahead
  if (bedtimeDate > now) {
    bedtime = {
      predictedTime: bedtimeDate,
      confidenceMin: bedtimeConfidence,
      estimatedDurationMin: avgNightDuration,
    };
  }

  // ── Cohérence sieste / coucher ──
  // Si le coucher est trop proche de la fin estimée de la prochaine sieste
  // (pas le temps pour un cycle complet réveil → coucher), on retire la sieste.
  if (nextNap && bedtime) {
    const napEndEstimate = nextNap.predictedTime.getTime() + nextNap.estimatedDurationMin * 60_000;
    const minWakeBeforeBed = 30 * 60_000; // au moins 30 min d'éveil entre fin sieste et coucher
    if (bedtime.predictedTime.getTime() < napEndEstimate + minWakeBeforeBed) {
      nextNap = null;
    }
  }

  return {
    baby,
    totalSleepToday,
    napsToday,
    nextNap,
    bedtime,
    medianInterNapMin: medianInterNap,
    avgNapDurationMin: avgNapDuration,
    estimatedBedtimeDate: bedtimeDate,
    sleepStatus,
    expectedDaySleepMin,
    sleepQuality,
    todayNapRecords: todayNaps,
  };
}
