import { buildMap } from "../../src/game/map.js";
import { normalizeConfig } from "../../shared/config.js";
import { isAuthorized, noStorage, readJson, unauthorized } from "../../shared/api-auth.js";

const ACTIVE_KEY = "active";

/** Public — the play page reads this with no auth required. */
export async function onRequestGet({ env }) {
  if (!env.MAPS_KV) return Response.json(normalizeConfig());

  const raw = await env.MAPS_KV.get(ACTIVE_KEY);
  if (!raw) return Response.json(normalizeConfig());

  try {
    return Response.json(normalizeConfig(JSON.parse(raw)));
  } catch {
    return Response.json(normalizeConfig());
  }
}

/** Protected — publishes the map, player setup and phase timings for players. */
export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();

  const { body, error } = await readJson(request);
  if (error) return error;

  const config = normalizeConfig(body);

  try {
    buildMap(config.mapText);
  } catch (err) {
    return Response.json({ error: `Invalid map: ${err.message}` }, { status: 400 });
  }

  if (!config.players.some((p) => p.controller !== "none")) {
    return Response.json({ error: "At least one cook must be enabled" }, { status: 400 });
  }

  if (config.phases.trainSeconds === 0 && config.phases.gameSeconds === 0 && !config.phases.freePlay) {
    return Response.json(
      { error: "Enable at least one phase: practice, scored round or free play" },
      { status: 400 },
    );
  }

  config.publishedAt = new Date().toISOString();
  await env.MAPS_KV.put(ACTIVE_KEY, JSON.stringify(config));
  return Response.json(config);
}
