// ═══════════════════════════════════════════════════════════════════════════
// TWINFEED FORECAST — Types TypeScript
// ═══════════════════════════════════════════════════════════════════════════

export type BabyName = 'colette' | 'isaure';

export type ActivityType = 'Biberon' | 'Tétée' | 'Sommeil' | 'Couche' | 'Poids' | 'Taille';

export type TimeSlotId = 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

export type AlertSeverity = 'info' | 'warning';

export type AlertType =
  | 'SMALL_FEED'
  | 'VERY_SMALL_FEED'
  | 'GROWTH_SPURT'
  | 'APPETITE_DROP';

export type PatternId =
  | 'CLUSTER'
  | 'COMPENSATION'
  | 'EVENING'
  | 'NIGHT_LIGHT'
  | 'POST_NAP'
  | 'GROWTH'
  | 'BREAST_RATIO_SHIFT'
  | 'LONG_INTERVAL'
  | 'MORNING_FIRST'
  | 'AFTERNOON_DIP'
  | 'SHORT_NAP_SERIES'
  | 'OVERTIRED'
  | 'VOLUME_DECLINE'
  | 'SUSTAINED_APPETITE'
  | 'SHORT_NIGHT';

export type Screen = 'import' | 'dashboard' | 'entries';

// ═══════════════════════════════════════════════════════════════════════════
// Data Records
// ═══════════════════════════════════════════════════════════════════════════

export interface RawCsvRow {
  'Date et heure': string;
  'Heure de fin': string;
  'Durée (mn)': string;
  Activité: string;
  Quantité: string;
  'Info supplémentaire': string;
  Texte: string;
  Notes: string;
  Contact: string;
}

export interface FeedRecord {
  id: string;
  baby: BabyName;
  timestamp: Date;
  type: 'bottle' | 'breast';
  volumeMl: number;
  durationMin?: number;
  notes?: string;
}

export interface SleepRecord {
  id: string;
  baby: BabyName;
  startTime: Date;
  endTime?: Date;
  durationMin: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Night Module
// ═══════════════════════════════════════════════════════════════════════════

export interface NightFeedEntry {
  id: string;
  baby: BabyName;
  timestamp: Date;
  type: 'bottle' | 'breast';
  volumeMl: number;
}

export interface NightSession {
  id: string;
  baby: BabyName;
  startTime: Date;
  endTime?: Date;
  feeds: NightFeedEntry[];
}

export interface NightRecap {
  baby: BabyName;
  session: NightSession;
  totalDurationMin: number;
  feedCount: number;
  totalVolumeMl: number;
  longestStretchMin: number;
  avgInterFeedMin: number;
  dismissed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Time Slots & Profiles
// ═══════════════════════════════════════════════════════════════════════════

export interface TimeSlot {
  id: TimeSlotId;
  hours: number[];
  meanMl: number;
  stdMl: number;
  typicalIntervalAfterH: number;
  peak?: boolean;
}

export interface BabyStats {
  meanVolumeMl: number;
  stdVolumeMl: number;
  typicalRangeMl: [number, number];
  meanIntervalH: number;
  medianIntervalH: number;
  typicalRangeH: [number, number];
  p10H: number;
  p90H: number;
}

export interface BabyProfile {
  name: string;
  key: BabyName;
  birthDate: string;
  stats: BabyStats;
  slots: TimeSlot[];
  predictionAdjustments: {
    volume: Record<string, number>;
    interval: Record<string, number>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Prediction Engine
// ═══════════════════════════════════════════════════════════════════════════

export interface TimingPrediction {
  predictedTime: Date;
  confidenceMinutes: number; // ±X min
  p10Time: Date;
  p90Time: Date;
}

export interface VolumePrediction {
  predictedMl: number;
  confidenceMl: number; // ±X ml
  p10Ml: number;
  p90Ml: number;
}

export interface Explanation {
  ruleId: string;
  text: string;
  impact: string; // e.g. "-25% intervalle"
}

export interface Prediction {
  baby: BabyName;
  timing: TimingPrediction;
  volume: VolumePrediction;
  explanations: Explanation[];
  confidence: 'high' | 'medium' | 'low';
  slot: TimeSlotId;
  generatedAt: Date;
  /** True when prediction is based on profile defaults (no fresh data today) */
  profileBased?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Patterns
// ═══════════════════════════════════════════════════════════════════════════

export interface DetectedPattern {
  id: PatternId;
  label: string;
  description: string;
  baby: BabyName;
  detectedAt: Date;
  timingModifier?: number; // multiplicative: 0.75 = -25%
  volumeModifier?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Alerts
// ═══════════════════════════════════════════════════════════════════════════

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  baby?: BabyName;
  message: string;
  actionSuggested?: string;
  timestamp: Date;
  dismissed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Feed-Sleep Insights
// ═══════════════════════════════════════════════════════════════════════════

export type InsightConfidence = 'forte' | 'moderee' | 'faible';

export interface FeedSleepInsight {
  id: string;
  baby: BabyName;
  label: string;
  observation: string;
  dataPoints: number;
  confidence: InsightConfidence;
  stat?: string;
}

export interface FeedSleepAnalysis {
  baby: BabyName;
  insights: FeedSleepInsight[];
  computedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// Application State
// ═══════════════════════════════════════════════════════════════════════════

export interface AppState {
  screen: Screen;
  feeds: FeedRecord[];
  sleeps: SleepRecord[];
  profiles: Record<BabyName, BabyProfile>;
  predictions: Record<BabyName, Prediction | null>;
  alerts: Alert[];
  patterns: DetectedPattern[];
  dataLoaded: boolean;
  lastUpdated: Date | null;
}
