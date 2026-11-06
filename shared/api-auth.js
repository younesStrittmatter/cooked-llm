/** Server-only helpers for the Pages Functions under functions/api. */

export function isAuthorized(request, env) {
  const key = request.headers.get("x-admin-key") || "";
  return Boolean(env.ADMIN_PASSWORD) && key === env.ADMIN_PASSWORD;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function noStorage() {
  return Response.json(
    { error: "Storage not configured (MAPS_KV binding missing)" },
    { status: 500 },
  );
}

export async function readJson(request) {
  try {
    return { body: await request.json() };
  } catch {
    return { error: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}
