/**
 * Map symbols — one letter per tile. Add new entries here when adding tile types.
 */
export const MAP_SYMBOLS = [
  { char: ".", name: "floor" },
  { char: "#", name: "wall" },
  { char: "C", name: "counter" },
  { char: "B", name: "cutting board" },
  { char: "T", name: "tomato dispenser" },
  { char: "P", name: "pumpkin dispenser" },
  { char: "L", name: "plate dispenser" },
  { char: "X", name: "trash" },
  { char: "D", name: "delivery" },
];

const DISPENSE_ITEMS = {
  T: "tomato",
  P: "pumpkin",
  L: "plate",
};

export function symbolByChar(char) {
  const entry = MAP_SYMBOLS.find((s) => s.char === char);
  if (!entry) return null;
  const dispenseItem = DISPENSE_ITEMS[char];
  return {
    char: entry.char,
    type: typeForChar(char),
    name: entry.name,
    dispenseItem,
  };
}

function typeForChar(char) {
  if (char === ".") return "floor";
  if (char === "#") return "wall";
  if (char === "C") return "counter";
  if (char === "B") return "cuttingBoard";
  if (char === "X") return "trash";
  if (char === "D") return "delivery";
  if (char in DISPENSE_ITEMS) return "dispenser";
  return "floor";
}
