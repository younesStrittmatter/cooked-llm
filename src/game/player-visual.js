import { TICK_MS } from "./constants.js";

const FRAMES = 8;

/** Fractional progress toward the next tile (0–1), extrapolated between ticks for smooth motion */
export function getWalkProgress(player, now = performance.now()) {
  if (!player.path.length) return 0;

  let t = player.walkProgress;
  if (player.lastStepAt != null) {
    const alpha = Math.min(1, (now - player.lastStepAt) / TICK_MS);
    t = Math.min(1, t + alpha * player.walkSpeed);
  }
  return t;
}

export function getVisualPosition(player, now = performance.now()) {
  if (!player.path.length) {
    return { x: player.x, y: player.y };
  }

  const next = player.path[0];
  const t = getWalkProgress(player, now);

  return {
    x: player.x + (next.x - player.x) * t,
    y: player.y + (next.y - player.y) * t,
  };
}

export function getAnimFrame(player, now = performance.now()) {
  if (!player.path.length) return 0;
  return Math.floor(getWalkProgress(player, now) * FRAMES) % FRAMES;
}
