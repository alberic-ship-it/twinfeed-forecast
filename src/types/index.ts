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
  | 'LONG_INTERVAL'
  | 'TWINS_DESYNC'
  | 'GROWTH_SPURT'
  | 'APPETITE_DROP';

export type SyncState = 'synchronized' | 'slightly_offset' | 'desynchronized';

export type PatternId =
  | 'CLUSTER'
  | 'COMPENSATION'
  | 'EVENING'
  | 'NIGHT_LIGHT'
  | 'POST_NAP'
  | 'GROWTH'
  | 'DESYNC';

export type Screen = 'import' | 'dashboard' | 'insights';

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
// Twins Sync
// ═══════════════════════════════════════════════════════════════════════════

export interface TwinsSyncStatus {
  state: SyncState;
  gapMinutes: number;
  syncRate: number; // 0-1
  commonWindow?: {
    start: Date;
    end: Date;
  };
  suggestion?: string;
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
// Knowledge Base (YAML structures)
// ═══════════════════════════════════════════════════════════════════════════

export interface KnowledgeBase {
  ageProfiles: Record<string, AgeProfile>;
  patterns: Record<string, PatternDef>;
  messageTemplates: Record<string, string>;
}

export interface AgeProfile {
  label: string;
  feeding: {
    typicalVolumeMl: [number, number];
    typicalIntervalH: [number, number];
    feedsPerDay: [number, number];
  };
}

export interface PatternDef {
  id: PatternId;
  label: string;
  description: string;
  timingModifier?: number;
  volumeModifier?: number;
  messageTemplate: string;
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
  syncStatus: TwinsSyncStatus | null;
  alerts: Alert[];
  patterns: DetectedPattern[];
  dataLoaded: boolean;
  lastUpdated: Date | null;
}
