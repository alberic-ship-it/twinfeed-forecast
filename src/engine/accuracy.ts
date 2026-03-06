import type { FeedRecord, SleepRecord, BabyName } from '../types';
import { recencyWeight, weightedMedian, filterRecentFeeds, filterRecentSleeps } from './recency';

/**
 * Compute a combined accuracy score [0..1] for a baby's feed & nap predictions.
 * Uses a rolling 24-hour window: events in the last 24h are compared against
 * the historical median (everything older than 24h, capped at 30 days).
 * The historical median uses the same recency weighting as the predictor
 * (≤7j = 5×, 8-21j = 2×, 22-30j = 1×) so accuracy stays aligned with recent patterns.
 * Feed accuracy: % of recent inter-feed intervals within ±45 min of historical median.
 * Nap accuracy: % of recent nap durations within ±20 min of historical median.
 * Returns null if insufficient data (< 5 historical events or 0 recent events).
 */
export function computeDayAccuracy(
  feeds: FeedRecord[],
  sleeps: SleepRecord[],
  baby: BabyName,
  now: Date,
): number | null {
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // ── Feeds ──────────────────────────────────────────────────────────────
  const recentFeeds = filterRecentFeeds(feeds.filter((f) => f.baby === baby), now)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const historicalFeeds = recentFeeds.filter((f) => f.timestamp < windowStart);
  const todayFeeds = recentFeeds.filter((f) => f.timestamp >= windowStart);

  const histIntervalValues: number[] = [];
  const histIntervalWeights: number[] = [];
  for (let i = 1; i < historicalFeeds.length; i++) {
    const gap = (historicalFeeds[i].timestamp.getTime() - historicalFeeds[i - 1].timestamp.getTime()) / 60_000;
    if (gap >= 60 && gap <= 360) {
      histIntervalValues.push(gap);
      histIntervalWeights.push(recencyWeight(historicalFeeds[i].timestamp, now));
    }
  }

  const todayIntervals: number[] = [];
  for (let i = 1; i < todayFeeds.length; i++) {
    const gap = (todayFeeds[i].timestamp.getTime() - todayFeeds[i - 1].timestamp.getTime()) / 60_000;
    if (gap >= 60 && gap <= 360) todayIntervals.push(gap);
  }

  let feedScore: number | null = null;
  let feedWeight = 0;
  if (histIntervalValues.length >= 5 && todayIntervals.length >= 1) {
    const median = weightedMedian(histIntervalValues, histIntervalWeights);
    const hits = todayIntervals.filter((g) => Math.abs(g - median) <= 45).length;
    feedScore = hits / todayIntervals.length;
    feedWeight = todayIntervals.length;
  }

  // ── Naps ───────────────────────────────────────────────────────────────
  const recentSleeps = filterRecentSleeps(
    sleeps.filter((s) => s.baby === baby && s.endTime),
    now,
  );
  const historicalSleeps = recentSleeps.filter((s) => s.startTime < windowStart);
  const todaySleeps = recentSleeps.filter((s) => s.startTime >= windowStart);

  const histDurationValues: number[] = [];
  const histDurationWeights: number[] = [];
  for (const s of historicalSleeps) {
    if (s.durationMin >= 10 && s.durationMin <= 180) {
      histDurationValues.push(s.durationMin);
      histDurationWeights.push(recencyWeight(s.startTime, now));
    }
  }

  let napScore: number | null = null;
  let napWeight = 0;
  if (histDurationValues.length >= 5 && todaySleeps.length >= 1) {
    const median = weightedMedian(histDurationValues, histDurationWeights);
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
