import { isCutDone } from "./cutting.js";
import { isFinishedPlate } from "./delivery.js";
import { getCell } from "./map.js";

function isChopped(item) {
  return Boolean(item?.endsWith("_cut"));
}

export function isRaw(item) {
  return item === "tomato" || item === "pumpkin";
}

export function scanKitchen(map) {
  const boards = [];
  const counters = [];
  const dispensers = { tomato: [], plate: [], pumpkin: [] };

  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.type === "cuttingBoard") boards.push(cell);
      else if (cell.type === "counter" && cell.item) counters.push(cell);
      else if (cell.type === "dispenser" && cell.dispenseItem) {
        dispensers[cell.dispenseItem]?.push(cell);
      }
    }
  }

  return { boards, counters, dispensers };
}

export function plateAnywhere(player, teammate, counters) {
  if (player.item === "plate" || teammate?.item === "plate") return true;
  return counters.some((c) => c.item === "plate");
}

export function choppedAnywhere(player, teammate, boards, counters) {
  if (isChopped(player.item) || isChopped(teammate?.item)) return true;
  if (counters.some((c) => isChopped(c.item))) return true;
  return boards.some((b) => b.item && isCutDone(b.cutProgress ?? 0));
}

export function saladAnywhere(player, teammate, counters) {
  if (isFinishedPlate(player.item) || isFinishedPlate(teammate?.item)) return true;
  return counters.some((c) => isFinishedPlate(c.item));
}

export function rawVegAnywhere(player, teammate, boards, counters) {
  if (isRaw(player.item) || isRaw(teammate?.item)) return true;
  if (counters.some((c) => isRaw(c.item))) return true;
  return boards.some((b) => b.item && !isCutDone(b.cutProgress ?? 0));
}

export function combineReady(counters) {
  for (const c of counters) {
    for (const d of counters) {
      if (c === d) continue;
      if ((c.item === "plate" && isChopped(d.item)) || (isChopped(c.item) && d.item === "plate")) {
        return true;
      }
    }
  }
  return false;
}

/** Omit counter pickups that only tie up hands with no combine/deliver next. */
export function isPrematurePickup(item, game, player, teammate) {
  if (!item || player.item) return false;
  const { boards, counters } = scanKitchen(game.map);
  if (item === "plate" && !choppedAnywhere(player, teammate, boards, counters)) return true;
  if (isChopped(item) && !plateAnywhere(player, teammate, counters)) return true;
  return false;
}

function teammateFetching(teammate, map, dispenseItem) {
  if (!teammate?.pendingInteract || teammate.pendingInteract.actionKind !== "take") return false;
  const cell = getCell(map, teammate.pendingInteract.x, teammate.pendingInteract.y);
  return cell?.type === "dispenser" && cell.dispenseItem === dispenseItem;
}

/** Teammate is already en route to the same dispenser item — don't duplicate the fetch. */
export function isRedundantFetch(dispenseItem, game, player, teammate) {
  if (player.item || !teammate || !teammateFetching(teammate, game.map, dispenseItem)) return false;
  const { boards, counters } = scanKitchen(game.map);
  if (isRaw(dispenseItem)) {
    return !rawVegAnywhere(player, teammate, boards, counters);
  }
  if (dispenseItem === "plate") {
    return !plateAnywhere(player, teammate, counters) && !choppedAnywhere(player, teammate, boards, counters);
  }
  return false;
}

/**
 * Teammate is idle — flags fetch/chop steps that would solo the recipe while they
 * stand still. Advisory: the caller renders this as a label hint ("take it only if
 * you are at least as close"), never by omitting the action. Hard-filtering these
 * deadlocked two LLM cooks — decisions only happen while idle, so "teammate idle"
 * means both are idle, and symmetric filtering left nobody allowed to chop.
 */
export function shouldDeferChopWorkWhenTeammateIdle(teammate, option, cell, game, player) {
  if (!teammate || teammate.path?.length || teammate.pendingInteract || teammate.activeCut) {
    return false;
  }

  const { boards, counters } = scanKitchen(game.map);

  switch (option.kind) {
    case "take":
      // First fetch is OK when nothing raw exists yet; after that, leave staged work alone.
      return isRaw(cell.dispenseItem) && rawVegAnywhere(player, teammate, boards, counters);
    case "pickup":
      return isRaw(cell.item);
    case "chop":
    case "resume_chop":
    case "take_chopped":
      return true;
    default:
      return false;
  }
}

/** @deprecated Use shouldDeferChopWorkWhenTeammateIdle */
export const shouldDeferChopWorkToHuman = shouldDeferChopWorkWhenTeammateIdle;

export function targetsTeammateDestination(cell, teammate) {
  if (!teammate?.pendingInteract) return false;
  return cell.x === teammate.pendingInteract.x && cell.y === teammate.pendingInteract.y;
}

/** @deprecated Use targetsTeammateDestination */
export const targetsHumanDestination = targetsTeammateDestination;