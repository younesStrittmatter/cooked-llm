import { isAuthorized, noStorage, unauthorized } from "../../../shared/api-auth.js";

/** Protected — fetch one saved rules prompt. */
export async function onRequestGet({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ error: "Not found" }, { status: 404 });

  const name = decodeURIComponent(params.name);
  const raw = await env.MAPS_KV.get(`prompt:${name}`);
  if (!raw) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const record = JSON.parse(raw);
    return Response.json({ name, ...record });
  } catch {
    return Response.json({ error: "Corrupt prompt data" }, { status: 500 });
  }
}

/** Protected — delete a saved rules prompt. */
export async function onRequestDelete({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();

  const name = decodeURIComponent(params.name);
  await env.MAPS_KV.delete(`prompt:${name}`);
  return Response.json({ deleted: name });
}
