/**
 * Exercises dynamic pathfinding around a teammate: routing around them when a
 * detour exists, falling back to the direct route when it doesn't, and
 * re-planning every tick as they move.
 *
 * `findPath`/`findPathAvoiding`/`adjacentWalkable` are DOM-free and imported
 * directly. `reroutePaths()` is copied verbatim from game.js (which can't be
 * imported here — it pulls in Renderer -> cook.js, which does `new Image()`
 * at module scope and only runs in a browser). If you change
 * `reroutePaths()`/`blockedTilesFor()` in game.js, mirror the change here too.
 */
import { buildMap } from "../src/game/map.js";
import { createPlayer } from "../src/game/player.js";
import { findPath, findPathAvoiding, adjacentWalkable } from "../src/game/pathfind.js";

function report(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) process.exitCode = 1;
}

function blockedTilesFor(players, player) {
  return new Set(players.filter((p) => p !== player).map((p) => `${p.x},${p.y}`));
}

function reroutePaths(players, map) {
  for (const player of players) {
    if (player.path.length === 0) continue;
    const dest = player.path[player.path.length - 1];
    const blocked = blockedTilesFor(players, player);
    const rerouted = findPathAvoiding(map, player.x, player.y, dest.x, dest.y, blocked);
    if (rerouted) player.path = rerouted;
  }
}

// A 3-wide room so there's always a detour around a single blocker, plus a
// 1-wide dead-end alcove (column x=1, rows 4-6) reachable only through (1,4).
const MAP = `#########
#.......#
#.......#
#.......#
#.#######
#.#######
#.#######
#########`;

// --- Test 1: a stationary teammate mid-corridor gets routed around ---
{
  const map = buildMap(MAP);
  const p1 = createPlayer({ id: "p1", index: 0, spawn: { x: 1, y: 2 } });
  const p2 = createPlayer({ id: "p2", index: 1, spawn: { x: 4, y: 2 } }); // sits on the straight-line route

  const blocked = blockedTilesFor([p1, p2], p1);
  const path = findPathAvoiding(map, p1.x, p1.y, 7, 2, blocked);

  report("test1: a route was found at all", !!path);
  report(
    "test1: the route detours around the teammate's tile",
    !!path && !path.some((t) => t.x === p2.x && t.y === p2.y),
    JSON.stringify(path),
  );
}

// --- Test 2: no detour exists (dead-end alcove) — falls back to the direct path ---
{
  const map = buildMap(MAP);
  const p1 = createPlayer({ id: "p1", index: 0, spawn: { x: 1, y: 1 } });
  const p2 = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 4 } }); // parked in the only doorway

  const blocked = blockedTilesFor([p1, p2], p1);
  const avoided = findPath(map, p1.x, p1.y, 1, 6, blocked);
  const fallback = findPathAvoiding(map, p1.x, p1.y, 1, 6, blocked);

  report("test2: strictly avoiding is impossible here", avoided === null);
  report("test2: findPathAvoiding falls back to the direct route instead of failing", !!fallback);
}

// --- Test 3: adjacentWalkable prefers a free side of a target over a blocked closer one ---
{
  const map = buildMap(MAP);
  // Target tile (4,2) has neighbors (3,2) and (5,2), both walkable and equidistant
  // from a cook approaching at (4,0); block the one adjacentWalkable would pick first.
  const teammate = { x: 4, y: 1 };
  const blocked = new Set([`${teammate.x},${teammate.y}`]);

  const stand = adjacentWalkable(map, 4, 2, 4, 0, blocked);
  report(
    "test3: picks an unblocked neighbor over the teammate's tile",
    stand && !(stand.x === teammate.x && stand.y === teammate.y),
    JSON.stringify(stand),
  );
}

// --- Test 4: dynamic re-routing mid-walk as the teammate steps into the path ---
{
  const map = buildMap(MAP);
  const p1 = createPlayer({ id: "p1", index: 0, spawn: { x: 1, y: 2 } });
  const p2 = createPlayer({ id: "p2", index: 1, spawn: { x: 6, y: 2 } });

  p1.path = findPath(map, p1.x, p1.y, 7, 2); // clear straight line at commit time
  const straightLine = p1.path.map((t) => `${t.x},${t.y}`).join("|");

  p2.x = 4;
  p2.y = 2; // teammate steps onto the middle of p1's route before p1 gets there

  reroutePaths([p1, p2], map);
  const rerouted = p1.path.map((t) => `${t.x},${t.y}`).join("|");

  report("test4: the path actually changed once blocked", rerouted !== straightLine, rerouted);
  report(
    "test4: the new path avoids the teammate's tile",
    !p1.path.some((t) => t.x === p2.x && t.y === p2.y),
    rerouted,
  );
  report("test4: the destination is unchanged", p1.path[p1.path.length - 1].x === 7 && p1.path[p1.path.length - 1].y === 2);
}

console.log(process.exitCode ? "\nSome checks failed." : "\nAll checks passed.");
