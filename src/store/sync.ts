import type { FeedRecord, SleepRecord } from '../types';

const API_URL = '/.netlify/functions/sync';

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
  const res = await fetch(API_URL);
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
  await fetch(API_URL, {
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
  await fetch(API_URL, { method: 'DELETE' });
}
