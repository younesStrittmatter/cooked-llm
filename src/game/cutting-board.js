import { RAW_VEG, cutStage, isCutDone, knifeFrame, displayItem } from "./cutting.js";
import { TICK_MS } from "./constants.js";

export function isAdjacentToBoard(player, cell) {
  return Math.abs(player.x - cell.x) + Math.abs(player.y - cell.y) === 1;
}

/** True if some other cook already has this exact board as their active cut. */
export function isBeingCutByOther(cell, player, otherPlayers) {
  return otherPlayers.some((p) => p !== player && p.activeCut?.x === cell.x && p.activeCut?.y === cell.y);
}

/**
 * `otherPlayers` should be every cook in the game (this `player` included, or
 * not — either is fine, it's filtered out below). Only one cook can hold the
 * knife on a given board at a time: a second cook interacting with a board
 * that's already being cut does nothing, rather than adding their cutSpeed
 * on top of the first cook's.
 */
export function interactCuttingBoard(player, cell, otherPlayers = []) {
  const progress = cell.cutProgress ?? 0;

  // Pick up finished cut
  if (cell.item && isCutDone(progress) && !player.item) {
    player.item = `${cell.item}_cut`;
    cell.item = null;
    cell.cutProgress = 0;
    player.activeCut = null;
    return;
  }

  // Swap: board done, player holds raw veg. The player's hands are full with
  // the cut they just picked up, so — same as the "place from hands" case
  // below — chopping does not start on its own; someone empty-handed has to
  // come back and interact again to resume it.
  if (cell.item && isCutDone(progress) && RAW_VEG.includes(player.item)) {
    const held = player.item;
    player.item = `${cell.item}_cut`;
    cell.item = held;
    cell.cutProgress = 0;
    player.activeCut = null;
    return;
  }

  // Place from hands — must stand at board to cut
  if (!cell.item && RAW_VEG.includes(player.item)) {
    cell.item = player.item;
    player.item = null;
    cell.cutProgress = 0;
    player.activeCut = { x: cell.x, y: cell.y };
    return;
  }

  // Resume cutting in progress — a no-op if someone else already has the knife here
  if (cell.item && !isCutDone(progress) && !player.item) {
    if (isBeingCutByOther(cell, player, otherPlayers)) return;
    player.activeCut = { x: cell.x, y: cell.y };
  }
}

export function tickCutting(player, map, getCell) {
  if (!player.activeCut) return;

  const cell = getCell(map, player.activeCut.x, player.activeCut.y);
  if (!cell || cell.type !== "cuttingBoard" || !cell.item || !RAW_VEG.includes(cell.item)) {
    player.activeCut = null;
    return;
  }

  if (!isAdjacentToBoard(player, cell)) {
    player.activeCut = null;
    return;
  }

  const progress = cell.cutProgress ?? 0;
  if (isCutDone(progress)) {
    player.activeCut = null;
    return;
  }

  cell.cutProgress = progress + player.cutSpeed * (TICK_MS / 1000);
}

export { cutStage, isCutDone, knifeFrame, displayItem };
