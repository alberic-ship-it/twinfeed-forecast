/**
 * Recency weighting utilities.
 *
 * Data from the last 7 days gets 3× weight,
 * last 30 days gets 2× weight,
 * older data gets 1× weight.
 */

export function recencyWeight(timestamp: Date, now: Date): number {
  const daysAgo = (now.getTime() - timestamp.getTime()) / 86_400_000;
  if (daysAgo <= 7) return 3;
  if (daysAgo <= 30) return 2;
  return 1;
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
