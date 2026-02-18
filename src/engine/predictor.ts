import { addMinutes, differenceInMinutes } from 'date-fns';
import type {
  BabyName,
  FeedRecord,
  SleepRecord,
  Prediction,
  TimingPrediction,
  VolumePrediction,
  Explanation,
} from '../types';
import { PROFILES } from '../data/knowledge';
import { INTERVAL_FILTER, getSlotId } from '../data/knowledge';
import { detectPatterns } from './patterns';
import { recencyWeight, weightedMedian, filterRecentFeeds, filterRecentSleeps } from './recency';

// Re-export for backwards compatibility (consumers may import from predictor)
export { INTERVAL_FILTER, getSlotId };

/**
 * Compute the weighted median latency (in minutes) between nap wake-up
 * and the next feed, from historical data.
 * Returns null if fewer than 3 data points.
 */
function computePostNapFeedLatency(
  baby: BabyName,
  allFeeds: FeedRecord[],
  allSleeps: SleepRecord[],
  now: Date,
): number | null {
  const babyFeeds = allFeeds
    .filter((f) => f.baby === baby)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const babySleeps = allSleeps
    .filter((s) => s.baby === baby && s.endTime)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const latencies: number[] = [];
  const weights: number[] = [];

  for (const nap of babySleeps) {
    if (!nap.endTime) continue;
    // Only daytime naps (6h–21h)
    if (nap.startTime.getHours() < 6 || nap.startTime.getHours() >= 21) continue;

    // Find the first feed after this nap's end (within 120 min)
    const napEnd = nap.endTime.getTime();
    let nextFeed: FeedRecord | null = null;
    for (const f of babyFeeds) {
      const ft = f.timestamp.getTime();
      if (ft >= napEnd && ft <= napEnd + 120 * 60_000) {
        nextFeed = f;
        break;
      }
    }
    if (!nextFeed) continue;

    const latency = differenceInMinutes(nextFeed.timestamp, nap.endTime);
    if (latency > 0 && latency <= 120) {
      latencies.push(latency);
      weights.push(recencyWeight(nap.endTime, now));
    }
  }

  if (latencies.length < 3) return null;
  return weightedMedian(latencies, weights);
}

/**
 * Find the most recent nap that ended recently (within maxMinAgo minutes)
 * for a given baby.
 */
function findRecentNapWakeUp(
  baby: BabyName,
  allSleeps: SleepRecord[],
  now: Date,
  maxMinAgo: number,
): SleepRecord | null {
  const cutoff = now.getTime() - maxMinAgo * 60_000;
  let best: SleepRecord | null = null;
  for (const s of allSleeps) {
    if (s.baby !== baby || !s.endTime) continue;
    const et = s.endTime.getTime();
    if (et >= cutoff && et <= now.getTime()) {
      if (!best || et > best.endTime!.getTime()) best = s;
    }
  }
  return best;
}

function getSlotForHour(hour: number, baby: BabyName) {
  const profile = PROFILES[baby];
  return profile.slots.find((s) => s.hours.includes(hour)) ?? profile.slots[0];
}

/** Minimum interval (minutes) to prevent infinite while-loops on bad data. */
const MIN_INTERVAL_MIN = 30;

function safeIntervalMin(intervalH: number): number {
  return Math.max(MIN_INTERVAL_MIN, Math.round(intervalH * 60));
}

function computeConfidence(weights: number[]): 'high' | 'medium' | 'low' {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight >= 100) return 'high';
  if (totalWeight >= 40) return 'medium';
  return 'low';
}

