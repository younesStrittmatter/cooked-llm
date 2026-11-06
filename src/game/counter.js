function saladFrom(cutItem) {
  return `${cutItem.split("_")[0]}_salad`;
}

function tryAssembleSalad(held, onCounter) {
  if (held?.endsWith("_cut") && onCounter === "plate") {
    return saladFrom(held);
  }
  if (held === "plate" && onCounter?.endsWith("_cut")) {
    return saladFrom(onCounter);
  }
  return null;
}

export function interactCounter(player, cell) {
  const held = player.item;
  const onCounter = cell.item;

  const salad = tryAssembleSalad(held, onCounter);
  if (salad) {
    cell.item = salad;
    player.item = null;
    return;
  }

  if (held && !onCounter) {
    cell.item = held;
    player.item = null;
  } else if (!held && onCounter) {
    player.item = onCounter;
    cell.item = null;
  } else if (held && onCounter) {
    cell.item = held;
    player.item = onCounter;
  }
}
