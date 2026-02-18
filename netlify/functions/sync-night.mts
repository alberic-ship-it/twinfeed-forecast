import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

const STORE_NAME = "twinfeed";
const KEY = "night-sessions";

export default async (req: Request, _context: Context) => {
  const store = getStore(STORE_NAME);

  if (req.method === "GET") {
    const raw = await store.get(KEY);
    if (!raw) {
      return Response.json({ colette: null, isaure: null });
    }
    return Response.json(JSON.parse(raw));
  }

  if (req.method === "POST") {
    const body = await req.json();
    await store.set(KEY, JSON.stringify(body));
    return Response.json({ ok: true });
  }

  return new Response("Method not allowed", { status: 405 });
};
