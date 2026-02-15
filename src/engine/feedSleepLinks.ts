import { differenceInMinutes, startOfDay, addHours } from 'date-fns';
import type {
  BabyName,
  FeedRecord,
  SleepRecord,
  FeedSleepAnalysis,
  FeedSleepInsight,
  InsightConfidence,
} from '../types';
import { PROFILES } from '../data/knowledge';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function confidence(n: number): InsightConfidence {
  if (n >= 25) return 'forte';
  if (n >= 12) return 'moderee';
  return 'faible';
}

/** Find the last feed before a given time, within maxMinBefore minutes. */
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

/** Find the first feed after a given time, within maxMinAfter minutes. */
function findFirstFeedAfter(
  feeds: FeedRecord[],
  after: Date,
  maxMinAfter: number,
): FeedRecord | null {
  const maxTime = after.getTime() + maxMinAfter * 60_000;
  let best: FeedRecord | null = null;
  for (const f of feeds) {
    const t = f.timestamp.getTime();
    if (t > after.getTime() && t <= maxTime) {
      if (!best || t < best.timestamp.getTime()) best = f;
    }
  }
  return best;
}

const MIN_DATA_POINTS = 5;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Impact du dernier biberon sur la durée de sieste
// ═══════════════════════════════════════════════════════════════════════════

