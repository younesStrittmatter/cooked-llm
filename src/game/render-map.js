import { TILE_SIZE, SPRITE_SIZE, SPRITE_BASE } from "./constants.js";
import { TILES } from "./map.js";
import { itemSpriteRow } from "./items.js";
import { cutStage } from "./cutting.js";

const images = new Map();
const loadWaiters = new Set();

function notifyWaiters() {
  for (const cb of loadWaiters) cb();
}

function loadSprite(name) {
  if (images.has(name)) return images.get(name);

  const img = new Image();
  images.set(name, img);

  const onDone = () => notifyWaiters();
  img.addEventListener("load", onDone, { once: true });
  img.addEventListener("error", onDone, { once: true });
  img.src = `${SPRITE_BASE}/world/${name}`;

  if (img.complete) {
    queueMicrotask(onDone);
  }

  return img;
}

/** Re-render when sprite assets finish loading (preview + game). */
export function onSpritesReady(callback) {
  loadWaiters.add(callback);
  callback();
}

function spriteReady(img) {
  return img.complete && img.naturalWidth > 0;
}

export function drawWorldSprite(ctx, name, sx, sy, dx, dy) {
  const img = loadSprite(name);
  if (!spriteReady(img)) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, SPRITE_SIZE, SPRITE_SIZE, dx, dy, TILE_SIZE, TILE_SIZE);
}

function drawItem(ctx, item, variant, dx, dy, srcX = 0) {
  const sprite =
    variant === "dispenser"
      ? "item-dispenser.png"
      : variant === "board"
        ? "item-on-board.png"
        : "item-on-counter.png";
  const row = itemSpriteRow(item, variant === "board" ? "board" : variant);
  const img = loadSprite(sprite);
  if (!spriteReady(img)) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, srcX, row, SPRITE_SIZE, SPRITE_SIZE, dx, dy, TILE_SIZE, TILE_SIZE);
}

function drawCuttingBoard(ctx, cell, px, py) {
  drawWorldSprite(ctx, "cutting-board.png", 0, 0, px, py);

  const progress = cell.cutProgress ?? 0;
  if (cell.item) {
    const stage = cutStage(progress);
    drawItem(ctx, cell.item, "board", px, py, stage * SPRITE_SIZE);
  }
}

function drawIdleKnives(ctx, map) {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.cells[y][x].type !== "cuttingBoard") continue;
      drawWorldSprite(ctx, "knife.png", 0, 0, x * TILE_SIZE, y * TILE_SIZE);
    }
  }
}

/** Draw map tiles only (no cook). Used for editor preview and game background. */
export function renderMap(map, ctx) {
  const logicalW = map.width * TILE_SIZE;
  const logicalH = map.height * TILE_SIZE;
  ctx.clearRect(0, 0, logicalW, logicalH);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.cells[y][x];
      const def = TILES[cell.type];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      drawWorldSprite(ctx, def.sprite, 0, 0, px, py);

      if (cell.type === "dispenser" && cell.dispenseItem) {
        drawItem(ctx, cell.dispenseItem, "dispenser", px, py);
      }

      if (cell.type === "counter" && cell.item) {
        drawItem(ctx, cell.item, "counter", px, py);
      }

      if (cell.type === "cuttingBoard") {
        drawCuttingBoard(ctx, cell, px, py);
      }

      if (cell.type === "trash") {
        drawWorldSprite(ctx, "trash-can.png", 0, 0, px, py);
      }
    }
  }

  drawIdleKnives(ctx, map);
}
