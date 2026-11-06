import { ITEMS } from "./items.js";

/** A finished plate is an assembled salad — the only thing delivery accepts. */
export function isFinishedPlate(item) {
  return Boolean(item) && item.endsWith("_salad") && item in ITEMS;
}

/** Hand in a finished plate. Returns the delivered item, or null if nothing was accepted. */
export function interactDelivery(player) {
  if (!isFinishedPlate(player.item)) return null;

  const delivered = player.item;
  player.item = null;
  return delivered;
}
