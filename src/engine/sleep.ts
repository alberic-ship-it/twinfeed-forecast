import { differenceInMinutes } from 'date-fns';
import type { SleepRecord, FeedRecord, BabyName } from '../types';
import { DEFAULT_SLEEP, NIGHT_SLEEP, WAKE_WINDOWS } from '../data/knowledge';
import { recencyWeight, weightedMedian, weightedAvg } from './recency';

export interface SleepPrediction {
  predictedTime: Date;
  confidenceMin: 30;
  estimatedDurationMin: number;
}

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

// ── Main analysis ──

export function analyzeSleep(
  baby: BabyName,
  sleeps: SleepRecord[],
  feeds: FeedRecord[],
  now: Date,
): SleepAnalysis {
  const defaults = DEFAULT_SLEEP[baby];

  const babySleeps = sleeps
    .filter((s) => s.baby === baby)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const babyFeeds = feeds
    .filter((f) => f.baby === baby)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Today's naps (6h–21h)
  const todayStart = new Date(now);
  todayStart.setHours(6, 0, 0, 0);
  const todayNaps = babySleeps.filter(
    (s) =>
      s.startTime >= todayStart &&
      s.startTime.getHours() >= 6 &&
      s.startTime.getHours() < 21,
  );

  const totalSleepToday = todayNaps.reduce((sum, s) => sum + s.durationMin, 0);
  const napsToday = todayNaps.length;

  // ── Compute median feed→nap latency from history (weighted by recency) ──
  const allNaps = babySleeps.filter(
    (s) => s.startTime.getHours() >= 6 && s.startTime.getHours() < 21,
  );

  const latencies: number[] = [];
  const latencyWeights: number[] = [];
  for (const nap of allNaps) {
    const lastFeed = findLastFeedBefore(babyFeeds, nap.startTime, 180);
    if (!lastFeed) continue;
    const latency = differenceInMinutes(nap.startTime, lastFeed.timestamp);
    if (latency > 0) {
      latencies.push(latency);
      latencyWeights.push(recencyWeight(nap.startTime, now));
    }
  }
  const medianLatency = latencies.length >= 3 ? weightedMedian(latencies, latencyWeights) : null;

  // ── Compute median inter-nap interval from history (weighted by recency) ──
  const interNapIntervals: number[] = [];
  const interNapWeights: number[] = [];
  for (let i = 1; i < allNaps.length; i++) {
    const prev = allNaps[i - 1];
    const curr = allNaps[i];
    if (prev.endTime) {
      const gap = differenceInMinutes(curr.startTime, prev.endTime);
      if (gap > 0 && gap < 360) {
        interNapIntervals.push(gap);
        interNapWeights.push(recencyWeight(curr.startTime, now));
      }
    }
  }
  const medianInterNap =
    interNapIntervals.length >= 3 ? weightedMedian(interNapIntervals, interNapWeights) : null;

  // ── Compute average nap duration from history (weighted by recency) ──
  const napDurations = allNaps.map((n) => n.durationMin);
  const napDurWeights = allNaps.map((n) => recencyWeight(n.startTime, now));
  const avgNapDuration =
    napDurations.length >= 3
      ? Math.round(weightedAvg(napDurations, napDurWeights))
      : defaults.napDurationMin;

  // ── Next nap prediction ──
  let nextNap: SleepPrediction | null = null;

  if (napsToday < defaults.napsPerDay) {
    let predictedTime: Date | null = null;

    const lastTodayNap =
      todayNaps.length > 0 ? todayNaps[todayNaps.length - 1] : null;

    const lastFeedToday = babyFeeds.filter(
      (f) => f.timestamp >= todayStart && f.timestamp <= now,
    );
    const mostRecentFeed =
      lastFeedToday.length > 0
        ? lastFeedToday[lastFeedToday.length - 1]
        : null;

    // Strategy A: if a nap was logged today, prioritize inter-nap interval
    // (more relevant than feed-based when we know the baby slept)
    if (lastTodayNap?.endTime) {
      // A1: data-driven inter-nap interval
      if (medianInterNap !== null) {
        const fromNap = new Date(
          lastTodayNap.endTime.getTime() + medianInterNap * 60_000,
        );
        if (fromNap > now) {
          predictedTime = fromNap;
        }
      }

      // A2: fallback to wake window if no inter-nap data
      if (!predictedTime) {
        const wakeWindowMin = (WAKE_WINDOWS.optimalMin + WAKE_WINDOWS.optimalMax) / 2;
        const fromWake = new Date(
          lastTodayNap.endTime.getTime() + wakeWindowMin * 60_000,
        );
        if (fromWake > now) {
          predictedTime = fromWake;
        }
      }
    }

    // Strategy B: no nap today yet — use feed + median latency
    if (!predictedTime && mostRecentFeed && medianLatency !== null) {
      const fromFeed = new Date(
        mostRecentFeed.timestamp.getTime() + medianLatency * 60_000,
      );
      if (fromFeed > now) {
        predictedTime = fromFeed;
      }
    }

    // Strategy C: fallback to default nap windows
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

    if (predictedTime) {
      nextNap = {
        predictedTime,
        confidenceMin: 30,
        estimatedDurationMin: avgNapDuration,
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

  let bedtimeDate = new Date(now);
  bedtimeDate.setHours(
    Math.floor(medianBedtimeMin / 60),
    Math.round(medianBedtimeMin % 60),
    0,
    0,
  );

  // Adjust bedtime based on today's context:
  // 1. If baby slept much less than usual today → earlier bedtime
  // 2. Last wake-up + max wake window gives an upper bound
  const expectedDaySleepMin = defaults.napsPerDay * avgNapDuration;
  const sleepDeficitMin = expectedDaySleepMin - totalSleepToday;

  if (sleepDeficitMin > 30 && totalSleepToday > 0) {
    // Pull bedtime earlier: ~15 min per 30 min deficit, capped at 60 min
    const pullMin = Math.min(60, Math.round(sleepDeficitMin * 0.5));
    bedtimeDate = new Date(bedtimeDate.getTime() - pullMin * 60_000);
  }

  // Wake-window cap: bedtime no later than last wake-up + max wake window
  const lastNapOrSleep = todayNaps.length > 0
    ? todayNaps[todayNaps.length - 1]
    : null;
  if (lastNapOrSleep?.endTime) {
    const maxBedtime = new Date(
      lastNapOrSleep.endTime.getTime() + WAKE_WINDOWS.maxBeforeOvertired * 60_000,
    );
    if (maxBedtime < bedtimeDate && maxBedtime > now) {
      bedtimeDate = maxBedtime;
    }
  }

  // Only show bedtime if it's still ahead
  if (bedtimeDate > now) {
    bedtime = {
      predictedTime: bedtimeDate,
      confidenceMin: 30,
      estimatedDurationMin: avgNightDuration,
    };
  }

  return {
    baby,
    totalSleepToday,
    napsToday,
    nextNap,
    bedtime,
    medianInterNapMin: medianInterNap,
    avgNapDurationMin: avgNapDuration,
  };
}
