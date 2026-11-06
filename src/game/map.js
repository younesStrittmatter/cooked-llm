import { symbolByChar } from "./map-symbols.js";

/** Tile definitions — add new tile types here */
export const TILES = {
  floor: {
    walkable: true,
    sprite: "basic-floor.png",
  },
  wall: {
    walkable: false,
    sprite: "basic-wall.png",
  },
  counter: {
    walkable: false,
    sprite: "basic-counter.png",
    interact: "exchange",
  },
  dispenser: {
    walkable: false,
    sprite: "basic-counter.png",
    interact: "pickup",
  },
  cuttingBoard: {
    walkable: false,
    sprite: "basic-counter.png",
    interact: "cut",
  },
  trash: {
    walkable: false,
    sprite: "basic-counter.png",
    interact: "trash",
  },
  delivery: {
    walkable: false,
    sprite: "delivery.png",
    interact: "deliver",
  },
};

export function buildMap(text) {
  const layout = text.trimEnd();
  const rows = layout.split("\n");
  const width = Math.max(...rows.map((row) => row.length));
  const height = rows.length;

  const cells = rows.map((row, y) =>
    [...row.padEnd(width, ".")].map((char, x) => {
      const sym = symbolByChar(char);
      const type = sym?.type ?? "floor";
      const cell = { x, y, type, item: null, cutProgress: 0 };

      if (sym?.dispenseItem) {
        cell.dispenseItem = sym.dispenseItem;
      }

      return cell;
    }),
  );

  return { width, height, cells };
}

export function getCell(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.cells[y][x];
}

export function isWalkable(map, x, y) {
  const cell = getCell(map, x, y);
  return cell && TILES[cell.type].walkable;
}

export function findSpawnTile(map) {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWalkable(map, x, y)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

/** Distinct spawn tiles, spread across the kitchen so cooks don't start stacked. */
export function findSpawnTiles(map, count) {
  const walkable = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWalkable(map, x, y)) walkable.push({ x, y });
    }
  }

  if (walkable.length === 0) {
    return Array.from({ length: count }, () => ({ x: 0, y: 0 }));
  }

  return Array.from({ length: count }, (_, i) => {
    const step = Math.floor((walkable.length - 1) / Math.max(1, count - 1));
    return walkable[Math.min(walkable.length - 1, i * step)];
  });
}
