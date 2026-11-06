/** Sanity-checks the restricted action space across held-item and tile states. */
import { buildMap, getCell } from "../src/game/map.js";
import { legalActions, describeActions } from "../src/game/agent-actions.js";
import { createPlayer } from "../src/game/player.js";

const MAP = `#########
#T.C.B.L#
#.......#
#X.....D#
#########`;

function scenario(name, { held, setup = () => {}, at = { x: 4, y: 2 }, teammateAt = null }) {
  const map = buildMap(MAP);
  setup(map);
  const p = createPlayer({ id: "p1", index: 0, spawn: at });
  p.item = held;
  const teammate = teammateAt ? createPlayer({ id: "p2", index: 1, spawn: teammateAt }) : null;
  const players = teammate ? [p, teammate] : [p];
  const actions = legalActions({ map, tick: 0, score: 0, players }, p, teammate);
  console.log(`\n${name} (holding ${held ?? "nothing"}):`);
  for (const a of actions.slice(1)) console.log(`   ${a.kind.padEnd(14)} (${a.x},${a.y}) ${a.label}`);
  if (actions.length === 1) console.log("   (only wait)");
  return actions;
}

scenario("empty hands, empty kitchen", { held: null });
scenario("holding raw tomato", { held: "tomato" });
scenario("holding chopped tomato", { held: "tomato_cut" });
scenario("holding plate", { held: "plate" });
scenario("holding finished salad", { held: "tomato_salad" });

scenario("empty hands, plate sits on counter", {
  held: null,
  setup: (m) => { getCell(m, 3, 1).item = "plate"; },
});
scenario("holding chopped tomato, plate on counter", {
  held: "tomato_cut",
  setup: (m) => { getCell(m, 3, 1).item = "plate"; },
});
scenario("empty hands, board part-chopped", {
  held: null,
  setup: (m) => { const c = getCell(m, 5, 1); c.item = "tomato"; c.cutProgress = 1.5; },
});
scenario("empty hands, board finished", {
  held: null,
  setup: (m) => { const c = getCell(m, 5, 1); c.item = "tomato"; c.cutProgress = 3; },
});
scenario("holding raw tomato, board part-chopped (no-op expected)", {
  held: "tomato",
  setup: (m) => { const c = getCell(m, 5, 1); c.item = "tomato"; c.cutProgress = 1.5; },
});
scenario("walled off in a closet", {
  held: null,
  at: { x: 1, y: 2 },
  setup: (m) => { getCell(m, 2, 2).type = "wall"; getCell(m, 1, 1).type = "wall"; getCell(m, 1, 3).type = "wall"; },
});

console.log("\n--- stand-tile action rendering ---");
const withMate = scenario("empty hands, with teammate", {
  held: null,
  at: { x: 4, y: 2 },
  teammateAt: { x: 1, y: 2 },
});
console.log("\ndescribeActions() rendering:\n" + describeActions(withMate));
const take = withMate.find((a) => a.kind === "take");
console.log(`stand tile on take action: (${take?.standX},${take?.standY}) steps=${take?.steps}`);

console.log("\n--- teammate currently blocking the only route ---");
// A single-tile bottleneck at (2,2) is the only way from the top room to the
// counter below — parking the teammate right on it should flag the action as
// blocked (but still offer it: they may well move on before this cook arrives).
const BOTTLENECK_MAP = `#####
#...#
##.##
#...#
#.C.#
#####`;
{
  const map = buildMap(BOTTLENECK_MAP);
  getCell(map, 2, 4).item = "plate";
  const p = createPlayer({ id: "p1", index: 0, spawn: { x: 1, y: 1 } });
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 2, y: 2 } });
  const actions = legalActions({ map, tick: 0, score: 0, players: [p, teammate] }, p, teammate);
  const pickup = actions.find((a) => a.kind === "pickup");
  console.log(`blocked flag set: ${pickup?.blocked === true}`);
  console.log(describeActions(actions.filter((a) => a.kind !== "wait")));
}
{
  // Sanity check: same bottleneck, but teammate stands off to the side in the
  // open room where they don't sit on the only route — should not be flagged.
  const map = buildMap(BOTTLENECK_MAP);
  getCell(map, 2, 4).item = "plate";
  const p = createPlayer({ id: "p1", index: 0, spawn: { x: 1, y: 1 } });
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 3, y: 1 } });
  const actions = legalActions({ map, tick: 0, score: 0, players: [p, teammate] }, p, teammate);
  const pickup = actions.find((a) => a.kind === "pickup");
  console.log(`false positive check — blocked should be false: ${pickup?.blocked === false}`);
}
