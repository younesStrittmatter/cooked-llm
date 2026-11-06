import { TILE_SIZE, SPRITE_SIZE } from "./constants.js";
import { getRecoloredSprite } from "./sprite-recolor.js";
import { itemSpriteRow } from "./items.js";
import { getVisualPosition, getAnimFrame } from "./player-visual.js";
import { SPRITE_BASE } from "./constants.js";

const itemsHeld = new Image();
itemsHeld.src = `${SPRITE_BASE}/agent/items-held.png`;

function drawLayer(ctx, img, frame, dx, dy, srcY = 0) {
  if (!img) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    frame * SPRITE_SIZE,
    srcY,
    SPRITE_SIZE,
    SPRITE_SIZE,
    dx,
    dy,
    TILE_SIZE,
    TILE_SIZE,
  );
}

function drawHeldItem(ctx, item, frame, dx, dy) {
  if (!itemsHeld.complete || itemsHeld.naturalWidth === 0) return;
  ctx.imageSmoothingEnabled = false;
  const row = itemSpriteRow(item, "counter");
  ctx.drawImage(
    itemsHeld,
    frame * SPRITE_SIZE,
    row,
    SPRITE_SIZE,
    SPRITE_SIZE,
    dx,
    dy,
    TILE_SIZE,
    TILE_SIZE,
  );
}

export function drawCook(ctx, player, colors) {
  const { x, y } = getVisualPosition(player);
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const frame = getAnimFrame(player);

  const husk = getRecoloredSprite("cook-husk.png", colors);
  const hair = getRecoloredSprite("hair.png", colors);
  const mustache = getRecoloredSprite("mustache.png", colors);
  const skin = getRecoloredSprite("skin.png", colors);

  drawLayer(ctx, husk, frame, px, py);
  drawLayer(ctx, hair, frame, px, py);
  drawLayer(ctx, skin, frame, px, py, 0);
  drawLayer(ctx, mustache, frame, px, py);

  if (player.item) {
    drawLayer(ctx, skin, frame, px, py, SPRITE_SIZE * 2);
    drawHeldItem(ctx, player.item, frame, px, py);
  } else {
    drawLayer(ctx, skin, frame, px, py, SPRITE_SIZE);
  }
}
