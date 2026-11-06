import { PLACEHOLDER } from "./placeholders.js";
import { SPRITE_BASE } from "./constants.js";

const cache = new Map();
const templates = new Map();

function cacheKey(name, colors) {
  return `${name}:${colors.hat.join(",")}:${colors.apron.join(",")}:${colors.hair.join(",")}:${colors.mustache.join(",")}:${colors.skin.join(",")}`;
}

function replacePlaceholders(imageData, colors) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const rgb = [data[i], data[i + 1], data[i + 2]];

    for (const [part, placeholder] of Object.entries(PLACEHOLDER)) {
      if (rgb[0] === placeholder[0] && rgb[1] === placeholder[1] && rgb[2] === placeholder[2]) {
        const c = colors[part];
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        break;
      }
    }
  }
}

function loadTemplate(name) {
  if (templates.has(name)) return templates.get(name);
  const img = new Image();
  img.src = `${SPRITE_BASE}/agent/${name}`;
  templates.set(name, img);
  return img;
}

/** Returns a recolored canvas for a sprite layer, or null while loading */
export function getRecoloredSprite(name, colors) {
  const key = cacheKey(name, colors);
  if (cache.has(key)) return cache.get(key);

  const template = loadTemplate(name);
  if (!template.complete || template.naturalWidth === 0) {
    if (!template.dataset.waiting) {
      template.dataset.waiting = "1";
      template.addEventListener(
        "load",
        () => {
          delete template.dataset.waiting;
          getRecoloredSprite(name, colors);
        },
        { once: true },
      );
    }
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = template.naturalWidth;
  canvas.height = template.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(template, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  replacePlaceholders(imageData, colors);
  ctx.putImageData(imageData, 0, 0);

  cache.set(key, canvas);
  return canvas;
}

export function clearRecolorCache() {
  cache.clear();
}
