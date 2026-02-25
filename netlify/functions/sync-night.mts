import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

const STORE_NAME = "twinfeed";
const KEY = "night-sessions";

interface NightData {
  version?: string;
  sessions?: Record<string, unknown>;
  recaps?: Record<string, unknown>[];
}

function mergeNightData(server: NightData, client: NightData): NightData {
  // Sessions: client takes priority (more up-to-date), fall back to server
  const mergedSessions: Record<string, unknown> = {};
  for (const baby of ['colette', 'isaure']) {
    mergedSessions[baby] = client.sessions?.[baby] ?? server.sessions?.[baby] ?? null;
  }

  // Recaps: union by session.id — client data takes priority on conflict
  const recapMap = new Map<string, Record<string, unknown>>();
  for (const r of (server.recaps ?? [])) {
    const id = (r.session as Record<string, string> | undefined)?.id;
    if (id) recapMap.set(id, r);
  }
  for (const r of (client.recaps ?? [])) {
    const id = (r.session as Record<string, string> | undefined)?.id;
    if (id) recapMap.set(id, r); // client overwrites server on same id
  }

  return {
    version: crypto.randomUUID(),
    sessions: mergedSessions,
    recaps: [...recapMap.values()],
  };
}

async function readCurrent(store: ReturnType<typeof getStore>): Promise<NightData> {
  const raw = await store.get(KEY);
  return raw ? (JSON.parse(raw) as NightData) : {};
}

export default async (req: Request, _context: Context) => {
  const store = getStore(STORE_NAME);

  if (req.method === "GET") {
    const raw = await store.get(KEY);
    if (!raw) {
      return Response.json({ sessions: { colette: null, isaure: null }, recaps: [] });
    }
    return Response.json(JSON.parse(raw));
  }

  if (req.method === "POST") {
    const clientData = await req.json() as NightData;

    // Retry loop: same pattern as sync.mts — detect concurrent writes via version field
    // and re-merge if needed (max 3 attempts + random backoff).
    let merged: NightData = {};
    const MAX_ATTEMPTS = 3;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const current = await readCurrent(store);
      merged = mergeNightData(current, clientData);
      await store.set(KEY, JSON.stringify(merged));

      // Confirm our version is still there
      const confirm = await readCurrent(store);
      if (confirm.version === merged.version) {
        break; // Our write is confirmed
      }

      // Conflict detected — another device wrote concurrently. Retry with backoff.
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));
      }
    }

    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};
