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
  NightSession,
  NightRecap,
  NightFeedEntry,
} from '../types';
import { PROFILES } from '../data/knowledge';
import { parseCsv } from '../data/parser';
import { predictNextFeed } from '../engine/predictor';
import { generateAlerts } from '../engine/alerts';
import { detectPatterns } from '../engine/patterns';
import { analyzeFeedSleepLinks } from '../engine/feedSleepLinks';
import { analyzeSleep } from '../engine/sleep';
import type { SleepAnalysis } from '../engine/sleep';
import { fetchSharedEntries, pushEntries, clearSharedEntries, deleteServerEntries, pushNightSessions, fetchNightSessions } from './sync';

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
  nightSessions: Record<BabyName, NightSession | null>;
  nightRecaps: NightRecap[];
  dataLoaded: boolean;
  lastUpdated: Date | null;

  setScreen: (screen: Screen) => void;
  loadData: (feeds: FeedRecord[], sleeps: SleepRecord[]) => void;
  addFeeds: (feeds: FeedRecord[], sleeps: SleepRecord[]) => void;
  logFeed: (baby: BabyName, type: 'bottle' | 'breast', ml?: number, timestamp?: Date) => void;
  logSleep: (baby: BabyName, durationMin: number, endTime?: Date) => void;
  deleteSleep: (id: string) => void;
  deleteFeed: (id: string) => void;
  startNight: (baby: BabyName) => void;
  endNight: (baby: BabyName) => void;
  updateNightStartTime: (baby: BabyName, newStartTime: Date) => void;
  dismissNightRecap: (baby: BabyName) => void;
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

// Night sessions persistence in localStorage
const NIGHT_SESSIONS_KEY = 'twinfeed-night-sessions';

function saveNightSessions(sessions: Record<BabyName, NightSession | null>) {
  const serializable: Record<string, unknown> = {};
  for (const baby of ['colette', 'isaure'] as BabyName[]) {
    const s = sessions[baby];
    if (!s) { serializable[baby] = null; continue; }
    serializable[baby] = {
      ...s,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime?.toISOString(),
      feeds: s.feeds.map((f) => ({ ...f, timestamp: f.timestamp.toISOString() })),
    };
  }
  localStorage.setItem(NIGHT_SESSIONS_KEY, JSON.stringify(serializable));
}

function loadNightSessions(): Record<BabyName, NightSession | null> {
  try {
    const raw = localStorage.getItem(NIGHT_SESSIONS_KEY);
    if (!raw) return { colette: null, isaure: null };
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown> | null>;
    const result: Record<BabyName, NightSession | null> = { colette: null, isaure: null };
    for (const baby of ['colette', 'isaure'] as BabyName[]) {
      const s = parsed[baby];
      if (!s) continue;
      result[baby] = {
        id: s.id as string,
        baby: s.baby as BabyName,
        startTime: new Date(s.startTime as string),
        endTime: s.endTime ? new Date(s.endTime as string) : undefined,
        feeds: ((s.feeds as Record<string, unknown>[]) ?? []).map((f) => ({
          id: f.id as string,
          baby: f.baby as BabyName,
          timestamp: new Date(f.timestamp as string),
          type: f.type as 'bottle' | 'breast',
          volumeMl: f.volumeMl as number,
        })),
      };
    }
    return result;
  } catch { return { colette: null, isaure: null }; }
}

// ── Entries cache — localStorage fallback pour les push serveur échoués ──
const ENTRIES_CACHE_KEY = 'twinfeed-entries-cache';

const CACHE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 jours

function saveEntriesCache(feeds: FeedRecord[], sleeps: SleepRecord[]) {
  try {
    const cutoff = Date.now() - CACHE_TTL_MS;
    const nonSeedFeeds = feeds.filter((f) => !f.id.startsWith('f|') && f.timestamp.getTime() > cutoff);
    const nonSeedSleeps = sleeps.filter((s) => !s.id.startsWith('s|') && s.startTime.getTime() > cutoff);
    localStorage.setItem(ENTRIES_CACHE_KEY, JSON.stringify({
      feeds: nonSeedFeeds.map((f) => ({ ...f, timestamp: f.timestamp.toISOString() })),
      sleeps: nonSeedSleeps.map((s) => ({
        ...s,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime?.toISOString(),
      })),
    }));
  } catch { /* localStorage indisponible */ }
}

