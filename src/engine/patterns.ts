import { differenceInMinutes, differenceInHours, subDays } from 'date-fns';
import type { BabyName, FeedRecord, SleepRecord, DetectedPattern } from '../types';
import { PROFILES } from '../data/knowledge';
import { filterRecentFeeds, filterRecentSleeps } from './recency';

export function detectPatterns(
  baby: BabyName,
  rawFeeds: FeedRecord[],
  rawSleeps: SleepRecord[],
  now: Date,
): DetectedPattern[] {
  const allFeeds = filterRecentFeeds(rawFeeds, now);
  const allSleeps = filterRecentSleeps(rawSleeps, now);
  const babyFeeds = allFeeds
    .filter((f) => f.baby === baby)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const babySleeps = allSleeps.filter((s) => s.baby === baby);
  const patterns: DetectedPattern[] = [];

  if (babyFeeds.length < 3) return patterns;

  // --- CLUSTER FEEDING ---
  // Breast-aware: ≥4 if all breast (breastfeeding clusters are more common),
  // ≥3 otherwise (at least one bottle in the window).
  const recentFeeds = babyFeeds.filter(
    (f) => differenceInMinutes(now, f.timestamp) <= 180,
  );
  const allBreast = recentFeeds.length > 0 && recentFeeds.every((f) => f.type === 'breast');
  const clusterThreshold = allBreast ? 4 : 3;
  if (recentFeeds.length >= clusterThreshold) {
    patterns.push({
      id: 'CLUSTER',
      label: 'Cluster feeding',
      description: allBreast
        ? '4+ tétées en moins de 3h — l\'intervalle après sera probablement plus long'
        : '3+ repas en moins de 3h — l\'intervalle après sera probablement plus long',
      baby,
      detectedAt: now,
      timingModifier: 1.30,
    });
  }

  // --- COMPENSATION ---
  // Last feed < 70% of slot average
  const lastFeed = babyFeeds[babyFeeds.length - 1];
  const profile = PROFILES[baby];
  const lastHour = lastFeed.timestamp.getHours();
  const lastSlot = profile.slots.find((s) => s.hours.includes(lastHour));
  if (lastSlot && lastFeed.type === 'bottle' && lastFeed.volumeMl > 0) {
    const ratio = lastFeed.volumeMl / lastSlot.meanMl;
    if (ratio < 0.7) {
      patterns.push({
        id: 'COMPENSATION',
        label: 'Compensation',
        description: 'Repas précédent < 70% de la moyenne — prochain repas probablement plus tôt',
        baby,
        detectedAt: now,
        timingModifier: 0.75,
      });
    }
  }

  // --- EVENING EFFECT ---
  // Aligned with evening slot definition in knowledge.ts (hours 18-21)
  const hour = now.getHours();
  if (hour >= 18 && hour < 22) {
    patterns.push({
      id: 'EVENING',
      label: 'Effet soirée',
      description: 'Créneau soirée (18h-21h) — intervalles plus courts, volumes plus importants',
      baby,
      detectedAt: now,
      timingModifier: 0.85,
      volumeModifier: 1.10,
    });
  }

  // --- NIGHT LIGHT ---
  if (hour >= 22 || hour < 6) {
    patterns.push({
      id: 'NIGHT_LIGHT',
      label: 'Mode nuit',
      description: 'Créneau nocturne — intervalles plus longs, volumes réduits',
      baby,
      detectedAt: now,
      timingModifier: 1.20,
      volumeModifier: 0.85,
    });
  }

  // --- POST NAP ---
  // Check if a nap >45min ended in the last 30 min
  const recentNap = babySleeps.find((s) => {
    if (!s.endTime || s.durationMin < 45) return false;
    return differenceInMinutes(now, s.endTime) <= 30 && differenceInMinutes(now, s.endTime) >= 0;
  });
  if (recentNap) {
    patterns.push({
      id: 'POST_NAP',
      label: 'Post-sieste',
      description: 'Sieste >45 min terminée récemment — volume potentiellement plus élevé',
      baby,
      detectedAt: now,
      timingModifier: 0.85,
      volumeModifier: 1.10,
    });
  }

  // --- GROWTH SPURT ---
  // Compare 48h avg vs 14d avg
  const feedsLast48h = babyFeeds.filter(
    (f) => f.type === 'bottle' && f.volumeMl > 0 && differenceInHours(now, f.timestamp) <= 48,
  );
  const feedsLast14d = babyFeeds.filter(
    (f) => f.type === 'bottle' && f.volumeMl > 0 && f.timestamp >= subDays(now, 14),
  );

  if (feedsLast48h.length >= 4 && feedsLast14d.length >= 10) {
    const avg48h = feedsLast48h.reduce((sum, f) => sum + f.volumeMl, 0) / feedsLast48h.length;
    const avg14d = feedsLast14d.reduce((sum, f) => sum + f.volumeMl, 0) / feedsLast14d.length;

    if (avg48h > avg14d * 1.25) {
      patterns.push({
        id: 'GROWTH',
        label: 'Pic de croissance',
        description: 'Appétit augmenté de >25% sur 48h — possible pic de croissance',
        baby,
        detectedAt: now,
        timingModifier: 0.80,
        volumeModifier: 1.15,
      });
    }
  }

  // --- BREAST RATIO SHIFT ---
  // If the proportion of breast feeds increased significantly over 48h vs 14d,
  // it signals a rhythm change (more frequent, shorter feeds).
  const allLast48h = babyFeeds.filter(
    (f) => differenceInHours(now, f.timestamp) <= 48,
  );
  const allLast14d = babyFeeds.filter(
    (f) => f.timestamp >= subDays(now, 14),
  );
  if (allLast48h.length >= 4 && allLast14d.length >= 10) {
    const breastRatio48h = allLast48h.filter((f) => f.type === 'breast').length / allLast48h.length;
    const breastRatio14d = allLast14d.filter((f) => f.type === 'breast').length / allLast14d.length;
    // Trigger if 48h breast ratio is ≥20pp higher than 14d baseline
    if (breastRatio48h - breastRatio14d >= 0.20) {
      patterns.push({
        id: 'BREAST_RATIO_SHIFT',
        label: 'Plus de tétées',
        description: 'Proportion de tétées en hausse sur 48h — intervalles potentiellement plus courts',
        baby,
        detectedAt: now,
        timingModifier: 0.90,
      });
    }
  }

  // --- LONG INTERVAL ---
  // Current gap since last feed is 1.5x+ the baby's own recent median interval.
  const gapSinceLastMin = differenceInMinutes(now, lastFeed.timestamp);
  if (babyFeeds.length >= 4 && gapSinceLastMin > 0) {
    const recentIntervals: number[] = [];
    for (let i = Math.max(1, babyFeeds.length - 8); i < babyFeeds.length; i++) {
      const diff = differenceInMinutes(babyFeeds[i].timestamp, babyFeeds[i - 1].timestamp);
      if (diff >= 60 && diff <= 480) recentIntervals.push(diff);
    }
    if (recentIntervals.length >= 2) {
      recentIntervals.sort((a, b) => a - b);
      const medianInterval = recentIntervals[Math.floor(recentIntervals.length / 2)];
      if (gapSinceLastMin >= medianInterval * 1.5 && gapSinceLastMin <= medianInterval * 3.5) {
        patterns.push({
          id: 'LONG_INTERVAL',
          label: 'Long délai',
          description: `Dernier repas il y a ${(gapSinceLastMin / 60).toFixed(1)}h — appétit probablement plus élevé`,
          baby,
          detectedAt: now,
          timingModifier: 0.80,
          volumeModifier: 1.12,
        });
      }
    }
  }

  // --- MORNING FIRST FEED ---
  // First feed of the day after the night fast → larger volume expected.
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const feedsSinceMorning = babyFeeds.filter(
    (f) => f.timestamp >= todayMidnight && f.timestamp.getHours() >= 5,
  );
  if (feedsSinceMorning.length === 0 && hour >= 5 && hour < 11) {
    patterns.push({
      id: 'MORNING_FIRST',
      label: 'Premier repas',
      description: 'Premier repas de la journée après le jeûne nocturne — volume généralement plus élevé',
      baby,
      detectedAt: now,
      timingModifier: 1.10,
      volumeModifier: 1.15,
    });
  }

  // --- AFTERNOON DIP ---
  // 13h-17h is the peak alertness/distraction window for 6-month-olds.
  if (hour >= 13 && hour < 17) {
    patterns.push({
      id: 'AFTERNOON_DIP',
      label: "Creux d'après-midi",
      description: '13h-17h : pic d\'éveil et de distraction — volumes parfois réduits',
      baby,
      detectedAt: now,
      timingModifier: 0.92,
      volumeModifier: 0.92,
    });
  }

  // --- SHORT NAP SERIES ---
  // ≥2 naps <35 min today → accumulated fatigue signal.
  const todaySleeps = babySleeps.filter((s) => s.startTime >= todayMidnight && s.endTime);
  const shortNapsToday = todaySleeps.filter(
    (s) =>
      s.durationMin > 0 &&
      s.durationMin < 35 &&
      s.startTime.getHours() >= 7 &&
      s.startTime.getHours() < 20,
  );
  if (shortNapsToday.length >= 2) {
    patterns.push({
      id: 'SHORT_NAP_SERIES',
      label: 'Siestes courtes',
      description: `${shortNapsToday.length} siestes < 35 min aujourd'hui — fatigue cumulée, repas potentiellement perturbés`,
      baby,
      detectedAt: now,
      timingModifier: 0.88,
      volumeModifier: 0.93,
    });
  }

  // --- OVERTIRED (long wake window in daytime) ---
  // >5h awake without any sleep between 8h and 20h.
  const sortedSleepsToday = [...todaySleeps].sort(
    (a, b) => b.endTime!.getTime() - a.endTime!.getTime(),
  );
  const lastCompletedSleep = sortedSleepsToday[0];
  const minutesAwake = lastCompletedSleep
    ? differenceInMinutes(now, lastCompletedSleep.endTime!)
    : -1;
  if (hour >= 8 && hour < 20 && minutesAwake >= 300) {
    patterns.push({
      id: 'OVERTIRED',
      label: 'Éveil prolongé',
      description: `${(minutesAwake / 60).toFixed(1)}h sans sommeil en journée — irritabilité possible, repas moins efficaces`,
      baby,
      detectedAt: now,
      timingModifier: 0.85,
      volumeModifier: 0.90,
    });
  }

  // --- VOLUME DECLINE ---
  // Last 3+ bottles each strictly smaller than the previous AND last is below 85% slot avg.
  const lastBottles = babyFeeds.filter((f) => f.type === 'bottle' && f.volumeMl > 0).slice(-4);
  if (lastBottles.length >= 3) {
    let strictlyDecreasing = true;
    for (let i = 1; i < lastBottles.length; i++) {
      if (lastBottles[i].volumeMl >= lastBottles[i - 1].volumeMl) {
        strictlyDecreasing = false;
        break;
      }
    }
    const lastBottle = lastBottles[lastBottles.length - 1];
    const lastBottleSlot = profile.slots.find((s) =>
      s.hours.includes(lastBottle.timestamp.getHours()),
    );
    const isBelowAvg = lastBottleSlot
      ? lastBottle.volumeMl < lastBottleSlot.meanMl * 0.85
      : false;
    if (strictlyDecreasing && isBelowAvg) {
      patterns.push({
        id: 'VOLUME_DECLINE',
        label: 'Volumes en baisse',
        description: "Biberons successifs en diminution — distraction, inconfort ou changement d'appétit",
        baby,
        detectedAt: now,
        volumeModifier: 0.92,
        timingModifier: 0.90,
      });
    }
  }

  // --- SUSTAINED APPETITE ---
  // Last 3 bottles in 12h all ≥110% of their slot average (but GROWTH not yet triggered).
  const recentBottles12h = babyFeeds.filter(
    (f) =>
      f.type === 'bottle' && f.volumeMl > 0 && differenceInHours(now, f.timestamp) <= 12,
  );
  if (recentBottles12h.length >= 3 && !patterns.some((p) => p.id === 'GROWTH')) {
    const allAboveAvg = recentBottles12h.slice(-3).every((f) => {
      const slot = profile.slots.find((s) => s.hours.includes(f.timestamp.getHours()));
      return slot ? f.volumeMl >= slot.meanMl * 1.10 : false;
    });
    if (allAboveAvg) {
      patterns.push({
        id: 'SUSTAINED_APPETITE',
        label: 'Appétit soutenu',
        description: '3 derniers biberons au-dessus de la moyenne — possible début de pic de croissance',
        baby,
        detectedAt: now,
        volumeModifier: 1.08,
        timingModifier: 0.88,
      });
    }
  }

  // --- SHORT NIGHT ---
  // Last night sleep (≥3h, started after 19h or before 6h) was shorter than 8h.
  const lastNight = [...babySleeps]
    .filter(
      (s) =>
        s.endTime &&
        differenceInHours(now, s.endTime) <= 18 &&
        s.durationMin >= 180 &&
        (s.startTime.getHours() >= 19 || s.startTime.getHours() < 6),
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];
  if (lastNight && lastNight.durationMin < 480) {
    patterns.push({
      id: 'SHORT_NIGHT',
      label: 'Nuit courte',
      description: `Nuit de ${(lastNight.durationMin / 60).toFixed(1)}h — siestes supplémentaires recommandées, intervalles potentiellement plus courts`,
      baby,
      detectedAt: now,
      timingModifier: 0.88,
      volumeModifier: 1.05,
    });
  }

  return patterns;
}