export function predictNextFeed(
  baby: BabyName,
  rawFeeds: FeedRecord[],
  rawSleeps: SleepRecord[],
  now: Date,
): Prediction | null {
  const allFeeds = filterRecentFeeds(rawFeeds, now);
  const allSleeps = filterRecentSleeps(rawSleeps, now);
  const profile = PROFILES[baby];
  const babyFeeds = allFeeds
    .filter((f) => f.baby === baby)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // --- Per-prediction slot cache (avoids redundant O(n) scans) ---
  const _intervalCache = new Map<string, number>();
  const _volumeCache = new Map<string, { meanMl: number; stdMl: number }>();
  const cachedInterval = (slotId: string) => {
    if (!_intervalCache.has(slotId)) {
      _intervalCache.set(slotId, computeSlotInterval(slotId, baby, allFeeds, now));
    }
    return _intervalCache.get(slotId)!;
  };
  const cachedVolume = (slotId: string) => {
    if (!_volumeCache.has(slotId)) {
      _volumeCache.set(slotId, computeSlotVolume(slotId, baby, allFeeds, now));
    }
    return _volumeCache.get(slotId)!;
  };

  // Fallback: no feed data → prediction based on hardcoded profiles
  if (babyFeeds.length === 0) {
    return predictFromProfile(baby, allFeeds, now, cachedInterval, cachedVolume);
  }

  const lastFeed = babyFeeds[babyFeeds.length - 1];

  // No fresh data → generate a clean profile-based daily plan.
  // Beyond p90 interval, assume baby ate normally per profile.
  // No manual entry ≠ baby hasn't eaten.
  const hoursSinceLastFeed = (now.getTime() - lastFeed.timestamp.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastFeed >= profile.stats.p90H) {
    return predictFromProfile(baby, allFeeds, now, cachedInterval, cachedVolume);
  }

  const patterns = detectPatterns(baby, allFeeds, allSleeps, now);
  const explanations: Explanation[] = [];

  // --- TIMING PREDICTION ---
  // Estimate target hour to pick the right slot, then use data-driven interval
  const roughHour = (lastFeed.timestamp.getHours() + Math.round(profile.stats.medianIntervalH)) % 24;
  const targetSlot = getSlotForHour(roughHour, baby);
  let intervalH = cachedInterval(targetSlot.id);

  // Apply pattern modifiers (COMPENSATION -25%, CLUSTER +30%, etc.)
  for (const pattern of patterns) {
    if (pattern.timingModifier && pattern.timingModifier !== 1) {
      intervalH *= pattern.timingModifier;
      const pct = Math.round((pattern.timingModifier - 1) * 100);
      explanations.push({
        ruleId: pattern.id,
        text: pattern.description,
        impact: `${pct > 0 ? '+' : ''}${pct}% intervalle`,
      });
    }
  }

  // Apply profile-specific interval adjustments
  const adjI = profile.predictionAdjustments.interval;
  if (adjI.base_multiplier && adjI.base_multiplier !== 1) {
    intervalH *= adjI.base_multiplier;
  }
  const slotId = getSlotId(roughHour);
  if (slotId === 'evening' && adjI.evening_reduction) {
    intervalH *= adjI.evening_reduction;
    explanations.push({
      ruleId: 'TIMING_EVENING',
      text: 'Créneau soir — intervalles plus courts',
      impact: `${Math.round((adjI.evening_reduction - 1) * 100)}% intervalle`,
    });
  }
  if (slotId === 'midday' && adjI.midday_extension) {
    intervalH *= adjI.midday_extension;
  }

  const intervalMin = Math.round(intervalH * 60);
  let predictedTime = addMinutes(lastFeed.timestamp, intervalMin);

  // If predicted time is in the past, advance by data-driven slot intervals until future.
  while (predictedTime < now) {
    const slot = getSlotForHour(predictedTime.getHours(), baby);
    predictedTime = addMinutes(predictedTime, safeIntervalMin(cachedInterval(slot.id)));
  }

  // --- POST-NAP ADJUSTMENT ---
  // If baby woke from a nap today and hasn't been fed since, rebase the
  // prediction on the nap wake-up. Window = 480 min (8h) so manually-logged
  // past naps are picked up, not just "just woke up" ones.
  const recentNap = findRecentNapWakeUp(baby, allSleeps, now, 480);
  if (recentNap?.endTime) {
    const postNapLatency = computePostNapFeedLatency(baby, allFeeds, allSleeps, now);
    const latencyMin = postNapLatency ?? 30;
    let postNapTime = addMinutes(recentNap.endTime, latencyMin);

    const fedSinceWake = babyFeeds.some(
      (f) => f.timestamp.getTime() >= recentNap.endTime!.getTime(),
    );

    if (!fedSinceWake) {
      // If post-nap feed time is already past, chain forward using slot
      // intervals until we reach the future — this rebases the whole
      // prediction chain on the nap wake-up.
      while (postNapTime < now) {
        const slot = getSlotForHour(postNapTime.getHours(), baby);
        postNapTime = addMinutes(postNapTime, safeIntervalMin(cachedInterval(slot.id)));
      }

      if (postNapTime < predictedTime) {
        predictedTime = postNapTime;
        explanations.push({
          ruleId: 'POST_NAP',
          text: `Réveil de sieste — repas recalé depuis réveil à ${recentNap.endTime.getHours()}h${String(recentNap.endTime.getMinutes()).padStart(2, '0')}`,
          impact: `~${latencyMin} min post-nap`,
        });
      }
    }
  }

  const confidenceMinutes = Math.round(intervalH * 20);
  const p10Time = addMinutes(predictedTime, -confidenceMinutes);
  const p90Time = addMinutes(predictedTime, confidenceMinutes);

  const timing: TimingPrediction = {
    predictedTime,
    confidenceMinutes,
    p10Time,
    p90Time,
  };

  // --- VOLUME PREDICTION ---
  const volumeSlotId = getSlotId(predictedTime.getHours());
  const vol = cachedVolume(volumeSlotId);
  let predictedMl = vol.meanMl;
  const stdMl = vol.stdMl;

  // Apply pattern modifiers on volume (stacks multiplicatively with profile adjustments below).
  // Example: EVENING pattern ×1.10 + evening_boost ×1.14 = ×1.25 total.
  // This is intentional: patterns capture generic time-of-day effects,
  // profile adjustments capture baby-specific calibration.
  for (const pattern of patterns) {
    if (pattern.volumeModifier && pattern.volumeModifier !== 1) {
      predictedMl *= pattern.volumeModifier;
    }
  }

  // Apply profile-specific volume adjustments
  const adjV = profile.predictionAdjustments.volume;
  if (volumeSlotId === 'evening' && adjV.evening_boost) {
    predictedMl *= adjV.evening_boost;
    explanations.push({
      ruleId: 'VOLUME_EVENING',
      text: 'Créneau soir — volumes plus élevés',
      impact: `+${Math.round((adjV.evening_boost - 1) * 100)}% volume`,
    });
  }
  if (volumeSlotId === 'night' && adjV.night_reduction) {
    predictedMl *= adjV.night_reduction;
    explanations.push({
      ruleId: 'VOLUME_NIGHT',
      text: 'Créneau nuit — volumes réduits',
      impact: `${Math.round((adjV.night_reduction - 1) * 100)}% volume`,
    });
  }
  if (volumeSlotId === 'midday' && adjV.midday_boost) {
    predictedMl *= adjV.midday_boost;
  }

  // Compensation: if last feed was small/large, adjust volume
  // Cap total volume modifiers to ±50% of slot mean to avoid extreme predictions.
  if (lastFeed.type === 'bottle' && lastFeed.volumeMl > 0) {
    const lastSlotVol = cachedVolume(getSlotId(lastFeed.timestamp.getHours()));
    const ratio = lastFeed.volumeMl / lastSlotVol.meanMl;
    if (ratio < 0.7) {
      predictedMl *= 1.10;
      explanations.push({
        ruleId: 'VOLUME_COMPENSATION',
        text: 'Dernier repas plus petit que la moyenne',
        impact: '+10% volume',
      });
    } else if (ratio > 1.3) {
      predictedMl *= 0.90;
      explanations.push({
        ruleId: 'VOLUME_LARGE_PREV',
        text: 'Dernier repas plus gros que la moyenne',
        impact: '-10% volume',
      });
    }
  }

  // Cap volume to ±50% of slot mean
  predictedMl = Math.max(vol.meanMl * 0.5, Math.min(predictedMl, vol.meanMl * 1.5));
  predictedMl = Math.round(predictedMl);
  const volume: VolumePrediction = {
    predictedMl,
    confidenceMl: Math.round(stdMl * 0.8),
    p10Ml: Math.max(30, predictedMl - Math.round(stdMl)),
    p90Ml: predictedMl + Math.round(stdMl),
  };

  const feedWeights = babyFeeds.map((f) => recencyWeight(f.timestamp, now));

  return {
    baby,
    timing,
    volume,
    explanations,
    confidence: computeConfidence(feedWeights),
    slot: getSlotId(predictedTime.getHours()),
    generatedAt: now,
  };
}