function loadEntriesCache(): { feeds: FeedRecord[]; sleeps: SleepRecord[] } {
  try {
    const raw = localStorage.getItem(ENTRIES_CACHE_KEY);
    if (!raw) return { feeds: [], sleeps: [] };
    const data = JSON.parse(raw) as { feeds: Record<string, unknown>[]; sleeps: Record<string, unknown>[] };
    return {
      feeds: (data.feeds ?? []).map((f) => ({
        ...f,
        timestamp: new Date(f.timestamp as string),
      })) as FeedRecord[],
      sleeps: (data.sleeps ?? []).map((s) => ({
        ...s,
        startTime: new Date(s.startTime as string),
        endTime: s.endTime ? new Date(s.endTime as string) : undefined,
      })) as SleepRecord[],
    };
  } catch { return { feeds: [], sleeps: [] }; }
}

// ── Night recaps persistence — les bilans de nuit survivent au rechargement ──
const NIGHT_RECAPS_KEY = 'twinfeed-night-recaps';
const NIGHT_RECAPS_TTL_MS = 48 * 60 * 60 * 1000; // 48h

function saveNightRecapsToStorage(recaps: NightRecap[]) {
  try {
    const cutoff = Date.now() - NIGHT_RECAPS_TTL_MS;
    const recent = recaps.filter((r) => r.session.startTime.getTime() > cutoff);
    localStorage.setItem(NIGHT_RECAPS_KEY, JSON.stringify(
      recent.map((r) => ({
        ...r,
        session: {
          ...r.session,
          startTime: r.session.startTime.toISOString(),
          endTime: r.session.endTime?.toISOString(),
          feeds: r.session.feeds.map((f) => ({ ...f, timestamp: f.timestamp.toISOString() })),
        },
      }))
    ));
  } catch { /* localStorage indisponible */ }
}

