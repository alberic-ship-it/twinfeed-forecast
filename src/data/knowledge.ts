import type { BabyProfile, TimeSlot, BabyName, TimeSlotId } from '../types';

/**
 * Shared interval filter: only keep intervals between 0.5h and 12h.
 * Used across the app to filter out noise (too short = same feed, too long = missed data).
 */
export const INTERVAL_FILTER = { minH: 0.5, maxH: 12 };

/**
 * Map an hour (0-23) to the corresponding time slot.
 * Boundaries: morning 6-9, midday 10-13, afternoon 14-17, evening 18-21, night 22-5.
 */
export function getSlotId(hour: number): TimeSlotId {
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

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

export const BEST_SYNC_WINDOWS = [
  { start: 7, end: 8, label: 'Réveil' },
  { start: 10, end: 11, label: 'Mi-matinée' },
  { start: 13, end: 14, label: 'Début après-midi' },
  { start: 17, end: 18, label: 'Fin après-midi' },
  { start: 20, end: 21, label: 'Avant coucher' },
];

// Seuil pour identifier un sommeil de nuit (vs sieste)
export const NIGHT_SLEEP = {
  minStartHour: 19,
  minDurationMin: 360,  // 6h — only count true night sleeps; excludes short/incomplete tracking sessions
};

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
    nightDurationMin: 570,    // ~9h30 — default for 6-month-old (historical data was unreliable)
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
    nightDurationMin: 570,    // ~9h30 — default for 6-month-old (historical data was unreliable)
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
  minMonths: number; // âge minimum (inclus)
  maxMonths: number; // âge maximum (inclus) — utiliser 24 pour "sans limite"
}

/**
 * Calcule l'âge en mois complets depuis la date de naissance.
 */
export function getBabyAgeMonths(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12
    + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months--;
  return Math.max(0, months);
}

