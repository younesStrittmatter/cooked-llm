import { isWalkable } from "./map.js";

export const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Every walkable tile reachable from a start point, mapped to its step count.
 * `blocked`, if given, is a Set of "x,y" strings treated as impassable in
 * addition to walls — see `findPath` for why (routing around a teammate).
 */
export function reachableFrom(map, fromX, fromY, blocked) {
  const distances = new Map([[`${fromX},${fromY}`, 0]]);
  const queue = [[fromX, fromY, 0]];

  while (queue.length) {
    const [x, y, dist] = queue.shift();
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (distances.has(key) || !isWalkable(map, nx, ny)) continue;
      if (blocked?.has(key)) continue;
      distances.set(key, dist + 1);
      queue.push([nx, ny, dist + 1]);
    }
  }

  return distances;
}

/**
 * BFS path from (fromX, fromY) to (toX, toY). Returns steps excluding start.
 *
 * `blocked`, if given, is a Set of "x,y" strings treated as impassable in
 * addition to walls — used to route around a teammate's current tile. The
 * goal tile itself is exempt from this: a cook can still path onto a tile a
 * teammate happens to occupy right now (the collision system stops it one
 * step short on arrival if they haven't moved on by then), it just will not
 * be used as a shortcut *through*.
 */
export function findPath(map, fromX, fromY, toX, toY, blocked) {
  if (fromX === toX && fromY === toY) return [];

  const start = `${fromX},${fromY}`;
  const goal = `${toX},${toY}`;
  const queue = [[fromX, fromY]];
  const cameFrom = new Map([[start, null]]);

  while (queue.length) {
    const [x, y] = queue.shift();
    const key = `${x},${y}`;
    if (key === goal) break;

    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const nkey = `${nx},${ny}`;
      if (cameFrom.has(nkey) || !isWalkable(map, nx, ny)) continue;
      if (blocked?.has(nkey) && nkey !== goal) continue;
      cameFrom.set(nkey, key);
      queue.push([nx, ny]);
    }
  }

  if (!cameFrom.has(goal)) return null;

  const path = [];
  let cur = goal;
  while (cur && cur !== start) {
    const [x, y] = cur.split(",").map(Number);
    path.push({ x, y });
    cur = cameFrom.get(cur);
  }

  return path.reverse();
}

/**
 * `findPath`, but if avoiding `blocked` leaves no route at all, falls back to
 * a path that ignores blocking rather than failing outright — so a teammate
 * standing somewhere never makes a destination flatly unreachable, it just
 * loses its priority as a route once no detour exists.
 */
export function findPathAvoiding(map, fromX, fromY, toX, toY, blocked) {
  if (!blocked?.size) return findPath(map, fromX, fromY, toX, toY);
  return findPath(map, fromX, fromY, toX, toY, blocked) ?? findPath(map, fromX, fromY, toX, toY);
}

/**
 * Closest walkable tile next to a non-walkable target. Prefers one `blocked`
 * does not cover — e.g. a teammate standing on the nearest side of a counter
 * that has another free side — falling back to the nearest tile regardless
 * if every side is currently occupied.
 */
export function adjacentWalkable(map, x, y, fromX, fromY, blocked) {
  let best = null;
  let bestDist = Infinity;
  let bestFree = null;
  let bestFreeDist = Infinity;

  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!isWalkable(map, nx, ny)) continue;
    const dist = Math.abs(nx - fromX) + Math.abs(ny - fromY);

    if (dist < bestDist) {
      bestDist = dist;
      best = { x: nx, y: ny };
    }
    if (!blocked?.has(`${nx},${ny}`) && dist < bestFreeDist) {
      bestFreeDist = dist;
      bestFree = { x: nx, y: ny };
    }
  }

  return bestFree ?? best;
}
