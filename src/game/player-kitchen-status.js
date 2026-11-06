import { isCutDone } from "./cutting.js";
import {
  scanKitchen,
  plateAnywhere,
  choppedAnywhere,
  saladAnywhere,
  rawVegAnywhere,
  combineReady,
} from "./kitchen-scan.js";

/** Short, player-facing line for the HUD — what's happening in the kitchen right now. */
export function playerKitchenStage(game) {
  const [player, teammate] = game.players;
  const { boards, counters } = scanKitchen(game.map);

  if (saladAnywhere(player, teammate, counters)) {
    return "Salad ready — get it to the window!";
  }
  if (combineReady(counters)) {
    return "Plating station — combine and serve";
  }
  if (boards.some((b) => b.item && isCutDone(b.cutProgress ?? 0))) {
    return "Chopped and ready — plate it up";
  }
  if (boards.some((b) => b.item && !isCutDone(b.cutProgress ?? 0))) {
    return "On the board — keep chopping";
  }
  if (choppedAnywhere(player, teammate, boards, counters) && !plateAnywhere(player, teammate, counters)) {
    return "Need a plate for the pass";
  }
  if (rawVegAnywhere(player, teammate, boards, counters)) {
    return "Vegetables in play — get them on a board";
  }
  return "Gathering ingredients";
}
