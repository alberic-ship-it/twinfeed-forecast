import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

const STORE_NAME = "twinfeed";
const KEY = "shared-entries";

interface StoredData {
  version?: string; // UUID updated on every write — used to detect concurrent writes
  feeds: Record<string, unknown>[];
  sleeps: Record<string, unknown>[];
}

function isManualId(id: string) {
  return !id.startsWith("f|") && !id.startsWith("s|");
}

function mergeInto(
  current: StoredData,
  newFeeds: Record<string, unknown>[],
  newSleeps: Record<string, unknown>[],
): StoredData {
  const feedMap = new Map<string, Record<string, unknown>>();
  for (const f of current.feeds) feedMap.set(f.id as string, f);
  for (const f of newFeeds) feedMap.set(f.id as string, f);

  const sleepMap = new Map<string, Record<string, unknown>>();
  for (const s of current.sleeps) sleepMap.set(s.id as string, s);
  for (const s of newSleeps) sleepMap.set(s.id as string, s);

  return {
    version: crypto.randomUUID(),
    feeds: [...feedMap.values()],
    sleeps: [...sleepMap.values()],
  };
}

async function readCurrent(store: ReturnType<typeof getStore>): Promise<StoredData> {
  const raw = await store.get(KEY);
  return raw ? (JSON.parse(raw) as StoredData) : { feeds: [], sleeps: [] };
}

export default async (req: Request, _context: Context) => {
  const store = getStore(STORE_NAME);

  if (req.method === "GET") {
    const raw = await store.get(KEY);
    if (!raw) {
      return Response.json({ feeds: [], sleeps: [] });
    }
    return Response.json(JSON.parse(raw));
  }

  if (req.method === "POST") {
    const body = await req.json() as { feeds?: Record<string, unknown>[]; sleeps?: Record<string, unknown>[] };
    const newFeeds = (body.feeds ?? []).filter((f) => isManualId(f.id as string));
    const newSleeps = (body.sleeps ?? []).filter((s) => isManualId(s.id as string));

    // Retry loop: detect concurrent writes via version field and re-merge if needed.
    // Without this, two simultaneous POSTs would both read state S, one would overwrite
    // the other's write (last-writer-wins on Netlify Blobs which has no transactions).
    let merged: StoredData = { feeds: [], sleeps: [] };
    const MAX_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const current = await readCurrent(store);
      merged = mergeInto(current, newFeeds, newSleeps);
      await store.set(KEY, JSON.stringify(merged));

      // Confirm our version is still there (another concurrent write would have changed it)
      const confirm = await readCurrent(store);
      if (confirm.version === merged.version) {
        break; // Our write is confirmed
      }

      // Conflict detected — another device wrote concurrently.
      // Wait a random backoff before retrying to avoid repeat collisions.
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));
      }
      // On next iteration we re-read the freshest state and re-merge our entries into it.
    }

    return Response.json(merged);
  }

  if (req.method === "DELETE") {
    // Only remove CSV-originated entries (deterministic IDs starting with f| or s|)
    // Keep manual entries (UUID format) safe
    const raw = await store.get(KEY);
    if (raw) {
      const current: StoredData = JSON.parse(raw);
      const cleaned: StoredData = {
        version: crypto.randomUUID(),
        feeds: current.feeds.filter((f) => isManualId(f.id as string)),
        sleeps: current.sleeps.filter((s) => isManualId(s.id as string)),
      };
      await store.set(KEY, JSON.stringify(cleaned));
      return Response.json({ ok: true, kept: cleaned.feeds.length + cleaned.sleeps.length });
    }
    return Response.json({ ok: true, kept: 0 });
  }

  if (req.method === "PATCH") {
    // Remove specific entries by ID
    const body = await req.json() as { deleteSleepIds?: string[]; deleteFeedIds?: string[] };
    const deleteSleepIds = new Set(body.deleteSleepIds ?? []);
    const deleteFeedIds = new Set(body.deleteFeedIds ?? []);

    const raw = await store.get(KEY);
    if (raw) {
      const current: StoredData = JSON.parse(raw);
      const updated: StoredData = {
        version: crypto.randomUUID(),
        feeds: current.feeds.filter((f) => !deleteFeedIds.has(f.id as string)),
        sleeps: current.sleeps.filter((s) => !deleteSleepIds.has(s.id as string)),
      };
      await store.set(KEY, JSON.stringify(updated));
      return Response.json({ ok: true });
    }
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};
