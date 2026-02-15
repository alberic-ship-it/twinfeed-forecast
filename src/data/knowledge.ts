import type { BabyProfile, TimeSlot, BabyName } from '../types';

// Hardcoded from profiles.yaml and config.yaml — no need for runtime YAML parsing
// since these are static knowledge base values

const COLETTE_SLOTS: TimeSlot[] = [
  { id: 'morning', hours: [6, 7, 8, 9], meanMl: 129, stdMl: 41, typicalIntervalAfterH: 3.5 },
  { id: 'midday', hours: [10, 11, 12, 13], meanMl: 127, stdMl: 36, typicalIntervalAfterH: 3.0 },
  { id: 'afternoon', hours: [14, 15, 16, 17], meanMl: 135, stdMl: 33, typicalIntervalAfterH: 2.5 },
  { id: 'evening', hours: [18, 19, 20, 21], meanMl: 147, stdMl: 31, typicalIntervalAfterH: 3.0, peak: true },
  { id: 'night', hours: [22, 23, 0, 1, 2, 3, 4, 5], meanMl: 116, stdMl: 43, typicalIntervalAfterH: 4.0 },
];

const ISAURE_SLOTS: TimeSlot[] = [
  { id: 'morning', hours: [6, 7, 8, 9], meanMl: 134, stdMl: 23, typicalIntervalAfterH: 3.0 },
  { id: 'midday', hours: [10, 11, 12, 13], meanMl: 148, stdMl: 32, typicalIntervalAfterH: 3.0, peak: true },
  { id: 'afternoon', hours: [14, 15, 16, 17], meanMl: 143, stdMl: 27, typicalIntervalAfterH: 2.5 },
  { id: 'evening', hours: [18, 19, 20, 21], meanMl: 140, stdMl: 32, typicalIntervalAfterH: 3.0 },
  { id: 'night', hours: [22, 23, 0, 1, 2, 3, 4, 5], meanMl: 102, stdMl: 39, typicalIntervalAfterH: 4.5 },
];

export const PROFILES: Record<BabyName, BabyProfile> = {
  colette: {
    name: 'Colette',
    key: 'colette',
    birthDate: '2025-08-12',
    stats: {
      meanVolumeMl: 131,
      stdVolumeMl: 33,
      typicalRangeMl: [100, 160],
      meanIntervalH: 4.6,
      medianIntervalH: 4.1,
      typicalRangeH: [2.5, 7.5],
      p10H: 2.4,
      p90H: 7.4,
    },
    slots: COLETTE_SLOTS,
    predictionAdjustments: {
      volume: { evening_boost: 1.14, night_reduction: 0.89 },
      interval: { base_multiplier: 1.0, evening_reduction: 0.85 },
    },
  },
  isaure: {
    name: 'Isaure',
    key: 'isaure',
    birthDate: '2025-08-12',
    stats: {
      meanVolumeMl: 134,
      stdVolumeMl: 32,
      typicalRangeMl: [100, 165],
      meanIntervalH: 4.2,
      medianIntervalH: 3.4,
      typicalRangeH: [2.2, 7.0],
      p10H: 2.2,
      p90H: 7.0,
    },
    slots: ISAURE_SLOTS,
    predictionAdjustments: {
      volume: { midday_boost: 1.10, night_reduction: 0.72 },
      interval: { base_multiplier: 0.91, midday_extension: 1.05 },
    },
  },
};

export const BABY_COLORS: Record<BabyName, string> = {
  colette: '#F472B6', // Rose/Coral
  isaure: '#2DD4BF',  // Bleu/Teal
};

export const SYNC_THRESHOLDS = {
  synchronized: 20,       // <20 min
  slightlyOffset: 45,     // 20-45 min
  desyncAlert: 60,        // >60 min → alert
  resyncTrigger: 45,      // >45 min → suggest resync
};

export const BEST_SYNC_WINDOWS = [
  { start: 7, end: 8, label: 'Réveil' },
  { start: 10, end: 11, label: 'Mi-matinée' },
  { start: 13, end: 14, label: 'Début après-midi' },
  { start: 17, end: 18, label: 'Fin après-midi' },
  { start: 20, end: 21, label: 'Avant coucher' },
];

// Wake windows pour bébés 4-6 mois (en minutes)
export const WAKE_WINDOWS = {
  optimalMin: 90,
  optimalMax: 150,
  maxBeforeOvertired: 180,
  ageLabel: '4-6 mois',
};

// Profils sommeil par défaut (utilisés quand données insuffisantes)
export interface SleepProfile {
  nightDurationMin: number;
  typicalBedtimeHour: number;
  typicalWakeHour: number;
  nightFeeds: number;
  napsPerDay: number;
  napDurationMin: number;
  bestNapTimes: { startH: number; endH: number }[];
}

export const DEFAULT_SLEEP: Record<BabyName, SleepProfile> = {
  colette: {
    nightDurationMin: 376,    // ~6h15
    typicalBedtimeHour: 21,
    typicalWakeHour: 7,
    nightFeeds: 1,
    napsPerDay: 3,
    napDurationMin: 36,
    bestNapTimes: [
      { startH: 9, endH: 10 },
      { startH: 12, endH: 13 },
      { startH: 16, endH: 17 },
    ],
  },
  isaure: {
    nightDurationMin: 387,    // ~6h27
    typicalBedtimeHour: 21,
    typicalWakeHour: 7,
    nightFeeds: 1,
    napsPerDay: 3,
    napDurationMin: 37,
    bestNapTimes: [
      { startH: 9.5, endH: 10.5 },
      { startH: 12, endH: 13 },
      { startH: 16, endH: 17 },
    ],
  },
};
