import { TICK_MS } from "./constants.js";
import { RAW_VEG, isCutDone } from "./cutting.js";
import { isFinishedPlate } from "./delivery.js";
import { itemName } from "./items.js";
import { isWalkable } from "./map.js";
import { NEIGHBORS, reachableFrom, findPath, adjacentWalkable } from "./pathfind.js";
import { isBusy } from "./player.js";
import {
  isRedundantFetch,
  shouldDeferChopWorkWhenTeammateIdle,
  targetsTeammateDestination,
} from "./kitchen-scan.js";

/**
 * Lower sorts first. Ordering is by usefulness so the most productive options are
 * at the top of the list the model reads.
 */
const PRIORITY = {
  deliver: 0,
  assemble: 1,
  take_chopped: 2,
  chop: 3,
  resume_chop: 4,
  take: 5,
  place: 6,
  pickup: 7,
  swap_board: 8,
  swap_counter: 9,
  trash: 10,
  move: 11,
};

const MAX_ACTIONS = 20;

function approach(cell, reach) {
  let best = null;
  for (const [dx, dy] of NEIGHBORS) {
    const x = cell.x + dx;
    const y = cell.y + dy;
    const steps = reach.get(`${x},${y}`);
    if (steps == null) continue;
    if (!best || steps < best.steps) best = { x, y, steps };
  }
  return best;
}

function combines(held, onTile) {
  if (held?.endsWith("_cut") && onTile === "plate") return true;
  if (held === "plate" && onTile?.endsWith("_cut")) return true;
  return false;
}

function dispenserActions(cell, held) {
  if (held) return [];
  return [{ kind: "take", label: `Take a ${cell.dispenseItem} from the dispenser` }];
}

function boardActions(cell, held, teammate) {
  const done = isCutDone(cell.cutProgress ?? 0);
  const holdingRaw = RAW_VEG.includes(held);
  const mateHasKnife = teammate?.activeCut?.x === cell.x && teammate?.activeCut?.y === cell.y;

  if (!cell.item) {
    return holdingRaw
      ? [{ kind: "chop", label: `Put your ${held} on this cutting board and start chopping it` }]
      : [];
  }

  if (done) {
    if (!held) {
      return [{ kind: "take_chopped", label: `Pick up the finished chopped ${cell.item} from this board` }];
    }
    if (holdingRaw) {
      return [
        {
          kind: "swap_board",
          label: `Swap: take the chopped ${cell.item} off this board, leaving your ${held} there uncut (you'll need to come back empty-handed to chop it)`,
        },
      ];
    }
    return [];
  }

  return held || mateHasKnife
    ? []
    : [
        {
          kind: "resume_chop",
          label: `Carry on chopping the ${cell.item} already on this board`,
        },
      ];
}

function counterActions(cell, held) {
  const onTile = cell.item;

  if (combines(held, onTile)) {
    const veg = held === "plate" ? onTile : held;
    return [
      {
        kind: "assemble",
        label: `Combine your ${itemName(held)} with the ${itemName(onTile)} here to plate a ${veg.split("_")[0]} salad`,
      },
    ];
  }

  if (held && !onTile) {
    return [{ kind: "place", label: `Put your ${itemName(held)} down on this empty counter` }];
  }

  if (!held && onTile) {
    return [{ kind: "pickup", label: `Pick up the ${itemName(onTile)} from this counter` }];
  }

  if (held && onTile) {
    return [
      {
        kind: "swap_counter",
        label: `Swap your ${itemName(held)} for the ${itemName(onTile)} on this counter`,
      },
    ];
  }

  return [];
}

export function actionsForCell(cell, held, teammate) {
  switch (cell.type) {
    case "dispenser":
      return dispenserActions(cell, held);
    case "cuttingBoard":
      return boardActions(cell, held, teammate);
    case "counter":
      return counterActions(cell, held);
    case "trash":
      return held ? [{ kind: "trash", label: `Throw away your ${itemName(held)}` }] : [];
    case "delivery":
      return isFinishedPlate(held)
        ? [{ kind: "deliver", label: `Hand in your ${itemName(held)} and score a point` }]
        : [];
    default:
      return [];
  }
}

