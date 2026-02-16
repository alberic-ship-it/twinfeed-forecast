import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

const STORE_NAME = "twinfeed";
const KEY = "shared-entries";

interface StoredData {
  feeds: Record<string, unknown>[];
  sleeps: Record<string, unknown>[];
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
    // Only accept manual entries (UUIDs), reject CSV-originated entries (f|.../s|...)
    const newFeeds = (body.feeds ?? []).filter((f) => {
      const id = f.id as string;
      return !id.startsWith("f|") && !id.startsWith("s|");
    });
    const newSleeps = (body.sleeps ?? []).filter((s) => {
      const id = s.id as string;
      return !id.startsWith("f|") && !id.startsWith("s|");
    });

    // Read current data
    let current: StoredData = { feeds: [], sleeps: [] };
    const raw = await store.get(KEY);
    if (raw) {
      current = JSON.parse(raw);
    }

    // Merge by ID to avoid duplicates
    const feedMap = new Map<string, Record<string, unknown>>();
    for (const f of current.feeds) feedMap.set(f.id as string, f);
    for (const f of newFeeds) feedMap.set(f.id as string, f);

    const sleepMap = new Map<string, Record<string, unknown>>();
    for (const s of current.sleeps) sleepMap.set(s.id as string, s);
    for (const s of newSleeps) sleepMap.set(s.id as string, s);

    const merged: StoredData = {
      feeds: [...feedMap.values()],
      sleeps: [...sleepMap.values()],
    };

    await store.set(KEY, JSON.stringify(merged));

    return Response.json(merged);
  }

  if (req.method === "DELETE") {
    // Only remove CSV-originated entries (deterministic IDs starting with f| or s|)
    // Keep manual entries (UUID format) safe
    const raw = await store.get(KEY);
    if (raw) {
      const current: StoredData = JSON.parse(raw);
      const cleaned: StoredData = {
        feeds: current.feeds.filter((f) => {
          const id = f.id as string;
          return !id.startsWith("f|") && !id.startsWith("s|");
        }),
        sleeps: current.sleeps.filter((s) => {
          const id = s.id as string;
          return !id.startsWith("f|") && !id.startsWith("s|");
        }),
      };
      await store.set(KEY, JSON.stringify(cleaned));
      return Response.json({ ok: true, kept: cleaned.feeds.length + cleaned.sleeps.length });
    }
    return Response.json({ ok: true, kept: 0 });
  }

  return new Response("Method not allowed", { status: 405 });
};
