import { buildMap } from "../../../src/game/map.js";
import { isAuthorized, noStorage, readJson, unauthorized } from "../../../shared/api-auth.js";

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

/** Protected — list saved maps (name + savedAt only, not full text). */
export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ maps: [] });

  const list = await env.MAPS_KV.list({ prefix: "map:" });
  const maps = [];

  for (const key of list.keys) {
    const raw = await env.MAPS_KV.get(key.name);
    if (!raw) continue;
    try {
      const { savedAt } = JSON.parse(raw);
      maps.push({ name: key.name.slice("map:".length), savedAt });
    } catch {
      // skip corrupt entry
    }
  }

  maps.sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ maps });
}

/** Protected — create or overwrite a named map. */
export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();

  const { body, error } = await readJson(request);
  if (error) return error;

  const name = normalizeName(body.name);
  if (!name) {
    return Response.json({ error: "Map name is required" }, { status: 400 });
  }

  const text = String(body.text ?? "");
  try {
    buildMap(text);
  } catch (err) {
    return Response.json({ error: `Invalid map: ${err.message}` }, { status: 400 });
  }

  const record = { text: text.trimEnd(), savedAt: new Date().toISOString() };
  await env.MAPS_KV.put(`map:${name}`, JSON.stringify(record));
  return Response.json({ name, ...record });
}
