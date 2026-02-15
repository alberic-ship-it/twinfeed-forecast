import { create } from 'zustand';
import type {
  Screen,
  FeedRecord,
  SleepRecord,
  BabyName,
  BabyProfile,
  Prediction,
  TwinsSyncStatus,
  Alert,
  DetectedPattern,
  FeedSleepAnalysis,
} from '../types';
import { PROFILES } from '../data/knowledge';
import { predictNextFeed } from '../engine/predictor';
import { computeSyncStatus } from '../engine/twins';
import { generateAlerts } from '../engine/alerts';
import { detectPatterns } from '../engine/patterns';
import { analyzeFeedSleepLinks } from '../engine/feedSleepLinks';

interface Store {
  screen: Screen;
  feeds: FeedRecord[];
  sleeps: SleepRecord[];
  profiles: Record<BabyName, BabyProfile>;
  predictions: Record<BabyName, Prediction | null>;
  syncStatus: TwinsSyncStatus | null;
  alerts: Alert[];
  patterns: DetectedPattern[];
  feedSleepInsights: Record<BabyName, FeedSleepAnalysis | null>;
  dataLoaded: boolean;
  lastUpdated: Date | null;

  setScreen: (screen: Screen) => void;
  loadData: (feeds: FeedRecord[], sleeps: SleepRecord[]) => void;
  addFeeds: (feeds: FeedRecord[], sleeps: SleepRecord[]) => void;
  logFeed: (baby: BabyName, type: 'bottle' | 'breast', ml?: number) => void;
  logSleep: (baby: BabyName, durationMin: number) => void;
  refreshPredictions: () => void;
  refreshInsights: () => void;
  dismissAlert: (id: string) => void;
  reset: () => void;
}

export const useStore = create<Store>((set, get) => ({
  screen: 'dashboard',
  feeds: [],
  sleeps: [],
  profiles: PROFILES,
  predictions: { colette: null, isaure: null },
  syncStatus: null,
  alerts: [],
  patterns: [],
  feedSleepInsights: { colette: null, isaure: null },
  dataLoaded: false,
  lastUpdated: null,

  setScreen: (screen) => set({ screen }),

  loadData: (feeds, sleeps) => {
    set({ feeds, sleeps, dataLoaded: true });
    get().refreshPredictions();
    get().refreshInsights();
    set({ screen: 'dashboard' });
  },

  addFeeds: (newFeeds, newSleeps) => {
    const { feeds, sleeps } = get();
    const allFeeds = [...feeds, ...newFeeds].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    const allSleeps = [...sleeps, ...newSleeps].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );
    set({ feeds: allFeeds, sleeps: allSleeps, dataLoaded: true });
    get().refreshPredictions();
    get().refreshInsights();
  },

  logFeed: (baby, type, ml) => {
    const feed: FeedRecord = {
      id: crypto.randomUUID(),
      baby,
      timestamp: new Date(),
      type,
      volumeMl: ml ?? 0,
    };
    const { feeds } = get();
    const allFeeds = [...feeds, feed].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );
    set({ feeds: allFeeds, dataLoaded: true });
    get().refreshPredictions();
  },

  logSleep: (baby, durationMin) => {
    const now = new Date();
    const sleep: SleepRecord = {
      id: crypto.randomUUID(),
      baby,
      startTime: new Date(now.getTime() - durationMin * 60000),
      endTime: now,
      durationMin,
    };
    const { sleeps } = get();
    const allSleeps = [...sleeps, sleep].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );
    set({ sleeps: allSleeps, dataLoaded: true });
    get().refreshPredictions();
    get().refreshInsights();
  },

  refreshPredictions: () => {
    const { feeds, sleeps } = get();
    const now = new Date();

    const colettePred = predictNextFeed('colette', feeds, sleeps, now);
    const isaurePred = predictNextFeed('isaure', feeds, sleeps, now);
    const syncStatus = computeSyncStatus(colettePred, isaurePred, feeds);
    const alerts = generateAlerts(feeds, syncStatus);
    const colettePatterns = detectPatterns('colette', feeds, sleeps, now);
    const isaurePatterns = detectPatterns('isaure', feeds, sleeps, now);

    set({
      predictions: { colette: colettePred, isaure: isaurePred },
      syncStatus,
      alerts,
      patterns: [...colettePatterns, ...isaurePatterns],
      lastUpdated: now,
    });

    // Persist to localStorage
    try {
      const { feeds: f, sleeps: s } = get();
      localStorage.setItem(
        'twinfeed_data',
        JSON.stringify({
          feeds: f.map((feed) => ({
            ...feed,
            timestamp: feed.timestamp.toISOString(),
          })),
          sleeps: s.map((sleep) => ({
            ...sleep,
            startTime: sleep.startTime.toISOString(),
            endTime: sleep.endTime?.toISOString(),
          })),
        })
      );
    } catch {
      // localStorage full or unavailable
    }
  },

  refreshInsights: () => {
    const { feeds, sleeps } = get();
    const now = new Date();
    set({
      feedSleepInsights: {
        colette: analyzeFeedSleepLinks('colette', feeds, sleeps, now),
        isaure: analyzeFeedSleepLinks('isaure', feeds, sleeps, now),
      },
    });
  },

  dismissAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, dismissed: true } : a
      ),
    })),

  reset: () => {
    localStorage.removeItem('twinfeed_data');
    set({
      screen: 'dashboard',
      feeds: [],
      sleeps: [],
      predictions: { colette: null, isaure: null },
      syncStatus: null,
      alerts: [],
      patterns: [],
      feedSleepInsights: { colette: null, isaure: null },
      dataLoaded: false,
      lastUpdated: null,
    });
  },
}));

// Restore from localStorage on init
export function restoreFromStorage() {
  try {
    const raw = localStorage.getItem('twinfeed_data');
    if (!raw) return false;
    const data = JSON.parse(raw);

    const feeds: FeedRecord[] = data.feeds.map((f: Record<string, unknown>) => ({
      ...f,
      timestamp: new Date(f.timestamp as string),
    }));
    const sleeps: SleepRecord[] = data.sleeps.map((s: Record<string, unknown>) => ({
      ...s,
      startTime: new Date(s.startTime as string),
      endTime: s.endTime ? new Date(s.endTime as string) : undefined,
    }));

    if (feeds.length > 0) {
      useStore.getState().loadData(feeds, sleeps);
      return true;
    }
  } catch {
    // Invalid data
  }
  return false;
}