function loadNightRecapsFromStorage(): NightRecap[] {
  try {
    const raw = localStorage.getItem(NIGHT_RECAPS_KEY);
    if (!raw) return [];
    const cutoff = Date.now() - NIGHT_RECAPS_TTL_MS;
    const data = JSON.parse(raw) as Record<string, unknown>[];
    return data
      .map((r) => {
        const s = r.session as Record<string, unknown>;
        return {
          ...r,
          session: {
            ...s,
            startTime: new Date(s.startTime as string),
            endTime: s.endTime ? new Date(s.endTime as string) : undefined,
            feeds: ((s.feeds as Record<string, unknown>[]) ?? []).map((f) => ({
              ...f,
              timestamp: new Date(f.timestamp as string),
            })),
          },
        } as NightRecap;
      })
      .filter((r) => r.session.startTime.getTime() > cutoff);
  } catch { return []; }
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
  nightSessions: loadNightSessions(),
  nightRecaps: loadNightRecapsFromStorage(),
  dataLoaded: false,
  lastUpdated: null,

  setScreen: (screen) => set({ screen }),

  loadData: (feeds, sleeps) => {
    set({ feeds, sleeps, dataLoaded: true });
    saveEntriesCache(feeds, sleeps);
    get().refreshPredictions();
    set({ screen: 'dashboard' });
  },

  addFeeds: (newFeeds, newSleeps) => {
    const { feeds, sleeps } = get();
    const allFeeds = mergeFeeds(feeds, newFeeds);
    const allSleeps = mergeSleeps(sleeps, newSleeps);
    set({ feeds: allFeeds, sleeps: allSleeps, dataLoaded: true });
    get().refreshPredictions();

    // Push only non-seed entries to server
    const nonSeedFeeds = allFeeds.filter((f) => !seedFeedIds.has(f.id));
    const nonSeedSleeps = allSleeps.filter((s) => !seedSleepIds.has(s.id));
    pushEntries(nonSeedFeeds, nonSeedSleeps).catch(() => {});
  },

  logFeed: (baby, type, ml, timestamp) => {
    const ts = timestamp ?? new Date();
    const { feeds, nightSessions } = get();

    // Guard: reject near-duplicate entries (same baby, type, volume within 60s)
    const isDuplicate = feeds.some(
      (f) =>
        f.baby === baby &&
        f.type === type &&
        f.volumeMl === (ml ?? 0) &&
        Math.abs(f.timestamp.getTime() - ts.getTime()) < 60_000
    );
    if (isDuplicate) return;

    const feed: FeedRecord = {
      id: crypto.randomUUID(),
      baby,
      timestamp: ts,
      type,
      volumeMl: ml ?? 0,
    };
    const allFeeds = [...feeds, feed].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // If night is active for this baby, add feed to the night session
    const activeNight = nightSessions[baby];
    if (activeNight && !activeNight.endTime) {
      const nightFeed: NightFeedEntry = {
        id: feed.id,
        baby,
        timestamp: feed.timestamp,
        type: feed.type,
        volumeMl: feed.volumeMl,
      };
      const updatedSession: NightSession = {
        ...activeNight,
        feeds: [...activeNight.feeds, nightFeed],
      };
      const updatedSessions = { ...nightSessions, [baby]: updatedSession };
      set({ feeds: allFeeds, dataLoaded: true, nightSessions: updatedSessions });
      saveNightSessions(updatedSessions);
      pushNightSessions(updatedSessions).catch(() => {});
    } else {
      set({ feeds: allFeeds, dataLoaded: true });
    }

    saveEntriesCache(allFeeds, get().sleeps);
    get().refreshPredictions(); // _refreshInsights est déjà appelé en interne

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
    saveEntriesCache(get().feeds, allSleeps);
    get().refreshPredictions();

    // Push to server
    pushEntries([], [sleep]).catch(() => {});
  },

  deleteSleep: (id) => {
    const { sleeps } = get();
    const filtered = sleeps.filter((s) => s.id !== id);
    if (filtered.length === sleeps.length) return; // not found
    set({ sleeps: filtered });
    saveEntriesCache(get().feeds, filtered);
    // Force refresh even if length changed
    _lastRefreshKey = '';
    get().refreshPredictions();

    // Delete from server too
    deleteServerEntries({ deleteSleepIds: [id] }).catch(() => {});
  },

  deleteFeed: (id) => {
    const { feeds } = get();
    const filtered = feeds.filter((f) => f.id !== id);
    if (filtered.length === feeds.length) return; // not found
    set({ feeds: filtered });
    saveEntriesCache(filtered, get().sleeps);
    _lastRefreshKey = '';
    get().refreshPredictions();

    deleteServerEntries({ deleteFeedIds: [id] }).catch(() => {});
  },

  startNight: (baby) => {
    const { nightSessions } = get();
    if (nightSessions[baby] && !nightSessions[baby]!.endTime) return; // already active
    const session: NightSession = {
      id: crypto.randomUUID(),
      baby,
      startTime: new Date(),
      feeds: [],
    };
    const updated = { ...nightSessions, [baby]: session };
    set({ nightSessions: updated });
    saveNightSessions(updated);
    pushNightSessions(updated).catch(() => {});
  },

  endNight: (baby) => {
    const { nightSessions, nightRecaps, sleeps } = get();
    const session = nightSessions[baby];
    if (!session || session.endTime) return;

    const endTime = new Date();
    const totalDurationMin = Math.round((endTime.getTime() - session.startTime.getTime()) / 60_000);

    // Create SleepRecord for this night
    const nightSleep: SleepRecord = {
      id: crypto.randomUUID(),
      baby,
      startTime: session.startTime,
      endTime,
      durationMin: totalDurationMin,
    };

    // Compute recap stats
    const feeds = session.feeds.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const feedCount = feeds.length;
    const totalVolumeMl = feeds.reduce((sum, f) => sum + f.volumeMl, 0);

    // Compute longest stretch without feed and average inter-feed interval
    const timestamps = [session.startTime, ...feeds.map((f) => f.timestamp), endTime];
    let longestStretchMin = 0;
    const gaps: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      const gap = Math.round((timestamps[i].getTime() - timestamps[i - 1].getTime()) / 60_000);
      gaps.push(gap);
      if (gap > longestStretchMin) longestStretchMin = gap;
    }
    const avgInterFeedMin = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;

    const endedSession: NightSession = { ...session, endTime };
    const recap: NightRecap = {
      baby,
      session: endedSession,
      totalDurationMin,
      feedCount,
      totalVolumeMl,
      longestStretchMin,
      avgInterFeedMin,
      dismissed: false,
    };

    const updatedSessions = { ...nightSessions, [baby]: null };
    const allSleeps = [...sleeps, nightSleep].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );
    const newRecaps = [...nightRecaps.filter((r) => r.baby !== baby || r.dismissed), recap];

    set({
      nightSessions: updatedSessions,
      nightRecaps: newRecaps,
      sleeps: allSleeps,
    });
    saveNightSessions(updatedSessions);
    saveNightRecapsToStorage(newRecaps);
    saveEntriesCache(get().feeds, allSleeps);
    pushNightSessions(updatedSessions).catch(() => {});
    pushEntries([], [nightSleep]).catch(() => {});

    // Force refresh predictions with new sleep data
    _lastRefreshKey = '';
    get().refreshPredictions();
  },

  updateNightStartTime: (baby, newStartTime) => {
    const { nightSessions } = get();
    const session = nightSessions[baby];
    if (!session || session.endTime) return;
    const updatedSession = { ...session, startTime: newStartTime };
    const updatedSessions = { ...nightSessions, [baby]: updatedSession };
    set({ nightSessions: updatedSessions });
    saveNightSessions(updatedSessions);
    pushNightSessions(updatedSessions).catch(() => {});
    _lastRefreshKey = '';
    get().refreshPredictions();
  },

  dismissNightRecap: (baby) => {
    const newRecaps = get().nightRecaps.map((r) =>
      r.baby === baby ? { ...r, dismissed: true } : r
    );
    set({ nightRecaps: newRecaps });
    saveNightRecapsToStorage(newRecaps);
  },

  refreshPredictions: () => {
    const { feeds, sleeps, nightSessions } = get();
    const now = new Date();

    // Skip if data hasn't changed and last refresh was recent.
    // La clé intègre longueur + premier/dernier ID pour détecter les
    // suppressions/ajouts qui ne changent pas la longueur totale.
    const firstFeedId = feeds.length > 0 ? feeds[0].id : '';
    const lastFeedId = feeds.length > 0 ? feeds[feeds.length - 1].id : '';
    const lastSleepId = sleeps.length > 0 ? sleeps[sleeps.length - 1].id : '';
    const refreshKey = `${feeds.length}|${firstFeedId}|${lastFeedId}|${sleeps.length}|${lastSleepId}`;
    if (refreshKey === _lastRefreshKey && now.getTime() - _lastRefreshTime < REFRESH_DEBOUNCE_MS) {
      return;
    }
    _lastRefreshKey = refreshKey;
    _lastRefreshTime = now.getTime();

    // Patterns calculés en premier pour éviter un double appel dans predictNextFeed
    const colettePatterns = detectPatterns('colette', feeds, sleeps, now);
    const isaurePatterns = detectPatterns('isaure', feeds, sleeps, now);
    const colettePred = predictNextFeed('colette', feeds, sleeps, now, colettePatterns);
    const isaurePred = predictNextFeed('isaure', feeds, sleeps, now, isaurePatterns);
    const freshAlerts = generateAlerts(feeds).map((a) =>
      dismissedAlertIds.has(a.id) ? { ...a, dismissed: true } : a
    );
    const coletteNight = nightSessions.colette && !nightSessions.colette.endTime ? nightSessions.colette : undefined;
    const isaureNight = nightSessions.isaure && !nightSessions.isaure.endTime ? nightSessions.isaure : undefined;
    const coletteSleep = analyzeSleep('colette', sleeps, feeds, now, coletteNight);
    const isaureSleep = analyzeSleep('isaure', sleeps, feeds, now, isaureNight);

    set({
      predictions: { colette: colettePred, isaure: isaurePred },
      alerts: freshAlerts,
      patterns: [...colettePatterns, ...isaurePatterns],
      sleepAnalyses: { colette: coletteSleep, isaure: isaureSleep },
      feedSleepInsights: {
        colette: analyzeFeedSleepLinks('colette', feeds, sleeps, now),
        isaure: analyzeFeedSleepLinks('isaure', feeds, sleeps, now),
      },
      lastUpdated: now,
    });
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
    const emptyNights: Record<BabyName, NightSession | null> = { colette: null, isaure: null };
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
      nightSessions: emptyNights,
      nightRecaps: [],
      dataLoaded: false,
      lastUpdated: null,
    });
    saveNightSessions(emptyNights);
    localStorage.removeItem(ENTRIES_CACHE_KEY);
    localStorage.removeItem(NIGHT_RECAPS_KEY);
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

  const [shared, migrated, serverNights] = await Promise.all([
    fetchSharedEntries().catch(() => ({ feeds: [] as FeedRecord[], sleeps: [] as SleepRecord[] })),
    migrateLocalStorage(),
    fetchNightSessions().catch(() => ({ colette: null, isaure: null } as Record<BabyName, NightSession | null>)),
  ]);

  // Merge night sessions: prefer local (more up-to-date) over server
  const localNights = loadNightSessions();
  const mergedNights: Record<BabyName, NightSession | null> = { colette: null, isaure: null };
  for (const baby of ['colette', 'isaure'] as BabyName[]) {
    mergedNights[baby] = localNights[baby] ?? serverNights[baby] ?? null;
  }
  saveNightSessions(mergedNights);
  useStore.setState({ nightSessions: mergedNights });

  // Include localStorage cache as fallback pour les entrées dont le push serveur a échoué
  const cached = loadEntriesCache();
  const allFeeds = mergeFeeds(mergeFeeds(mergeFeeds(seeds.feeds, shared.feeds), migrated.feeds), cached.feeds);
  const allSleeps = mergeSleeps(mergeSleeps(mergeSleeps(seeds.sleeps, shared.sleeps), migrated.sleeps), cached.sleeps);

  useStore.getState().loadData(allFeeds, allSleeps);
}

