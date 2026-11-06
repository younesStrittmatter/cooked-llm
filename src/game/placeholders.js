import { DEFAULT_COLORS } from "../../shared/game-defaults.js";

/** Placeholder RGB in sprite files — swapped at runtime */
export const PLACEHOLDER = {
  hat: [0, 0, 255],
  apron: [0, 255, 0],
  hair: [255, 0, 255],
  mustache: [255, 136, 0],
  skin: [255, 186, 222],
};

export { DEFAULT_COLORS };

export function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorsFromHex(map) {
  return Object.fromEntries(
    Object.entries(map).map(([key, hex]) => [key, hexToRgb(hex)]),
  );
}
