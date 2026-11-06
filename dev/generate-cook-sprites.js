/**
 * Build placeholder cook sprites from spoiled_broth sources.
 * Run: node dev/generate-cook-sprites.js
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { PNG } from "pngjs";

const SRC = path.resolve(
  "../cooked/games/spoiled_broth/static/sprites/agent",
);
const OUT = path.resolve("public/sprites/agent");

/** Placeholder RGB values — replaced at runtime by editor colors */
export const PLACEHOLDER = {
  hat: [0, 0, 255],
  apron: [0, 255, 0],
  hair: [255, 0, 255],
  mustache: [255, 136, 0],
  skin: [255, 186, 222],
};

const HAT_SRC = new Set(["255,255,255", "240,240,240"]);
const APRON_SRC = new Set(["0,64,255", "0,56,224"]);

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(png, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function setPx(data, i, rgb, alpha) {
  data[i] = rgb[0];
  data[i + 1] = rgb[1];
  data[i + 2] = rgb[2];
  data[i + 3] = alpha;
}

function recolorHusk(png) {
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3];
    if (a === 0) continue;
    const key = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`;
    if (HAT_SRC.has(key)) setPx(png.data, i, PLACEHOLDER.hat, a);
    else if (APRON_SRC.has(key)) setPx(png.data, i, PLACEHOLDER.apron, a);
  }
}

function recolorSkin(png, rgb) {
  const SKIN_SRC = new Set(["208,151,119", "200,134,96"]);
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3];
    if (a === 0) continue;
    const key = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`;
    if (SKIN_SRC.has(key)) setPx(png.data, i, rgb, a);
  }
}

function recolorMustache(png, rgb) {
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3];
    if (a === 0) continue;
    setPx(png.data, i, rgb, a);
  }
}

function copyRaw(srcPath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
}

fs.mkdirSync(OUT, { recursive: true });

const husk = readPng(path.join(SRC, "cook-husk.png"));
recolorHusk(husk);
writePng(husk, path.join(OUT, "cook-husk.png"));

const hair = readPng(path.join(SRC, "hair/0.png"));
recolorMustache(hair, PLACEHOLDER.hair);
writePng(hair, path.join(OUT, "hair.png"));

const skin = readPng(path.join(SRC, "skin/0.png"));
recolorSkin(skin, PLACEHOLDER.skin);
writePng(skin, path.join(OUT, "skin.png"));

try {
  const mustacheSrc = path.join(SRC, "mustache/0.png");
  const mustacheTmp = path.join(OUT, ".mustache-src.png");
  execSync(`sips -s format png "${mustacheSrc}" --out "${mustacheTmp}"`, { stdio: "ignore" });
  const mustache = readPng(mustacheTmp);
  recolorMustache(mustache, PLACEHOLDER.mustache);
  writePng(mustache, path.join(OUT, "mustache.png"));
  fs.unlinkSync(mustacheTmp);
} catch (err) {
  console.warn("mustache sprite skipped:", err.message);
}

copyRaw(path.join(SRC, "items-held.png"), path.join(OUT, "items-held.png"));

console.log("Generated placeholder sprites in public/sprites/agent/");
