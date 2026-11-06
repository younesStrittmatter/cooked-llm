/**
 * Generate world sprites for cooked-llm (16×16, matches spoiled_broth palette).
 * Run: node dev/generate-world-sprites.js
 */
import fs from "fs";
import path from "path";
import { PNG } from "pngjs";

const OUT = path.resolve("public/sprites/world");

/** Grey palette — same family as delivery.png */
const PALETTE = {
  ".": null,
  o: [59, 59, 59, 255],
  d: [74, 74, 74, 255],
  m: [89, 89, 89, 255],
  l: [104, 104, 104, 255],
  h: [120, 120, 120, 255],
  K: [16, 16, 18, 255],
};

/**
 * Typical grey kitchen bin (top-down): open lid, light rim, dark opening, tapered body.
 */
const TRASH_CAN = `
................
........lh......
.....ollllo.....
....olKKKKKlo...
...olKKKKKKKlo..
..oddddddddddo..
..odmmmmmmmmdo..
..odmdmdmdmdo...
..odmmmmmmmmdo..
..oddddddddddo..
...odddddddddo..
....ooooooooo...
................
................
................
................
`.trim();

function artToPng(lines) {
  const height = lines.length;
  const width = lines[0].length;
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const rgb = PALETTE[lines[y][x]] ?? null;
      if (rgb) {
        png.data[i] = rgb[0];
        png.data[i + 1] = rgb[1];
        png.data[i + 2] = rgb[2];
        png.data[i + 3] = rgb[3];
      }
    }
  }

  return png;
}

fs.mkdirSync(OUT, { recursive: true });

for (const row of TRASH_CAN.split("\n")) {
  if (row.length !== 16) {
    throw new Error(`Trash-can row width ${row.length}, expected 16: ${row}`);
  }
}

const trash = artToPng(TRASH_CAN.split("\n"));
fs.writeFileSync(path.join(OUT, "trash-can.png"), PNG.sync.write(trash));
console.log("Generated public/sprites/world/trash-can.png");