export const BABY_FACTS: BabyFact[] = [

  // ══════════════════════════════════════════════════════════════════
  // ALIMENTATION — faits valables 5-9 mois
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-volume-typique',
    title: 'Volume typique à 6 mois',
    message: 'Un biberon fait en moyenne 120-180 ml à 6 mois. Les volumes varient selon l\'heure, la fatigue et l\'activité — c\'est tout à fait normal.',
    category: 'feeding',
    hours: [6, 7, 8, 10, 11, 14, 15],
    minMonths: 5, maxMonths: 8,
  },
  {
    id: 'fact-repas-par-jour',
    title: 'Nombre de repas par jour',
    message: '4 à 6 repas par jour est la norme à 6 mois. Au-delà, c\'est souvent du cluster feeding — un mécanisme naturel de régulation, pas un signe de problème.',
    category: 'feeding',
    hours: [9, 12, 15, 18],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-apport-journalier',
    title: 'Apport journalier en lait',
    message: 'Un bébé de 6 mois consomme 700-900 ml de lait par jour. Si la diversification a commencé, le lait reste l\'apport nutritionnel principal jusqu\'à 12 mois.',
    category: 'feeding',
    hours: [8, 11, 14, 17, 20],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-intervalle',
    title: 'Intervalle entre repas',
    message: 'L\'intervalle typique à 6 mois est de 3h30-4h30. Chaque bébé développe son propre rythme — les écarts d\'une heure sont parfaitement normaux.',
    category: 'feeding',
    hours: [7, 10, 13, 16],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-diversification',
    title: 'Diversification alimentaire',
    message: '6 mois est le moment recommandé pour introduire les solides. Commencez par des purées lisses en petites quantités (1-2 cuillères). Le lait reste l\'aliment principal pendant encore 6 mois.',
    category: 'feeding',
    hours: [9, 10, 11, 12],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-variation-appetit',
    title: 'Variations d\'appétit',
    message: 'L\'appétit varie selon la fatigue, les poussées dentaires, l\'activité et la chaleur. Un repas plus petit suivi d\'un plus gros le lendemain est un mécanisme de régulation naturel.',
    category: 'feeding',
    hours: [8, 13, 16, 19],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-appetit-soir',
    title: 'Appétit du soir',
    message: 'Beaucoup de bébés mangent davantage le soir — c\'est un "plein" naturel avant la nuit. Prévoyez un biberon légèrement plus généreux entre 18h et 20h.',
    category: 'feeding',
    hours: [17, 18, 19, 20],
    minMonths: 4, maxMonths: 10,
  },
  {
    id: 'fact-repas-nuit',
    title: 'Repas de nuit',
    message: '1 à 2 biberons de nuit restent courants à 6 mois. Ils diminuent naturellement avec l\'âge — pas besoin de forcer le sevrage nocturne avant que le bébé soit prêt.',
    category: 'feeding',
    hours: [20, 21, 22, 23, 0, 1, 2, 3],
    minMonths: 4, maxMonths: 9,
  },
  {
    id: 'fact-biberon-reveil',
    title: 'Biberon complet au réveil',
    message: 'Un biberon bien pris au réveil (120-180 ml) aide à caler le rythme alimentaire de la journée. Si bébé refuse, pas d\'inquiétude — il rattrapera naturellement au repas suivant.',
    category: 'feeding',
    hours: [6, 7, 8],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-volume-aprem-coucher',
    title: 'Biberon d\'après-midi & nuit',
    message: 'Un bon biberon entre 14h et 17h contribue à un meilleur endormissement le soir. C\'est le total calorique de l\'après-midi qui compte, pas uniquement le dernier biberon avant le coucher.',
    category: 'feeding',
    hours: [14, 15, 16],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-reduction-nuit',
    title: 'Diminuer les biberons de nuit',
    message: 'Pour réduire les réveils nocturnes liés à la faim, diminuez progressivement le volume (10-20 ml par semaine) plutôt qu\'arrêter brutalement. Cela laisse au bébé le temps de compenser en journée.',
    category: 'feeding',
    hours: [22, 23, 0, 1, 2, 3],
    minMonths: 5, maxMonths: 11,
  },
  {
    id: 'fact-signes-faim',
    title: 'Signaux de faim précoces',
    message: 'Les signaux de faim précoces : main à la bouche, mouvements de succion, agitation légère, regard vers le parent. Attendre les pleurs est souvent trop tard — le bébé stressé mange moins bien.',
    category: 'feeding',
    hours: [6, 9, 12, 15, 18],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-signes-satiete',
    title: 'Signaux de satiété',
    message: 'Un bébé rassasié : tourne la tête, relâche la tétine, s\'endort, joue avec le biberon. Ne forcez jamais à finir — l\'autorégulation alimentaire protège contre les problèmes de poids à long terme.',
    category: 'feeding',
    hours: [7, 10, 13, 16, 19],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-paced-feeding',
    title: 'Biberon en rythme lent',
    message: 'Tenez le biberon horizontalement et faites des pauses toutes les 30-60 ml. Cela imite le rythme de l\'allaitement, évite la suralimentation et réduit les gaz et régurgitations.',
    category: 'feeding',
    hours: [7, 10, 13, 16],
    minMonths: 4, maxMonths: 11,
  },
  {
    id: 'fact-vitamine-d',
    title: 'Vitamine D',
    message: 'La vitamine D est essentielle au développement osseux. Les bébés allaités ou peu exposés au soleil ont besoin d\'une supplémentation quotidienne (400 UI). Demandez à votre pédiatre.',
    category: 'feeding',
    hours: [8, 12, 18],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-cluster-feeding',
    title: 'Cluster feeding du soir',
    message: 'Le cluster feeding (repas rapprochés en soirée, toutes les 1-2h) est fréquent entre 17h et 21h à cet âge. C\'est une façon pour bébé de "faire le plein" avant la nuit — laissez-le guider.',
    category: 'feeding',
    hours: [17, 18, 19, 20],
    minMonths: 4, maxMonths: 8,
  },
  {
    id: 'fact-temperature-biberon',
    title: 'Température du biberon',
    message: 'La plupart des bébés acceptent le biberon à température ambiante ou légèrement chaud (37°C). La nuit, avoir un biberon à température ambiante évite l\'attente et perturbe moins le sommeil.',
    category: 'feeding',
    hours: [0, 1, 2, 3, 4, 21, 22, 23],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-taille-tetine',
    title: 'Taille de la tétine',
    message: 'La taille 2 (ou débit moyen) est adaptée à la plupart des bébés de 6 mois. Une tétine trop rapide provoque l\'ingestion d\'air et le reflux ; trop lente, le bébé se fatigue et mange moins.',
    category: 'feeding',
    hours: [6, 10, 14, 18],
    minMonths: 5, maxMonths: 8,
  },
  {
    id: 'fact-refus-biberon',
    title: 'Refus de biberon passager',
    message: 'Un refus de biberon de 1-3 jours peut survenir lors de poussées dentaires, maladies légères ou distractibilité accrue. Proposez dans un endroit calme et semi-obscur, sans forcer.',
    category: 'feeding',
    hours: [8, 11, 14, 17],
    minMonths: 4, maxMonths: 10,
  },
  {
    id: 'fact-dream-feed',
    title: 'Tétée de rêve (dream feed)',
    message: 'Donner un biberon entre 22h et 23h, avant votre propre coucher, peut rallonger le premier cycle de nuit de 1-2h. Le bébé mange à demi-endormi — pas besoin de le réveiller complètement.',
    category: 'feeding',
    hours: [21, 22, 23],
    minMonths: 4, maxMonths: 9,
  },

  // ══════════════════════════════════════════════════════════════════
  // SOMMEIL — faits existants avec plages d'âge
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-sommeil-total',
    title: 'Sommeil à 6 mois',
    message: 'Un bébé de 6 mois dort 12-15h par jour : 10-12h la nuit (avec possibles réveils) et 2-3 siestes en journée totalisant 2-4h.',
    category: 'sleep',
    hours: [7, 12, 19, 21],
    minMonths: 5, maxMonths: 7,
  },
  {
    id: 'fact-fenetre-eveil',
    title: 'Fenêtres d\'éveil',
    message: 'À 6 mois, un bébé peut rester éveillé 1h30-2h30 entre deux siestes. Au-delà de 3h sans sommeil, les signes de surstimulation apparaissent et l\'endormissement devient plus difficile.',
    category: 'sleep',
    hours: [8, 9, 11, 13, 15],
    minMonths: 5, maxMonths: 8,
  },
  {
    id: 'fact-transition-siestes',
    title: 'Transition 3 → 2 siestes',
    message: 'Entre 6 et 9 mois, beaucoup de bébés passent de 3 siestes à 2. Des jours à 3 et d\'autres à 2 siestes sont normaux pendant cette transition — suivez les signes de fatigue plutôt que l\'horloge.',
    category: 'sleep',
    hours: [9, 10, 14, 15, 16],
    minMonths: 6, maxMonths: 9,
  },
  {
    id: 'fact-regression-sommeil',
    title: 'Régression du sommeil 4-6 mois',
    message: 'La régression du sommeil entre 4 et 6 mois est liée à la maturation du cerveau et l\'explosion des acquisitions motrices. Elle dure 2-6 semaines. Maintenir la routine est la meilleure réponse.',
    category: 'sleep',
    hours: [6, 22, 23, 0, 1, 2],
    minMonths: 4, maxMonths: 7,
  },
  {
    id: 'fact-routine-coucher',
    title: 'Routine du coucher',
    message: 'Une routine régulière (bain, massage, biberon, chanson) conditionne le cerveau à anticiper le sommeil. La régularité de la séquence compte plus que la durée — 15 à 30 min suffisent.',
    category: 'sleep',
    hours: [18, 19, 20, 21],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-sieste-matin',
    title: 'Sieste du matin — la plus réparatrice',
    message: 'La sieste du matin (souvent vers 9h-10h) est la plus liée à la qualité du sommeil nocturne. Un réveil matinal trop tardif peut la décaler et déstabiliser toute la journée.',
    category: 'sleep',
    hours: [7, 8, 9, 10],
    minMonths: 5, maxMonths: 10,
  },
  {
    id: 'fact-premier-stretch',
    title: 'Premier stretch de nuit',
    message: 'Le premier cycle de sommeil nocturne est toujours le plus long. Un repas du soir bien pris et un coucher dans la bonne fenêtre horaire contribuent à l\'allonger.',
    category: 'sleep',
    hours: [20, 21, 22, 23],
    minMonths: 5, maxMonths: 10,
  },
  {
    id: 'fact-proteger-sieste-midi',
    title: 'Protéger la sieste de midi',
    message: 'La sieste de midi est souvent la plus longue (30-90 min). Protégez-la : pénombre, calme, coucher au premier signe de fatigue. Une sieste de midi réussie améliore directement la nuit suivante.',
    category: 'sleep',
    hours: [11, 12, 13],
    minMonths: 5, maxMonths: 24,
  },
  {
    id: 'fact-rituel-soir',
    title: 'Rituel du soir — la régularité',
    message: 'Un rituel prévisible (bain, biberon, berceuse, obscurité) signale au cerveau que la nuit approche. Reproduire la même séquence chaque soir accélère l\'endormissement sur le long terme.',
    category: 'sleep',
    hours: [18, 19, 20],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-sieste-courte-ok',
    title: 'Sieste courte = cycle complet',
    message: 'Une sieste de 20-30 min correspond à un cycle de sommeil léger complet chez le nourrisson. Elle est suffisante pour recharger les batteries — pas besoin de forcer une prolongation.',
    category: 'sleep',
    hours: [9, 10, 14, 15, 16],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-surstimulation',
    title: 'Calme en fin d\'après-midi',
    message: 'Entre 16h et 18h, réduisez les stimulations (écrans, bruits forts, jeux très actifs). Le cortisol du soir peut retarder l\'endormissement de 30 à 60 min — le calme est un investissement.',
    category: 'sleep',
    hours: [16, 17, 18],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-coucher-ideal',
    title: 'Créneau de coucher idéal',
    message: 'Entre 19h et 21h, le taux de mélatonine est naturellement élevé chez le nourrisson. Coucher dans ce créneau facilite l\'endormissement, allonge le premier cycle et réduit les réveils nocturnes.',
    category: 'sleep',
    hours: [19, 20, 21],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-cycles-nuit',
    title: 'Cycles de sommeil nocturne',
    message: 'À 6 mois, un cycle de sommeil dure environ 45-60 min. Entre chaque cycle, il y a une phase d\'éveil léger naturelle. Si bébé a appris à se rendormir seul, il le fait en quelques minutes.',
    category: 'sleep',
    hours: [0, 1, 2, 3, 4, 22, 23],
    minMonths: 5, maxMonths: 10,
  },
  {
    id: 'fact-association-endormissement',
    title: 'Associations d\'endormissement',
    message: 'Si bébé s\'endort dans les bras ou au biberon, il cherchera les mêmes conditions à chaque réveil nocturne. Poser bébé éveillé mais somnolent dans son lit favorise l\'apprentissage de l\'auto-apaisement.',
    category: 'sleep',
    hours: [19, 20, 21, 22],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-obscurite',
    title: 'Obscurité et mélatonine',
    message: 'L\'obscurité complète déclenche la production de mélatonine, l\'hormone du sommeil. Même une petite veilleuse peut réduire sa production. Pour les siestes en journée, des volets obscurcissants doublent souvent leur durée.',
    category: 'sleep',
    hours: [7, 10, 12, 18, 19, 20],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-bruit-blanc',
    title: 'Bruit blanc',
    message: 'Le bruit blanc (ventilateur, aspirateur, app dédiée) masque les bruits domestiques et rappelle le son utérin. Il peut allonger les siestes et réduire les micro-réveils. Volume recommandé : 50-65 dB.',
    category: 'sleep',
    hours: [9, 12, 15, 20, 21],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-temperature-chambre',
    title: 'Température de la chambre',
    message: 'La température idéale pour le sommeil du nourrisson est 18-20°C. Une chambre trop chaude perturbe le sommeil profond et augmente les réveils. En dessous de 18°C, une turbulette suffit.',
    category: 'sleep',
    hours: [19, 20, 21, 22],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-signes-fatigue-precoces',
    title: 'Repérer la fatigue à temps',
    message: 'Signes précoces de fatigue : regard dans le vide, frottement des yeux, bâillement, oreille tirée. Attendre les pleurs ou l\'agitation forte = fatigue excessive, endormissement plus long et sommeil plus agité.',
    category: 'sleep',
    hours: [8, 11, 13, 16, 18],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-overtired',
    title: 'La surstimulation — paradoxe',
    message: 'Un bébé surstimulé semble énergique et difficile à calmer — mais c\'est l\'excès de cortisol. Il s\'endormira plus difficilement, dormira moins longtemps et se réveillera plus souvent. La fenêtre d\'éveil est précieuse.',
    category: 'sleep',
    hours: [9, 14, 16, 20],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-lumiere-matin',
    title: 'Lumière naturelle le matin',
    message: 'Exposer bébé à la lumière naturelle dans les 30 min suivant le réveil ancre son horloge circadienne. Cela améliore la régularité des siestes et avance naturellement l\'heure du coucher le soir.',
    category: 'sleep',
    hours: [6, 7, 8],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-nuit-complete-definition',
    title: 'Qu\'est-ce qu\'une nuit complète ?',
    message: 'À 6 mois, une "nuit complète" correspond à 5-6h d\'affilée sans réveil pour manger. Certains bébés y arrivent naturellement, d\'autres pas avant 9-12 mois — c\'est une grande variabilité normale.',
    category: 'sleep',
    hours: [5, 6, 22, 23],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-faux-depart',
    title: 'Réveil à 45 min — entre deux cycles',
    message: 'Le réveil systématique après 45 min de sieste correspond à la jonction entre deux cycles de sommeil. Si bébé ne sait pas se rendormir seul, il appellera. Attendre 2-3 min avant d\'intervenir laisse une chance.',
    category: 'sleep',
    hours: [9, 10, 11, 12, 13, 14, 15, 16],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-regression-motrice',
    title: 'Sommeil perturbé par les acquisitions',
    message: 'Chaque grande acquisition motrice (retournement, position assise, 4 pattes) perturbe temporairement le sommeil. Le cerveau "pratique" les nouveaux mouvements la nuit. Ça dure 1-2 semaines en général.',
    category: 'sleep',
    hours: [1, 2, 3, 22, 23],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-bruits-maison',
    title: 'Ne pas étouffer tous les bruits',
    message: 'Bébé n\'a pas besoin d\'un silence absolu pour dormir. Un niveau sonore de maison normale (30-40 dB) est bénéfique — cela évite une hypersensibilité aux bruits ambiants qui complique les siestes en dehors.',
    category: 'sleep',
    hours: [10, 12, 14, 16],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-melatonine-production',
    title: 'Mélatonine — production à 6 mois',
    message: 'La production de mélatonine se stabilise progressivement entre 3 et 6 mois, synchronisant enfin l\'horloge biologique avec le cycle jour/nuit. C\'est pourquoi les nuits commencent à se consolider à cet âge.',
    category: 'sleep',
    hours: [19, 20, 21, 22],
    minMonths: 4, maxMonths: 8,
  },

  // ══════════════════════════════════════════════════════════════════
  // DÉVELOPPEMENT — faits existants avec plages d'âge
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-motricite',
    title: 'Motricité à 6 mois',
    message: 'À 6 mois, la plupart des bébés tiennent assis avec appui, attrapent des objets intentionnellement et commencent à se retourner. Cette activité accrue augmente les besoins caloriques et la fatigue.',
    category: 'development',
    hours: [8, 10, 14, 16],
    minMonths: 5, maxMonths: 8,
  },
  {
    id: 'fact-dents',
    title: 'Poussées dentaires',
    message: 'Les premières dents apparaissent souvent entre 4 et 7 mois. Signes : bave abondante, gencives gonflées, irritabilité, refus du biberon. L\'appétit peut baisser de 10-30% pendant 2-5 jours.',
    category: 'development',
    hours: [7, 11, 15, 19],
    minMonths: 4, maxMonths: 12,
  },
  {
    id: 'fact-curiosite',
    title: 'Curiosité et distraction au repas',
    message: 'À 6 mois, les bébés sont très curieux et se distraient facilement. Les repas peuvent être courts et agités — alimentez dans un endroit calme, sans écran ni bruit. Ce n\'est pas un refus, c\'est de l\'exploration.',
    category: 'development',
    hours: [9, 12, 15, 17],
    minMonths: 5, maxMonths: 10,
  },
  {
    id: 'fact-pic-croissance',
    title: 'Pics de croissance',
    message: 'Les pics de croissance durent 2-4 jours : appétit +20-40%, repas plus fréquents, sommeil perturbé. Suivez la demande, augmentez les volumes — ça revient à la normale spontanément.',
    category: 'development',
    hours: [6, 10, 14, 18, 22],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-poids',
    title: 'Prise de poids',
    message: 'À 6 mois, un bébé a généralement doublé son poids de naissance. La prise de poids ralentit ensuite : 400-500g par mois entre 6 et 9 mois. C\'est normal et attendu.',
    category: 'development',
    hours: [8, 13, 17],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-babillage',
    title: 'Babillage et langage',
    message: 'Vers 6 mois, le babillage se diversifie (ba-ba, da-da, ma-ma). Répondez avec les mêmes sons — c\'est le premier dialogue. Parler pendant les repas stimule le langage sans gêner l\'alimentation.',
    category: 'development',
    hours: [7, 11, 15, 19],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-objet-permanent',
    title: 'Permanence de l\'objet',
    message: 'Vers 6 mois, bébé commence à comprendre qu\'un objet caché existe encore. Cela explique aussi pourquoi l\'anxiété de séparation peut apparaître au coucher — il sait que vous existez, même hors de sa vue.',
    category: 'development',
    hours: [9, 13, 20, 21],
    minMonths: 5, maxMonths: 9,
  },
  {
    id: 'fact-tummy-time',
    title: 'Temps sur le ventre (tummy time)',
    message: '20-30 min de tummy time par jour renforcent la nuque, les épaules et préparent la position assise et le 4 pattes. Faites-le sur une surface ferme, bébé éveillé — jamais pour dormir.',
    category: 'development',
    hours: [9, 10, 14, 15, 16],
    minMonths: 4, maxMonths: 9,
  },
  {
    id: 'fact-imitation',
    title: 'Imitation',
    message: 'Vers 6 mois, les bébés imitent les expressions du visage, les sons et certains gestes. C\'est la base de l\'apprentissage social. Exagérez vos expressions — bébé adore et mémorise.',
    category: 'development',
    hours: [9, 11, 15, 17],
    minMonths: 5, maxMonths: 10,
  },
  {
    id: 'fact-jeu-miroir',
    title: 'Jeu en miroir',
    message: 'Vers 6 mois, les bébés sont fascinés par leur reflet. Un miroir inbrisable fixé au sol ou dans le lit d\'éveil stimule la conscience de soi, la motricité et le sourire.',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 5, maxMonths: 10,
  },
  {
    id: 'fact-massage',
    title: 'Massage bébé',
    message: 'Un massage de 10-15 min après le bain réduit le cortisol, favorise la production d\'ocytocine et améliore la qualité du sommeil nocturne. Utilisez une huile adaptée et des mouvements lents et prévisibles.',
    category: 'development',
    hours: [18, 19, 20],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-lecture',
    title: 'Lecture à voix haute',
    message: 'Lire à voix haute à bébé enrichit son vocabulaire passif, développe la concentration et crée un moment calme avant le coucher. La régularité compte plus que la durée — 5-10 min suffisent.',
    category: 'development',
    hours: [8, 12, 19, 20],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-anxiete-separation',
    title: 'Anxiété de séparation',
    message: 'Vers 6-8 mois, l\'anxiété de séparation commence à apparaître. C\'est un signe de développement normal — bébé comprend que vous pouvez partir. Les rituels prévisibles (coucher, départ) aident à rassurer.',
    category: 'development',
    hours: [19, 20, 21, 7, 8],
    minMonths: 6, maxMonths: 14,
  },
  {
    id: 'fact-rythmes-circadiens',
    title: 'Rythmes circadiens',
    message: 'L\'horloge biologique se stabilise à cet âge. La régularité des horaires de lever, repas et coucher (± 30 min chaque jour) la consolide rapidement et réduit les nuits difficiles.',
    category: 'development',
    hours: [6, 7, 19, 20, 21],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-bain-detente',
    title: 'Bain et régulation thermique',
    message: 'Un bain tiède (37°C) abaisse la température corporelle par refroidissement de surface après la sortie — ce refroidissement est un signal biologique d\'endormissement. Idéal 60-90 min avant le coucher.',
    category: 'development',
    hours: [17, 18, 19],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-portage',
    title: 'Portage et développement',
    message: 'Le portage (écharpe, porte-bébé) favorise l\'attachement, régule la température et le rythme cardiaque de bébé, et réduit les pleurs. Idéal pour les périodes difficiles.',
    category: 'development',
    hours: [9, 14, 17],
    minMonths: 4, maxMonths: 12,
  },
  {
    id: 'fact-rire',
    title: 'Le rire, indicateur clé',
    message: 'Le rire franc et fréquent est l\'un des meilleurs indicateurs de bien-être. Un bébé reposé, bien nourri et suffisamment stimulé rit naturellement. L\'absence de rire sur plusieurs jours mérite attention.',
    category: 'development',
    hours: [9, 11, 14, 16],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-musique',
    title: 'Musique et développement',
    message: 'La musique douce et répétitive (berceuses, comptines) aide bébé à anticiper les structures et les séquences. Elle est particulièrement efficace pour calmer et préparer au sommeil dans un contexte de routine.',
    category: 'development',
    hours: [18, 19, 20, 21],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-inconnu-visages',
    title: 'Méfiance envers les inconnus',
    message: 'Vers 6-8 mois, les bébés deviennent méfiants envers les visages inconnus — c\'est la "peur des étrangers". C\'est une étape normale du développement cognitif, pas de la timidité.',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 6, maxMonths: 12,
  },

  // ══════════════════════════════════════════════════════════════════
  // JUMEAUX — faits existants avec plages d'âge
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-jumeaux-individualite',
    title: 'Chaque jumeau est unique',
    message: 'Même des jumeaux identiques développent des préférences, des rythmes et des tempéraments distincts. Comparez toujours chaque bébé à son propre historique, jamais à son jumeau.',
    category: 'twins',
    hours: [7, 10, 13, 16, 19],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-sync',
    title: 'Synchronisation — quand la viser ?',
    message: 'Synchroniser les repas quand c\'est possible est pragmatique. Mais forcer un rythme strictement identique peut stresser le bébé en avance ou en retard. Les 30 min d\'écart sont gérables et souvent naturels.',
    category: 'twins',
    hours: [8, 11, 14, 17, 20],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-dormir-ensemble',
    title: 'Dormir ensemble ou séparément ?',
    message: 'Passé 6 mois, lit séparé est conseillé mais la même chambre reste possible et souvent bénéfique. Les jumeaux s\'habituent rapidement aux bruits de l\'autre.',
    category: 'twins',
    hours: [20, 21, 22, 7],
    minMonths: 6, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-reveil-nuit',
    title: 'Quand un jumeau réveille l\'autre',
    message: 'Si un jumeau réveille l\'autre la nuit, intervenez vite sur le premier. Le bébé réveillé apprend souvent à dormir malgré le bruit du jumeau — l\'habitude se crée. Séparation des chambres rarement nécessaire avant 9 mois.',
    category: 'twins',
    hours: [0, 1, 2, 3, 4, 22, 23],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-siestes-decalees',
    title: 'Siestes légèrement décalées',
    message: 'Décaler les siestes de 15-20 min entre jumeaux permet un moment seul avec chacun. C\'est aussi plus gérable si l\'un a besoin d\'aide pour s\'endormir et l\'autre est déjà dans son lit.',
    category: 'twins',
    hours: [9, 11, 13, 15],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-coucher-decale',
    title: 'Coucher légèrement décalé',
    message: 'Coucher les jumeaux avec 10-15 min d\'écart permet d\'accorder à chacun un moment de rituel individuel (berceuse, contact). C\'est épuisant à court terme mais bénéfique pour leur sentiment de sécurité.',
    category: 'twins',
    hours: [19, 20, 21],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-attention-individuelle',
    title: 'Attention individuelle malgré deux bébés',
    message: 'Même 5 min seul avec chaque bébé par jour (pendant la sieste de l\'autre) renforce l\'attachement individuel. Les jumeaux ont besoin d\'être vus comme des individus, pas toujours comme une paire.',
    category: 'twins',
    hours: [10, 14, 16],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-rythmes-differents',
    title: 'Rythmes naturellement différents',
    message: 'Il est fréquent qu\'un jumeau consolide ses nuits avant l\'autre. Ce n\'est pas de la chance ou de la malchance — chaque bébé mûrit à son rythme. Ne comparez pas et adaptez la réponse à chacun.',
    category: 'twins',
    hours: [6, 7, 9, 21],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-babillage',
    title: 'Communication entre jumeaux',
    message: 'Vers 6-8 mois, les jumeaux commencent à "se répondre" par des vocalisations et des regards. Cette communication précoce est précieuse — laissez des moments d\'interaction sans adulte qui intervient.',
    category: 'twins',
    hours: [10, 13, 15],
    minMonths: 6, maxMonths: 12,
  },
  {
    id: 'fact-jumeaux-maladie',
    title: 'Quand un jumeau est malade',
    message: 'Quand un jumeau est malade, l\'autre contracte généralement le même virus dans les 24-72h. Préparez-vous à un rebond : une semaine difficile en alternance plutôt qu\'une semaine difficile ensemble.',
    category: 'twins',
    hours: [8, 12, 16],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-preferences-parent',
    title: 'Préférence de parent',
    message: 'Il est courant qu\'un jumeau montre une préférence pour un parent. C\'est temporaire et tourne souvent. Évitez de vous en formaliser — c\'est de l\'attachement sélectif, pas du rejet.',
    category: 'twins',
    hours: [7, 12, 19],
    minMonths: 5, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-epuisement-parent',
    title: 'Épuisement parental — normalité',
    message: 'Élever des jumeaux la première année est objectivement plus éprouvant qu\'un enfant unique. Le sentiment d\'être dépassé est normal, pas un échec. Demander de l\'aide est une force, pas une faiblesse.',
    category: 'twins',
    hours: [3, 4, 5, 22, 23],
    minMonths: 4, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-sol',
    title: 'Jouer au sol ensemble',
    message: 'Posez les deux jumeaux sur un tapis d\'éveil face à face. Ils s\'observent, se touchent, se sourient — cette stimulation mutuelle accélère le développement social et moteur.',
    category: 'twins',
    hours: [9, 11, 14, 16],
    minMonths: 5, maxMonths: 24,
  },
  {
    id: 'fact-jumeaux-nuit-progressive',
    title: 'Consolider les nuits — progressivement',
    message: 'Pour les jumeaux, consolider les nuits demande souvent plus de temps car le réveil de l\'un provoque le réveil de l\'autre. La régularité du rituel paye sur 2-3 semaines.',
    category: 'twins',
    hours: [20, 21, 22, 0, 1],
    minMonths: 4, maxMonths: 24,
  },

  // ══════════════════════════════════════════════════════════════════
  // NOUVEAUX FAITS — 7 MOIS
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-7m-solides-2repas',
    title: 'Solides : 2 repas par jour',
    message: 'À 7 mois, visez 2 repas de solides par jour (déjeuner + dîner), 2-4 cuillères à soupe par repas. Le lait reste l\'apport principal : 700-800 ml/jour.',
    category: 'feeding',
    hours: [10, 12, 17, 18],
    minMonths: 7, maxMonths: 8,
  },
  {
    id: 'fact-7m-textures',
    title: 'Évoluer les textures progressivement',
    message: 'Après 1-2 mois de purées lisses, passez aux purées grumeleuses puis aux légumes écrasés à la fourchette. L\'objectif est d\'apprendre à gérer des morceaux avant les molaires (vers 12-18 mois).',
    category: 'feeding',
    hours: [10, 12, 17],
    minMonths: 7, maxMonths: 10,
  },
  {
    id: 'fact-7m-eau',
    title: 'Introduire l\'eau libre',
    message: 'À partir de 7 mois, proposez quelques gorgées d\'eau plate à chaque repas de solides dans une tasse. Pas de jus de fruit avant 12 mois. L\'eau libre prépare la transition vers la tasse.',
    category: 'feeding',
    hours: [10, 12, 17],
    minMonths: 7, maxMonths: 24,
  },
  {
    id: 'fact-7m-allergenes',
    title: 'Introduction des allergènes',
    message: 'Introduire les allergènes majeurs (œuf, arachide, gluten, poisson) dès 6-7 mois réduit le risque d\'allergie. Commencez un allergène à la fois, 2-3 jours d\'intervalle. Consultez votre pédiatre si antécédents familiaux.',
    category: 'feeding',
    hours: [10, 12, 18],
    minMonths: 6, maxMonths: 10,
  },
  {
    id: 'fact-7m-fin-3e-sieste',
    title: 'Disparition de la 3e sieste',
    message: 'Vers 7-8 mois, la 3e sieste (fin d\'après-midi) disparaît souvent naturellement. Si bébé refuse mais est épuisé à 17h, avancez le coucher de 30-45 min — mieux vaut un coucher à 19h qu\'un bébé surstimulé.',
    category: 'sleep',
    hours: [15, 16, 17, 18],
    minMonths: 7, maxMonths: 9,
  },
  {
    id: 'fact-7m-coucher-avance',
    title: 'Coucher anticipé — règle des 2 siestes',
    message: 'En passant à 2 siestes, la dernière se termine souvent vers 15h-16h. Si le coucher habituel est à 20h30, bébé sera épuisé. Avancez à 19h-19h30 les premiers jours.',
    category: 'sleep',
    hours: [15, 16, 17, 18, 19],
    minMonths: 7, maxMonths: 9,
  },
  {
    id: 'fact-7m-assis-sans-appui',
    title: 'Position assise sans appui',
    message: 'Vers 7-8 mois, la position assise sans soutien est acquise. Bébé peut avoir les mains libres pour jouer. Les chutes en arrière sont normales — placez un coussin derrière.',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 7, maxMonths: 9,
  },
  {
    id: 'fact-7m-transfert-objet',
    title: 'Transfert d\'objet et coordination',
    message: 'À 7 mois, la plupart des bébés transfèrent un objet d\'une main à l\'autre, tapent deux objets ensemble, et portent tout à la bouche. C\'est de la proprioception et de l\'exploration sensorielle.',
    category: 'development',
    hours: [9, 14, 16],
    minMonths: 7, maxMonths: 9,
  },
  {
    id: 'fact-7m-4-pattes-approche',
    title: 'Vers le 4 pattes',
    message: 'Entre 7 et 10 mois, la plupart des bébés commencent à se déplacer — sur le ventre, en rampant, en pivotant, en 4 pattes. L\'ordre importe peu — un bébé qui rampe en arrière avant d\'aller en avant est normal.',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 7, maxMonths: 11,
  },
  {
    id: 'fact-7m-jumeaux-interactions',
    title: 'Les jumeaux se "trouvent"',
    message: 'Vers 7-8 mois, les jumeaux s\'intéressent vraiment l\'un à l\'autre : ils se tendent des objets, cherchent le regard, rient ensemble. Cette stimulation mutuelle est un véritable accélérateur de développement.',
    category: 'twins',
    hours: [10, 13, 16],
    minMonths: 7, maxMonths: 24,
  },

  // ══════════════════════════════════════════════════════════════════
  // NOUVEAUX FAITS — 8 MOIS
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-8m-finger-foods',
    title: 'Premiers finger foods',
    message: 'À 8 mois, proposez des morceaux mous que bébé peut attraper : banane, avocat, tofu mou, patate douce cuite, macaroni courts. Évitez les morceaux ronds, les aliments durs et le miel avant 12 mois.',
    category: 'feeding',
    hours: [10, 12, 17],
    minMonths: 8, maxMonths: 12,
  },
  {
    id: 'fact-8m-3-repas',
    title: 'Passage à 3 repas de solides',
    message: 'Vers 8-9 mois, introduisez le petit-déjeuner de solides (porridge, fruit, yaourt). 3 repas + 3-4 prises de lait. Le lait reste à 500-700 ml/jour — les solides ne remplacent pas encore.',
    category: 'feeding',
    hours: [7, 8, 10, 12, 17],
    minMonths: 8, maxMonths: 11,
  },
  {
    id: 'fact-8m-yaourt',
    title: 'Yaourt et produits laitiers',
    message: 'Le yaourt nature (sans sucre ajouté) peut être proposé dès 6 mois, le fromage à pâte cuite dès 8 mois. Riches en calcium et protéines. Le lait de vache en boisson reste déconseillé avant 12 mois.',
    category: 'feeding',
    hours: [8, 10, 17],
    minMonths: 7, maxMonths: 24,
  },
  {
    id: 'fact-8m-2-siestes',
    title: '2 siestes bien établies',
    message: 'À 8 mois, le rythme classique : sieste du matin (30-60 min vers 9h-10h) + sieste de milieu de journée (1-2h vers 12h-14h). La fenêtre d\'éveil est de 2h30-3h30. La nuit dure 10-12h.',
    category: 'sleep',
    hours: [9, 10, 13, 14, 21],
    minMonths: 8, maxMonths: 12,
  },
  {
    id: 'fact-8m-anxiete-coucher',
    title: 'Résistance au coucher — pic 8-10 mois',
    message: 'Le pic de l\'anxiété de séparation (8-10 mois) s\'accompagne souvent d\'une résistance au coucher. Maintenir le rituel sans le prolonger et partir avec confiance — hésiter ou revenir renforce l\'anxiété.',
    category: 'sleep',
    hours: [19, 20, 21],
    minMonths: 8, maxMonths: 11,
  },
  {
    id: 'fact-8m-pince',
    title: 'Prise en pince — développement majeur',
    message: 'La prise en pince (pouce-index) se développe entre 8 et 10 mois. C\'est un jalon majeur qui permet de saisir de petits morceaux, de pointer. Proposez de petits objets adaptés (toujours sécurisés).',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 8, maxMonths: 11,
  },
  {
    id: 'fact-8m-securite-maison',
    title: 'Sécuriser la maison — urgence mobile',
    message: 'Un bébé qui se déplace ouvre un nouveau chapitre : protège-coins, sécuriser les meubles lourds, fermer les portes de salle de bain et cuisine, couvrir les prises. Anticipez avant que bébé n\'explore.',
    category: 'development',
    hours: [9, 14, 16],
    minMonths: 8, maxMonths: 14,
  },
  {
    id: 'fact-8m-jalousie',
    title: 'Premières jalousies entre jumeaux',
    message: 'Vers 8-10 mois, il est courant qu\'un jumeau pleure quand l\'autre reçoit de l\'attention. Ce n\'est pas de la manipulation — c\'est de la conscience sociale précoce. Répondre à chacun calmement et tour à tour suffit.',
    category: 'twins',
    hours: [8, 11, 14, 17, 19],
    minMonths: 8, maxMonths: 15,
  },

  // ══════════════════════════════════════════════════════════════════
  // NOUVEAUX FAITS — 9 MOIS
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-9m-repas-famille',
    title: 'Repas "famille" adaptés',
    message: 'Vers 9-10 mois, bébé peut manger une version adaptée du repas familial : sans sel ajouté, sans épices fortes, textures tendres. Cuisiner commun et prélever la part bébé avant assaisonnement simplifie tout.',
    category: 'feeding',
    hours: [10, 12, 17, 18],
    minMonths: 9, maxMonths: 24,
  },
  {
    id: 'fact-9m-sevrage-nuit',
    title: 'Sevrage nocturne naturel',
    message: 'Vers 9-12 mois, beaucoup de bébés n\'ont plus physiologiquement besoin de biberon la nuit si l\'apport journalier est suffisant. Si bébé boit <60 ml, c\'est souvent une habitude — un accompagnement au dodo peut suffire.',
    category: 'feeding',
    hours: [0, 1, 2, 3, 22, 23],
    minMonths: 9, maxMonths: 15,
  },
  {
    id: 'fact-9m-nuit-consolidee',
    title: 'Nuit qui se consolide',
    message: 'Beaucoup de bébés de 9 mois dorment 6-10h consécutives. Ceux qui se réveillent encore ont souvent des associations d\'endormissement à dénouer. Cohérence du rituel et auto-apaisement sont les leviers.',
    category: 'sleep',
    hours: [0, 1, 2, 3, 22, 23, 6, 7],
    minMonths: 9, maxMonths: 14,
  },
  {
    id: 'fact-9m-debout-appui',
    title: 'Se mettre debout avec appui',
    message: 'Vers 9-11 mois, bébé se hisse debout en s\'appuyant sur les meubles, puis fait des pas latéraux (croisière). Encouragez sans forcer — les jambes se musclent progressivement.',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 9, maxMonths: 13,
  },
  {
    id: 'fact-9m-premiers-mots',
    title: 'Premiers proto-mots',
    message: '"Mama" et "dada" avec intention, des sons reproductibles pour des objets familiers — c\'est le langage qui émerge. Parlez, nommez, commentez les actions. Chaque phrase entendue enrichit le réservoir passif.',
    category: 'development',
    hours: [8, 11, 15, 18],
    minMonths: 9, maxMonths: 15,
  },
  {
    id: 'fact-9m-pointage',
    title: 'Pointage proto-impératif',
    message: 'Vers 9-12 mois, bébé tend le bras vers ce qu\'il veut — c\'est un jalon de communication majeur. Nommez l\'objet pointé et répondez-y : c\'est un premier échange intentionnel de sens.',
    category: 'development',
    hours: [9, 12, 15],
    minMonths: 9, maxMonths: 15,
  },
  {
    id: 'fact-9m-jumeaux-jeu-social',
    title: 'Jumeaux : du jeu parallèle au jeu social',
    message: 'Vers 9-10 mois, les jumeaux passent du jeu côte à côte à de vrais échanges : offrir un objet, imiter le geste de l\'autre, se sourire délibérément. C\'est le début d\'une relation sociale complexe.',
    category: 'twins',
    hours: [10, 13, 15],
    minMonths: 9, maxMonths: 24,
  },

  // ══════════════════════════════════════════════════════════════════
  // NOUVEAUX FAITS — 10 MOIS
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-10m-autonomie-repas',
    title: 'Manger seul — manger salement',
    message: 'À 10 mois, bébé veut tenir la cuillère, toucher la nourriture, faire son assiette. C\'est de l\'apprentissage sensoriel. Protégez le sol, acceptez le désordre — l\'autonomie alimentaire prévient les difficultés à table plus tard.',
    category: 'feeding',
    hours: [8, 10, 12, 17],
    minMonths: 10, maxMonths: 24,
  },
  {
    id: 'fact-10m-collations',
    title: 'Collations à 10 mois',
    message: 'Deux collations par jour (milieu de matinée + milieu d\'après-midi) stabilisent la glycémie entre les repas. Fruits, légumes cuits en bâtonnets, fromage doux. Évitez moins de 1h30 avant les repas.',
    category: 'feeding',
    hours: [10, 15],
    minMonths: 10, maxMonths: 24,
  },
  {
    id: 'fact-10m-vers-1-sieste',
    title: 'Résistance aux siestes — transition ?',
    message: 'Si bébé résiste régulièrement à une sieste depuis 2+ semaines, il explore peut-être la transition 2→1 sieste. Mais cette transition arrive rarement avant 12-15 mois — à 10 mois, presque tous ont encore besoin de 2 siestes.',
    category: 'sleep',
    hours: [9, 13],
    minMonths: 10, maxMonths: 15,
  },
  {
    id: 'fact-10m-croisiere',
    title: 'Croisière et premiers pas',
    message: 'La croisière (marche latérale le long des meubles) précède les premiers pas de quelques semaines à quelques mois. Les premiers pas arrivent entre 9 et 17 mois — l\'écart normal est énorme.',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 10, maxMonths: 15,
  },
  {
    id: 'fact-10m-comprehension-langage',
    title: 'Compréhension avant production',
    message: 'À 10 mois, bébé comprend bien plus qu\'il ne dit. Il suit des consignes simples ("donne-moi", "viens"), reconnaît son prénom, réagit à "non". Ce décalage compréhension/expression est normal jusqu\'à 18-24 mois.',
    category: 'development',
    hours: [9, 13, 16],
    minMonths: 10, maxMonths: 24,
  },
  {
    id: 'fact-10m-jumeaux-competition',
    title: 'Compétition pour les jouets',
    message: 'Les querelles pour les mêmes jouets entre jumeaux commencent vers 10-12 mois. Avoir deux exemplaires des jouets préférés réduit les conflits, mais quelques négociations encadrées apprennent la gestion de la frustration.',
    category: 'twins',
    hours: [10, 14, 16],
    minMonths: 10, maxMonths: 24,
  },

  // ══════════════════════════════════════════════════════════════════
  // NOUVEAUX FAITS — 11 MOIS
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-11m-vers-lait-croissance',
    title: 'Vers le lait de croissance',
    message: 'À partir de 12 mois, le lait de croissance (ou lait entier pasteurisé) remplace progressivement le lait maternisé. Transition en 2-3 semaines par mélange progressif si refus. 500 ml/jour suffit.',
    category: 'feeding',
    hours: [7, 12, 17, 20],
    minMonths: 11, maxMonths: 15,
  },
  {
    id: 'fact-11m-fin-biberon',
    title: 'Fin progressive du biberon',
    message: 'L\'OMS recommande de sevrer le biberon avant 18 mois. Commencer la transition vers la tasse entre 12 et 18 mois réduit les caries et améliore le développement oro-facial. Commencez par remplacer un biberon par jour.',
    category: 'feeding',
    hours: [8, 12, 17, 20],
    minMonths: 11, maxMonths: 18,
  },
  {
    id: 'fact-11m-nuit-complete',
    title: 'Nuit complète à l\'approche de 12 mois',
    message: 'La plupart des bébés de 11-12 mois peuvent faire 10-12h de nuit sans alimentation si l\'apport journalier est suffisant. S\'il y a encore des réveils fréquents, l\'association d\'endormissement est souvent en cause.',
    category: 'sleep',
    hours: [0, 1, 22, 23],
    minMonths: 11, maxMonths: 15,
  },
  {
    id: 'fact-11m-marche-premiers-pas',
    title: 'Premiers pas — grande variabilité',
    message: 'Les premiers pas interviennent entre 9 et 17 mois dans la norme. Ne comparez pas deux jumeaux entre eux — l\'un peut marcher à 10 mois et l\'autre à 14 mois : c\'est dans les limites normales.',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 11, maxMonths: 17,
  },
  {
    id: 'fact-11m-vocabulaire',
    title: 'Vocabulaire à l\'approche de 12 mois',
    message: 'Vers 12 mois, 2 à 5 mots intentionnels est la médiane. L\'absence de mots à 12 mois mérite attention mais pas d\'alarme — beaucoup rattrapent entre 12 et 18 mois. La compréhension de consignes simples est l\'indicateur clé.',
    category: 'development',
    hours: [9, 12, 15],
    minMonths: 11, maxMonths: 16,
  },
  {
    id: 'fact-11m-jeu-symbolique',
    title: 'Jeu symbolique précoce',
    message: 'Vers 11-13 mois apparaît le jeu "faire semblant" précoce : boire dans une tasse vide, nourrir une peluche. C\'est le signe d\'une pensée symbolique naissante — le fondement du langage et de l\'imagination.',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 11, maxMonths: 18,
  },

  // ══════════════════════════════════════════════════════════════════
  // NOUVEAUX FAITS — 12 MOIS
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-12m-alimentation-diversifiee',
    title: 'À 12 mois : presque tout est possible',
    message: 'À 12 mois, votre bébé peut manger quasiment comme la famille — sel limité, sucre limité, miel toujours proscrit. Évitez encore les aliments à risque d\'étouffement : raisins entiers, noix, bonbons durs.',
    category: 'feeding',
    hours: [8, 10, 12, 17, 18],
    minMonths: 12, maxMonths: 24,
  },
  {
    id: 'fact-12m-repas-famille',
    title: 'Le repas partagé — rituel familial',
    message: 'Manger ensemble à table, sans écran, avec les adultes, est le meilleur apprentissage alimentaire. L\'imitation des parents (goût, texture, comportement) joue un rôle plus important que toute technique.',
    category: 'feeding',
    hours: [8, 12, 17, 18],
    minMonths: 12, maxMonths: 24,
  },
  {
    id: 'fact-12m-transition-1-sieste',
    title: 'Transition 2 → 1 sieste (12-18 mois)',
    message: 'La transition 2→1 sieste arrive entre 12 et 18 mois (médiane : 15 mois). Signes : résistance régulière à l\'une des siestes, coucher tardif malgré des siestes courtes. La transition prend 4-6 semaines.',
    category: 'sleep',
    hours: [9, 13],
    minMonths: 12, maxMonths: 18,
  },
  {
    id: 'fact-12m-1-an',
    title: '12 mois — jalons attendus',
    message: 'À 12 mois, les jalons classiques : tenir debout seul quelques secondes, dire 1-3 mots intentionnels, pointer, imiter, jouer à coucou. Certains marchent, d\'autres pas encore. Le bilan pédiatrique de 12 mois fait le point.',
    category: 'development',
    hours: [9, 14, 16],
    minMonths: 12, maxMonths: 14,
  },
  {
    id: 'fact-12m-autonomie',
    title: 'L\'autonomie à 12 mois',
    message: 'À 12 mois, bébé veut faire beaucoup de choses seul : tenir la tasse, retirer ses chaussures, ouvrir un tiroir. Laissez-le essayer même si c\'est lent ou inefficace — la frustration gérée construit la persévérance.',
    category: 'development',
    hours: [10, 14, 16],
    minMonths: 12, maxMonths: 24,
  },
  {
    id: 'fact-12m-jumeaux-1-an',
    title: 'Jumeaux à 12 mois — un cap',
    message: 'La première année avec des jumeaux est une montagne. Vous avez navigué des nuits sans sommeil, des repas simultanés, le tout en double. Prenez un moment pour reconnaître cette réussite — elle est méritée.',
    category: 'twins',
    hours: [7, 12, 19, 21],
    minMonths: 12, maxMonths: 15,
  },
];

/**
 * Seeded LCG (Knuth) — returns a deterministic pseudo-random float in [0, 1).
 */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Pick 2 facts for the current hour, filtered to the baby's current age.
 * Every day the pool is Fisher-Yates shuffled with a day-based seed,
 * so every fact rotates fairly and no fact is stranded for multiple days.
 * Each hour picks a unique pair from the shuffled sequence.
 */
export function getHourlyFacts(hour: number, ageMonths: number): BabyFact[] {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );

  // Filter facts relevant to the baby's current age
  const pool = BABY_FACTS.filter(f => ageMonths >= f.minMonths && ageMonths <= f.maxMonths);
  const n = pool.length;
  const rand = seededRandom(dayOfYear * 7919 + 42);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Each hour picks a unique consecutive pair from the shuffled pool
  const idx1 = (hour * 2) % n;
  const idx2 = (hour * 2 + 1) % n;

  const fact1 = pool[idx1];
  let fact2 = pool[idx2];

  // Ensure different categories when possible
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
