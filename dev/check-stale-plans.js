/**
 * Exercises the stale-plan revalidation logic — both the reactive case
 * (something changed underfoot) and the anticipatory case (teammate is about
 * to get there first) — and that it only ever touches LLM-controlled cooks,
 * never humans.
 *
 * Can't import Game itself here: it pulls in Renderer -> cook.js, which does
 * `new Image()` at module scope and only runs in a browser. Instead this
 * copies the four small, DOM-free methods verbatim from game.js so the exact
 * production logic runs — if you change revalidatePlans()/etaTicks()/
 * invalidatePlan()/teammateOf() in game.js, mirror the change here too.
 */
import { getCell, buildMap } from "../src/game/map.js";
import { createPlayer } from "../src/game/player.js";
import { actionsForCell } from "../src/game/agent-actions.js";

const MAP = `#########
#T.C.B.L#
#.......#
#X.....D#
#########`;

// --- verbatim copies of Game's DOM-free methods (see src/game/game.js) ---

function teammateOf(player) {
  return this.players.find((p) => p !== player) ?? null;
}

function etaTicks(player) {
  if (player.path.length === 0) return 0;
  const remaining = player.path.length - player.walkProgress;
  return player.walkSpeed > 0 ? remaining / player.walkSpeed : Infinity;
}

function revalidatePlans() {
  for (const player of this.players) {
    if (player.controller !== "llm") continue;

    const pending = player.pendingInteract;
    if (!pending) continue;

    const cell = getCell(this.map, pending.x, pending.y);
    if (!cell) continue;

    const teammate = this.teammateOf(player);
    const currentKind = actionsForCell(cell, player.item, teammate)[0]?.kind ?? null;

    if (currentKind !== pending.actionKind) {
      this.invalidatePlan(player, pending, "the situation there changed");
      continue;
    }

    const contested = cell.type === "counter" || cell.type === "cuttingBoard";
    const raceLoss =
      contested &&
      teammate?.pendingInteract &&
      teammate.pendingInteract.x === pending.x &&
      teammate.pendingInteract.y === pending.y &&
      this.etaTicks(teammate) <= this.etaTicks(player);

    if (raceLoss) {
      this.invalidatePlan(player, pending, "your teammate is about to get there first");
    }
  }
}

function invalidatePlan(player, pending, reason) {
  player.path = [];
  player.pendingInteract = null;
  player.walkProgress = 0;
  player.staleTarget = { x: pending.x, y: pending.y, reason };
  this.emit({ type: "plan-stale", playerId: player.id, x: pending.x, y: pending.y, reason });
}

function makeFakeGame(players) {
  const map = buildMap(MAP);
  const events = [];
  return {
    map,
    players,
    tick: 0,
    events,
    emit(event) {
      events.push(event);
    },
    teammateOf,
    etaTicks,
    revalidatePlans,
    invalidatePlan,
  };
}

/** Queues a walk-and-interact exactly like Game.handleClick would, without the pathfinding. */
function queueInteract(game, player, x, y, { pathLength = 0 } = {}) {
  const cell = getCell(game.map, x, y);
  const teammate = game.teammateOf(player);
  const actionKind = actionsForCell(cell, player.item, teammate)[0]?.kind ?? null;
  player.pendingInteract = { x, y, actionKind };
  player.path = Array.from({ length: pathLength }, () => ({ x, y }));
  return actionKind;
}

function report(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) process.exitCode = 1;
}

// --- Test 1: reactive invalidation — the plate gets picked up before p1 arrives ---
{
  const p1 = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, controller: "llm" });
  const game = makeFakeGame([p1]);
  getCell(game.map, 3, 1).item = "plate";

  const kind = queueInteract(game, p1, 3, 1, { pathLength: 3 });
  report("test1 setup: pickup queued", kind === "pickup", `kind=${kind}`);

  getCell(game.map, 3, 1).item = null; // someone else took it
  game.revalidatePlans();

  report("test1: plan cancelled", p1.pendingInteract === null && p1.path.length === 0);
  report(
    "test1: staleTarget set with reactive reason",
    p1.staleTarget?.reason === "the situation there changed",
    JSON.stringify(p1.staleTarget),
  );
  report("test1: plan-stale event emitted", game.events.some((e) => e.type === "plan-stale"));
}

// --- Test 2: anticipation — teammate is closer to the same board, nothing changed yet ---
{
  const p1 = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, walkSpeed: 1, controller: "llm" });
  const p2 = createPlayer({ id: "p2", index: 1, spawn: { x: 4, y: 1 }, walkSpeed: 1, controller: "llm" });
  const game = makeFakeGame([p1, p2]);
  const board = getCell(game.map, 5, 1);
  board.item = "tomato";
  board.cutProgress = 1.5; // part-chopped, unattended

  queueInteract(game, p1, 5, 1, { pathLength: 6 }); // far
  queueInteract(game, p2, 5, 1, { pathLength: 1 }); // close, arrives first

  game.revalidatePlans();

  report(
    "test2: far cook's plan cancelled early (anticipation)",
    p1.pendingInteract === null && p1.staleTarget?.reason === "your teammate is about to get there first",
    JSON.stringify(p1.staleTarget),
  );
  report("test2: near cook's plan left alone", p2.pendingInteract !== null && p2.staleTarget === null);
}

// --- Test 3: no false positive — both cooks race for the same *dispenser* ---
{
  const p1 = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, walkSpeed: 1, controller: "llm" });
  const p2 = createPlayer({ id: "p2", index: 1, spawn: { x: 2, y: 1 }, walkSpeed: 1, controller: "llm" });
  const game = makeFakeGame([p1, p2]);

  queueInteract(game, p1, 1, 1, { pathLength: 6 }); // far from the tomato dispenser
  queueInteract(game, p2, 1, 1, { pathLength: 1 }); // close, arrives first

  game.revalidatePlans();

  report(
    "test3: dispensers are never contested",
    p1.pendingInteract !== null && p2.pendingInteract !== null,
    `p1=${JSON.stringify(p1.staleTarget)} p2=${JSON.stringify(p2.staleTarget)}`,
  );
}

// --- Test 4: unaffected plan survives revalidation untouched ---
{
  const p1 = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, controller: "llm" });
  const game = makeFakeGame([p1]);
  getCell(game.map, 3, 1).item = "plate";

  queueInteract(game, p1, 3, 1, { pathLength: 3 });
  game.revalidatePlans();

  report("test4: untouched plan survives", p1.pendingInteract !== null && p1.staleTarget === null);
}

// --- Test 5: humans are exempt — same setup as test 1, but a human plan rides it out ---
{
  const p1 = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, controller: "human" });
  const game = makeFakeGame([p1]);
  getCell(game.map, 3, 1).item = "plate";

  queueInteract(game, p1, 3, 1, { pathLength: 3 });
  getCell(game.map, 3, 1).item = null; // someone else took it — would invalidate an LLM's plan
  game.revalidatePlans();

  report(
    "test5: a human's plan is left alone even though the target changed underfoot",
    p1.pendingInteract !== null && p1.path.length === 3 && p1.staleTarget === null,
  );
  report("test5: no plan-stale event was emitted for the human", !game.events.some((e) => e.type === "plan-stale"));
}

console.log(process.exitCode ? "\nSome checks failed." : "\nAll checks passed.");