export function describeIntent(kind, cell, held) {
  switch (kind) {
    case "take":
      return `grab a ${cell.dispenseItem} from the dispenser`;
    case "chop":
      return `start chopping their ${itemName(held)}`;
    case "resume_chop":
      return `resume chopping the ${itemName(cell.item)} already on the board`;
    case "take_chopped":
      return `pick up the finished chopped ${itemName(cell.item)}`;
    case "swap_board":
      return `swap for the chopped ${itemName(cell.item)}, leaving their ${itemName(held)} there uncut`;
    case "place":
      return `put down their ${itemName(held)}`;
    case "pickup":
      return `pick up the ${itemName(cell.item)}`;
    case "swap_counter":
      return `swap their ${itemName(held)} for the ${itemName(cell.item)}`;
    case "assemble":
      return `plate a salad here`;
    case "trash":
      return `throw away their ${itemName(held)}`;
    case "deliver":
      return `deliver their ${itemName(held)}`;
    default:
      return `use this tile`;
  }
}

function plateAvailable(game, player, teammate) {
  if (player.item === "plate" || teammate?.item === "plate") return true;
  for (const row of game.map.cells) {
    for (const cell of row) {
      if (cell.type === "counter" && cell.item === "plate") return true;
    }
  }
  return false;
}

function choppedAvailable(game, player, teammate) {
  const isChopped = (item) => Boolean(item?.endsWith("_cut"));
  if (isChopped(player.item) || isChopped(teammate?.item)) return true;
  for (const row of game.map.cells) {
    for (const cell of row) {
      if (cell.type === "counter" && isChopped(cell.item)) return true;
      if (cell.type === "cuttingBoard" && cell.item && isCutDone(cell.cutProgress ?? 0)) return true;
    }
  }
  return false;
}

function prematurePickupNote(item, game, player, teammate) {
  if (item === "plate" && !choppedAvailable(game, player, teammate)) {
    return " (nothing chopped is ready to combine with yet — usually better left on the counter)";
  }
  if (item?.endsWith("_cut") && !plateAvailable(game, player, teammate)) {
    return " (no plate is ready to combine with yet — usually better left where it is)";
  }
  return "";
}

/** Roughly the last few decisions at 10 ticks/s — recent enough that "you just did this" is true. */
const SHUFFLE_TICKS = 300;

/**
 * True when this counter still holds the very item this cook set down moments
 * ago. Salads are exempt: putting a salad together and then picking it up to
 * deliver is the intended flow, not shuffling.
 */
function justPlacedHere(cell, player, game) {
  const placed = player.lastPlaced;
  if (!placed || placed.x !== cell.x || placed.y !== cell.y) return false;
  if (cell.item !== placed.item || isFinishedPlate(cell.item)) return false;
  return game.tick - placed.tick <= SHUFFLE_TICKS;
}

/**
 * True when the item in this cook's hands is one they lifted off a counter
 * moments ago and have not used since — putting it back down (anywhere) is the
 * second half of a shuffle.
 */
function stillCarryingTaken(held, player, game) {
  const taken = player.lastTaken;
  if (!taken || taken.item !== held || isFinishedPlate(held)) return false;
  return game.tick - taken.tick <= SHUFFLE_TICKS;
}

/** Approximate walking time in seconds for this cook, so "N steps" means something. */
function walkSecs(steps, player) {
  if (!steps || !player.walkSpeed) return 0;
  return Math.round((steps / player.walkSpeed) * TICK_MS / 100) / 10;
}

/**
 * Would the teammate, with this cook moved to `tile`, have an open path to what
 * they are (apparently) after? With no known goal, the tile this cook currently
 * stands on is the proxy — in a corridor face-off that is exactly the tile the
 * teammate is pressing toward.
 */
