import { differenceInMinutes } from 'date-fns';
import type { SleepRecord, FeedRecord, BabyName } from '../types';
import { DEFAULT_SLEEP } from '../data/knowledge';

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
}

// ── Helpers ──

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

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

  // ── Compute median feed→nap latency from history ──
  const allNaps = babySleeps.filter(
    (s) => s.startTime.getHours() >= 6 && s.startTime.getHours() < 21,
  );

  const latencies: number[] = [];
  for (const nap of allNaps) {
    const lastFeed = findLastFeedBefore(babyFeeds, nap.startTime, 180);
    if (!lastFeed) continue;
    const latency = differenceInMinutes(nap.startTime, lastFeed.timestamp);
    if (latency > 0) latencies.push(latency);
  }
  const medianLatency = latencies.length >= 3 ? median(latencies) : null;

  // ── Compute median inter-nap interval from history ──
  const interNapIntervals: number[] = [];
  for (let i = 1; i < allNaps.length; i++) {
    const prev = allNaps[i - 1];
    const curr = allNaps[i];
    if (prev.endTime) {
      const gap = differenceInMinutes(curr.startTime, prev.endTime);
      if (gap > 0 && gap < 360) interNapIntervals.push(gap);
    }
  }
  const medianInterNap =
    interNapIntervals.length >= 3 ? median(interNapIntervals) : null;

  // ── Compute average nap duration from history ──
  const napDurations = allNaps.map((n) => n.durationMin);
  const avgNapDuration =
    napDurations.length >= 3
      ? Math.round(
          napDurations.reduce((s, d) => s + d, 0) / napDurations.length,
        )
      : defaults.napDurationMin;

  // ── Next nap prediction ──
  let nextNap: SleepPrediction | null = null;

  if (napsToday < defaults.napsPerDay) {
    let predictedTime: Date | null = null;

    // Strategy 1: last feed + median latency
    const lastFeedToday = babyFeeds.filter(
      (f) => f.timestamp >= todayStart && f.timestamp <= now,
    );
    const mostRecentFeed =
      lastFeedToday.length > 0
        ? lastFeedToday[lastFeedToday.length - 1]
        : null;

    if (mostRecentFeed && medianLatency !== null) {
      const fromFeed = new Date(
        mostRecentFeed.timestamp.getTime() + medianLatency * 60_000,
      );
      if (fromFeed > now) {
        predictedTime = fromFeed;
      }
    }

    // Strategy 2: last nap end + median inter-nap interval
    if (!predictedTime) {
      const lastTodayNap =
        todayNaps.length > 0 ? todayNaps[todayNaps.length - 1] : null;
      if (lastTodayNap?.endTime && medianInterNap !== null) {
        const fromNap = new Date(
          lastTodayNap.endTime.getTime() + medianInterNap * 60_000,
        );
        if (fromNap > now) {
          predictedTime = fromNap;
        }
      }
    }

    // Strategy 3: fallback to default nap windows
    if (!predictedTime) {
      const currentH = now.getHours() + now.getMinutes() / 60;
      for (let i = napsToday; i < defaults.bestNapTimes.length; i++) {
        const window = defaults.bestNapTimes[i];
        if (currentH < window.endH) {
          const midH = (window.startH + window.endH) / 2;
          predictedTime = new Date(now);
          predictedTime.setHours(Math.floor(midH), Math.round((midH % 1) * 60), 0, 0);
          if (predictedTime <= now) {
            // If midpoint already passed, use now + 15 min
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
    (s) => s.startTime.getHours() >= 19 && s.durationMin > 120,
  );

  const bedtimeMinutes = nightSleeps.map(
    (s) => s.startTime.getHours() * 60 + s.startTime.getMinutes(),
  );
  const nightDurations = nightSleeps.map((s) => s.durationMin);

  const medianBedtimeMin =
    bedtimeMinutes.length >= 3
      ? median(bedtimeMinutes)
      : defaults.typicalBedtimeHour * 60;

  const avgNightDuration =
    nightDurations.length >= 3
      ? Math.round(
          nightDurations.reduce((s, d) => s + d, 0) / nightDurations.length,
        )
      : defaults.nightDurationMin;

  const bedtimeDate = new Date(now);
  bedtimeDate.setHours(
    Math.floor(medianBedtimeMin / 60),
    Math.round(medianBedtimeMin % 60),
    0,
    0,
  );

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
  };
}
