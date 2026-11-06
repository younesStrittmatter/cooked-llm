import { isAuthorized, noStorage, readJson, unauthorized } from "../../../shared/api-auth.js";

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

/** Protected — list saved agent rules prompts (name + savedAt only). */
export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ prompts: [] });

  const list = await env.MAPS_KV.list({ prefix: "prompt:" });
  const prompts = [];

  for (const key of list.keys) {
    const raw = await env.MAPS_KV.get(key.name);
    if (!raw) continue;
    try {
      const { savedAt } = JSON.parse(raw);
      prompts.push({ name: key.name.slice("prompt:".length), savedAt });
    } catch {
      // skip corrupt entry
    }
  }

  prompts.sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ prompts });
}

/** Protected — create or overwrite a named rules prompt. */
export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();

  const { body, error } = await readJson(request);
  if (error) return error;

  const name = normalizeName(body.name);
  if (!name) {
    return Response.json({ error: "Prompt name is required" }, { status: 400 });
  }

  const text = String(body.text ?? "").trim();
  if (text.length < 80) {
    return Response.json({ error: "Prompt text is too short" }, { status: 400 });
  }

  const record = { text, savedAt: new Date().toISOString() };
  await env.MAPS_KV.put(`prompt:${name}`, JSON.stringify(record));
  return Response.json({ name, ...record });
}