function clearsWayFor(map, teammate, goal, tile, player) {
  const blocked = new Set([`${tile.x},${tile.y}`]);
  const target = goal ?? { x: player.x, y: player.y };
  const walkTarget = isWalkable(map, target.x, target.y)
    ? target
    : adjacentWalkable(map, target.x, target.y, teammate.x, teammate.y, blocked);
  if (!walkTarget) return false;
  if (walkTarget.x === tile.x && walkTarget.y === tile.y) return false;
  return Boolean(findPath(map, teammate.x, teammate.y, walkTarget.x, walkTarget.y, blocked));
}

/**
 * Nearest floor tile this cook can retreat to that actually unblocks the
 * teammate — stepping one tile back inside the same corridor does not count.
 * Null when no such tile exists (e.g. cornered), in which case waiting while
 * the OTHER cook yields is the only resolution.
 */
function stepAsideTarget(map, player, teammate, reachAvoidingMate) {
  if (!reachAvoidingMate) return null;

  const pathEnd = teammate.path?.length ? teammate.path[teammate.path.length - 1] : null;
  const goal = teammate.pendingInteract ?? pathEnd ?? teammate.lastClick ?? null;

  const candidates = [];
  for (const [key, steps] of reachAvoidingMate) {
    if (steps === 0) continue;
    const [x, y] = key.split(",").map(Number);
    if (goal && x === goal.x && y === goal.y) continue;
    candidates.push({ x, y, steps });
  }
  candidates.sort((a, b) => a.steps - b.steps);

  return candidates.find((tile) => clearsWayFor(map, teammate, goal, tile, player)) ?? null;
}

function teammateIdle(teammate) {
  return teammate && !isBusy(teammate);
}

function teammateActive(teammate) {
  return teammate && isBusy(teammate);
}

/**
 * Actions offered to the cook choosing a move. Index 0 is always wait.
 * Cooperation filters apply only when this cook is Claude — humans click freely.
 * `opts.collided` marks a decision triggered by walking into the teammate, which
 * (along with blocked routes) unlocks the step-aside action.
 */
