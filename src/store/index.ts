import { create } from 'zustand';
import type {
  Screen,
  FeedRecord,
  SleepRecord,
  BabyName,
  BabyProfile,
  Prediction,
  Alert,
  DetectedPattern,
  FeedSleepAnalysis,
} from '../types';
import { PROFILES } from '../data/knowledge';
import { parseCsv } from '../data/parser';
import { predictNextFeed } from '../engine/predictor';
import { generateAlerts } from '../engine/alerts';
import { detectPatterns } from '../engine/patterns';
import { analyzeFeedSleepLinks } from '../engine/feedSleepLinks';
import { analyzeSleep } from '../engine/sleep';
import type { SleepAnalysis } from '../engine/sleep';
import { fetchSharedEntries, pushEntries, clearSharedEntries, deleteServerEntries } from './sync';

interface Store {
  screen: Screen;
  feeds: FeedRecord[];
  sleeps: SleepRecord[];
  profiles: Record<BabyName, BabyProfile>;
  predictions: Record<BabyName, Prediction | null>;
  alerts: Alert[];
  patterns: DetectedPattern[];
  feedSleepInsights: Record<BabyName, FeedSleepAnalysis | null>;
  sleepAnalyses: Record<BabyName, SleepAnalysis>;
  dataLoaded: boolean;
  lastUpdated: Date | null;

  setScreen: (screen: Screen) => void;
  loadData: (feeds: FeedRecord[], sleeps: SleepRecord[]) => void;
  addFeeds: (feeds: FeedRecord[], sleeps: SleepRecord[]) => void;
  logFeed: (baby: BabyName, type: 'bottle' | 'breast', ml?: number) => void;
  logSleep: (baby: BabyName, durationMin: number, endTime?: Date) => void;
  deleteSleep: (id: string) => void;
  refreshPredictions: () => void;
  dismissAlert: (id: string) => void;
  reset: () => void;
}

// Track seed data IDs so we only push non-seed entries to the server
let seedFeedIds = new Set<string>();
let seedSleepIds = new Set<string>();

// Dirty-check: skip refresh if data hasn't changed and last refresh was recent
let _lastRefreshKey = '';
let _lastRefreshTime = 0;
const REFRESH_DEBOUNCE_MS = 10_000; // 10s minimum between identical refreshes

// Track dismissed alert IDs across refreshes — persisted in sessionStorage
const DISMISSED_KEY = 'twinfeed-dismissed-alerts';
function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveDismissed(ids: Set<string>) {
  sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}
const dismissedAlertIds = loadDismissed();

/** Internal: refresh feed-sleep insights. Not exposed on the public Store interface. */
function _refreshInsights(get: () => Store, set: (partial: Partial<Store>) => void) {
  const { feeds, sleeps } = get();
  const now = new Date();
  set({
    feedSleepInsights: {
      colette: analyzeFeedSleepLinks('colette', feeds, sleeps, now),
      isaure: analyzeFeedSleepLinks('isaure', feeds, sleeps, now),
    },
  });
}

