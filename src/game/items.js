/** Item sprite row offsets (16px rows in the spritesheet) */
export const ITEMS = {
  tomato: { counterY: 0, dispenserY: 0, boardY: 0 },
  pumpkin: { counterY: 16, dispenserY: 16, boardY: 16 },
  cabbage: { counterY: 32, dispenserY: 32, boardY: 32 },
  plate: { counterY: 48, dispenserY: 48, boardY: 48 },
  tomato_cut: { counterY: 9 * 16, boardY: 9 * 16 },
  pumpkin_cut: { counterY: 10 * 16, boardY: 10 * 16 },
  cabbage_cut: { counterY: 11 * 16, boardY: 11 * 16 },
  tomato_salad: { counterY: 15 * 16 },
  pumpkin_salad: { counterY: 16 * 16 },
  cabbage_salad: { counterY: 17 * 16 },
};

/** Human-readable item name for prompts and UI: "tomato_cut" -> "chopped tomato". */
export function itemName(item) {
  if (!item) return "nothing";
  if (item.endsWith("_cut")) return `chopped ${item.slice(0, -"_cut".length)}`;
  if (item.endsWith("_salad")) return `${item.slice(0, -"_salad".length)} salad`;
  return item;
}

export function itemSpriteRow(item, variant) {
  const def = ITEMS[item];
  if (!def) return 0;
  if (variant === "dispenser") return def.dispenserY ?? def.counterY;
  if (variant === "board") return def.boardY ?? def.counterY;
  return def.counterY;
}
