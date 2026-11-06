import { TILE_SIZE } from "./constants.js";
import { renderMap, drawWorldSprite } from "./render-map.js";
import { drawCook } from "./cook.js";
import { RAW_VEG, isCutDone, knifeFrame } from "./cutting.js";
import { isAdjacentToBoard } from "./cutting-board.js";

export { renderMap, onSpritesReady } from "./render-map.js";

function isChoppedBy(players, cell) {
  return players.some(
    (player) =>
      player.activeCut?.x === cell.x &&
      player.activeCut?.y === cell.y &&
      isAdjacentToBoard(player, cell),
  );
}

function drawActiveKnives(ctx, map, players) {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.cells[y][x];
      if (cell.type !== "cuttingBoard") continue;

      const progress = cell.cutProgress ?? 0;
      const chopping =
        cell.item &&
        RAW_VEG.includes(cell.item) &&
        !isCutDone(progress) &&
        isChoppedBy(players, cell);

      if (chopping && progress > 0) {
        drawWorldSprite(ctx, "knife.png", knifeFrame(progress), 0, x * TILE_SIZE, y * TILE_SIZE);
      }
    }
  }
}

export function drawFrame(game, ctx) {
  const { map, players } = game;

  renderMap(map, ctx);
  drawActiveKnives(ctx, map, players);

  // Lower cooks last so they overlap the ones standing behind them.
  for (const player of [...players].sort((a, b) => a.y - b.y)) {
    drawCook(ctx, player, player.colors);
  }
}
