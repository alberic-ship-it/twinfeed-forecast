/**
 * Recency weighting utilities.
 *
 * Data is hard-capped to the last 60 days (DATA_WINDOW_DAYS).
 * Within that window: ≤7j = 3×, 8-21j = 2×, 22-60j = 1×.
 */

import type { FeedRecord, SleepRecord } from '../types';

/** Rolling window: only the last 60 days of data are used by engines. */
export const DATA_WINDOW_DAYS = 60;

export function recencyWeight(timestamp: Date, now: Date): number {
  const daysAgo = (now.getTime() - timestamp.getTime()) / 86_400_000;
  if (daysAgo <= 7) return 3;
  if (daysAgo <= 21) return 2;
  return 1;
}

/** Filter feeds to the last DATA_WINDOW_DAYS days. */
export function filterRecentFeeds(feeds: FeedRecord[], now: Date): FeedRecord[] {
  const cutoff = now.getTime() - DATA_WINDOW_DAYS * 86_400_000;
  return feeds.filter((f) => f.timestamp.getTime() >= cutoff);
}

/** Filter sleeps to the last DATA_WINDOW_DAYS days. */
export function filterRecentSleeps(sleeps: SleepRecord[], now: Date): SleepRecord[] {
  const cutoff = now.getTime() - DATA_WINDOW_DAYS * 86_400_000;
  return sleeps.filter((s) => s.startTime.getTime() >= cutoff);
}

export function weightedMedian(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const pairs = values.map((v, i) => ({ v, w: weights[i] }));
  pairs.sort((a, b) => a.v - b.v);
  const totalWeight = pairs.reduce((s, p) => s + p.w, 0);
  const half = totalWeight / 2;
  let cumWeight = 0;
  for (const p of pairs) {
    cumWeight += p.w;
    if (cumWeight >= half) return p.v;
  }
  return pairs[pairs.length - 1].v;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

export function weightedAvg(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  let sumVW = 0;
  let sumW = 0;
  for (let i = 0; i < values.length; i++) {
    sumVW += values[i] * weights[i];
    sumW += weights[i];
  }
  return sumW > 0 ? sumVW / sumW : 0;
}
