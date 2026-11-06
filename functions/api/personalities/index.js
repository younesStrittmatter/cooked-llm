import { isAuthorized, noStorage, readJson, unauthorized } from "../../../shared/api-auth.js";

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

function cookKey(cook) {
  return cook === "p1" || cook === "p2" ? cook : null;
}

function kvKey(cook, name) {
  return `personality:${cook}:${name}`;
}

/** Protected — list saved personalities for one cook (name + savedAt only). */
export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ personalities: [] });

  const url = new URL(request.url);
  const cook = cookKey(url.searchParams.get("cook"));
  if (!cook) {
    return Response.json({ error: "Query param cook=p1 or cook=p2 is required" }, { status: 400 });
  }

  const list = await env.MAPS_KV.list({ prefix: `personality:${cook}:` });
  const personalities = [];

  for (const key of list.keys) {
    const raw = await env.MAPS_KV.get(key.name);
    if (!raw) continue;
    try {
      const { savedAt } = JSON.parse(raw);
      personalities.push({ name: key.name.slice(`personality:${cook}:`.length), savedAt });
    } catch {
      // skip corrupt entry
    }
  }

  personalities.sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ personalities });
}

/** Protected — create or overwrite a named personality for one cook. */
export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();

  const { body, error } = await readJson(request);
  if (error) return error;

  const cook = cookKey(body.cook);
  if (!cook) {
    return Response.json({ error: "cook must be p1 or p2" }, { status: 400 });
  }

  const name = normalizeName(body.name);
  if (!name) {
    return Response.json({ error: "Personality name is required" }, { status: 400 });
  }

  const extraInstructions = String(body.extraInstructions ?? "");
  const instructionScheduleText = String(body.instructionScheduleText ?? "");

  const record = {
    extraInstructions,
    instructionScheduleText,
    savedAt: new Date().toISOString(),
  };
  await env.MAPS_KV.put(kvKey(cook, name), JSON.stringify(record));
  return Response.json({ cook, name, ...record });
}
