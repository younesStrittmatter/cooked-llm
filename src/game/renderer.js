import { TILE_SIZE, SPRITE_SIZE } from "./constants.js";

/**
 * Crisp pixel rendering:
 * - logical game pixels are SPRITE_SIZE (16px)
 * - canvas buffer = logical × integer display scale × integer DPR
 * - no CSS upscaling of the bitmap (1 canvas px per CSS px at base scale)
 */
export class Renderer {
  constructor(canvas, map, viewport) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.map = map;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.displayScale = 1;
    this.bufferScale = 1;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  get logicalWidth() {
    return this.map.width * TILE_SIZE;
  }

  get logicalHeight() {
    return this.map.height * TILE_SIZE;
  }

  resize() {
    const logicalW = this.logicalWidth;
    const logicalH = this.logicalHeight;
    const container = this.viewport?.closest(".game-stage");
    const maxW = container?.clientWidth ?? window.innerWidth;
    const maxH = container?.clientHeight ?? window.innerHeight;
    const pad = 32;
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));

    const scaleW = Math.floor((maxW - pad) / logicalW);
    const scaleH = Math.floor((maxH - pad) / logicalH);
    this.displayScale = Math.max(2, Math.min(scaleW, scaleH));
    this.bufferScale = this.displayScale * dpr;

    const cssW = logicalW * this.displayScale;
    const cssH = logicalH * this.displayScale;

    this.canvas.width = logicalW * this.bufferScale;
    this.canvas.height = logicalH * this.bufferScale;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    if (this.viewport) {
      this.viewport.style.width = `${cssW}px`;
      this.viewport.style.height = `${cssH}px`;
    }

    this.applyTransform();
  }

  applyTransform() {
    this.ctx.setTransform(this.bufferScale, 0, 0, this.bufferScale, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Call before each frame — resize can reset the context transform */
  prepare() {
    this.applyTransform();
    this.ctx.imageSmoothingEnabled = false;
  }

  toTile(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * this.map.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * this.map.height);
    return { x, y };
  }

  start(draw) {
    const frame = () => {
      this.prepare();
      draw(this.ctx);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

export { TILE_SIZE, SPRITE_SIZE };
