/**
 * Sanity-checks the wording of the per-turn state message: grammar, teammate
 * intent, redundant last-click suppression, live maps, and stand-tile action
 * wording (no "closer" comparisons).
 *
 *   node dev/check-prompt-text.js
 */
import { buildMap, getCell } from "../src/game/map.js";
import { createPlayer } from "../src/game/player.js";
import { legalActions } from "../src/game/agent-actions.js";
import { buildStateMessage } from "../src/game/llm-prompt.js";

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? "ok  " : "FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!cond) failures++;
}

const MAP = `#########
#T.C.B.L#
#.......#
#X.....D#
#########`;

function message(playerOverrides, teammateOverrides, setup = () => {}) {
  const map = buildMap(MAP);
  setup(map);
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 } });
  Object.assign(player, playerOverrides);
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 } });
  Object.assign(teammate, teammateOverrides);
  const game = { map, tick: 500, score: 0, players: [player, teammate] };
  const actions = legalActions(game, player, teammate);
  return { msg: buildStateMessage({ game, player, teammate, phase: null, actions, lastTurn: null }), actions };
}

// --- grammar ---
{
  const { msg } = message({}, {});
  check('uses "You are", not "You is"', msg.includes("You are at (4,2)"), msg.match(/You .*/)?.[0]);
  check('uses "Your teammate is"', msg.includes("Your teammate is at (1,2)"));
}

// --- third-person intent for a teammate walking to interact ---
{
  const { msg } = message(
    {},
    {
      item: "tomato",
      pendingInteract: { x: 5, y: 1, actionKind: "chop" },
      path: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 4, y: 2 },
        { x: 5, y: 2 },
      ],
    },
  );
  check(
    "describes the teammate's walk with what they'll actually do",
    msg.includes("walking to (5,1) to start chopping their tomato"),
    msg.match(/Your teammate is.*/)?.[0],
  );
  check("does not show a teammate-destination map", !/Where your teammate will stand/.test(msg));
}

{
  const { msg } = message(
    {},
    {
      item: null,
      pendingInteract: { x: 3, y: 1, actionKind: "pickup" },
      path: [
        { x: 3, y: 2 },
        { x: 3, y: 1 },
      ],
    },
    (map) => {
      getCell(map, 3, 1).item = "plate";
    },
  );
  check("still produces a sane fallback when the target's state moved on", msg.includes("(3,1)"));
}

// --- redundant "last clicked" suppression ---
{
  const { msg } = message(
    {},
    {
      item: "tomato",
      pendingInteract: { x: 5, y: 1, actionKind: "chop" },
      path: [
        { x: 5, y: 2 },
        { x: 5, y: 1 },
      ],
      lastClick: { x: 5, y: 1, tileType: "cuttingBoard", target: "cutting board", tick: 480 },
    },
  );
  check(
    'suppresses "last clicked" when it just repeats the current walk target',
    !msg.includes("last clicked"),
    msg.match(/Your teammate.*/g)?.join(" | "),
  );
}

{
  const { msg } = message(
    {},
    {
      item: null,
      lastClick: { x: 1, y: 1, tileType: "dispenser", target: "tomato dispenser", tick: 450 },
    },
  );
  check(
    'keeps "last clicked" when it differs from the current focus (now standing still)',
    msg.includes("last clicked the tomato dispenser at (1,1)"),
  );
}

// --- spatial prompt shape ---
{
  const { msg, actions } = message({ item: "tomato" }, {});
  check("includes live kitchen-now map", msg.includes("Kitchen right now"));
  check("does not paint action numbers onto the map", !/Where you would end up/.test(msg));
  check("does not use closer-than comparisons", !/closer/.test(msg));
  const chop = actions.find((a) => a.kind === "chop");
  check("chop actions carry a stand tile", Boolean(chop?.standX != null && chop?.standY != null));
  check(
    "action list names the stand tile",
    Boolean(chop && msg.includes(`you'd stand at (${chop.standX},${chop.standY})`)),
  );
}

// --- idle teammate note in state message ---
{
  const map = buildMap(MAP);
  const player = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 }, controller: "llm" });
  const teammate = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, controller: "human" });
  teammate.pendingInteract = { x: 1, y: 1, actionKind: "take" };
  teammate.path = [{ x: 2, y: 2 }];
  const game = { map, tick: 0, score: 0, players: [teammate, player] };
  const actions = legalActions(game, player, teammate);
  const busyMsg = buildStateMessage({ game, player, teammate, phase: null, actions, lastTurn: null });
  check("includes busy teammate note", busyMsg.includes("# Teammate is busy"));

  teammate.path = [];
  teammate.pendingInteract = null;
  const idleMsg = buildStateMessage({ game, player, teammate, phase: null, actions, lastTurn: null });
  check("includes idle teammate note", idleMsg.includes("# Teammate is idle"));
  check("does not include pipeline readout", !idleMsg.includes("# Pipeline readout"));
}

