import type { FeedRecord, SleepRecord, BabyName } from '../types';

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute a combined accuracy score [0..1] for a baby's feed & nap predictions today.
 * Feed accuracy: % of today's inter-feed intervals within ±45 min of historical median.
 * Nap accuracy: % of today's nap durations within ±20 min of historical median.
 * Returns null if insufficient data (< 5 historical events or 0 today's events).
 */
export function computeDayAccuracy(
  feeds: FeedRecord[],
  sleeps: SleepRecord[],
  baby: BabyName,
  now: Date,
): number | null {
  const todayStart = new Date(now);
  todayStart.setHours(5, 0, 0, 0);

  // ── Feeds ──────────────────────────────────────────────────────────────
  const babyFeeds = feeds
    .filter((f) => f.baby === baby)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const historicalFeeds = babyFeeds.filter((f) => new Date(f.timestamp) < todayStart);
  const todayFeeds = babyFeeds.filter((f) => new Date(f.timestamp) >= todayStart);

  const histIntervals: number[] = [];
  for (let i = 1; i < historicalFeeds.length; i++) {
    const gap =
      (new Date(historicalFeeds[i].timestamp).getTime() -
        new Date(historicalFeeds[i - 1].timestamp).getTime()) /
      60_000;
    if (gap >= 60 && gap <= 360) histIntervals.push(gap);
  }

  const todayIntervals: number[] = [];
  for (let i = 1; i < todayFeeds.length; i++) {
    const gap =
      (new Date(todayFeeds[i].timestamp).getTime() -
        new Date(todayFeeds[i - 1].timestamp).getTime()) /
      60_000;
    if (gap >= 60 && gap <= 360) todayIntervals.push(gap);
  }

  let feedScore: number | null = null;
  let feedWeight = 0;
  if (histIntervals.length >= 5 && todayIntervals.length >= 1) {
    const median = computeMedian(histIntervals);
    const hits = todayIntervals.filter((g) => Math.abs(g - median) <= 45).length;
    feedScore = hits / todayIntervals.length;
    feedWeight = todayIntervals.length;
  }

  // ── Naps ───────────────────────────────────────────────────────────────
  const babySleeps = sleeps.filter((s) => s.baby === baby && s.endTime);
  const historicalSleeps = babySleeps.filter((s) => new Date(s.startTime) < todayStart);
  const todaySleeps = babySleeps.filter((s) => new Date(s.startTime) >= todayStart);

  const histDurations = historicalSleeps
    .map((s) => s.durationMin)
    .filter((d) => d >= 10 && d <= 180);

  let napScore: number | null = null;
  let napWeight = 0;
  if (histDurations.length >= 5 && todaySleeps.length >= 1) {
    const median = computeMedian(histDurations);
    const hits = todaySleeps.filter((s) => Math.abs(s.durationMin - median) <= 20).length;
    napScore = hits / todaySleeps.length;
    napWeight = todaySleeps.length;
  }

  // ── Combine ────────────────────────────────────────────────────────────
  if (feedScore === null && napScore === null) return null;
  if (feedScore !== null && napScore === null) return feedScore;
  if (feedScore === null && napScore !== null) return napScore;

  const totalWeight = feedWeight + napWeight;
  return (feedScore! * feedWeight + napScore! * napWeight) / totalWeight;
}
