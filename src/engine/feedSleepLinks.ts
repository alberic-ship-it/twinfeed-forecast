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
import { recencyWeight, weightedMedian, weightedAvg, percentile as sharedPercentile, filterRecentFeeds, filterRecentSleeps } from './recency';

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Simple unweighted average — used only for per-day aggregates without timestamps. */
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
  const p25 = Math.round(sharedPercentile(latencies, 25));
  const p75 = Math.round(sharedPercentile(latencies, 75));

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
  // Detect cluster episodes: 3+ feeds within 180 min window (O(n) sliding window)
  const clusterEndTimes: Date[] = [];
  const sortedFeeds = [...allFeeds].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  let windowStart = 0;
  for (let windowEnd = 0; windowEnd < sortedFeeds.length; windowEnd++) {
    // Shrink window from the left until it fits within 180 min
    while (sortedFeeds[windowEnd].timestamp.getTime() - sortedFeeds[windowStart].timestamp.getTime() > 180 * 60_000) {
      windowStart++;
    }
    const count = windowEnd - windowStart + 1;
    if (count >= 3) {
      const lastInCluster = sortedFeeds[windowEnd].timestamp;
      const prev = clusterEndTimes[clusterEndTimes.length - 1];
      if (!prev || differenceInMinutes(lastInCluster, prev) > 60) {
        clusterEndTimes.push(lastInCluster);
      }
    }
  }

  if (clusterEndTimes.length < 2) return null;

  // Find next sleep after each cluster
  const postClusterDurations: number[] = [];
  const postClusterWeights: number[] = [];
  for (const clusterEnd of clusterEndTimes) {
    const nextSleep = sleeps.find(
      (s) =>
        s.startTime > clusterEnd &&
        differenceInMinutes(s.startTime, clusterEnd) <= 120,
    );
    if (nextSleep) {
      postClusterDurations.push(nextSleep.durationMin);
      postClusterWeights.push(recencyWeight(clusterEnd, now));
    }
  }

  if (postClusterDurations.length < MIN_DATA_POINTS) return null;

  // Compare to non-cluster average sleep duration (weighted by recency)
  const allDurations = sleeps.map((s) => s.durationMin);
  const allDurWeights = sleeps.map((s) => recencyWeight(s.startTime, now));
  const avgAll = weightedAvg(allDurations, allDurWeights);
  const avgPostCluster = weightedAvg(postClusterDurations, postClusterWeights);
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
      const medVol = weightedMedian(
        morningBottles.map((f) => f.volumeMl),
        morningBottles.map((f) => recencyWeight(f.timestamp, now)),
      );
      const bigMorning = morningNaps.filter((n) => {
        const fb = findLastFeedBefore(bottles, n.startTime, 180);
        return fb && fb.volumeMl > medVol;
      });
      const smallMorning = morningNaps.filter((n) => {
        const fb = findLastFeedBefore(bottles, n.startTime, 180);
        return fb && fb.volumeMl <= medVol;
      });

      if (bigMorning.length >= 2 && smallMorning.length >= 2) {
        const avgBig = Math.round(weightedAvg(bigMorning.map((n) => n.durationMin), bigMorning.map((n) => recencyWeight(n.startTime, now))));
        const avgSmall = Math.round(weightedAvg(smallMorning.map((n) => n.durationMin), smallMorning.map((n) => recencyWeight(n.startTime, now))));
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
      const avgLatency = latencies.length >= 2 ? Math.round(weightedAvg(
        latencies,
        middayNaps.filter((n) => findLastFeedBefore(bottles, n.startTime, 180)).map((n) => recencyWeight(n.startTime, now)),
      )) : null;
      const avgMidday = Math.round(weightedAvg(middayNaps.map((n) => n.durationMin), middayNaps.map((n) => recencyWeight(n.startTime, now))));
      const avgOther = otherNaps.length >= 2 ? Math.round(weightedAvg(otherNaps.map((n) => n.durationMin), otherNaps.map((n) => recencyWeight(n.startTime, now)))) : null;

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
      const avgNaps = Math.round(avg(dayCounts) * 10) / 10; // day counts aren't timestamped, unweighted is fine
      let obs = `${name} fait en moyenne ${avgNaps} siestes par jour`;
      if (thirdNapDurations.length >= 2) {
        const avg3rd = Math.round(avg(thirdNapDurations)); // same: per-day stat, not timestamped
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

    // Sieste PM courte → coucher plus tôt ?
    const pmNaps = naps.filter((s) => s.startTime.getHours() >= 14 && s.startTime.getHours() < 18);
    if (pmNaps.length >= 5 && nightSleeps.length >= 5) {
      const shortPmDays: number[] = [];
      const longPmDays: number[] = [];
      for (const pm of pmNaps) {
        const dayKey = startOfDay(pm.startTime).getTime();
        const ns = nightSleeps.find((s) => startOfDay(s.startTime).getTime() === dayKey);
        if (!ns) continue;
        const bedtimeMin = ns.startTime.getHours() * 60 + ns.startTime.getMinutes();
        if (pm.durationMin < 30) {
          shortPmDays.push(bedtimeMin);
        } else {
          longPmDays.push(bedtimeMin);
        }
      }
      if (shortPmDays.length >= 2 && longPmDays.length >= 2) {
        const avgShort = Math.round(avg(shortPmDays)); // bedtime minutes, no timestamp for weighting
        const avgLong = Math.round(avg(longPmDays));
        const diff = avgLong - avgShort;
        if (Math.abs(diff) >= 5) {
          const formatShort = `${Math.floor(avgShort / 60)}h${(avgShort % 60).toString().padStart(2, '0')}`;
          const formatLong = `${Math.floor(avgLong / 60)}h${(avgLong % 60).toString().padStart(2, '0')}`;
          results.push({
            id: `hourly-afternoon-shortnap-${baby}`,
            baby,
            label: 'Sieste courte & coucher',
            observation: `Les jours où la sieste d'après-midi de ${name} dure moins de 30 min, le coucher est vers ${formatShort} contre ${formatLong} sinon (${Math.abs(diff)} min ${diff > 0 ? 'plus tôt' : 'plus tard'}).`,
            dataPoints: shortPmDays.length + longPmDays.length,
            confidence: confidence(shortPmDays.length + longPmDays.length),
            stat: `${diff > 0 ? '-' : '+'}${Math.abs(diff)} min`,
          });
        }
      }
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

    // Variabilité de l'heure de coucher
    if (nightSleeps.length >= 5) {
      const bedtimeMinutes = nightSleeps.map((s) => s.startTime.getHours() * 60 + s.startTime.getMinutes());
      const meanBedtime = avg(bedtimeMinutes);
      const variance = avg(bedtimeMinutes.map((v) => (v - meanBedtime) ** 2));
      const std = Math.round(Math.sqrt(variance));

      if (std > 20) {
        results.push({
          id: `hourly-evening-variability-${baby}`,
          baby,
          label: 'Régularité du coucher',
          observation: `Le coucher de ${name} varie de ±${std} min d'un soir à l'autre. Un rituel constant aide à stabiliser l'heure d'endormissement.`,
          dataPoints: nightSleeps.length,
          confidence: confidence(nightSleeps.length),
          stat: `±${std} min`,
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
// 7. Fenêtre d'éveil → qualité de la sieste
// ═══════════════════════════════════════════════════════════════════════════

function computeWakeWindowNapQuality(
  baby: BabyName,
  naps: SleepRecord[],
  allSleeps: SleepRecord[],
  now: Date,
): FeedSleepInsight | null {
  const THRESHOLD_MIN = 105; // 1h45
  const shortWakeNaps: { duration: number; time: Date }[] = [];
  const longWakeNaps: { duration: number; time: Date }[] = [];

  for (const nap of naps) {
    // Find previous sleep end (nap or night)
    const prevSleep = [...allSleeps]
      .filter((s) => s.baby === baby && s.endTime && s.endTime < nap.startTime)
      .sort((a, b) => b.endTime!.getTime() - a.endTime!.getTime())[0];
    if (!prevSleep?.endTime) continue;

    const wakeMin = differenceInMinutes(nap.startTime, prevSleep.endTime);
    if (wakeMin <= 0 || wakeMin > 300) continue;

    const entry = { duration: nap.durationMin, time: nap.startTime };
    if (wakeMin <= THRESHOLD_MIN) {
      shortWakeNaps.push(entry);
    } else {
      longWakeNaps.push(entry);
    }
  }

  if (shortWakeNaps.length < 3 || longWakeNaps.length < 3) return null;

  const avgShort = Math.round(weightedAvg(
    shortWakeNaps.map((n) => n.duration),
    shortWakeNaps.map((n) => recencyWeight(n.time, now)),
  ));
  const avgLong = Math.round(weightedAvg(
    longWakeNaps.map((n) => n.duration),
    longWakeNaps.map((n) => recencyWeight(n.time, now)),
  ));
  const diff = avgShort - avgLong;
  if (Math.abs(diff) < 3) return null;

  const name = PROFILES[baby].name;
  return {
    id: `wake-window-nap-${baby}`,
    baby,
    label: 'Fenêtre d\'éveil & sieste',
    observation: `Quand ${name} s'endort dans les 1h45 après son réveil, ses siestes durent ~${avgShort} min contre ~${avgLong} min quand elle reste éveillée plus longtemps.`,
    dataPoints: shortWakeNaps.length + longWakeNaps.length,
    confidence: confidence(shortWakeNaps.length + longWakeNaps.length),
    stat: `${diff > 0 ? '+' : ''}${diff} min`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Volume d'après-midi → qualité de la nuit
// ═══════════════════════════════════════════════════════════════════════════

function computeAfternoonFeedSleepQuality(
  baby: BabyName,
  bottles: FeedRecord[],
  sleeps: SleepRecord[],
  now: Date,
): FeedSleepInsight | null {
  const dayMap = new Map<string, { vol: number; nightDuration: number; date: Date }>();

  const nightSleeps = sleeps.filter(
    (s) => s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin,
  );

  for (const ns of nightSleeps) {
    const dayStart = startOfDay(ns.startTime);
    const pmStart = addHours(dayStart, 14);
    const pmEnd = addHours(dayStart, 17);

    const pmVol = bottles
      .filter((f) => f.timestamp >= pmStart && f.timestamp < pmEnd && f.volumeMl > 0)
      .reduce((s, f) => s + f.volumeMl, 0);

    if (pmVol > 0) {
      dayMap.set(dayStart.toISOString(), { vol: pmVol, nightDuration: ns.durationMin, date: ns.startTime });
    }
  }

  const entries = [...dayMap.values()];
  if (entries.length < MIN_DATA_POINTS) return null;

  const ew = entries.map((e) => recencyWeight(e.date, now));
  const medVol = weightedMedian(entries.map((e) => e.vol), ew);
  const big = entries.filter((e) => e.vol > medVol);
  const small = entries.filter((e) => e.vol <= medVol);
  if (big.length < 3 || small.length < 3) return null;

  const avgBig = Math.round(weightedAvg(big.map((e) => e.nightDuration), big.map((e) => recencyWeight(e.date, now))));
  const avgSmall = Math.round(weightedAvg(small.map((e) => e.nightDuration), small.map((e) => recencyWeight(e.date, now))));
  const diff = avgBig - avgSmall;
  if (Math.abs(diff) < 5) return null;

  const name = PROFILES[baby].name;
  return {
    id: `afternoon-feed-night-${baby}`,
    baby,
    label: 'Biberon d\'après-midi & nuit',
    observation: `Les jours où ${name} boit plus de ${Math.round(medVol)} ml l'après-midi, son premier sommeil de nuit dure en moyenne ${Math.abs(diff)} min de ${diff > 0 ? 'plus' : 'moins'}.`,
    dataPoints: entries.length,
    confidence: confidence(entries.length),
    stat: `${diff > 0 ? '+' : ''}${diff} min de nuit`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Tendance des biberons de nuit
// ═══════════════════════════════════════════════════════════════════════════

function computeNightFeedTrend(
  baby: BabyName,
  bottles: FeedRecord[],
  now: Date,
): FeedSleepInsight | null {
  // Night bottles (22h-6h)
  const nightBottles = bottles
    .filter((f) => f.timestamp.getHours() >= 22 || f.timestamp.getHours() < 6)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (nightBottles.length < 6) return null;

  const midIdx = Math.floor(nightBottles.length / 2);
  const firstHalf = nightBottles.slice(0, midIdx);
  const secondHalf = nightBottles.slice(midIdx);

  const avgFirst = Math.round(weightedAvg(firstHalf.map((f) => f.volumeMl), firstHalf.map((f) => recencyWeight(f.timestamp, now))));
  const avgSecond = Math.round(weightedAvg(secondHalf.map((f) => f.volumeMl), secondHalf.map((f) => recencyWeight(f.timestamp, now))));
  const diff = avgSecond - avgFirst;

  if (Math.abs(diff) < 10) return null;

  const name = PROFILES[baby].name;
  const direction = diff < 0 ? 'diminué' : 'augmenté';

  return {
    id: `night-feed-trend-${baby}`,
    baby,
    label: 'Évolution biberons de nuit',
    observation: `Les biberons de nuit de ${name} ont ${direction} : ~${avgFirst} ml → ~${avgSecond} ml en moyenne ces dernières semaines.`,
    dataPoints: nightBottles.length,
    confidence: confidence(nightBottles.length),
    stat: `${diff > 0 ? '+' : ''}${diff} ml`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. Volume total journalier → qualité de la nuit
// ═══════════════════════════════════════════════════════════════════════════

function computeDailyVolumeNightQuality(
  baby: BabyName,
  bottles: FeedRecord[],
  sleeps: SleepRecord[],
  now: Date,
): FeedSleepInsight | null {
  const nightSleeps = sleeps.filter(
    (s) => s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin,
  );

  const dayMap = new Map<string, { totalVol: number; nightDuration: number; date: Date }>();

  for (const ns of nightSleeps) {
    const dayStart = startOfDay(ns.startTime);
    const dayEnd = addHours(dayStart, 22);

    const dayVol = bottles
      .filter((f) => f.timestamp >= dayStart && f.timestamp < dayEnd)
      .reduce((s, f) => s + f.volumeMl, 0);

    if (dayVol > 0) {
      dayMap.set(dayStart.toISOString(), { totalVol: dayVol, nightDuration: ns.durationMin, date: ns.startTime });
    }
  }

  const entries = [...dayMap.values()];
  if (entries.length < MIN_DATA_POINTS) return null;

  const ew = entries.map((e) => recencyWeight(e.date, now));
  const medVol = weightedMedian(entries.map((e) => e.totalVol), ew);
  const big = entries.filter((e) => e.totalVol > medVol);
  const small = entries.filter((e) => e.totalVol <= medVol);
  if (big.length < 3 || small.length < 3) return null;

  const avgBig = Math.round(weightedAvg(big.map((e) => e.nightDuration), big.map((e) => recencyWeight(e.date, now))));
  const avgSmall = Math.round(weightedAvg(small.map((e) => e.nightDuration), small.map((e) => recencyWeight(e.date, now))));
  const diff = avgBig - avgSmall;
  if (Math.abs(diff) < 5) return null;

  const name = PROFILES[baby].name;
  return {
    id: `daily-volume-night-${baby}`,
    baby,
    label: 'Volume total & nuit',
    observation: `Les jours où ${name} boit plus de ${Math.round(medVol)} ml au total, sa nuit dure en moyenne ${Math.abs(diff)} min de ${diff > 0 ? 'plus' : 'moins'}.`,
    dataPoints: entries.length,
    confidence: confidence(entries.length),
    stat: `${diff > 0 ? '+' : ''}${diff} min`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. Nombre de siestes → heure de coucher
// ═══════════════════════════════════════════════════════════════════════════

function computeNapCountBedtime(
  baby: BabyName,
  naps: SleepRecord[],
  sleeps: SleepRecord[],
  now: Date,
): FeedSleepInsight | null {
  const nightSleeps = sleeps.filter(
    (s) => s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin,
  );

  const dayData: { napCount: number; bedtimeMin: number; date: Date }[] = [];

  for (const ns of nightSleeps) {
    const dayStart = startOfDay(ns.startTime);
    const dayNaps = naps.filter((n) => {
      const d = startOfDay(n.startTime);
      return d.getTime() === dayStart.getTime();
    });
    const bedtimeMin = ns.startTime.getHours() * 60 + ns.startTime.getMinutes();
    dayData.push({ napCount: dayNaps.length, bedtimeMin, date: ns.startTime });
  }

  const days3 = dayData.filter((d) => d.napCount >= 3);
  const days2 = dayData.filter((d) => d.napCount === 2);
  if (days3.length < 3 || days2.length < 3) return null;

  const avg3 = Math.round(weightedAvg(days3.map((d) => d.bedtimeMin), days3.map((d) => recencyWeight(d.date, now))));
  const avg2 = Math.round(weightedAvg(days2.map((d) => d.bedtimeMin), days2.map((d) => recencyWeight(d.date, now))));
  const diff = avg3 - avg2;
  if (Math.abs(diff) < 5) return null;

  const name = PROFILES[baby].name;
  const format3 = `${Math.floor(avg3 / 60)}h${(avg3 % 60).toString().padStart(2, '0')}`;
  const format2 = `${Math.floor(avg2 / 60)}h${(avg2 % 60).toString().padStart(2, '0')}`;

  return {
    id: `nap-count-bedtime-${baby}`,
    baby,
    label: 'Nombre de siestes & coucher',
    observation: `Les jours à 3 siestes, ${name} s'endort vers ${format3} en moyenne, contre ${format2} les jours à 2 siestes (${Math.abs(diff)} min de ${diff > 0 ? 'plus tard' : 'plus tôt'}).`,
    dataPoints: days3.length + days2.length,
    confidence: confidence(days3.length + days2.length),
    stat: `${diff > 0 ? '+' : ''}${diff} min`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. Sieste courte → biberon suivant
// ═══════════════════════════════════════════════════════════════════════════

function computeShortNapNextFeed(
  baby: BabyName,
  bottles: FeedRecord[],
  naps: SleepRecord[],
  now: Date,
): FeedSleepInsight | null {
  const shortNapFeeds: { latency: number; volume: number; time: Date }[] = [];
  const normalNapFeeds: { latency: number; volume: number; time: Date }[] = [];

  for (const nap of naps) {
    if (!nap.endTime) continue;
    const nextFeed = findFirstFeedAfter(bottles, nap.endTime, 120);
    if (!nextFeed || nextFeed.volumeMl <= 0) continue;

    const latency = differenceInMinutes(nextFeed.timestamp, nap.endTime);
    const entry = { latency, volume: nextFeed.volumeMl, time: nap.startTime };

    if (nap.durationMin < 30) {
      shortNapFeeds.push(entry);
    } else {
      normalNapFeeds.push(entry);
    }
  }

  if (shortNapFeeds.length < 3 || normalNapFeeds.length < 3) return null;

  const avgLatShort = Math.round(weightedAvg(shortNapFeeds.map((f) => f.latency), shortNapFeeds.map((f) => recencyWeight(f.time, now))));
  const avgLatNormal = Math.round(weightedAvg(normalNapFeeds.map((f) => f.latency), normalNapFeeds.map((f) => recencyWeight(f.time, now))));
  const avgVolShort = Math.round(weightedAvg(shortNapFeeds.map((f) => f.volume), shortNapFeeds.map((f) => recencyWeight(f.time, now))));
  const avgVolNormal = Math.round(weightedAvg(normalNapFeeds.map((f) => f.volume), normalNapFeeds.map((f) => recencyWeight(f.time, now))));

  const latDiff = avgLatShort - avgLatNormal;
  const volDiff = avgVolShort - avgVolNormal;

  const parts: string[] = [];
  if (Math.abs(latDiff) >= 3) {
    parts.push(`redemande à manger ${Math.abs(latDiff)} min ${latDiff < 0 ? 'plus tôt' : 'plus tard'}`);
  }
  if (Math.abs(volDiff) >= 5) {
    parts.push(`boit ${Math.abs(volDiff)} ml ${volDiff > 0 ? 'de plus' : 'de moins'}`);
  }
  if (parts.length === 0) return null;

  const name = PROFILES[baby].name;
  return {
    id: `short-nap-feed-${baby}`,
    baby,
    label: 'Sieste courte & biberon',
    observation: `Après une sieste courte (<30 min), ${name} ${parts.join(' et ')}.`,
    dataPoints: shortNapFeeds.length + normalNapFeeds.length,
    confidence: confidence(shortNapFeeds.length + normalNapFeeds.length),
    stat: volDiff !== 0 ? `${volDiff > 0 ? '+' : ''}${volDiff} ml` : `${latDiff > 0 ? '+' : ''}${latDiff} min`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. Écart de coucher entre jumelles
// ═══════════════════════════════════════════════════════════════════════════

function computeTwinsBedtimeGap(
  allSleeps: SleepRecord[],
  now: Date,
): FeedSleepInsight | null {
  const nightSleepsC = allSleeps
    .filter((s) => s.baby === 'colette' && s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin);
  const nightSleepsI = allSleeps
    .filter((s) => s.baby === 'isaure' && s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin);

  const gaps: number[] = [];
  const gapDates: Date[] = [];

  for (const c of nightSleepsC) {
    const dayKey = startOfDay(c.startTime).getTime();
    const match = nightSleepsI.find((i) => startOfDay(i.startTime).getTime() === dayKey);
    if (match) {
      const gap = differenceInMinutes(c.startTime, match.startTime);
      gaps.push(gap);
      gapDates.push(c.startTime);
    }
  }

  if (gaps.length < MIN_DATA_POINTS) return null;

  const avgGap = Math.round(weightedAvg(gaps, gapDates.map((d) => recencyWeight(d, now))));
  const absGap = Math.abs(avgGap);
  if (absGap < 3) return null;

  const first = avgGap > 0 ? 'Isaure' : 'Colette';

  return {
    id: 'twins-bedtime-gap',
    baby: 'colette', // shown once for both
    label: 'Coucher des jumelles',
    observation: `Colette et Isaure s'endorment en moyenne à ${absGap} min d'écart le soir. ${first} s'endort généralement en premier.`,
    dataPoints: gaps.length,
    confidence: confidence(gaps.length),
    stat: `~${absGap} min d'écart`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 14. Biberon du matin → sieste du matin
// ═══════════════════════════════════════════════════════════════════════════

function computeMorningFeedMorningNap(
  baby: BabyName,
  bottles: FeedRecord[],
  naps: SleepRecord[],
  now: Date,
): FeedSleepInsight | null {
  const morningBottles = bottles.filter((f) => f.timestamp.getHours() >= 6 && f.timestamp.getHours() < 9);
  const morningNaps = naps.filter((s) => s.startTime.getHours() >= 8 && s.startTime.getHours() < 12);

  if (morningBottles.length < 5 || morningNaps.length < 5) return null;

  const medVol = weightedMedian(
    morningBottles.map((f) => f.volumeMl),
    morningBottles.map((f) => recencyWeight(f.timestamp, now)),
  );

  const pairs: { vol: number; napDur: number; time: Date }[] = [];
  for (const nap of morningNaps) {
    const morningFeed = findLastFeedBefore(bottles, nap.startTime, 180);
    if (morningFeed && morningFeed.timestamp.getHours() >= 6 && morningFeed.timestamp.getHours() < 9) {
      pairs.push({ vol: morningFeed.volumeMl, napDur: nap.durationMin, time: nap.startTime });
    }
  }

  if (pairs.length < MIN_DATA_POINTS) return null;

  const big = pairs.filter((p) => p.vol > medVol);
  const small = pairs.filter((p) => p.vol <= medVol);
  if (big.length < 3 || small.length < 3) return null;

  const avgBig = Math.round(weightedAvg(big.map((p) => p.napDur), big.map((p) => recencyWeight(p.time, now))));
  const avgSmall = Math.round(weightedAvg(small.map((p) => p.napDur), small.map((p) => recencyWeight(p.time, now))));
  const diff = avgBig - avgSmall;
  if (Math.abs(diff) < 3) return null;

  const name = PROFILES[baby].name;
  return {
    id: `morning-feed-nap-${baby}`,
    baby,
    label: 'Biberon du matin & sieste',
    observation: `Quand ${name} boit plus de ${Math.round(medVol)} ml au premier biberon, sa sieste du matin dure ~${avgBig} min contre ~${avgSmall} min sinon.`,
    dataPoints: pairs.length,
    confidence: confidence(pairs.length),
    stat: `${diff > 0 ? '+' : ''}${diff} min`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 15. Régularité des horaires → qualité de la nuit
// ═══════════════════════════════════════════════════════════════════════════

function computeScheduleRegularity(
  baby: BabyName,
  bottles: FeedRecord[],
  sleeps: SleepRecord[],
  now: Date,
): FeedSleepInsight | null {
  const nightSleeps = sleeps.filter(
    (s) => s.startTime.getHours() >= NIGHT_SLEEP.minStartHour && s.durationMin > NIGHT_SLEEP.minDurationMin,
  );

  const dayData: { stdInterval: number; nightDuration: number; date: Date }[] = [];

  for (const ns of nightSleeps) {
    const dayStart = startOfDay(ns.startTime);
    const dayEnd = addHours(dayStart, 22);
    const dayBottles = bottles
      .filter((f) => f.timestamp >= dayStart && f.timestamp < dayEnd)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (dayBottles.length < 3) continue;

    const intervals: number[] = [];
    for (let i = 1; i < dayBottles.length; i++) {
      intervals.push(differenceInMinutes(dayBottles[i].timestamp, dayBottles[i - 1].timestamp));
    }

    const mean = avg(intervals);
    const variance = avg(intervals.map((v) => (v - mean) ** 2));
    const std = Math.sqrt(variance);

    dayData.push({ stdInterval: std, nightDuration: ns.durationMin, date: ns.startTime });
  }

  if (dayData.length < MIN_DATA_POINTS) return null;

  const medStd = weightedMedian(dayData.map((d) => d.stdInterval), dayData.map((d) => recencyWeight(d.date, now)));
  const regular = dayData.filter((d) => d.stdInterval <= medStd);
  const irregular = dayData.filter((d) => d.stdInterval > medStd);
  if (regular.length < 3 || irregular.length < 3) return null;

  const avgRegNight = Math.round(weightedAvg(regular.map((d) => d.nightDuration), regular.map((d) => recencyWeight(d.date, now))));
  const avgIrrNight = Math.round(weightedAvg(irregular.map((d) => d.nightDuration), irregular.map((d) => recencyWeight(d.date, now))));
  const diff = avgRegNight - avgIrrNight;
  if (Math.abs(diff) < 5) return null;

  const name = PROFILES[baby].name;
  return {
    id: `schedule-regularity-${baby}`,
    baby,
    label: 'Régularité des repas & nuit',
    observation: `Les jours où les repas de ${name} sont réguliers, sa nuit est en moyenne ${Math.abs(diff)} min ${diff > 0 ? 'plus longue' : 'plus courte'}.`,
    dataPoints: dayData.length,
    confidence: confidence(dayData.length),
    stat: `${diff > 0 ? '+' : ''}${diff} min`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeFeedSleepLinks(
  baby: BabyName,
  rawFeeds: FeedRecord[],
  rawSleeps: SleepRecord[],
  now: Date,
): FeedSleepAnalysis {
  const allFeeds = filterRecentFeeds(rawFeeds, now);
  const allSleeps = filterRecentSleeps(rawSleeps, now);
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
    computeWakeWindowNapQuality(baby, naps, allSleeps, now),
    computeAfternoonFeedSleepQuality(baby, bottles, sleeps, now),
    computeNightFeedTrend(baby, bottles, now),
    computeDailyVolumeNightQuality(baby, bottles, sleeps, now),
    computeNapCountBedtime(baby, naps, sleeps, now),
    computeShortNapNextFeed(baby, bottles, naps, now),
    computeTwinsBedtimeGap(allSleeps, now),
    computeMorningFeedMorningNap(baby, bottles, naps, now),
    computeScheduleRegularity(baby, bottles, sleeps, now),
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