function computePreSleepFeedImpact(
  baby: BabyName,
  bottles: FeedRecord[],
  naps: SleepRecord[],
): FeedSleepInsight | null {
  const pairs: { volume: number; napDuration: number }[] = [];

  for (const nap of naps) {
    const lastBottle = findLastFeedBefore(bottles, nap.startTime, 120);
    if (lastBottle && lastBottle.volumeMl > 0) {
      pairs.push({ volume: lastBottle.volumeMl, napDuration: nap.durationMin });
    }
  }

  if (pairs.length < MIN_DATA_POINTS) return null;

  const medianVol = median(pairs.map((p) => p.volume));
  const big = pairs.filter((p) => p.volume > medianVol);
  const small = pairs.filter((p) => p.volume <= medianVol);

  if (big.length < 3 || small.length < 3) return null;

  const avgBig = avg(big.map((p) => p.napDuration));
  const avgSmall = avg(small.map((p) => p.napDuration));
  const diff = Math.round(avgBig - avgSmall);

  if (Math.abs(diff) < 5) return null;

  const name = PROFILES[baby].name;
  const direction = diff > 0 ? 'plus longues' : 'plus courtes';
  const absDiff = Math.abs(diff);

  return {
    id: `pre-sleep-feed-${baby}`,
    baby,
    label: 'Biberon avant sieste',
    observation: `Quand le dernier biberon avant la sieste est plus gros (>${Math.round(medianVol)} ml), les siestes de ${name} sont en moyenne ${absDiff} min ${direction}.`,
    dataPoints: pairs.length,
    confidence: confidence(pairs.length),
    stat: `${diff > 0 ? '+' : ''}${diff} min`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Appétit post-sieste
// ═══════════════════════════════════════════════════════════════════════════

function computePostNapAppetite(
  baby: BabyName,
  bottles: FeedRecord[],
  naps: SleepRecord[],
): FeedSleepInsight | null {
  const longNapFeeds: { volume: number; latencyMin: number }[] = [];
  const shortNapFeeds: { volume: number; latencyMin: number }[] = [];

  for (const nap of naps) {
    if (!nap.endTime) continue;
    const nextFeed = findFirstFeedAfter(bottles, nap.endTime, 90);
    if (!nextFeed || nextFeed.volumeMl <= 0) continue;

    const latency = differenceInMinutes(nextFeed.timestamp, nap.endTime);
    const entry = { volume: nextFeed.volumeMl, latencyMin: latency };

    if (nap.durationMin >= 45) {
      longNapFeeds.push(entry);
    } else {
      shortNapFeeds.push(entry);
    }
  }

  if (longNapFeeds.length < 3 || shortNapFeeds.length < 3) return null;
  const total = longNapFeeds.length + shortNapFeeds.length;
  if (total < MIN_DATA_POINTS) return null;

  const avgVolLong = avg(longNapFeeds.map((f) => f.volume));
  const avgVolShort = avg(shortNapFeeds.map((f) => f.volume));
  const avgLatLong = avg(longNapFeeds.map((f) => f.latencyMin));
  const avgLatShort = avg(shortNapFeeds.map((f) => f.latencyMin));

  const volDiff = Math.round(avgVolLong - avgVolShort);
  const latDiff = Math.round(avgLatLong - avgLatShort);

  const name = PROFILES[baby].name;

  const parts: string[] = [];
  if (Math.abs(volDiff) >= 5) {
    parts.push(
      `mange en moyenne ${Math.abs(volDiff)} ml ${volDiff > 0 ? 'de plus' : 'de moins'}`,
    );
  }
  if (Math.abs(latDiff) >= 3) {
    parts.push(
      `redemande ${latDiff < 0 ? 'plus tôt' : 'plus tard'} (${Math.abs(latDiff)} min ${latDiff < 0 ? 'avant' : 'après'})`,
    );
  }

  if (parts.length === 0) return null;

  return {
    id: `post-nap-appetite-${baby}`,
    baby,
    label: 'Appétit post-sieste',
    observation: `Après une longue sieste (≥45 min), ${name} ${parts.join(' et ')}.`,
    dataPoints: total,
    confidence: confidence(total),
    stat: volDiff !== 0 ? `${volDiff > 0 ? '+' : ''}${volDiff} ml` : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Repas du soir → première nuit
// ═══════════════════════════════════════════════════════════════════════════

function computeEveningFeedNightStretch(
  baby: BabyName,
  bottles: FeedRecord[],
  sleeps: SleepRecord[],
): FeedSleepInsight | null {
  // Group evening bottles and night sleeps by day
  const dayMap = new Map<
    string,
    { eveningVolume: number; nightDuration: number }
  >();

  // Night sleeps: starts >= 20h, duration > 120 min
  const nightSleeps = sleeps.filter(
    (s) => s.startTime.getHours() >= 20 && s.durationMin > 120,
  );

  for (const ns of nightSleeps) {
    const dayKey = startOfDay(ns.startTime).toISOString();
    // Sum evening bottles (17-21h) for that day
    const dayStart = startOfDay(ns.startTime);
    const eveningStart = addHours(dayStart, 17);
    const eveningEnd = addHours(dayStart, 21);

    const eveningVol = bottles
      .filter(
        (f) =>
          f.timestamp >= eveningStart &&
          f.timestamp < eveningEnd &&
          f.volumeMl > 0,
      )
      .reduce((s, f) => s + f.volumeMl, 0);

    if (eveningVol > 0) {
      dayMap.set(dayKey, {
        eveningVolume: eveningVol,
        nightDuration: ns.durationMin,
      });
    }
  }

  const entries = [...dayMap.values()];
  if (entries.length < MIN_DATA_POINTS) return null;

  const medianVol = median(entries.map((e) => e.eveningVolume));
  const bigEvening = entries.filter((e) => e.eveningVolume > medianVol);
  const smallEvening = entries.filter((e) => e.eveningVolume <= medianVol);

  if (bigEvening.length < 3 || smallEvening.length < 3) return null;

  const avgNightBig = avg(bigEvening.map((e) => e.nightDuration));
  const avgNightSmall = avg(smallEvening.map((e) => e.nightDuration));
  const diff = Math.round(avgNightBig - avgNightSmall);

  if (Math.abs(diff) < 5) return null;

  const name = PROFILES[baby].name;
  const direction = diff > 0 ? 'plus long' : 'plus court';

  return {
    id: `evening-night-${baby}`,
    baby,
    label: 'Repas du soir & nuit',
    observation: `Les soirs où ${name} mange plus au biberon (>${Math.round(medianVol)} ml total), le premier sommeil de nuit dure en moyenne ${Math.abs(diff)} min de ${direction}.`,
    dataPoints: entries.length,
    confidence: confidence(entries.length),
    stat: `${diff > 0 ? '+' : ''}${diff} min de nuit`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Latence repas → endormissement
// ═══════════════════════════════════════════════════════════════════════════

function computeFeedToSleepLatency(
  baby: BabyName,
  allFeeds: FeedRecord[],
  naps: SleepRecord[],
): FeedSleepInsight | null {
  const latencies: number[] = [];

  for (const nap of naps) {
    const lastFeed = findLastFeedBefore(allFeeds, nap.startTime, 180);
    if (!lastFeed) continue;
    const latency = differenceInMinutes(nap.startTime, lastFeed.timestamp);
    if (latency > 0) latencies.push(latency);
  }

  if (latencies.length < MIN_DATA_POINTS) return null;

  const med = Math.round(median(latencies));
  const p25 = Math.round(percentile(latencies, 25));
  const p75 = Math.round(percentile(latencies, 75));

  const name = PROFILES[baby].name;

  return {
    id: `feed-sleep-latency-${baby}`,
    baby,
    label: 'Délai repas → sieste',
    observation: `${name} s'endort typiquement ${med} min après le dernier repas (entre ${p25} et ${p75} min le plus souvent).`,
    dataPoints: latencies.length,
    confidence: confidence(latencies.length),
    stat: `~${med} min`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Cluster feeding → sommeil plus long
// ═══════════════════════════════════════════════════════════════════════════

function computeClusterThenSleep(
  baby: BabyName,
  allFeeds: FeedRecord[],
  sleeps: SleepRecord[],
): FeedSleepInsight | null {
  // Detect cluster episodes: 3+ feeds within 180 min window
  const clusterEndTimes: Date[] = [];

  for (let i = 0; i < allFeeds.length; i++) {
    const windowStart = allFeeds[i].timestamp;
    const windowEnd = new Date(windowStart.getTime() + 180 * 60_000);
    const feedsInWindow = allFeeds.filter(
      (f) => f.timestamp >= windowStart && f.timestamp <= windowEnd,
    );
    if (feedsInWindow.length >= 3) {
      const lastInCluster = feedsInWindow[feedsInWindow.length - 1].timestamp;
      // Avoid duplicate cluster detections (skip if too close to previous)
      const prev = clusterEndTimes[clusterEndTimes.length - 1];
      if (!prev || differenceInMinutes(lastInCluster, prev) > 60) {
        clusterEndTimes.push(lastInCluster);
      }
    }
  }

  if (clusterEndTimes.length < 2) return null;

  // Find next sleep after each cluster
  const postClusterDurations: number[] = [];
  for (const clusterEnd of clusterEndTimes) {
    const nextSleep = sleeps.find(
      (s) =>
        s.startTime > clusterEnd &&
        differenceInMinutes(s.startTime, clusterEnd) <= 120,
    );
    if (nextSleep) {
      postClusterDurations.push(nextSleep.durationMin);
    }
  }

  if (postClusterDurations.length < MIN_DATA_POINTS) return null;

  // Compare to non-cluster average sleep duration
  const allDurations = sleeps.map((s) => s.durationMin);
  const avgAll = avg(allDurations);
  const avgPostCluster = avg(postClusterDurations);
  const diff = Math.round(avgPostCluster - avgAll);

  if (Math.abs(diff) < 3) return null;

  const name = PROFILES[baby].name;
  const direction = diff > 0 ? 'plus long' : 'plus court';

  return {
    id: `cluster-sleep-${baby}`,
    baby,
    label: 'Cluster feeding & sommeil',
    observation: `Après un épisode de cluster feeding, ${name} dort en moyenne ${Math.abs(diff)} min de ${direction} que d'habitude.`,
    dataPoints: postClusterDurations.length,
    confidence: confidence(postClusterDurations.length),
    stat: `${diff > 0 ? '+' : ''}${diff} min`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeFeedSleepLinks(
  baby: BabyName,
  allFeeds: FeedRecord[],
  allSleeps: SleepRecord[],
  now: Date,
): FeedSleepAnalysis {
  const feeds = allFeeds.filter((f) => f.baby === baby);
  const sleeps = allSleeps
    .filter((s) => s.baby === baby)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Bottles only (reliable volume)
  const bottles = feeds.filter((f) => f.type === 'bottle' && f.volumeMl > 0);

  // Daytime naps (6h-21h)
  const naps = sleeps.filter(
    (s) => s.startTime.getHours() >= 6 && s.startTime.getHours() < 21,
  );

  const analyses = [
    computePreSleepFeedImpact(baby, bottles, naps),
    computePostNapAppetite(baby, bottles, naps),
    computeEveningFeedNightStretch(baby, bottles, sleeps),
    computeFeedToSleepLatency(baby, feeds, naps),
    computeClusterThenSleep(baby, feeds, sleeps),
  ];

  return {
    baby,
    insights: analyses.filter((a): a is FeedSleepInsight => a !== null),
    computedAt: now,
  };
}
