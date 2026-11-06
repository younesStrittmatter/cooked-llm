import { isAuthorized, unauthorized } from "../../../shared/api-auth.js";

const PREFIX = "session:";

function resolveKey(params) {
  const raw = decodeURIComponent(params.key ?? "");
  return raw.startsWith(PREFIX) ? raw : `${PREFIX}${raw}`;
}

/** Protected — full session log including every recorded action. */
export async function onRequestGet({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ error: "Storage not configured" }, { status: 500 });

  const raw = await env.MAPS_KV.get(resolveKey(params));
  if (!raw) return Response.json({ error: "Session not found" }, { status: 404 });

  return new Response(raw, { headers: { "content-type": "application/json" } });
}

export async function onRequestDelete({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ error: "Storage not configured" }, { status: 500 });

  await env.MAPS_KV.delete(resolveKey(params));
  return Response.json({ ok: true });
}
