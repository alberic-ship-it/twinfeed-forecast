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
  minDurationMin: 300,  // 5h — only count true night sleeps, not long evening naps
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

  // ══════════════════════════════════════════════════════════════════
  // ALIMENTATION
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-volume-typique',
    title: 'Volume typique à 6 mois',
    message: 'Un biberon fait en moyenne 120-180 ml à 6 mois. Les volumes varient selon l\'heure, la fatigue et l\'activité — c\'est tout à fait normal.',
    category: 'feeding',
    hours: [6, 7, 8, 10, 11, 14, 15],
  },
  {
    id: 'fact-repas-par-jour',
    title: 'Nombre de repas par jour',
    message: '4 à 6 repas par jour est la norme à 6 mois. Au-delà, c\'est souvent du cluster feeding — un mécanisme naturel de régulation, pas un signe de problème.',
    category: 'feeding',
    hours: [9, 12, 15, 18],
  },
  {
    id: 'fact-apport-journalier',
    title: 'Apport journalier',
    message: 'Un bébé de 6 mois consomme 700-900 ml de lait par jour. Si la diversification a commencé, le lait reste l\'apport nutritionnel principal jusqu\'à 12 mois.',
    category: 'feeding',
    hours: [8, 11, 14, 17, 20],
  },
  {
    id: 'fact-intervalle',
    title: 'Intervalle entre repas',
    message: 'L\'intervalle typique à 6 mois est de 3h30-4h30. Chaque bébé développe son propre rythme — les écarts d\'une heure sont parfaitement normaux.',
    category: 'feeding',
    hours: [7, 10, 13, 16],
  },
  {
    id: 'fact-diversification',
    title: 'Diversification alimentaire',
    message: '6 mois est le moment recommandé pour introduire les solides. Commencez par des purées lisses en petites quantités (1-2 cuillères). Le lait reste l\'aliment principal pendant encore 6 mois.',
    category: 'feeding',
    hours: [9, 10, 11, 12],
  },
  {
    id: 'fact-variation-appetit',
    title: 'Variations d\'appétit',
    message: 'L\'appétit varie selon la fatigue, les poussées dentaires, l\'activité et la chaleur. Un repas plus petit suivi d\'un plus gros le lendemain est un mécanisme de régulation naturel.',
    category: 'feeding',
    hours: [8, 13, 16, 19],
  },
  {
    id: 'fact-appetit-soir',
    title: 'Appétit du soir',
    message: 'Beaucoup de bébés de 6 mois mangent davantage le soir — c\'est un "plein" naturel avant la nuit. Prévoyez un biberon légèrement plus généreux entre 18h et 20h.',
    category: 'feeding',
    hours: [17, 18, 19, 20],
  },
  {
    id: 'fact-repas-nuit',
    title: 'Repas de nuit',
    message: '1 à 2 biberons de nuit restent courants à 6 mois. Ils diminuent naturellement avec l\'âge — pas besoin de forcer le sevrage nocturne avant que le bébé soit prêt.',
    category: 'feeding',
    hours: [20, 21, 22, 23, 0, 1, 2, 3],
  },
  {
    id: 'fact-biberon-reveil',
    title: 'Biberon complet au réveil',
    message: 'Un biberon bien pris au réveil (120-180 ml) aide à caler le rythme alimentaire de la journée. Si bébé refuse, pas d\'inquiétude — il rattrapera naturellement au repas suivant.',
    category: 'feeding',
    hours: [6, 7, 8],
  },
  {
    id: 'fact-volume-aprem-coucher',
    title: 'Biberon d\'après-midi & nuit',
    message: 'Un bon biberon entre 14h et 17h contribue à un meilleur endormissement le soir. C\'est le total calorique de l\'après-midi qui compte, pas uniquement le dernier biberon avant le coucher.',
    category: 'feeding',
    hours: [14, 15, 16],
  },
  {
    id: 'fact-reduction-nuit',
    title: 'Diminuer les biberons de nuit',
    message: 'Pour réduire les réveils nocturnes liés à la faim, diminuez progressivement le volume (10-20 ml par semaine) plutôt qu\'arrêter brutalement. Cela laisse au bébé le temps de compenser en journée.',
    category: 'feeding',
    hours: [22, 23, 0, 1, 2, 3],
  },
  {
    id: 'fact-signes-faim',
    title: 'Signaux de faim précoces',
    message: 'Les signaux de faim précoces : main à la bouche, mouvements de succion, agitation légère, regard vers le parent. Attendre les pleurs est souvent trop tard — le bébé stressed mange moins bien.',
    category: 'feeding',
    hours: [6, 9, 12, 15, 18],
  },
  {
    id: 'fact-signes-satiete',
    title: 'Signaux de satiété',
    message: 'Un bébé rassasié : tourne la tête, relâche la tétine, s\'endort, joue avec le biberon. Ne forcez jamais à finir — l\'autorégulation alimentaire protège contre les problèmes de poids à long terme.',
    category: 'feeding',
    hours: [7, 10, 13, 16, 19],
  },
  {
    id: 'fact-paced-feeding',
    title: 'Biberon en rythme lent',
    message: 'Tenez le biberon horizontalement et faites des pauses toutes les 30-60 ml. Cela imite le rythme de l\'allaitement, évite la suralimentation et réduit les gaz et régurgitations.',
    category: 'feeding',
    hours: [7, 10, 13, 16],
  },
  {
    id: 'fact-vitamine-d',
    title: 'Vitamine D',
    message: 'La vitamine D est essentielle au développement osseux. Les bébés allaités ou peu exposés au soleil ont besoin d\'une supplémentation quotidienne (400 UI). Demandez à votre pédiatre.',
    category: 'feeding',
    hours: [8, 12, 18],
  },
  {
    id: 'fact-cluster-feeding',
    title: 'Cluster feeding du soir',
    message: 'Le cluster feeding (repas rapprochés en soirée, toutes les 1-2h) est fréquent entre 17h et 21h à cet âge. C\'est une façon pour bébé de "faire le plein" avant la nuit — laissez-le guider.',
    category: 'feeding',
    hours: [17, 18, 19, 20],
  },
  {
    id: 'fact-temperature-biberon',
    title: 'Température du biberon',
    message: 'La plupart des bébés acceptent le biberon à température ambiante ou légèrement chaud (37°C). La nuit, avoir un biberon à température ambiante évite l\'attente et perturbe moins le sommeil.',
    category: 'feeding',
    hours: [0, 1, 2, 3, 4, 21, 22, 23],
  },
  {
    id: 'fact-taille-tetine',
    title: 'Taille de la tétine',
    message: 'La taille 2 (ou débit moyen) est adaptée à la plupart des bébés de 6 mois. Une tétine trop rapide provoque l\'ingestion d\'air et le reflux ; trop lente, le bébé se fatigue et mange moins.',
    category: 'feeding',
    hours: [6, 10, 14, 18],
  },
  {
    id: 'fact-refus-biberon',
    title: 'Refus de biberon passager',
    message: 'Un refus de biberon de 1-3 jours peut survenir lors de poussées dentaires, maladies légères ou distractibilité accrue. Proposez dans un endroit calme et semi-obscur, sans forcer.',
    category: 'feeding',
    hours: [8, 11, 14, 17],
  },
  {
    id: 'fact-dream-feed',
    title: 'Tétée de rêve (dream feed)',
    message: 'Donner un biberon entre 22h et 23h, avant votre propre coucher, peut rallonger le premier cycle de nuit de 1-2h. Le bébé mange à demi-endormi — pas besoin de le réveiller complètement.',
    category: 'feeding',
    hours: [21, 22, 23],
  },

  // ══════════════════════════════════════════════════════════════════
  // SOMMEIL
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-sommeil-total',
    title: 'Sommeil à 6 mois',
    message: 'Un bébé de 6 mois dort 12-15h par jour : 10-12h la nuit (avec possibles réveils) et 2-3 siestes en journée totalisant 2-4h.',
    category: 'sleep',
    hours: [7, 12, 19, 21],
  },
  {
    id: 'fact-fenetre-eveil',
    title: 'Fenêtres d\'éveil',
    message: 'À 6 mois, un bébé peut rester éveillé 1h30-2h30 entre deux siestes. Au-delà de 3h sans sommeil, les signes de surstimulation apparaissent et l\'endormissement devient plus difficile.',
    category: 'sleep',
    hours: [8, 9, 11, 13, 15],
  },
  {
    id: 'fact-transition-siestes',
    title: 'Transition 3 → 2 siestes',
    message: 'Entre 6 et 9 mois, beaucoup de bébés passent de 3 siestes à 2. Des jours à 3 et d\'autres à 2 siestes sont normaux pendant cette transition — suivez les signes de fatigue plutôt que l\'horloge.',
    category: 'sleep',
    hours: [9, 10, 14, 15, 16],
  },
  {
    id: 'fact-regression-sommeil',
    title: 'Régression du sommeil 6 mois',
    message: 'La régression du sommeil entre 4 et 6 mois est liée à la maturation du cerveau et l\'explosion des acquisitions motrices. Elle dure 2-6 semaines. Maintenir la routine est la meilleure réponse.',
    category: 'sleep',
    hours: [6, 22, 23, 0, 1, 2],
  },
  {
    id: 'fact-routine-coucher',
    title: 'Routine du coucher',
    message: 'Une routine régulière (bain, massage, biberon, chanson) conditionne le cerveau à anticiper le sommeil. La régularité de la séquence compte plus que la durée — 15 à 30 min suffisent.',
    category: 'sleep',
    hours: [18, 19, 20, 21],
  },
  {
    id: 'fact-sieste-matin',
    title: 'Sieste du matin — la plus réparatrice',
    message: 'La sieste du matin (souvent vers 9h-10h) est la plus liée à la qualité du sommeil nocturne. Un réveil matinal trop tardif peut la décaler et déstabiliser toute la journée.',
    category: 'sleep',
    hours: [7, 8, 9, 10],
  },
  {
    id: 'fact-premier-stretch',
    title: 'Premier stretch de nuit',
    message: 'Le premier cycle de sommeil nocturne est toujours le plus long (4-6h à 6 mois). Un biberon du soir bien pris et un coucher dans la bonne fenêtre horaire contribuent à l\'allonger.',
    category: 'sleep',
    hours: [20, 21, 22, 23],
  },
  {
    id: 'fact-proteger-sieste-midi',
    title: 'Protéger la sieste de midi',
    message: 'La sieste de midi est souvent la plus longue (30-90 min). Protégez-la : pénombre, calme, coucher au premier signe de fatigue. Une sieste de midi réussie améliore directement la nuit suivante.',
    category: 'sleep',
    hours: [11, 12, 13],
  },
  {
    id: 'fact-rituel-soir',
    title: 'Rituel du soir — la régularité',
    message: 'Un rituel prévisible (bain, biberon, berceuse, obscurité) signale au cerveau que la nuit approche. Reproduire la même séquence chaque soir accélère l\'endormissement sur le long terme.',
    category: 'sleep',
    hours: [18, 19, 20],
  },
  {
    id: 'fact-sieste-courte-ok',
    title: 'Sieste courte = cycle complet',
    message: 'Une sieste de 20-30 min correspond à un cycle de sommeil léger complet chez le nourrisson. Elle est suffisante pour recharger les batteries — pas besoin de forcer une prolongation.',
    category: 'sleep',
    hours: [9, 10, 14, 15, 16],
  },
  {
    id: 'fact-surstimulation',
    title: 'Calme en fin d\'après-midi',
    message: 'Entre 16h et 18h, réduisez les stimulations (écrans, bruits forts, jeux très actifs). Le cortisol du soir peut retarder l\'endormissement de 30 à 60 min — le calme est un investissement.',
    category: 'sleep',
    hours: [16, 17, 18],
  },
  {
    id: 'fact-coucher-ideal',
    title: 'Créneau de coucher idéal',
    message: 'Entre 19h et 21h, le taux de mélatonine est naturellement élevé chez le nourrisson. Coucher dans ce créneau facilite l\'endormissement, allonge le premier cycle et réduit les réveils nocturnes.',
    category: 'sleep',
    hours: [19, 20, 21],
  },
  {
    id: 'fact-cycles-nuit',
    title: 'Cycles de sommeil nocturne',
    message: 'À 6 mois, un cycle de sommeil dure environ 45-60 min. Entre chaque cycle, il y a une phase d\'éveil léger naturelle. Si bébé a appris à se rendormir seul, il le fait en quelques minutes.',
    category: 'sleep',
    hours: [0, 1, 2, 3, 4, 22, 23],
  },
  {
    id: 'fact-association-endormissement',
    title: 'Associations d\'endormissement',
    message: 'Si bébé s\'endort dans les bras ou au biberon, il cherchera les mêmes conditions à chaque réveil nocturne. Poser bébé éveillé mais somnolent dans son lit favorise l\'apprentissage de l\'auto-apaisement.',
    category: 'sleep',
    hours: [19, 20, 21, 22],
  },
  {
    id: 'fact-obscurite',
    title: 'Obscurité et mélatonine',
    message: 'L\'obscurité complète déclenche la production de mélatonine, l\'hormone du sommeil. Même une petite veilleuse peut réduire sa production. Pour les siestes en journée, des volets obscurcissants doublent souvent leur durée.',
    category: 'sleep',
    hours: [7, 10, 12, 18, 19, 20],
  },
  {
    id: 'fact-bruit-blanc',
    title: 'Bruit blanc',
    message: 'Le bruit blanc (ventilateur, aspirateur, app dédiée) masque les bruits domestiques et rappelle le son utérin. Il peut allonger les siestes et réduire les micro-réveils. Volume recommandé : 50-65 dB.',
    category: 'sleep',
    hours: [9, 12, 15, 20, 21],
  },
  {
    id: 'fact-temperature-chambre',
    title: 'Température de la chambre',
    message: 'La température idéale pour le sommeil du nourrisson est 18-20°C. Une chambre trop chaude perturbe le sommeil profond et augmente les réveils. En dessous de 18°C, une turbulette suffit.',
    category: 'sleep',
    hours: [19, 20, 21, 22],
  },
  {
    id: 'fact-signes-fatigue-precoces',
    title: 'Repérer la fatigue à temps',
    message: 'Signes précoces de fatigue : regard dans le vide, frottement des yeux, bâillement, oreille tirée. Attendre les pleurs ou l\'agitation forte = fatigue excessive, endormissement plus long et sommeil plus agité.',
    category: 'sleep',
    hours: [8, 11, 13, 16, 18],
  },
  {
    id: 'fact-overtired',
    title: 'La surstimulation — paradoxe',
    message: 'Un bébé surstimulé semble énergique et difficile à calmer — mais c\'est l\'excès de cortisol. Il s\'endormira plus difficilement, dormira moins longtemps et se réveillera plus souvent. La fenêtre d\'éveil est précieuse.',
    category: 'sleep',
    hours: [9, 14, 16, 20],
  },
  {
    id: 'fact-lumiere-matin',
    title: 'Lumière naturelle le matin',
    message: 'Exposer bébé à la lumière naturelle dans les 30 min suivant le réveil ancre son horloge circadienne. Cela améliore la régularité des siestes et avance naturellement l\'heure du coucher le soir.',
    category: 'sleep',
    hours: [6, 7, 8],
  },
  {
    id: 'fact-nuit-complete-definition',
    title: 'Qu\'est-ce qu\'une nuit complète ?',
    message: 'À 6 mois, une "nuit complète" correspond à 5-6h d\'affilée sans réveil pour manger. Certains bébés y arrivent naturellement, d\'autres pas avant 9-12 mois — c\'est une grande variabilité normale.',
    category: 'sleep',
    hours: [5, 6, 22, 23],
  },
  {
    id: 'fact-faux-depart',
    title: 'Réveil à 45 min — entre deux cycles',
    message: 'Le réveil systématique après 45 min de sieste correspond à la jonction entre deux cycles de sommeil. Si bébé ne sait pas se rendormir seul, il appellera. Attendre 2-3 min avant d\'intervenir laisse une chance.',
    category: 'sleep',
    hours: [9, 10, 11, 12, 13, 14, 15, 16],
  },
  {
    id: 'fact-regression-motrice',
    title: 'Sommeil perturbé par les acquisitions',
    message: 'Chaque grande acquisition motrice (retournement, position assise, 4 pattes) perturbe temporairement le sommeil. Le cerveau "pratique" les nouveaux mouvements la nuit. Ça dure 1-2 semaines en général.',
    category: 'sleep',
    hours: [1, 2, 3, 22, 23],
  },
  {
    id: 'fact-bruits-maison',
    title: 'Ne pas étouffer tous les bruits',
    message: 'Bébé n\'a pas besoin d\'un silence absolu pour dormir. Un niveau sonore de maison normale (30-40 dB) est bénéfique — cela évite une hypersensibilité aux bruits ambiants qui complique les siestes en dehors.',
    category: 'sleep',
    hours: [10, 12, 14, 16],
  },
  {
    id: 'fact-melatonine-production',
    title: 'Mélatonine — production à 6 mois',
    message: 'La production de mélatonine se stabilise progressivement entre 3 et 6 mois, synchronisant enfin l\'horloge biologique avec le cycle jour/nuit. C\'est pourquoi les nuits commencent à se consolider à cet âge.',
    category: 'sleep',
    hours: [19, 20, 21, 22],
  },

  // ══════════════════════════════════════════════════════════════════
  // DÉVELOPPEMENT
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-motricite',
    title: 'Motricité à 6 mois',
    message: 'À 6 mois, la plupart des bébés tiennent assis avec appui, attrapent des objets intentionnellement et commencent à se retourner. Cette activité accrue augmente les besoins caloriques et la fatigue.',
    category: 'development',
    hours: [8, 10, 14, 16],
  },
  {
    id: 'fact-dents',
    title: 'Poussées dentaires',
    message: 'Les premières dents apparaissent souvent entre 4 et 7 mois. Signes : bave abondante, gencives gonflées, irritabilité, refus du biberon. L\'appétit peut baisser de 10-30% pendant 2-5 jours.',
    category: 'development',
    hours: [7, 11, 15, 19],
  },
  {
    id: 'fact-curiosite',
    title: 'Curiosité et distraction au repas',
    message: 'À 6 mois, les bébés sont très curieux et se distraient facilement. Les repas peuvent être courts et agités — alimentez dans un endroit calme, sans écran ni bruit. Ce n\'est pas un refus, c\'est de l\'exploration.',
    category: 'development',
    hours: [9, 12, 15, 17],
  },
  {
    id: 'fact-pic-croissance',
    title: 'Pics de croissance',
    message: 'Les pics de croissance à 6 mois durent 2-4 jours : appétit +20-40%, repas plus fréquents, sommeil perturbé. Suivez la demande, augmentez les volumes — ça revient à la normale spontanément.',
    category: 'development',
    hours: [6, 10, 14, 18, 22],
  },
  {
    id: 'fact-poids',
    title: 'Prise de poids',
    message: 'À 6 mois, un bébé a généralement doublé son poids de naissance. La prise de poids ralentit ensuite : 400-500g par mois entre 6 et 9 mois. C\'est normal et attendu.',
    category: 'development',
    hours: [8, 13, 17],
  },
  {
    id: 'fact-babillage',
    title: 'Babillage et langage',
    message: 'Vers 6 mois, le babillage se diversifie (ba-ba, da-da, ma-ma). Répondez avec les mêmes sons — c\'est le premier dialogue. Parler pendant les repas stimule le langage sans gêner l\'alimentation.',
    category: 'development',
    hours: [7, 11, 15, 19],
  },
  {
    id: 'fact-objet-permanent',
    title: 'Permanence de l\'objet',
    message: 'Vers 6 mois, bébé commence à comprendre qu\'un objet caché existe encore. Cela explique aussi pourquoi l\'anxiété de séparation peut apparaître au coucher — il sait que vous existez, même hors de sa vue.',
    category: 'development',
    hours: [9, 13, 20, 21],
  },
  {
    id: 'fact-tummy-time',
    title: 'Temps sur le ventre (tummy time)',
    message: '20-30 min de tummy time par jour renforcent la nuque, les épaules et prépare la position assise et le 4 pattes. Faites-le sur une surface ferme, bébé éveillé — jamais pour dormir.',
    category: 'development',
    hours: [9, 10, 14, 15, 16],
  },
  {
    id: 'fact-imitation',
    title: 'Imitation à 6 mois',
    message: 'Vers 6 mois, les bébés imitent les expressions du visage, les sons et certains gestes. C\'est la base de l\'apprentissage social. Exagérez vos expressions — bébé adore et mémorise.',
    category: 'development',
    hours: [9, 11, 15, 17],
  },
  {
    id: 'fact-jeu-miroir',
    title: 'Jeu en miroir',
    message: 'Vers 6 mois, les bébés sont fascinés par leur reflet. Un miroir inbrisable fixé au sol ou dans le lit d\'éveil stimule la conscience de soi, la motricité (ils essaient d\'atteindre leur reflet) et le sourire.',
    category: 'development',
    hours: [10, 14, 16],
  },
  {
    id: 'fact-massage',
    title: 'Massage bébé',
    message: 'Un massage de 10-15 min après le bain réduit le cortisol, favorise la production d\'ocytocine et améliore la qualité du sommeil nocturne. Utilisez une huile adaptée et des mouvements lents et prévisibles.',
    category: 'development',
    hours: [18, 19, 20],
  },
  {
    id: 'fact-lecture',
    title: 'Lecture à voix haute',
    message: 'Lire à voix haute à bébé dès 6 mois enrichit son vocabulaire passif, développe la concentration et crée un moment calme avant le coucher. La régularité compte plus que la durée — 5-10 min suffisent.',
    category: 'development',
    hours: [8, 12, 19, 20],
  },
  {
    id: 'fact-anxiete-separation',
    title: 'Début de l\'anxiété de séparation',
    message: 'Vers 6-8 mois, l\'anxiété de séparation commence à apparaître. C\'est un signe de développement normal — bébé comprend que vous pouvez partir. Les rituels prévisibles (coucher, départ) aident à rassurer.',
    category: 'development',
    hours: [19, 20, 21, 7, 8],
  },
  {
    id: 'fact-rythmes-circadiens',
    title: 'Rythmes circadiens',
    message: 'À 6 mois, l\'horloge biologique est encore fragile. La régularité des horaires de lever, repas et coucher (± 30 min chaque jour) la stabilise rapidement et réduit les nuits difficiles.',
    category: 'development',
    hours: [6, 7, 19, 20, 21],
  },
  {
    id: 'fact-bain-detente',
    title: 'Bain et régulation thermique',
    message: 'Un bain tiède (37°C) abaisse la température corporelle par refroidissement de surface après la sortie — ce refroidissement est un signal biologique d\'endormissement. Idéal 60-90 min avant le coucher.',
    category: 'development',
    hours: [17, 18, 19],
  },
  {
    id: 'fact-portage',
    title: 'Portage et développement',
    message: 'Le portage (écharpe, porte-bébé) favorise l\'attachement, régule la température et le rythme cardiaque de bébé, et réduit les pleurs de 43% selon plusieurs études. Idéal pour les périodes difficiles.',
    category: 'development',
    hours: [9, 14, 17],
  },
  {
    id: 'fact-rire',
    title: 'Le rire, indicateur clé',
    message: 'Le rire franc et fréquent est l\'un des meilleurs indicateurs de bien-être à 6 mois. Un bébé reposé, bien nourri et suffisamment stimulé rit naturellement. L\'absence de rire sur plusieurs jours mérite attention.',
    category: 'development',
    hours: [9, 11, 14, 16],
  },
  {
    id: 'fact-musique',
    title: 'Musique et développement',
    message: 'La musique douce et répétitive (berceuses, comptines) aide bébé à anticiper les structures et les séquences. Elle est particulièrement efficace pour calmer et préparer au sommeil dans un contexte de routine.',
    category: 'development',
    hours: [18, 19, 20, 21],
  },
  {
    id: 'fact-inconnu-visages',
    title: 'Méfiance envers les inconnus',
    message: 'Vers 6-8 mois, les bébés deviennent méfiants envers les visages inconnus — c\'est la "peur des étrangers". C\'est une étape normale du développement cognitif, pas de la timidité. Laissez le temps à bébé d\'apprivoiser.',
    category: 'development',
    hours: [10, 14, 16],
  },

  // ══════════════════════════════════════════════════════════════════
  // JUMEAUX
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'fact-jumeaux-individualite',
    title: 'Chaque jumeau est unique',
    message: 'Même des jumeaux identiques développent des préférences, des rythmes et des tempéraments distincts. Comparez toujours chaque bébé à son propre historique, jamais à son jumeau.',
    category: 'twins',
    hours: [7, 10, 13, 16, 19],
  },
  {
    id: 'fact-jumeaux-sync',
    title: 'Synchronisation — quand la viser ?',
    message: 'Synchroniser les repas quand c\'est possible est pragmatique. Mais forcer un rythme strictement identique peut stresser le bébé en avance ou en retard. Les 30 min d\'écart sont gérables et souvent naturels.',
    category: 'twins',
    hours: [8, 11, 14, 17, 20],
  },
  {
    id: 'fact-jumeaux-dormir-ensemble',
    title: 'Dormir ensemble ou séparément ?',
    message: 'Dormir dans le même lit (co-bedding) jusqu\'à 6 mois peut aider à la régulation thermique et réduire les pleurs. Passé 6 mois, lit séparé est conseillé. La même chambre reste possible et souvent bénéfique.',
    category: 'twins',
    hours: [20, 21, 22, 7],
  },
  {
    id: 'fact-jumeaux-reveil-nuit',
    title: 'Quand un jumeau réveille l\'autre',
    message: 'Si un jumeau réveille l\'autre la nuit, intervenez vite sur le premier. Le bébé réveillé apprend souvent à dormir malgré le bruit du jumeau — l\'habitude se crée. Séparation des chambres rarement nécessaire avant 9 mois.',
    category: 'twins',
    hours: [0, 1, 2, 3, 4, 22, 23],
  },
  {
    id: 'fact-jumeaux-siestes-decalees',
    title: 'Siestes légèrement décalées',
    message: 'Décaler les siestes de 15-20 min entre jumeaux permet un moment seul avec chacun. C\'est aussi plus gérable si l\'un a besoin d\'aide pour s\'endormir et l\'autre est déjà dans son lit.',
    category: 'twins',
    hours: [9, 11, 13, 15],
  },
  {
    id: 'fact-jumeaux-coucher-decale',
    title: 'Coucher légèrement décalé',
    message: 'Coucher les jumeaux avec 10-15 min d\'écart permet d\'accorder à chacun un moment de rituel individuel (berceuse, contact). C\'est épuisant à court terme mais bénéfique pour leur sentiment de sécurité.',
    category: 'twins',
    hours: [19, 20, 21],
  },
  {
    id: 'fact-jumeaux-attention-individuelle',
    title: 'Attention individuelle malgré deux bébés',
    message: 'Même 5 min seul avec chaque bébé par jour (pendant la sieste de l\'autre) renforce l\'attachement individuel. Les jumeaux ont besoin d\'être vus comme des individus, pas toujours comme une paire.',
    category: 'twins',
    hours: [10, 14, 16],
  },
  {
    id: 'fact-jumeaux-rythmes-differents',
    title: 'Rythmes naturellement différents',
    message: 'Il est fréquent qu\'un jumeau consolide ses nuits avant l\'autre. Ce n\'est pas de la chance ou de la malchance — chaque bébé mûrit à son rythme. Ne comparez pas et adaptez la réponse à chacun.',
    category: 'twins',
    hours: [6, 7, 9, 21],
  },
  {
    id: 'fact-jumeaux-babillage',
    title: 'Communication entre jumeaux',
    message: 'Vers 6-8 mois, les jumeaux commencent à "se répondre" par des vocalisations et des regards. Cette communication précoce est précieuse — laissez des moments d\'interaction sans adulte qui intervient.',
    category: 'twins',
    hours: [10, 13, 15],
  },
  {
    id: 'fact-jumeaux-maladie',
    title: 'Quand un jumeau est malade',
    message: 'Quand un jumeau est malade, l\'autre contracte généralement le même virus dans les 24-72h. Préparez-vous à un rebond : une semaine difficile en alternance plutôt qu\'une semaine difficile ensemble.',
    category: 'twins',
    hours: [8, 12, 16],
  },
  {
    id: 'fact-jumeaux-preferences-parent',
    title: 'Préférence de parent',
    message: 'Il est courant qu\'à 6 mois un jumeau montre une préférence pour un parent. C\'est temporaire et tourne souvent. Évitez de vous en formaliser — c\'est de l\'attachement sélectif, pas du rejet.',
    category: 'twins',
    hours: [7, 12, 19],
  },
  {
    id: 'fact-jumeaux-epuisement-parent',
    title: 'Épuisement parental — normalité',
    message: 'Élever des jumeaux la première année est objectivement plus éprouvant qu\'un enfant unique. Le sentiment d\'être dépassé est normal, pas un échec. Demander de l\'aide est une force, pas une faiblesse.',
    category: 'twins',
    hours: [3, 4, 5, 22, 23],
  },
  {
    id: 'fact-jumeaux-sol',
    title: 'Jouer au sol ensemble',
    message: 'Dès 6 mois, posez les deux jumeaux sur un tapis d\'éveil face à face. Ils s\'observent, se touchent, se sourient — cette stimulation mutuelle accélère le développement social et moteur.',
    category: 'twins',
    hours: [9, 11, 14, 16],
  },
  {
    id: 'fact-jumeaux-nuit-progressive',
    title: 'Consolider les nuits — progressivement',
    message: 'Pour les jumeaux, consolider les nuits demande souvent plus de temps car le réveil de l\'un provoque le réveil de l\'autre, créant plus d\'interventions nocturnes. La régularité du rituel paye sur 2-3 semaines.',
    category: 'twins',
    hours: [20, 21, 22, 0, 1],
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
 * Pick 2 facts for the current hour.
 * Every day the full pool is Fisher-Yates shuffled with a day-based seed,
 * so every fact rotates fairly and no fact is stranded for multiple days.
 * Each hour picks a unique pair from the shuffled sequence.
 */
export function getHourlyFacts(hour: number): BabyFact[] {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );

  // Fisher-Yates shuffle seeded by day — different ordering every day
  const pool = [...BABY_FACTS_6M];
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