export const useStore = create<Store>((set, get) => ({
  screen: 'dashboard',
  feeds: [],
  sleeps: [],
  profiles: PROFILES,
  predictions: { colette: null, isaure: null },
  alerts: [],
  patterns: [],
  feedSleepInsights: { colette: null, isaure: null },
  sleepAnalyses: {
    colette: analyzeSleep('colette', [], [], new Date()),
    isaure: analyzeSleep('isaure', [], [], new Date()),
  },
  dataLoaded: false,
  lastUpdated: null,

  setScreen: (screen) => set({ screen }),

  loadData: (feeds, sleeps) => {
    set({ feeds, sleeps, dataLoaded: true });
    get().refreshPredictions();
    _refreshInsights(get, set);
    set({ screen: 'dashboard' });
  },

  addFeeds: (newFeeds, newSleeps) => {
    const { feeds, sleeps } = get();
    const allFeeds = mergeFeeds(feeds, newFeeds);
    const allSleeps = mergeSleeps(sleeps, newSleeps);
    set({ feeds: allFeeds, sleeps: allSleeps, dataLoaded: true });
    get().refreshPredictions();
    _refreshInsights(get, set);

    // Push only non-seed entries to server
    const nonSeedFeeds = allFeeds.filter((f) => !seedFeedIds.has(f.id));
    const nonSeedSleeps = allSleeps.filter((s) => !seedSleepIds.has(s.id));
    pushEntries(nonSeedFeeds, nonSeedSleeps).catch(() => {});
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

    // Push to server
    pushEntries([feed], []).catch(() => {});
  },

  logSleep: (baby, durationMin, endTime?) => {
    const end = endTime ?? new Date();
    const sleep: SleepRecord = {
      id: crypto.randomUUID(),
      baby,
      startTime: new Date(end.getTime() - durationMin * 60000),
      endTime: end,
      durationMin,
    };
    const { sleeps } = get();
    const allSleeps = [...sleeps, sleep].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );
    set({ sleeps: allSleeps, dataLoaded: true });
    get().refreshPredictions();
    _refreshInsights(get, set);

    // Push to server
    pushEntries([], [sleep]).catch(() => {});
  },

  deleteSleep: (id) => {
    const { sleeps } = get();
    const filtered = sleeps.filter((s) => s.id !== id);
    if (filtered.length === sleeps.length) return; // not found
    set({ sleeps: filtered });
    // Force refresh even if length changed
    _lastRefreshKey = '';
    get().refreshPredictions();
    _refreshInsights(get, set);

    // Delete from server too
    deleteServerEntries({ deleteSleepIds: [id] }).catch(() => {});
  },

  refreshPredictions: () => {
    const { feeds, sleeps } = get();
    const now = new Date();

    // Skip if data hasn't changed and last refresh was recent
    const refreshKey = `${feeds.length}|${sleeps.length}`;
    if (refreshKey === _lastRefreshKey && now.getTime() - _lastRefreshTime < REFRESH_DEBOUNCE_MS) {
      return;
    }
    _lastRefreshKey = refreshKey;
    _lastRefreshTime = now.getTime();

    const colettePred = predictNextFeed('colette', feeds, sleeps, now);
    const isaurePred = predictNextFeed('isaure', feeds, sleeps, now);
    const freshAlerts = generateAlerts(feeds).map((a) =>
      dismissedAlertIds.has(a.id) ? { ...a, dismissed: true } : a
    );
    const colettePatterns = detectPatterns('colette', feeds, sleeps, now);
    const isaurePatterns = detectPatterns('isaure', feeds, sleeps, now);
    const coletteSleep = analyzeSleep('colette', sleeps, feeds, now);
    const isaureSleep = analyzeSleep('isaure', sleeps, feeds, now);

    set({
      predictions: { colette: colettePred, isaure: isaurePred },
      alerts: freshAlerts,
      patterns: [...colettePatterns, ...isaurePatterns],
      sleepAnalyses: { colette: coletteSleep, isaure: isaureSleep },
      lastUpdated: now,
    });
    _refreshInsights(get, set);
  },

  dismissAlert: (id) => {
    dismissedAlertIds.add(id);
    saveDismissed(dismissedAlertIds);
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, dismissed: true } : a
      ),
    }));
  },

  reset: () => {
    set({
      screen: 'dashboard',
      feeds: [],
      sleeps: [],
      predictions: { colette: null, isaure: null },
      alerts: [],
      patterns: [],
      feedSleepInsights: { colette: null, isaure: null },
      sleepAnalyses: {
        colette: analyzeSleep('colette', [], [], new Date()),
        isaure: analyzeSleep('isaure', [], [], new Date()),
      },
      dataLoaded: false,
      lastUpdated: null,
    });
    clearSharedEntries().catch(() => {});
    loadSeedData();
  },
}));

// ── Helpers ──

/**
 * Content key for a feed: deduplicates entries that represent the same
 * real-world event even when they have different IDs (e.g. deterministic
 * seed ID vs UUID migrated from localStorage / server).
 */
function feedContentKey(f: FeedRecord): string {
  return `${f.baby}|${f.timestamp.getTime()}|${f.type}|${f.volumeMl}`;
}

function mergeFeeds(existing: FeedRecord[], incoming: FeedRecord[]): FeedRecord[] {
  // First pass: merge by ID (existing behaviour)
  const byId = new Map<string, FeedRecord>();
  for (const f of existing) byId.set(f.id, f);
  for (const f of incoming) byId.set(f.id, f);

  // Second pass: deduplicate by content — when two entries share the same
  // baby+timestamp+type+volume but have different IDs, keep the deterministic
  // one (starts with "f|") so seed filtering keeps working correctly.
  const byContent = new Map<string, FeedRecord>();
  for (const f of byId.values()) {
    const key = feedContentKey(f);
    const prev = byContent.get(key);
    if (!prev) {
      byContent.set(key, f);
    } else {
      // Prefer the deterministic (seed) ID so seedFeedIds filtering works
      const prevIsDeterministic = prev.id.startsWith('f|');
      const currIsDeterministic = f.id.startsWith('f|');
      if (currIsDeterministic && !prevIsDeterministic) {
        byContent.set(key, f);
      }
      // Otherwise keep prev (first one wins)
    }
  }

  return [...byContent.values()].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
}

function sleepContentKey(s: SleepRecord): string {
  // Normalize to minute precision to avoid millisecond drift creating duplicates
  const minuteTs = Math.floor(s.startTime.getTime() / 60_000) * 60_000;
  return `${s.baby}|${minuteTs}|${s.durationMin}`;
}

