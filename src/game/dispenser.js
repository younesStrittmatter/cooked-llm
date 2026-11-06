/** Infinite dispenser — always gives its item; anything held is discarded. */
export function interactDispenser(player, cell) {
  if (cell.dispenseItem) {
    player.item = cell.dispenseItem;
  }
}