export function legalActions(game, player, teammate = null, opts = {}) {
  const reach = reachableFrom(game.map, player.x, player.y);
  const blockedTiles = teammate ? new Set([`${teammate.x},${teammate.y}`]) : null;
  const reachAvoidingMate = blockedTiles ? reachableFrom(game.map, player.x, player.y, blockedTiles) : null;
  const held = player.item;
  const found = [];
  const forLlm = player.controller === "llm";
  const mateIdle = forLlm && teammateIdle(teammate);
  const mateActive = forLlm && teammateActive(teammate);

  for (const row of game.map.cells) {
    for (const cell of row) {
      const options = actionsForCell(cell, held, teammate);
      if (options.length === 0) continue;

      const standNear = approach(cell, reach);
      if (!standNear) continue;

      // Prefer the approach that routes around the teammate — that is the walk
      // the game will actually perform — and fall back to the raw geometry when
      // the teammate currently blocks every route (the cook would walk up to
      // them and stop; see blockNote).
      const standFree = reachAvoidingMate ? approach(cell, reachAvoidingMate) : null;
      const stand = standFree ?? standNear;
      const noDetour = Boolean(reachAvoidingMate && !standFree && standNear.steps > 0);
      const blocked = noDetour || Boolean(standFree && standFree.steps !== standNear.steps);

      for (const option of options) {
        let label = option.label;
        if (forLlm && teammate) {
          if (option.kind === "take" && isRedundantFetch(cell.dispenseItem, game, player, teammate)) {
            continue;
          }
          if (targetsTeammateDestination(cell, teammate)) {
            continue;
          }
          if (shouldDeferChopWorkWhenTeammateIdle(teammate, option, cell, game, player)) {
            label += " (your idle teammate could do this too — take it only if you are at least as close)";
          }
        }

        if (option.kind === "place" && mateIdle && RAW_VEG.includes(held)) {
          label += " (one option: leave it here for your teammate to chop, if they are better placed)";
        }
        if (option.kind === "place" && stillCarryingTaken(held, player, game)) {
          label +=
            " (you picked this up from a counter moments ago and haven't used it — putting it back down is just shuffling)";
        }
        if (option.kind === "swap_counter") {
          label += ` (a swap only helps if you need the ${itemName(cell.item)} immediately — otherwise it is just shuffling)`;
        }
        if (option.kind === "pickup") {
          label += prematurePickupNote(cell.item, game, player, teammate);
          if (justPlacedHere(cell, player, game)) {
            label += " (you put this here yourself a moment ago — picking it back up just undoes your own work)";
          }
          if (isFinishedPlate(cell.item) && teammate && teammate.walkSpeed > player.walkSpeed) {
            label +=
              " (your teammate is the faster runner — if their hands are free, leaving this salad for them to deliver may score sooner)";
          }
        }

        found.push({
          ...option,
          label,
          x: cell.x,
          y: cell.y,
          steps: stand.steps,
          secs: walkSecs(stand.steps, player),
          standX: stand.x,
          standY: stand.y,
          blocked,
          noDetour,
        });
      }
    }
  }

  found.sort((a, b) => (PRIORITY[a.kind] ?? 99) - (PRIORITY[b.kind] ?? 99) || a.steps - b.steps);

  // The escape hatch for chokepoints: offered after a collision, when the
  // teammate blocks the only route to something, or in an adjacent face-off
  // with an idle teammate. Without it a cook in a corridor has no way to
  // yield — "wait" keeps blocking the corridor.
  const extras = [];
  if (forLlm && teammate) {
    const adjacentFaceOff =
      Math.abs(player.x - teammate.x) + Math.abs(player.y - teammate.y) === 1 && !isBusy(teammate);
    if (opts.collided || adjacentFaceOff || found.some((a) => a.noDetour)) {
      const aside = stepAsideTarget(game.map, player, teammate, reachAvoidingMate);
      if (aside) {
        extras.push({
          kind: "move",
          label:
            "Step aside so your teammate can get past you — give way when you have the longer " +
            "remaining trip, or when you are parked on their route",
          x: aside.x,
          y: aside.y,
          steps: aside.steps,
          secs: walkSecs(aside.steps, player),
          standX: aside.x,
          standY: aside.y,
          blocked: false,
          noDetour: false,
        });
      }
    }
  }

  const waitLabel = mateIdle
    ? "Wait — you are BOTH idle, so this is allowed only if your teammate is strictly better placed " +
      "for every unclaimed step; otherwise take a real pipeline step (shuffling items between " +
      "counters does not count as acting)"
    : mateActive
      ? "Wait while your teammate finishes — use only if every other action would duplicate or block their job"
      : "Wait here for about 2 seconds, or until a counter's contents change — for when you are " +
        "the stay-put cook and your teammate is doing the fetching";

  return [
    {
      index: 0,
      kind: "wait",
      label: waitLabel,
      x: null,
      y: null,
      steps: 0,
      standX: player.x,
      standY: player.y,
      blocked: false,
    },
    ...[...found.slice(0, MAX_ACTIONS), ...extras].map((action, i) => ({ ...action, index: i + 1 })),
  ];
}

function pluralSteps(n) {
  return `${n} step${n === 1 ? "" : "s"}`;
}

function blockNote(action) {
  if (action.noDetour) {
    return (
      "; your teammate is standing on the only route — you would just walk up to them and stop, " +
      "so pick this only if you expect them to move"
    );
  }
  return action.blocked ? "; path detours around your teammate" : "";
}

function walkPhrase(action) {
  if (action.steps === 0) return "already next to it";
  const time = action.secs ? ` (≈${action.secs}s at your speed)` : "";
  return `${pluralSteps(action.steps)} to walk${time}`;
}

export function describeActions(actions) {
  return actions
    .map((action) => {
      if (action.kind === "wait") {
        return `${action.index}. ${action.label} — you stay at (${action.standX},${action.standY}).`;
      }
      if (action.kind === "move") {
        return `${action.index}. ${action.label} — ${walkPhrase(action)}, ending at (${action.standX},${action.standY}).`;
      }
      const machine = `at (${action.x},${action.y})`;
      const stand = `you'd stand at (${action.standX},${action.standY})`;
      return `${action.index}. ${action.label} ${machine} — ${walkPhrase(action)}, ${stand}${blockNote(action)}.`;
    })
    .join("\n");
}
