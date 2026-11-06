import { isAuthorized, noStorage, unauthorized } from "../../../shared/api-auth.js";

/** Protected — fetch one saved map's full text. */
export async function onRequestGet({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ error: "Not found" }, { status: 404 });

  const name = decodeURIComponent(params.name);
  const raw = await env.MAPS_KV.get(`map:${name}`);
  if (!raw) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const record = JSON.parse(raw);
    return Response.json({ name, ...record });
  } catch {
    return Response.json({ error: "Corrupt map data" }, { status: 500 });
  }
}

/** Protected — delete a saved map. Does not affect the currently published config. */
export async function onRequestDelete({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();

  const name = decodeURIComponent(params.name);
  await env.MAPS_KV.delete(`map:${name}`);
  return Response.json({ deleted: name });
}
