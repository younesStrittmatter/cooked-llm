/**
 * Sanity-checks the computed pipeline readout for common cooperation gaps.
 *
 *   node dev/check-pipeline.js
 */
import { buildMap } from "../src/game/map.js";
import { createPlayer } from "../src/game/player.js";
import { buildPipelineSummary } from "../src/game/pipeline-summary.js";

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

function summary(playerOverrides, teammateOverrides) {
  const map = buildMap(MAP);
  const player = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 } });
  Object.assign(player, playerOverrides);
  const teammate = createPlayer({ id: "p2", index: 1, spawn: { x: 5, y: 2 }, walkSpeed: 2 });
  Object.assign(teammate, teammateOverrides);
  const game = { map, tick: 0, score: 0, players: [player, teammate] };
  return buildPipelineSummary(game, player, teammate);
}

{
  const text = summary({}, { pendingInteract: { x: 1, y: 1, actionKind: "take" }, path: [{ x: 3, y: 2 }] });
  check("flags duplicate fetch when teammate is already getting a tomato", text.includes("already fetching a vegetable"));
}

{
  const text = summary({}, { x: 5, y: 2, item: null });
  check("flags missing raw veg when teammate is near boards empty-handed", text.includes("set up to chop but no raw vegetable"));
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
if (failures) process.exitCode = 1;
