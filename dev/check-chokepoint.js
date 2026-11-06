/**
 * Chokepoint behavior: honest blocked-route notes, the step-aside escape hatch
 * (without it a cook in a corridor has no way to yield — "wait" keeps blocking
 * the corridor), and the collision guidance in the state message.
 *
 *   node dev/check-chokepoint.js
 */
import { buildMap, getCell } from "../src/game/map.js";
import { createPlayer } from "../src/game/player.js";
import { legalActions, describeActions } from "../src/game/agent-actions.js";
import { buildStateMessage } from "../src/game/llm-prompt.js";

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? "ok  " : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
}

// Single corridor tile (2,2) is the only link between the two rooms.
const BOTTLENECK = `#####
#...#
##.##
#...#
#.C.#
#####`;

// Two routes down to the counter, so blocking one just forces a detour.
const TWO_ROUTES = `#####
#...#
#.#.#
#...#
##C##
#####`;

// --- teammate parked on the only route ---
{
  const map = buildMap(BOTTLENECK);
  getCell(map, 2, 4).item = "plate";
  const llm = createPlayer({ id: "p1", index: 0, spawn: { x: 2, y: 1 }, controller: "llm" });
  const mate = createPlayer({ id: "p2", index: 1, spawn: { x: 2, y: 2 }, controller: "llm" });
  const game = { map, tick: 0, score: 0, players: [llm, mate] };
  const actions = legalActions(game, llm, mate);
  const pickup = actions.find((a) => a.kind === "pickup");
  check("blocked pickup is still offered", Boolean(pickup));
  check("pickup is flagged blocked with no detour", pickup?.blocked === true && pickup?.noDetour === true);
  check("action list warns it is the only route", describeActions(actions).includes("only route"));
  const aside = actions.find((a) => a.kind === "move");
  check("step-aside action offered", Boolean(aside));
  check("step-aside tile is not the corridor tile", aside && !(aside.x === 2 && aside.y === 2));
}

// --- detour exists: honest steps and softer note ---
{
  const map = buildMap(TWO_ROUTES);
  getCell(map, 2, 4).item = "plate";
  const llm = createPlayer({ id: "p1", index: 0, spawn: { x: 1, y: 1 }, controller: "llm" });
  const mate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 }, controller: "llm" });
  const game = { map, tick: 0, score: 0, players: [llm, mate] };
  const actions = legalActions(game, llm, mate);
  const pickup = actions.find((a) => a.kind === "pickup");
  check("detour case flagged blocked but not no-detour", pickup?.blocked === true && pickup?.noDetour === false);
  check("steps reflect the actual detour", pickup?.steps === 5, `steps=${pickup?.steps}`);
  check("note says the path detours", describeActions(actions).includes("detours around your teammate"));
}

// --- adjacent face-off with an idle teammate offers step-aside too ---
{
  const map = buildMap(BOTTLENECK);
  const llm = createPlayer({ id: "p1", index: 0, spawn: { x: 2, y: 2 }, controller: "llm" });
  const mate = createPlayer({ id: "p2", index: 1, spawn: { x: 2, y: 1 }, controller: "llm" });
  const game = { map, tick: 0, score: 0, players: [llm, mate] };
  const actions = legalActions(game, llm, mate);
  const aside = actions.find((a) => a.kind === "move");
  check("face-off in corridor offers step aside", Boolean(aside));
  check(
    "step-aside target actually clears the corridor",
    aside && aside.y >= 3,
    aside ? `target (${aside.x},${aside.y})` : "none",
  );
}

// --- collision guidance in the state message ---
{
  const map = buildMap(BOTTLENECK);
  const llm = createPlayer({ id: "p1", index: 0, spawn: { x: 2, y: 1 }, controller: "llm" });
  const mate = createPlayer({ id: "p2", index: 1, spawn: { x: 2, y: 2 }, controller: "llm" });
  const game = { map, tick: 10, score: 0, players: [llm, mate] };
  const actions = legalActions(game, llm, mate, { collided: true });
  const msg = buildStateMessage({
    game,
    player: llm,
    teammate: mate,
    phase: null,
    actions,
    lastTurn: null,
    collision: { x: 2, y: 2 },
    collisionStreak: 3,
  });
  check("collision message names the yield rule", msg.includes("sorts later alphabetically"));
  check("collision message forbids repeating the choice", msg.includes("Do not repeat your last choice"));
  check("repeat collisions escalate", msg.includes("collided 3 times in a row"));
}

console.log(failures ? `\n${failures} failed.` : "\nAll checks passed.");
if (failures) process.exitCode = 1;
