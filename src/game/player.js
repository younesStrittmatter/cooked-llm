import { colorsFromHex, DEFAULT_COLORS } from "./placeholders.js";
import { isAdjacentToBoard } from "./cutting-board.js";
import { actionsForCell, describeIntent } from "./agent-actions.js";
import { DEFAULT_SETTINGS } from "../../shared/game-defaults.js";

export function createPlayer({
  id,
  index,
  controller = "human",
  colors = DEFAULT_COLORS,
  walkSpeed = DEFAULT_SETTINGS.walkSpeed,
  cutSpeed = DEFAULT_SETTINGS.cutSpeed,
  spawn,
}) {
  return {
    id,
    index,
    controller,
    colorsHex: { ...DEFAULT_COLORS, ...colors },
    colors: colorsFromHex({ ...DEFAULT_COLORS, ...colors }),
    x: spawn?.x ?? 1,
    y: spawn?.y ?? 1,
    spawn: { x: spawn?.x ?? 1, y: spawn?.y ?? 1 },
    item: null,
    path: [],
    pendingInteract: null,
    walkSpeed,
    cutSpeed,
    walkProgress: 0,
    lastStepAt: 0,
    activeCut: null,
    /** Last tile this player clicked, so the other player can observe intent. */
    lastClick: null,
    /** Last item this player set down on a counter ({x, y, item, tick}) — used to discourage re-picking it up. */
    lastPlaced: null,
    /** Last item this player took off a counter ({x, y, item, tick}) — used to discourage re-placing it unused. */
    lastTaken: null,
    /** Tile of the teammate this player just walked into, if any — one-shot. */
    collidedWith: null,
    /** Interact target that stopped making sense mid-walk, if any — one-shot. */
    staleTarget: null,
  };
}

export function resetPlayer(player, spawn) {
  player.x = spawn?.x ?? player.spawn.x;
  player.y = spawn?.y ?? player.spawn.y;
  player.spawn = { x: player.x, y: player.y };
  player.item = null;
  player.path = [];
  player.pendingInteract = null;
  player.walkProgress = 0;
  player.activeCut = null;
  player.lastClick = null;
  player.lastPlaced = null;
  player.lastTaken = null;
  player.collidedWith = null;
  player.staleTarget = null;
}

/**
 * True while the cook still has something to carry out: walking, a queued
 * interaction, or an active chop. An agent is only asked to decide once this
 * goes false.
 */
export function isBusy(player) {
  return player.path.length > 0 || Boolean(player.pendingInteract) || Boolean(player.activeCut);
}

/** Where the player is heading, or null when standing still. */
export function destination(player) {
  if (player.pendingInteract) return { ...player.pendingInteract, kind: "interact" };
  const last = player.path[player.path.length - 1];
  return last ? { x: last.x, y: last.y, kind: "walk" } : null;
}

/**
 * Short human-readable activity, used for the LLM prompt and the UI. `teammate`
 * is this player's own teammate — only used to match the same "who's already
 * holding the knife" check `actionsForCell` applies when picking actions —
 * so a walk-to-interact can be described as e.g. "to chop their tomato"
 * instead of just naming the tile.
 */
export function describeActivity(player, map, getCell, teammate = null) {
  if (player.activeCut) {
    const cell = getCell(map, player.activeCut.x, player.activeCut.y);
    if (cell?.item && isAdjacentToBoard(player, cell)) {
      return `chopping ${cell.item} at the cutting board (${cell.x},${cell.y})`;
    }
  }

  const target = destination(player);
  if (!target) return "standing still";
  if (target.kind !== "interact") return `walking to (${target.x},${target.y})`;

  const cell = getCell(map, target.x, target.y);
  const kind = cell ? actionsForCell(cell, player.item, teammate)[0]?.kind : null;
  const intent = cell && kind ? describeIntent(kind, cell, player.item) : `use the tile at (${target.x},${target.y})`;
  return `walking to (${target.x},${target.y}) to ${intent}`;
}
