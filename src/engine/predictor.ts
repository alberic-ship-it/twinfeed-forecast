import { addMinutes } from 'date-fns';
import type {
  BabyName,
  FeedRecord,
  SleepRecord,
  Prediction,
  TimingPrediction,
  VolumePrediction,
  Explanation,
  TimeSlotId,
} from '../types';
import { PROFILES } from '../data/knowledge';
import { detectPatterns } from './patterns';

function getSlotForHour(hour: number, baby: BabyName) {
  const profile = PROFILES[baby];
  return profile.slots.find((s) => s.hours.includes(hour)) ?? profile.slots[0];
}

function getSlotId(hour: number): TimeSlotId {
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

function computeMedianInterval(feeds: FeedRecord[]): number {
  if (feeds.length < 2) return 3.5;
  const intervals: number[] = [];
  for (let i = 1; i < feeds.length; i++) {
    const diffH = (feeds[i].timestamp.getTime() - feeds[i - 1].timestamp.getTime()) / (1000 * 60 * 60);
    if (diffH > 0.5 && diffH < 12) {
      intervals.push(diffH);
    }
  }
  if (intervals.length === 0) return 3.5;
  intervals.sort((a, b) => a - b);
  return intervals[Math.floor(intervals.length / 2)];
}

function computeConfidence(feedCount: number): 'high' | 'medium' | 'low' {
  if (feedCount >= 50) return 'high';
  if (feedCount >= 20) return 'medium';
  return 'low';
}

export function predictNextFeed(
  baby: BabyName,
  allFeeds: FeedRecord[],
  allSleeps: SleepRecord[],
  now: Date,
): Prediction | null {
  const profile = PROFILES[baby];
  const babyFeeds = allFeeds
    .filter((f) => f.baby === baby)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Fallback: no feed data → prediction based on hardcoded profiles
  if (babyFeeds.length === 0) {
    return predictFromProfile(baby, now);
  }

  const lastFeed = babyFeeds[babyFeeds.length - 1];
  const patterns = detectPatterns(baby, allFeeds, allSleeps, now);
  const explanations: Explanation[] = [];

  // --- TIMING PREDICTION ---
  const medianInterval = computeMedianInterval(babyFeeds);
  let intervalH = medianInterval;

  // Apply slot-based interval
  const predictedHour = (lastFeed.timestamp.getHours() + Math.round(intervalH)) % 24;
  const targetSlot = getSlotForHour(predictedHour, baby);
  intervalH = targetSlot.typicalIntervalAfterH;
  explanations.push({
    ruleId: 'TIMING_BASE',
    text: `Intervalle médian : ${medianInterval.toFixed(1)}h`,
    impact: 'base',
  });

  // Apply pattern modifiers
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

  // Apply profile adjustments
  const adj = profile.predictionAdjustments.interval;
  if (adj.base_multiplier) {
    intervalH *= adj.base_multiplier;
  }
  const slotId = getSlotId(predictedHour);
  if (slotId === 'evening' && adj.evening_reduction) {
    intervalH *= adj.evening_reduction;
    explanations.push({
      ruleId: 'TIMING_EVENING',
      text: 'Créneau soir — intervalles plus courts',
      impact: '-15% intervalle',
    });
  }

  const intervalMin = Math.round(intervalH * 60);
  const predictedTime = addMinutes(lastFeed.timestamp, intervalMin);
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
  const volumeSlot = getSlotForHour(predictedTime.getHours(), baby);
  let predictedMl = volumeSlot.meanMl;
  const stdMl = volumeSlot.stdMl;

  // Apply pattern modifiers on volume
  for (const pattern of patterns) {
    if (pattern.volumeModifier && pattern.volumeModifier !== 1) {
      predictedMl *= pattern.volumeModifier;
    }
  }

  // Compensation: if last feed was small, predict slightly more
  if (lastFeed.type === 'bottle' && lastFeed.volumeMl > 0) {
    const lastSlot = getSlotForHour(lastFeed.timestamp.getHours(), baby);
    const ratio = lastFeed.volumeMl / lastSlot.meanMl;
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

  predictedMl = Math.round(predictedMl);
  const volume: VolumePrediction = {
    predictedMl,
    confidenceMl: Math.round(stdMl * 0.8),
    p10Ml: Math.max(30, predictedMl - Math.round(stdMl)),
    p90Ml: predictedMl + Math.round(stdMl),
  };

  return {
    baby,
    timing,
    volume,
    explanations,
    confidence: computeConfidence(babyFeeds.length),
    slot: getSlotId(predictedTime.getHours()),
    generatedAt: now,
  };
}

function predictFromProfile(baby: BabyName, now: Date): Prediction {
  const profile = PROFILES[baby];
  const currentSlot = getSlotForHour(now.getHours(), baby);
  const intervalH = currentSlot.typicalIntervalAfterH;
  const intervalMin = Math.round(intervalH * 60);

  const predictedTime = addMinutes(now, intervalMin);
  const confidenceMinutes = Math.round(intervalH * 30); // wider confidence without data

  const nextSlot = getSlotForHour(predictedTime.getHours(), baby);

  return {
    baby,
    timing: {
      predictedTime,
      confidenceMinutes,
      p10Time: addMinutes(predictedTime, -confidenceMinutes),
      p90Time: addMinutes(predictedTime, confidenceMinutes),
    },
    volume: {
      predictedMl: nextSlot.meanMl,
      confidenceMl: Math.round(nextSlot.stdMl),
      p10Ml: Math.max(30, nextSlot.meanMl - nextSlot.stdMl),
      p90Ml: nextSlot.meanMl + nextSlot.stdMl,
    },
    explanations: [
      {
        ruleId: 'PROFILE_DEFAULT',
        text: `Basé sur le profil historique de ${profile.name}`,
        impact: 'estimation',
      },
    ],
    confidence: 'low',
    slot: getSlotId(predictedTime.getHours()),
    generatedAt: now,
  };
}