// --- premature plate pickup warns in action list ---
{
  const map = buildMap(MAP);
  getCell(map, 3, 1).item = "plate";
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 } });
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 } });
  const game = { map, tick: 0, score: 0, players: [player, teammate] };
  const actions = legalActions(game, player, teammate);
  const pickup = actions.find((a) => a.kind === "pickup");
  check(
    "warns on premature plate pickup when nothing is chopped",
    Boolean(pickup?.label.includes("nothing chopped is ready")),
  );
}

// --- picking back up what you just put down warns in the action list ---
{
  const map = buildMap(MAP);
  getCell(map, 3, 1).item = "tomato_cut";
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 } });
  player.lastPlaced = { x: 3, y: 1, item: "tomato_cut", tick: 60 };
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 } });
  const game = { map, tick: 100, score: 0, players: [player, teammate] };
  const actions = legalActions(game, player, teammate);
  const pickup = actions.find((a) => a.kind === "pickup");
  check(
    "warns when picking back up what you just placed",
    Boolean(pickup?.label.includes("undoes your own work")),
  );
}

// --- but a freshly assembled salad is meant to be picked up ---
{
  const map = buildMap(MAP);
  getCell(map, 3, 1).item = "tomato_salad";
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 } });
  player.lastPlaced = { x: 3, y: 1, item: "tomato_salad", tick: 60 };
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 } });
  const game = { map, tick: 100, score: 0, players: [player, teammate] };
  const actions = legalActions(game, player, teammate);
  const pickup = actions.find((a) => a.kind === "pickup");
  check("salad pickup carries no self-placed warning", Boolean(pickup) && !pickup.label.includes("undoes your own work"));
}

// --- per-turn speed comparison and time-costed walks ---
{
  const map = buildMap(MAP);
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, walkSpeed: 0.05, cutSpeed: 2 });
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 }, walkSpeed: 0.15, cutSpeed: 1 });
  const game = { map, tick: 0, score: 0, players: [player, teammate] };
  const actions = legalActions(game, player, teammate);
  const msg = buildStateMessage({ game, player, teammate, phase: null, actions, lastTurn: null });
  check("speed check line present every turn", msg.includes("Speed check:"));
  check("slow cook told long trips are cheaper for teammate", msg.includes("cheaper for THEM"));
  check("fast chopper told boards are their job", msg.includes("boards are your job"));
  check("walk costs are shown in seconds", /≈[\d.]+s at your speed/.test(msg));
}

// --- salad on a counter: the slow cook is warned to leave it for the runner ---
{
  const map = buildMap(MAP);
  getCell(map, 3, 1).item = "tomato_salad";
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, walkSpeed: 0.05 });
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 }, walkSpeed: 0.15 });
  const game = { map, tick: 0, score: 0, players: [player, teammate] };
  const actions = legalActions(game, player, teammate);
  const pickup = actions.find((a) => a.kind === "pickup");
  check("slow cook warned to leave the salad for the faster runner", Boolean(pickup?.label.includes("faster runner")));
}

// --- re-placing an item you just took off a counter is flagged as shuffling ---
{
  const map = buildMap(MAP);
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 } });
  player.item = "plate";
  player.lastTaken = { x: 3, y: 1, item: "plate", tick: 80 };
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 } });
  const game = { map, tick: 100, score: 0, players: [player, teammate] };
  const actions = legalActions(game, player, teammate);
  const place = actions.find((a) => a.kind === "place");
  check("re-placing a just-taken item flagged as shuffling", Boolean(place?.label.includes("just shuffling")));
}

// --- counter swaps carry a standing caution ---
{
  const map = buildMap(MAP);
  getCell(map, 3, 1).item = "plate";
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 } });
  player.item = "tomato";
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 } });
  const game = { map, tick: 0, score: 0, players: [player, teammate] };
  const actions = legalActions(game, player, teammate);
  const swap = actions.find((a) => a.kind === "swap_counter");
  check("swap warns it is usually shuffling", Boolean(swap?.label.includes("otherwise it is just shuffling")));
}

// --- the warning expires once the placement is old news ---
{
  const map = buildMap(MAP);
  getCell(map, 3, 1).item = "tomato_cut";
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 } });
  player.lastPlaced = { x: 3, y: 1, item: "tomato_cut", tick: 60 };
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 } });
  const game = { map, tick: 600, score: 0, players: [player, teammate] };
  const actions = legalActions(game, player, teammate);
  const pickup = actions.find((a) => a.kind === "pickup");
  check("self-placed warning expires with time", Boolean(pickup) && !pickup.label.includes("undoes your own work"));
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
if (failures) process.exitCode = 1;
