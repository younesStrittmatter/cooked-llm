import { isAuthorized, noStorage, unauthorized } from "../../../shared/api-auth.js";

function cookKey(cook) {
  return cook === "p1" || cook === "p2" ? cook : null;
}

function kvKey(cook, name) {
  return `personality:${cook}:${name}`;
}

/** Protected — fetch one saved personality for a cook. */
export async function onRequestGet({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const cook = cookKey(url.searchParams.get("cook"));
  if (!cook) {
    return Response.json({ error: "Query param cook=p1 or cook=p2 is required" }, { status: 400 });
  }

  const name = decodeURIComponent(params.name);
  const raw = await env.MAPS_KV.get(kvKey(cook, name));
  if (!raw) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const record = JSON.parse(raw);
    return Response.json({ cook, name, ...record });
  } catch {
    return Response.json({ error: "Corrupt personality data" }, { status: 500 });
  }
}

/** Protected — delete a saved personality for a cook. */
export async function onRequestDelete({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();

  const url = new URL(request.url);
  const cook = cookKey(url.searchParams.get("cook"));
  if (!cook) {
    return Response.json({ error: "Query param cook=p1 or cook=p2 is required" }, { status: 400 });
  }

  const name = decodeURIComponent(params.name);
  await env.MAPS_KV.delete(kvKey(cook, name));
  return Response.json({ cook, deleted: name });
}