const SLOT_LABELS: Record<string, string> = {
  morning: 'Matin',
  midday: 'Mi-journée',
  afternoon: 'Après-midi',
  evening: 'Soirée',
  night: 'Nuit',
};

/**
 * Compute the weighted median interval for a specific time slot,
 * using real historical data with recency weighting.
 * Falls back to the slot's hardcoded interval if not enough data.
 */
export function computeSlotInterval(
  slotId: string,
  baby: BabyName,
  allFeeds: FeedRecord[],
  now: Date,
): number {
  const profile = PROFILES[baby];
  const slot = profile.slots.find((s) => s.id === slotId) ?? profile.slots[0];
  const babyFeeds = allFeeds
    .filter((f) => f.baby === baby)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (babyFeeds.length < 2) return slot.typicalIntervalAfterH;

  // Collect intervals where the feed fell in this slot
  const intervals: number[] = [];
  const weights: number[] = [];
  for (let i = 1; i < babyFeeds.length; i++) {
    const prevHour = babyFeeds[i - 1].timestamp.getHours();
    const prevSlot = profile.slots.find((s) => s.hours.includes(prevHour));
    if (!prevSlot || prevSlot.id !== slotId) continue;

    const diffH = (babyFeeds[i].timestamp.getTime() - babyFeeds[i - 1].timestamp.getTime()) / 3_600_000;
    if (diffH > INTERVAL_FILTER.minH && diffH < INTERVAL_FILTER.maxH) {
      intervals.push(diffH);
      const midpoint = new Date((babyFeeds[i - 1].timestamp.getTime() + babyFeeds[i].timestamp.getTime()) / 2);
      weights.push(recencyWeight(midpoint, now));
    }
  }

  if (intervals.length < 3) return slot.typicalIntervalAfterH;
  return weightedMedian(intervals, weights);
}

