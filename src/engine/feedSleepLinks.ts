import { differenceInMinutes, startOfDay, addHours } from 'date-fns';
import type {
  BabyName,
  FeedRecord,
  SleepRecord,
  FeedSleepAnalysis,
  FeedSleepInsight,
  InsightConfidence,
} from '../types';
import { PROFILES, NIGHT_SLEEP } from '../data/knowledge';
import { recencyWeight, weightedMedian, weightedAvg } from './recency';

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
  now: Date,
): FeedSleepInsight | null {
  const pairs: { volume: number; napDuration: number; time: Date }[] = [];

  for (const nap of naps) {
    const lastBottle = findLastFeedBefore(bottles, nap.startTime, 120);
    if (lastBottle && lastBottle.volumeMl > 0) {
      pairs.push({ volume: lastBottle.volumeMl, napDuration: nap.durationMin, time: nap.startTime });
    }
  }

  if (pairs.length < MIN_DATA_POINTS) return null;

  const medianVol = weightedMedian(
    pairs.map((p) => p.volume),
    pairs.map((p) => recencyWeight(p.time, now)),
  );
  const big = pairs.filter((p) => p.volume > medianVol);
  const small = pairs.filter((p) => p.volume <= medianVol);

  if (big.length < 3 || small.length < 3) return null;

  const avgBig = weightedAvg(
    big.map((p) => p.napDuration),
    big.map((p) => recencyWeight(p.time, now)),
  );
  const avgSmall = weightedAvg(
    small.map((p) => p.napDuration),
    small.map((p) => recencyWeight(p.time, now)),
  );
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
  now: Date,
): FeedSleepInsight | null {
  const longNapFeeds: { volume: number; latencyMin: number; time: Date }[] = [];
  const shortNapFeeds: { volume: number; latencyMin: number; time: Date }[] = [];

  for (const nap of naps) {
    if (!nap.endTime) continue;
    const nextFeed = findFirstFeedAfter(bottles, nap.endTime, 90);
    if (!nextFeed || nextFeed.volumeMl <= 0) continue;

    const latency = differenceInMinutes(nextFeed.timestamp, nap.endTime);
    const entry = { volume: nextFeed.volumeMl, latencyMin: latency, time: nap.startTime };

    if (nap.durationMin >= 45) {
      longNapFeeds.push(entry);
    } else {
      shortNapFeeds.push(entry);
    }
  }

  if (longNapFeeds.length < 3 || shortNapFeeds.length < 3) return null;
  const total = longNapFeeds.length + shortNapFeeds.length;
  if (total < MIN_DATA_POINTS) return null;

  const avgVolLong = weightedAvg(longNapFeeds.map((f) => f.volume), longNapFeeds.map((f) => recencyWeight(f.time, now)));
  const avgVolShort = weightedAvg(shortNapFeeds.map((f) => f.volume), shortNapFeeds.map((f) => recencyWeight(f.time, now)));
  const avgLatLong = weightedAvg(longNapFeeds.map((f) => f.latencyMin), longNapFeeds.map((f) => recencyWeight(f.time, now)));
  const avgLatShort = weightedAvg(shortNapFeeds.map((f) => f.latencyMin), shortNapFeeds.map((f) => recencyWeight(f.time, now)));

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
  now: Date,
): FeedSleepInsight | null {
  // Group evening bottles and night sleeps by day
  const dayMap = new Map<
    string,
    { eveningVolume: number; nightDuration: number; date: Date }
  >();

  // Night sleeps: starts >= 19h, duration > 120 min (aligned with sleep.ts)
  const nightSleeps = sleeps.filter(
    (s) => s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin,
  );

  for (const ns of nightSleeps) {
    const dayKey = startOfDay(ns.startTime).toISOString();
    // Sum evening bottles (18-22h) for that day — aligned with evening slot
    const dayStart = startOfDay(ns.startTime);
    const eveningStart = addHours(dayStart, 18);
    const eveningEnd = addHours(dayStart, 22);

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
        date: ns.startTime,
      });
    }
  }

  const entries = [...dayMap.values()];
  if (entries.length < MIN_DATA_POINTS) return null;

  const entryWeights = entries.map((e) => recencyWeight(e.date, now));
  const medianVol = weightedMedian(entries.map((e) => e.eveningVolume), entryWeights);
  const bigEvening = entries.filter((e) => e.eveningVolume > medianVol);
  const smallEvening = entries.filter((e) => e.eveningVolume <= medianVol);

  if (bigEvening.length < 3 || smallEvening.length < 3) return null;

  const avgNightBig = weightedAvg(bigEvening.map((e) => e.nightDuration), bigEvening.map((e) => recencyWeight(e.date, now)));
  const avgNightSmall = weightedAvg(smallEvening.map((e) => e.nightDuration), smallEvening.map((e) => recencyWeight(e.date, now)));
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
  now: Date,
): FeedSleepInsight | null {
  const latencies: number[] = [];
  const latWeights: number[] = [];

  for (const nap of naps) {
    const lastFeed = findLastFeedBefore(allFeeds, nap.startTime, 180);
    if (!lastFeed) continue;
    const latency = differenceInMinutes(nap.startTime, lastFeed.timestamp);
    if (latency > 0) {
      latencies.push(latency);
      latWeights.push(recencyWeight(nap.startTime, now));
    }
  }

  if (latencies.length < MIN_DATA_POINTS) return null;

  const med = Math.round(weightedMedian(latencies, latWeights));
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
  now: Date,
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

  // Compare to non-cluster average sleep duration (weighted by recency)
  const allDurations = sleeps.map((s) => s.durationMin);
  const allDurWeights = sleeps.map((s) => recencyWeight(s.startTime, now));
  const avgAll = weightedAvg(allDurations, allDurWeights);
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
// 6. Insights contextuels par créneau horaire
// ═══════════════════════════════════════════════════════════════════════════

function computeHourlyContextInsights(
  baby: BabyName,
  bottles: FeedRecord[],
  naps: SleepRecord[],
  nightSleeps: SleepRecord[],
  hour: number,
  now: Date,
): FeedSleepInsight[] {
  const name = PROFILES[baby].name;
  const results: FeedSleepInsight[] = [];

  if (hour >= 6 && hour < 10) {
    // Matin : impact du biberon du matin sur la sieste du matin
    const morningBottles = bottles.filter((f) => f.timestamp.getHours() >= 6 && f.timestamp.getHours() < 10);
    const morningNaps = naps.filter((s) => s.startTime.getHours() >= 8 && s.startTime.getHours() < 12);

    if (morningBottles.length >= 3 && morningNaps.length >= 3) {
      const medVol = median(morningBottles.map((f) => f.volumeMl));
      const bigMorning = morningNaps.filter((n) => {
        const fb = findLastFeedBefore(bottles, n.startTime, 180);
        return fb && fb.volumeMl > medVol;
      });
      const smallMorning = morningNaps.filter((n) => {
        const fb = findLastFeedBefore(bottles, n.startTime, 180);
        return fb && fb.volumeMl <= medVol;
      });

      if (bigMorning.length >= 2 && smallMorning.length >= 2) {
        const avgBig = Math.round(avg(bigMorning.map((n) => n.durationMin)));
        const avgSmall = Math.round(avg(smallMorning.map((n) => n.durationMin)));
        const lastBottle = morningBottles[morningBottles.length - 1];

        results.push({
          id: `hourly-morning-${baby}`,
          baby,
          label: 'Matin & sieste',
          observation: `Ce matin, ${name} a bu ${lastBottle ? `${lastBottle.volumeMl}ml` : '?'} — après un biberon >${Math.round(medVol)}ml, ses siestes du matin durent ~${avgBig}min vs ~${avgSmall}min sinon.`,
          dataPoints: bigMorning.length + smallMorning.length,
          confidence: confidence(bigMorning.length + smallMorning.length),
          stat: `${avgBig} vs ${avgSmall} min`,
        });
      }
    }
  } else if (hour >= 10 && hour < 14) {
    // Mi-journée : délai repas→sieste de midi, comparaison durée
    const middayNaps = naps.filter((s) => s.startTime.getHours() >= 11 && s.startTime.getHours() < 15);
    const otherNaps = naps.filter((s) => s.startTime.getHours() < 11 || s.startTime.getHours() >= 15);

    if (middayNaps.length >= 3) {
      const latencies: number[] = [];
      for (const nap of middayNaps) {
        const fb = findLastFeedBefore(bottles, nap.startTime, 180);
        if (fb) latencies.push(differenceInMinutes(nap.startTime, fb.timestamp));
      }
      const avgLatency = latencies.length >= 2 ? Math.round(avg(latencies)) : null;
      const avgMidday = Math.round(avg(middayNaps.map((n) => n.durationMin)));
      const avgOther = otherNaps.length >= 2 ? Math.round(avg(otherNaps.map((n) => n.durationMin))) : null;

      let obs = `La sieste de midi de ${name} dure en moyenne ${avgMidday}min`;
      if (avgOther !== null) obs += ` (vs ${avgOther}min pour les autres siestes)`;
      if (avgLatency !== null) obs += `. Délai repas→sieste : ~${avgLatency}min`;
      obs += '.';

      results.push({
        id: `hourly-midday-${baby}`,
        baby,
        label: 'Sieste de midi',
        observation: obs,
        dataPoints: middayNaps.length,
        confidence: confidence(middayNaps.length),
        stat: `~${avgMidday} min`,
      });
    }
  } else if (hour >= 14 && hour < 18) {
    // Après-midi : nb de siestes par jour, durée 3e sieste
    const napsByDay = new Map<string, number>();
    const thirdNapDurations: number[] = [];

    for (const nap of naps) {
      const dayKey = startOfDay(nap.startTime).toISOString();
      const count = (napsByDay.get(dayKey) ?? 0) + 1;
      napsByDay.set(dayKey, count);
      if (count === 3) thirdNapDurations.push(nap.durationMin);
    }

    const dayCounts = [...napsByDay.values()];
    if (dayCounts.length >= 3) {
      const avgNaps = Math.round(avg(dayCounts) * 10) / 10;
      let obs = `${name} fait en moyenne ${avgNaps} siestes par jour`;
      if (thirdNapDurations.length >= 2) {
        const avg3rd = Math.round(avg(thirdNapDurations));
        obs += `. La 3e sieste dure ~${avg3rd}min en moyenne`;
      }
      obs += '.';

      results.push({
        id: `hourly-afternoon-${baby}`,
        baby,
        label: 'Siestes de la journée',
        observation: obs,
        dataPoints: dayCounts.length,
        confidence: confidence(dayCounts.length),
        stat: `~${avgNaps} siestes/jour`,
      });
    }
  } else if (hour >= 18 && hour < 22) {
    // Soir : corrélation volume soir → 1er stretch de nuit
    const dayMap = new Map<string, { vol: number; stretch: number; date: Date }>();
    for (const ns of nightSleeps) {
      const dayKey = startOfDay(ns.startTime).toISOString();
      const dayStart = startOfDay(ns.startTime);
      const evStart = addHours(dayStart, 18);
      const evEnd = addHours(dayStart, 22);
      const vol = bottles
        .filter((f) => f.timestamp >= evStart && f.timestamp < evEnd)
        .reduce((s, f) => s + f.volumeMl, 0);
      if (vol > 0) dayMap.set(dayKey, { vol, stretch: ns.durationMin, date: ns.startTime });
    }

    const entries = [...dayMap.values()];
    if (entries.length >= 5) {
      const ew = entries.map((e) => recencyWeight(e.date, now));
      const medVol = weightedMedian(entries.map((e) => e.vol), ew);
      const big = entries.filter((e) => e.vol > medVol);
      const small = entries.filter((e) => e.vol <= medVol);
      if (big.length >= 2 && small.length >= 2) {
        const avgBig = Math.round(weightedAvg(big.map((e) => e.stretch), big.map((e) => recencyWeight(e.date, now))));
        const avgSmall = Math.round(weightedAvg(small.map((e) => e.stretch), small.map((e) => recencyWeight(e.date, now))));
        const diff = avgBig - avgSmall;

        results.push({
          id: `hourly-evening-${baby}`,
          baby,
          label: 'Volume du soir & nuit',
          observation: `Quand ${name} boit >${Math.round(medVol)}ml le soir, son 1er stretch de nuit dure ~${avgBig}min vs ~${avgSmall}min (${diff > 0 ? '+' : ''}${diff}min).`,
          dataPoints: entries.length,
          confidence: confidence(entries.length),
          stat: `${diff > 0 ? '+' : ''}${diff} min`,
        });
      }
    }
  } else {
    // Nuit (22-6h) : durée 1er stretch, nb réveils
    if (nightSleeps.length >= 3) {
      const avgStretch = Math.round(weightedAvg(nightSleeps.map((s) => s.durationMin), nightSleeps.map((s) => recencyWeight(s.startTime, now))));
      const stretchH = Math.floor(avgStretch / 60);
      const stretchM = avgStretch % 60;

      // Count night wakings per night
      const nightsByDay = new Map<string, number>();
      for (const ns of nightSleeps) {
        const dayKey = startOfDay(ns.startTime).toISOString();
        nightsByDay.set(dayKey, (nightsByDay.get(dayKey) ?? 0) + 1);
      }
      const wakingCounts = [...nightsByDay.values()];
      const avgWakings = wakingCounts.length > 0
        ? Math.round(avg(wakingCounts.map((c) => Math.max(0, c - 1))) * 10) / 10
        : null;

      let obs = `Le 1er stretch de nuit de ${name} dure en moyenne ${stretchH}h${stretchM > 0 ? stretchM.toString().padStart(2, '0') : ''}`;
      if (avgWakings !== null) obs += `. En moyenne ${avgWakings} réveil${avgWakings > 1 ? 's' : ''} par nuit`;
      obs += '.';

      results.push({
        id: `hourly-night-${baby}`,
        baby,
        label: 'Nuit en cours',
        observation: obs,
        dataPoints: nightSleeps.length,
        confidence: confidence(nightSleeps.length),
        stat: `~${stretchH}h${stretchM > 0 ? stretchM.toString().padStart(2, '0') : ''} de stretch`,
      });
    }
  }

  return results;
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

  // Night sleeps (starts >= 19h, duration > 120 min — aligned with sleep.ts)
  const nightSleeps = sleeps.filter(
    (s) => s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin,
  );

  const hour = now.getHours();

  const analyses = [
    computePreSleepFeedImpact(baby, bottles, naps, now),
    computePostNapAppetite(baby, bottles, naps, now),
    computeEveningFeedNightStretch(baby, bottles, sleeps, now),
    computeFeedToSleepLatency(baby, feeds, naps, now),
    computeClusterThenSleep(baby, feeds, sleeps, now),
  ];

  const hourlyInsights = computeHourlyContextInsights(baby, bottles, naps, nightSleeps, hour, now);

  return {
    baby,
    insights: [
      ...analyses.filter((a): a is FeedSleepInsight => a !== null),
      ...hourlyInsights,
    ],
    computedAt: now,
  };
}
