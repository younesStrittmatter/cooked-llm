import { itemName } from "./items.js";
import { getCell } from "./map.js";
import { describeActivity } from "./player.js";
import {
  scanKitchen,
  plateAnywhere,
  choppedAnywhere,
  saladAnywhere,
  rawVegAnywhere,
  combineReady,
  isRaw,
} from "./kitchen-scan.js";
import { isCutDone } from "./cutting.js";
import { isFinishedPlate } from "./delivery.js";

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function walkTicks(steps, walkSpeed) {
  if (steps <= 0) return 0;
  return walkSpeed > 0 ? Math.ceil(steps / walkSpeed) : Infinity;
}

/**
 * Factual pipeline readout — computed each turn, not prescriptive script.
 */
export function buildPipelineSummary(game, player, teammate) {
  const { boards, counters, dispensers } = scanKitchen(game.map);
  const lines = [`# Pipeline readout`, ``];

  const hasSalad = saladAnywhere(player, teammate, counters);
  const hasChopped = choppedAnywhere(player, teammate, boards, counters);
  const hasPlate = plateAnywhere(player, teammate, counters);
  const hasRaw = rawVegAnywhere(player, teammate, boards, counters);
  const canCombine = combineReady(counters);

  const choppingBoard = boards.find((b) => b.item && !isCutDone(b.cutProgress ?? 0));
  const doneBoard = boards.find((b) => b.item && isCutDone(b.cutProgress ?? 0));

  let stage = "starting — need a raw vegetable";
  if (hasSalad) stage = "salad exists — deliver it";
  else if (canCombine) stage = "chopped + plate on counters — combine into salad";
  else if (doneBoard) stage = "chopped vegetable ready on a board";
  else if (choppingBoard) stage = `chopping ${choppingBoard.item} in progress`;
  else if (hasRaw) stage = "raw vegetable available — needs a board";
  else if (hasChopped && !hasPlate) stage = "chopped ready but no plate anywhere";

  lines.push(`Pipeline stage: ${stage}.`);

  const staged = [];
  for (const b of boards) {
    if (!b.item) continue;
    if (isCutDone(b.cutProgress ?? 0)) staged.push(`board (${b.x},${b.y}): finished chopped ${b.item}`);
    else staged.push(`board (${b.x},${b.y}): ${b.item} part-chopped`);
  }
  for (const c of counters) {
    staged.push(`counter (${c.x},${c.y}): ${itemName(c.item)}`);
  }
  lines.push(staged.length ? `Staged: ${staged.join("; ")}.` : `Staged: nothing on boards or counters.`);

  const gaps = [];

  if (teammate) {
    const mateActivity = describeActivity(teammate, game.map, getCell, player);
    const mateIdle = mateActivity === "standing still";
    lines.push(
      mateIdle
        ? `Teammate: idle at (${teammate.x},${teammate.y}), holding ${itemName(teammate.item)}.`
        : `Teammate's current job: ${mateActivity}.`,
    );

    const mateNearBoard = boards.some((b) => manhattan(teammate, b) <= 4);
    const mateFetchingVeg = mateActivity.includes("grab a tomato") || mateActivity.includes("grab a pumpkin");
    const mateChopSetup =
      !teammate.item && (mateNearBoard || mateActivity.includes("chop") || mateActivity.includes("resume chopping"));

    if (mateChopSetup && !hasRaw && !mateFetchingVeg) {
      gaps.push("teammate looks set up to chop but no raw vegetable is in hand or staged nearby");
    }
    if (mateFetchingVeg && isRaw(player.item)) {
      gaps.push("teammate is already fetching a vegetable — a second fetch from you may waste time");
    }
    if (mateFetchingVeg && !player.item && !hasRaw) {
      gaps.push(
        "teammate is already fetching a vegetable — waiting or staging a plate near boards may beat duplicating the fetch",
      );
    }
    if (doneBoard && !hasPlate) gaps.push("chopped vegetable is ready but no plate exists yet");
    if (canCombine) gaps.push("salad can be plated now — combine, then deliver");
    if (hasSalad && !isFinishedPlate(player.item) && !isFinishedPlate(teammate?.item)) {
      gaps.push("finished salad is waiting on a counter — pick up and deliver");
    }
  }

  if (!player.item && counters.some((c) => c.item === "plate") && !hasChopped) {
    gaps.push("plate is staged but nothing is chopped yet — leave it on the counter");
  }
  if (!player.item && counters.some((c) => c.item?.endsWith("_cut")) && !hasPlate) {
    gaps.push("chopped vegetable is staged but no plate — get a plate before picking up the chop");
  }

  if (gaps.length) {
    lines.push(``, `Gaps / opportunities:`);
    for (const g of gaps) lines.push(`- ${g}`);
  }

  if (teammate) {
    const sample = dispensers.tomato[0] ?? dispensers.plate[0];
    if (sample) {
      const yTicks = walkTicks(manhattan(player, sample), player.walkSpeed);
      const mTicks = walkTicks(manhattan(teammate, sample), teammate.walkSpeed);
      if (yTicks > mTicks * 1.5) {
        lines.push(
          ``,
          `Walk cost (example far fetch): you ~${yTicks} ticks at walk ${player.walkSpeed}; ` +
            `teammate ~${mTicks} ticks at walk ${teammate.walkSpeed}.`,
        );
      } else if (mTicks > yTicks * 1.5) {
        lines.push(
          ``,
          `Walk cost (example far fetch): teammate ~${mTicks} ticks; you ~${yTicks} ticks — you may courier faster.`,
        );
      }
    }
  }

  return lines.join("\n");
}
