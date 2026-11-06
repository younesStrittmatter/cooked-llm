import { buildMap } from "./map.js";
import { renderMap, onSpritesReady } from "./render-map.js";
import { TILE_SIZE } from "./constants.js";

const PREVIEW_SCALE = 2;

export class MapPreview {
  constructor(canvas) {
    if (!canvas) throw new Error("MapPreview: canvas element missing");
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.map = null;
    this.cursor = null;
    onSpritesReady(() => this.redraw());
  }

  /** Parse map text and draw a scaled preview. */
  show(text, cursor = null) {
    this.map = buildMap(text);
    this.cursor = cursor;
    this.resize();
    this.redraw();
  }

  setCursor(cursor) {
    this.cursor = cursor;
    this.redraw();
  }

  resize() {
    if (!this.map) return;

    const logicalW = this.map.width * TILE_SIZE;
    const logicalH = this.map.height * TILE_SIZE;
    const pixelW = logicalW * PREVIEW_SCALE;
    const pixelH = logicalH * PREVIEW_SCALE;

    this.canvas.width = pixelW;
    this.canvas.height = pixelH;
    this.canvas.style.width = `${pixelW}px`;
    this.canvas.style.height = `${pixelH}px`;

    this.ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  redraw() {
    if (!this.map) return;

    renderMap(this.map, this.ctx);
    this.drawCursor();
  }

  drawCursor() {
    const cursor = this.cursor;
    if (!cursor) return;

    const { row, col } = cursor;
    if (row < 0 || row >= this.map.height || col < 0 || col >= this.map.width) return;

    const px = col * TILE_SIZE;
    const py = row * TILE_SIZE;

    this.ctx.fillStyle = "rgba(255, 197, 0, 0.3)";
    this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    this.ctx.strokeStyle = "#ffc500";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  }
}

/** Wire live map preview next to the textarea. */
export function initMapPreview(mapText, previewCanvas, defaultMapText) {
  const preview = new MapPreview(previewCanvas);

  function cursor() {
    const before = mapText.value.slice(0, mapText.selectionStart);
    const lines = before.split("\n");
    return { row: lines.length - 1, col: lines[lines.length - 1].length };
  }

  function syncEditorHeight() {
    const h = previewCanvas.offsetHeight;
    if (h > 0) mapText.style.height = `${h}px`;
  }

  function refresh() {
    preview.show(mapText.value, cursor());
    syncEditorHeight();
  }

  function refreshCursor() {
    preview.setCursor(cursor());
  }

  if (!mapText.value.trim() && defaultMapText) {
    mapText.value = defaultMapText.trimEnd();
  }

  refresh();

  mapText.addEventListener("input", refresh);
  mapText.addEventListener("keyup", refreshCursor);
  mapText.addEventListener("click", refreshCursor);
  mapText.addEventListener("select", refreshCursor);
  mapText.addEventListener("paste", () => queueMicrotask(refresh));

  return preview;
}
