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
// Reference data — used by sleep.ts nap prediction fallback logic
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

// ═══════════════════════════════════════════════════════════════════════════
// Repères éducatifs bébé 6 mois (rotatifs par heure)
// ═══════════════════════════════════════════════════════════════════════════

export interface BabyFact {
  id: string;
  title: string;
  message: string;
  category: 'feeding' | 'sleep' | 'development' | 'twins';
  hours: number[];
}

export const BABY_FACTS_6M: BabyFact[] = [
  // ── Alimentation ──────────────────────────────────────────────────
  {
    id: 'fact-volume-typique',
    title: 'Volume typique à 6 mois',
    message: 'Un biberon fait en moyenne 120-180 ml à 6 mois. Les volumes varient selon l\'heure, la fatigue et l\'activité — c\'est normal.',
    category: 'feeding',
    hours: [6, 7, 8, 10, 11, 14, 15],
  },
  {
    id: 'fact-repas-par-jour',
    title: 'Nombre de repas par jour',
    message: '4 à 6 repas par jour est la norme à 6 mois. Au-delà, c\'est souvent du cluster feeding — un mécanisme naturel, pas un problème.',
    category: 'feeding',
    hours: [9, 12, 15, 18],
  },
  {
    id: 'fact-apport-journalier',
    title: 'Apport journalier',
    message: 'Un bébé de 6 mois consomme 700-900 ml par jour. Si la diversification a commencé, le lait reste l\'apport principal jusqu\'à 12 mois.',
    category: 'feeding',
    hours: [8, 11, 14, 17, 20],
  },
  {
    id: 'fact-intervalle',
    title: 'Intervalle entre repas',
    message: 'L\'intervalle typique à 6 mois est de 3h30-4h30. Chaque bébé a son rythme propre — les écarts sont normaux.',
    category: 'feeding',
    hours: [7, 10, 13, 16],
  },
  {
    id: 'fact-diversification',
    title: 'Diversification alimentaire',
    message: '6 mois est le moment recommandé pour les solides. Commencez par des purées lisses en petites quantités. Le lait reste l\'aliment principal.',
    category: 'feeding',
    hours: [9, 10, 11, 12],
  },
  {
    id: 'fact-variation-appetit',
    title: 'Variations d\'appétit',
    message: 'L\'appétit varie selon la fatigue, les poussées dentaires et l\'activité. Un repas plus petit suivi d\'un plus gros est un mécanisme de régulation naturel.',
    category: 'feeding',
    hours: [8, 13, 16, 19],
  },
  {
    id: 'fact-appetit-soir',
    title: 'Appétit du soir',
    message: 'Beaucoup de bébés de 6 mois mangent davantage le soir — c\'est un "plein" naturel avant la nuit. Prévoyez un biberon un peu plus grand.',
    category: 'feeding',
    hours: [17, 18, 19, 20],
  },
  {
    id: 'fact-repas-nuit',
    title: 'Repas de nuit',
    message: '1 à 2 biberons de nuit restent courants à 6 mois. Ils diminuent naturellement avec l\'âge — pas besoin de forcer le sevrage.',
    category: 'feeding',
    hours: [20, 21, 22, 23, 0, 1, 2, 3],
  },
  // ── Sommeil ──────────────────────────────────────────────────────
  {
    id: 'fact-sommeil-total',
    title: 'Sommeil à 6 mois',
    message: 'Un bébé de 6 mois dort 12-15h par jour : 10-12h la nuit (avec possibles réveils) + 2-3 siestes en journée.',
    category: 'sleep',
    hours: [7, 12, 19, 21],
  },
  {
    id: 'fact-fenetre-eveil',
    title: 'Fenêtres d\'éveil',
    message: 'À 6 mois, un bébé peut rester éveillé 1h30-2h30 entre deux siestes. Au-delà de 3h, il risque d\'être surstimulé.',
    category: 'sleep',
    hours: [8, 9, 11, 13, 15],
  },
  {
    id: 'fact-transition-siestes',
    title: 'Transition des siestes',
    message: 'Entre 6 et 9 mois, beaucoup de bébés passent de 3 siestes à 2. Des jours à 3 et d\'autres à 2 sont normaux pendant la transition.',
    category: 'sleep',
    hours: [9, 10, 14, 15, 16],
  },
  {
    id: 'fact-regression-sommeil',
    title: 'Régression du sommeil',
    message: 'Une régression du sommeil est courante entre 4 et 6 mois — réveils plus fréquents, siestes courtes. Ça dure 2-4 semaines, c\'est lié au développement cérébral.',
    category: 'sleep',
    hours: [6, 22, 23, 0, 1, 2],
  },
  {
    id: 'fact-routine-coucher',
    title: 'Routine du coucher',
    message: 'Une routine régulière (bain, biberon, berceuse) aide le bébé à anticiper le sommeil. 20-30 min de rituel suffisent.',
    category: 'sleep',
    hours: [18, 19, 20, 21],
  },
  {
    id: 'fact-sieste-matin',
    title: 'Sieste du matin',
    message: 'La sieste du matin (souvent vers 9h-10h) est généralement la plus réparatrice. Elle est liée au sommeil de nuit.',
    category: 'sleep',
    hours: [7, 8, 9, 10],
  },
  {
    id: 'fact-premier-stretch',
    title: 'Premier stretch de nuit',
    message: 'Le premier sommeil de nuit est souvent le plus long (4-6h à 6 mois). Un bon repas du soir peut aider à l\'allonger.',
    category: 'sleep',
    hours: [20, 21, 22, 23],
  },
  // ── Développement ─────────────────────────────────────────────────
  {
    id: 'fact-motricite',
    title: 'Motricité à 6 mois',
    message: 'À 6 mois, la plupart des bébés tiennent assis (avec appui), attrapent des objets et commencent à se retourner. L\'activité accrue augmente les besoins caloriques.',
    category: 'development',
    hours: [8, 10, 14, 16],
  },
  {
    id: 'fact-dents',
    title: 'Poussées dentaires',
    message: 'Les premières dents apparaissent souvent entre 4 et 7 mois. Signes : bave, gencives gonflées, irritabilité. L\'appétit peut baisser de 10-30%.',
    category: 'development',
    hours: [7, 11, 15, 19],
  },
  {
    id: 'fact-curiosite',
    title: 'Curiosité et distraction',
    message: 'À 6 mois, les bébés sont très curieux. Les repas peuvent être plus courts ou agités — ce n\'est pas un refus, c\'est de l\'exploration.',
    category: 'development',
    hours: [9, 12, 15, 17],
  },
  {
    id: 'fact-pic-croissance',
    title: 'Pics de croissance',
    message: 'Les pics de croissance à 6 mois durent 2-4 jours : appétit +20-40%, repas plus fréquents, sommeil parfois perturbé. C\'est temporaire.',
    category: 'development',
    hours: [6, 10, 14, 18, 22],
  },
  {
    id: 'fact-poids',
    title: 'Prise de poids',
    message: 'À 6 mois, un bébé a généralement doublé son poids de naissance. La prise de poids ralentit ensuite (400-500g/mois). C\'est normal.',
    category: 'development',
    hours: [8, 13, 17],
  },
  {
    id: 'fact-babillage',
    title: 'Babillage',
    message: 'Vers 6 mois, le babillage se diversifie (ba-ba, da-da). Parler pendant les repas stimule le langage sans gêner l\'alimentation.',
    category: 'development',
    hours: [7, 11, 15, 19],
  },
  {
    id: 'fact-objet-permanent',
    title: 'Permanence de l\'objet',
    message: 'Vers 6 mois, bébé comprend qu\'un objet caché existe encore. C\'est aussi pourquoi l\'anxiété de séparation peut apparaître au coucher.',
    category: 'development',
    hours: [20, 21, 9, 13],
  },
  // ── Jumeaux ───────────────────────────────────────────────────────
  {
    id: 'fact-jumeaux-individualite',
    title: 'Chaque jumeau est unique',
    message: 'Même des jumeaux identiques développent des préférences distinctes. Des rythmes différents sont normaux — comparez chaque bébé à son propre historique.',
    category: 'twins',
    hours: [7, 10, 13, 16, 19],
  },
  {
    id: 'fact-jumeaux-sync',
    title: 'Synchronisation des jumeaux',
    message: 'Nourrir les deux ensemble quand c\'est possible facilite la logistique. Mais forcer un rythme identique n\'est pas nécessaire — ils se recalent souvent seuls.',
    category: 'twins',
    hours: [8, 11, 14, 17, 20],
  },
];

/**
 * Pick 2 facts for the current hour.
 * Uses day-of-year as offset so every hour in the same day gets
 * a unique pair, and different days rotate through different facts.
 */
export function getHourlyFacts(hour: number): BabyFact[] {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  const pool = BABY_FACTS_6M;
  const n = pool.length;

  // Deterministic shuffle seed based on day — each day gets a different ordering
  const daySeed = dayOfYear * 31;

  // Pick index for this hour, guaranteed unique across hours in the same day
  const idx1 = (daySeed + hour * 3 + 1) % n;
  let idx2 = (daySeed + hour * 3 + 2) % n;
  if (idx2 === idx1) idx2 = (idx2 + 1) % n;

  // Ensure different categories when possible
  const fact1 = pool[idx1];
  let fact2 = pool[idx2];
  if (fact1.category === fact2.category && n > 2) {
    for (let i = 1; i < n; i++) {
      const candidate = pool[(idx2 + i) % n];
      if (candidate.category !== fact1.category && candidate.id !== fact1.id) {
        fact2 = candidate;
        break;
      }
    }
  }

  return [fact1, fact2];
}