/**
 * Compute the weighted mean volume for a specific time slot.
 */
export function computeSlotVolume(
  slotId: string,
  baby: BabyName,
  allFeeds: FeedRecord[],
  now: Date,
): { meanMl: number; stdMl: number } {
  const profile = PROFILES[baby];
  const slot = profile.slots.find((s) => s.id === slotId) ?? profile.slots[0];
  const babyFeeds = allFeeds.filter(
    (f) => f.baby === baby && f.type === 'bottle' && f.volumeMl > 0,
  );

  const volumes: number[] = [];
  const weights: number[] = [];
  for (const feed of babyFeeds) {
    const hour = feed.timestamp.getHours();
    const feedSlot = profile.slots.find((s) => s.hours.includes(hour));
    if (!feedSlot || feedSlot.id !== slotId) continue;
    volumes.push(feed.volumeMl);
    weights.push(recencyWeight(feed.timestamp, now));
  }

  if (volumes.length < 3) return { meanMl: slot.meanMl, stdMl: slot.stdMl };

  const mean = weightedMedian(volumes, weights);
  // Approximate std from data
  const diffs = volumes.map((v) => (v - mean) ** 2);
  const std = Math.sqrt(diffs.reduce((s, d) => s + d, 0) / diffs.length);
  return { meanMl: Math.round(mean), stdMl: Math.round(std) };
}

/**
 * Generate a prediction based on historical data patterns (weighted by recency).
 * Used when there's no fresh feed to anchor on.
 * Walks from the current slot forward using data-driven intervals.
 */
function predictFromProfile(
  baby: BabyName,
  allFeeds: FeedRecord[],
  now: Date,
  cachedInterval: (slotId: string) => number,
  cachedVolume: (slotId: string) => { meanMl: number; stdMl: number },
): Prediction {
  const profile = PROFILES[baby];

  const currentHour = now.getHours();
  const currentSlot = getSlotForHour(currentHour, baby);

  // Anchor on the start of the current slot
  const slotStartHour = currentSlot.hours[0];
  const anchorTime = new Date(now);
  anchorTime.setHours(slotStartHour, 0, 0, 0);

  // Step forward using data-driven intervals until we're past now
  let predictedTime = anchorTime;
  while (predictedTime <= now) {
    const slot = getSlotForHour(predictedTime.getHours(), baby);
    predictedTime = addMinutes(predictedTime, safeIntervalMin(cachedInterval(slot.id)));
  }

  const nextSlot = getSlotForHour(predictedTime.getHours(), baby);
  const nextIntervalH = cachedInterval(nextSlot.id);
  const vol = cachedVolume(nextSlot.id);
  const confidenceMinutes = Math.round(nextIntervalH * 20);
  const slotLabel = SLOT_LABELS[nextSlot.id] ?? nextSlot.id;

  return {
    baby,
    timing: {
      predictedTime,
      confidenceMinutes,
      p10Time: addMinutes(predictedTime, -confidenceMinutes),
      p90Time: addMinutes(predictedTime, confidenceMinutes),
    },
    volume: {
      predictedMl: vol.meanMl,
      confidenceMl: Math.round(vol.stdMl * 0.8),
      p10Ml: Math.max(30, vol.meanMl - vol.stdMl),
      p90Ml: vol.meanMl + vol.stdMl,
    },
    explanations: [
      {
        ruleId: 'PROFILE_NO_FRESH',
        text: 'Pas de saisie récente — projection basée sur l\'historique',
        impact: 'mode profil',
      },
      {
        ruleId: 'PROFILE_SLOT',
        text: `Créneau ${slotLabel} — intervalle moyen ${nextIntervalH.toFixed(1)}h`,
        impact: `~${vol.meanMl}ml`,
      },
      {
        ruleId: 'PROFILE_RECENCY',
        text: 'Pondéré vers les 60 derniers jours',
        impact: `${profile.stats.typicalRangeMl[0]}–${profile.stats.typicalRangeMl[1]}ml`,
      },
    ],
    confidence: allFeeds.filter((f) => f.baby === baby).length >= 50 ? 'medium' : 'low',
    slot: getSlotId(predictedTime.getHours()),
    generatedAt: now,
    profileBased: true,
  };
}

