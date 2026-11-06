import { isAuthorized, noStorage, readJson, unauthorized } from "../../../shared/api-auth.js";

const PREFIX = "session:";
const MAX_BYTES = 10 * 1024 * 1024;

function sessionKey(startedAt, id) {
  // Sortable: KV lists keys lexicographically, so this yields chronological order.
  return `${PREFIX}${startedAt}_${id}`;
}

/** Public — the play page uploads a finished session. */
export async function onRequestPost({ request, env }) {
  if (!env.MAPS_KV) return noStorage();

  const { body, error } = await readJson(request);
  if (error) return error;

  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_BYTES) {
    return Response.json({ error: "Session log too large" }, { status: 413 });
  }
  if (!Array.isArray(body.events)) {
    return Response.json({ error: "events array is required" }, { status: 400 });
  }

  const id = String(body.sessionId ?? crypto.randomUUID()).slice(0, 64);
  const startedAt = typeof body.startedAt === "string" ? body.startedAt : new Date().toISOString();
  const record = { ...body, sessionId: id, startedAt, receivedAt: new Date().toISOString() };

  await env.MAPS_KV.put(sessionKey(startedAt, id), JSON.stringify(record));
  return Response.json({ ok: true, id });
}

/** Protected — newest-first index of stored sessions, without the event stream. */
export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ sessions: [] });

  const list = await env.MAPS_KV.list({ prefix: PREFIX });
  const sessions = [];

  for (const key of list.keys) {
    const raw = await env.MAPS_KV.get(key.name);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      sessions.push({
        key: key.name,
        sessionId: data.sessionId,
        startedAt: data.startedAt,
        endedAt: data.endedAt ?? null,
        mapName: data.mapName ?? null,
        players: data.players ?? [],
        phaseResults: data.phaseResults ?? [],
        scoredTotal: data.scoredTotal ?? 0,
        eventCount: data.eventCount ?? (data.events?.length ?? 0),
        llmUsage: data.llmUsage ?? {},
      });
    } catch {
      // skip corrupt entry
    }
  }

  sessions.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return Response.json({ sessions });
}
