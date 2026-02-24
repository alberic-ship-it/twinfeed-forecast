import type { FeedRecord, SleepRecord, BabyName, NightSession, NightRecap } from '../types';

const API_URL = '/.netlify/functions/sync';
const FETCH_TIMEOUT_MS = 8_000;

/** fetch avec timeout — évite d'attendre indéfiniment si Netlify est lent */
async function fetchWithTimeout(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${opts?.method ?? 'GET'} ${url}`);
  return res;
}

interface RawData {
  feeds: Record<string, unknown>[];
  sleeps: Record<string, unknown>[];
}

function deserializeFeeds(raw: Record<string, unknown>[]): FeedRecord[] {
  return raw.map((f) => ({
    ...f,
    timestamp: new Date(f.timestamp as string),
  })) as FeedRecord[];
}

function deserializeSleeps(raw: Record<string, unknown>[]): SleepRecord[] {
  return raw.map((s) => ({
    ...s,
    startTime: new Date(s.startTime as string),
    endTime: s.endTime ? new Date(s.endTime as string) : undefined,
  })) as SleepRecord[];
}

function serializeFeeds(feeds: FeedRecord[]): Record<string, unknown>[] {
  return feeds.map((f) => ({
    ...f,
    timestamp: f.timestamp.toISOString(),
  }));
}

function serializeSleeps(sleeps: SleepRecord[]): Record<string, unknown>[] {
  return sleeps.map((s) => ({
    ...s,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime?.toISOString(),
  }));
}

/** Fetch all shared entries from the server. */
export async function fetchSharedEntries(): Promise<{
  feeds: FeedRecord[];
  sleeps: SleepRecord[];
}> {
  const res = await fetchWithTimeout(API_URL);
  const data: RawData = await res.json();
  return {
    feeds: deserializeFeeds(data.feeds),
    sleeps: deserializeSleeps(data.sleeps),
  };
}

/** Push new entries to the server (merges by ID). */
export async function pushEntries(
  feeds: FeedRecord[],
  sleeps: SleepRecord[],
): Promise<void> {
  await fetchWithTimeout(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      feeds: serializeFeeds(feeds),
      sleeps: serializeSleeps(sleeps),
    }),
  });
}

/** Clear all shared entries on the server. */
export async function clearSharedEntries(): Promise<void> {
  await fetchWithTimeout(API_URL, { method: 'DELETE' });
}

/** Delete specific entries by ID on the server. */
export async function deleteServerEntries(opts: { deleteSleepIds?: string[]; deleteFeedIds?: string[] }): Promise<void> {
  await fetchWithTimeout(API_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
}

// ── Night sessions sync ──

const NIGHT_URL = '/.netlify/functions/sync-night';

function serializeNightSessions(sessions: Record<BabyName, NightSession | null>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const baby of ['colette', 'isaure'] as BabyName[]) {
    const s = sessions[baby];
    if (!s) { result[baby] = null; continue; }
    result[baby] = {
      ...s,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime?.toISOString(),
      feeds: s.feeds.map((f) => ({ ...f, timestamp: f.timestamp.toISOString() })),
    };
  }
  return result;
}

function deserializeNightSession(raw: Record<string, unknown> | null): NightSession | null {
  if (!raw) return null;
  return {
    id: raw.id as string,
    baby: raw.baby as BabyName,
    startTime: new Date(raw.startTime as string),
    endTime: raw.endTime ? new Date(raw.endTime as string) : undefined,
    feeds: ((raw.feeds as Record<string, unknown>[]) ?? []).map((f) => ({
      id: f.id as string,
      baby: f.baby as BabyName,
      timestamp: new Date(f.timestamp as string),
      type: f.type as 'bottle' | 'breast',
      volumeMl: f.volumeMl as number,
    })),
  };
}

const RECAP_TTL_MS = 48 * 60 * 60 * 1000; // 48h

function serializeNightRecap(r: NightRecap): Record<string, unknown> {
  return {
    ...r,
    session: {
      ...r.session,
      startTime: r.session.startTime.toISOString(),
      endTime: r.session.endTime?.toISOString(),
      feeds: r.session.feeds.map((f) => ({ ...f, timestamp: f.timestamp.toISOString() })),
    },
  };
}

function deserializeNightRecap(raw: Record<string, unknown>): NightRecap {
  const s = raw.session as Record<string, unknown>;
  return {
    ...raw,
    session: {
      ...s,
      startTime: new Date(s.startTime as string),
      endTime: s.endTime ? new Date(s.endTime as string) : undefined,
      feeds: ((s.feeds as Record<string, unknown>[]) ?? []).map((f) => ({
        id: f.id as string,
        baby: f.baby as BabyName,
        timestamp: new Date(f.timestamp as string),
        type: f.type as 'bottle' | 'breast',
        volumeMl: f.volumeMl as number,
      })),
    },
  } as NightRecap;
}

/** Push night sessions + recaps to server. */
export async function pushNightSessions(
  sessions: Record<BabyName, NightSession | null>,
  recaps: NightRecap[],
): Promise<void> {
  const cutoff = Date.now() - RECAP_TTL_MS;
  const payload = {
    ...serializeNightSessions(sessions),
    recaps: recaps
      .filter((r) => r.session.startTime.getTime() > cutoff)
      .map(serializeNightRecap),
  };
  await fetchWithTimeout(NIGHT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/** Fetch night sessions + recaps from server. */
export async function fetchNightSessions(): Promise<{
  sessions: Record<BabyName, NightSession | null>;
  recaps: NightRecap[];
}> {
  const res = await fetchWithTimeout(NIGHT_URL);
  const data = await res.json() as Record<string, unknown>;
  const rawRecaps = (data.recaps as Record<string, unknown>[] | undefined) ?? [];
  return {
    sessions: {
      colette: deserializeNightSession(data.colette as Record<string, unknown> | null ?? null),
      isaure: deserializeNightSession(data.isaure as Record<string, unknown> | null ?? null),
    },
    recaps: rawRecaps.map(deserializeNightRecap),
  };
}