function mergeSleeps(existing: SleepRecord[], incoming: SleepRecord[]): SleepRecord[] {
  const byId = new Map<string, SleepRecord>();
  for (const s of existing) byId.set(s.id, s);
  for (const s of incoming) byId.set(s.id, s);

  const byContent = new Map<string, SleepRecord>();
  for (const s of byId.values()) {
    const key = sleepContentKey(s);
    const prev = byContent.get(key);
    if (!prev) {
      byContent.set(key, s);
    } else {
      const prevIsDeterministic = prev.id.startsWith('s|');
      const currIsDeterministic = s.id.startsWith('s|');
      if (currIsDeterministic && !prevIsDeterministic) {
        byContent.set(key, s);
      }
    }
  }

  return [...byContent.values()].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime()
  );
}

// ── Load seed CSVs from public/data/ as baseline ──

export async function loadSeedData() {
  try {
    const [coletteRes, isaureRes] = await Promise.all([
      fetch('/data/colette.csv'),
      fetch('/data/isaure.csv'),
    ]);
    const [coletteCsv, isaureCsv] = await Promise.all([
      coletteRes.text(),
      isaureRes.text(),
    ]);

    const coletteData = parseCsv(coletteCsv, 'colette');
    const isaureData = parseCsv(isaureCsv, 'isaure');

    const seedFeeds = [...coletteData.feeds, ...isaureData.feeds].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
    const seedSleeps = [...coletteData.sleeps, ...isaureData.sleeps].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    // Remember seed IDs so we don't push them to the server
    seedFeedIds = new Set(seedFeeds.map((f) => f.id));
    seedSleepIds = new Set(seedSleeps.map((s) => s.id));

    return { feeds: seedFeeds, sleeps: seedSleeps };
  } catch {
    return { feeds: [], sleeps: [] };
  }
}

// ── Migrate localStorage data to server (one-time) ──

async function migrateLocalStorage(): Promise<{ feeds: FeedRecord[]; sleeps: SleepRecord[] }> {
  try {
    const raw = localStorage.getItem('twinfeed_data');
    if (!raw) return { feeds: [], sleeps: [] };

    const data = JSON.parse(raw);
    const feeds: FeedRecord[] = (data.feeds ?? []).map((f: Record<string, unknown>) => ({
      ...f,
      timestamp: new Date(f.timestamp as string),
    }));
    const sleeps: SleepRecord[] = (data.sleeps ?? []).map((s: Record<string, unknown>) => ({
      ...s,
      startTime: new Date(s.startTime as string),
      endTime: s.endTime ? new Date(s.endTime as string) : undefined,
    }));

    // Push non-seed entries to server so they're shared
    const nonSeedFeeds = feeds.filter((f) => !seedFeedIds.has(f.id));
    const nonSeedSleeps = sleeps.filter((s) => !seedSleepIds.has(s.id));
    if (nonSeedFeeds.length > 0 || nonSeedSleeps.length > 0) {
      await pushEntries(nonSeedFeeds, nonSeedSleeps).catch(() => {});
    }

    // Clear localStorage after migration
    localStorage.removeItem('twinfeed_data');

    return { feeds: nonSeedFeeds, sleeps: nonSeedSleeps };
  } catch {
    return { feeds: [], sleeps: [] };
  }
}

// ── Init: load seeds + fetch shared entries + migrate localStorage ──

export async function initData() {
  const seeds = await loadSeedData();

  const [shared, migrated] = await Promise.all([
    fetchSharedEntries().catch(() => ({ feeds: [] as FeedRecord[], sleeps: [] as SleepRecord[] })),
    migrateLocalStorage(),
  ]);

  const allFeeds = mergeFeeds(mergeFeeds(seeds.feeds, shared.feeds), migrated.feeds);
  const allSleeps = mergeSleeps(mergeSleeps(seeds.sleeps, shared.sleeps), migrated.sleeps);

  useStore.getState().loadData(allFeeds, allSleeps);
}

// ── Sync: fetch server entries and merge with current state ──

export async function syncFromServer() {
  try {
    const shared = await fetchSharedEntries();
    const { feeds, sleeps } = useStore.getState();
    const newFeeds = mergeFeeds(feeds, shared.feeds);
    const newSleeps = mergeSleeps(sleeps, shared.sleeps);

    // Only update if there are actual changes
    if (newFeeds.length !== feeds.length || newSleeps.length !== sleeps.length) {
      useStore.setState({ feeds: newFeeds, sleeps: newSleeps });
      useStore.getState().refreshPredictions();
    }
  } catch {
    // Server unreachable — ignore
  }
}