// ── Sync: fetch server entries and merge with current state ──

export async function syncFromServer() {
  try {
    const [shared, serverNights] = await Promise.all([
      fetchSharedEntries(),
      fetchNightSessions().catch(() => ({ colette: null, isaure: null } as Record<BabyName, NightSession | null>)),
    ]);

    const { feeds, sleeps, nightSessions } = useStore.getState();
    const newFeeds = mergeFeeds(feeds, shared.feeds);
    const newSleeps = mergeSleeps(sleeps, shared.sleeps);

    // Merge night sessions: local prend la priorité sur serveur
    const mergedNights: Record<BabyName, NightSession | null> = { colette: null, isaure: null };
    for (const baby of ['colette', 'isaure'] as BabyName[]) {
      mergedNights[baby] = nightSessions[baby] ?? serverNights[baby] ?? null;
    }
    const nightsChanged = (['colette', 'isaure'] as BabyName[]).some(
      (b) => JSON.stringify(mergedNights[b]) !== JSON.stringify(nightSessions[b])
    );
    const feedsChanged = newFeeds.length !== feeds.length || newSleeps.length !== sleeps.length;

    if (feedsChanged) useStore.setState({ feeds: newFeeds, sleeps: newSleeps });
    if (nightsChanged) { useStore.setState({ nightSessions: mergedNights }); saveNightSessions(mergedNights); }
    if (feedsChanged || nightsChanged) useStore.getState().refreshPredictions();
  } catch {
    // Server unreachable — ignore
  }
}
