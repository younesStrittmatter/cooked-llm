/**
 * When the teammate is idle, chop-pipeline actions are still OFFERED to the LLM
 * cook — hard-filtering them deadlocked two LLM cooks, since decisions only
 * happen while idle ("teammate idle" ⇒ both idle) — but they carry an advisory
 * note telling the cook to take them only if at least as close. Filters that
 * only fire while the teammate is busy (redundant fetch, same destination)
 * still omit actions outright.
 *
 *   node dev/check-teammate-defer.js
 */
import { buildMap, getCell } from "../src/game/map.js";
import { createPlayer } from "../src/game/player.js";
import { legalActions } from "../src/game/agent-actions.js";

const MAP = `#########
#T.C.B.L#
#.......#
#X.....D#
#########`;

const DEFER_NOTE = "take it only if you are at least as close";

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "ok  " : "FAIL"} — ${label}`);
  if (!cond) failures++;
}

function llmVsMate(mateController, llmHeld = null, mateHeld = null) {
  const map = buildMap(MAP);
  const mate = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, controller: mateController });
  mate.item = mateHeld;
  const llm = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 }, controller: "llm" });
  llm.item = llmHeld;
  const game = { map, tick: 0, score: 0, players: [mate, llm] };
  return { game, map, mate, llm, actions: legalActions(game, llm, mate) };
}

for (const mate of ["human", "llm"]) {
  const { actions } = llmVsMate(mate);
  const takeTomato = actions.find((a) => a.kind === "take" && a.label.includes("tomato"));
  check(`${mate} idle + empty kitchen: first tomato fetch ok`, Boolean(takeTomato));
  check(`${mate} idle + empty kitchen: first fetch carries no defer note`, takeTomato && !takeTomato.label.includes(DEFER_NOTE));
}

{
  const map = buildMap(MAP);
  getCell(map, 3, 1).item = "tomato";
  const mate = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, controller: "llm" });
  const llm = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 }, controller: "llm" });
  const actions = legalActions({ map, tick: 0, score: 0, players: [mate, llm] }, llm, mate);
  const takeTomato = actions.find((a) => a.kind === "take" && a.label.includes("tomato"));
  const pickupTomato = actions.find((a) => a.kind === "pickup" && a.label.includes("tomato"));
  check("raw staged, both idle: take tomato still offered (no deadlock)", Boolean(takeTomato));
  check("raw staged, both idle: take tomato carries defer note", takeTomato?.label.includes(DEFER_NOTE));
  check("raw staged, both idle: counter pickup still offered (no deadlock)", Boolean(pickupTomato));
  check("raw staged, both idle: counter pickup carries defer note", pickupTomato?.label.includes(DEFER_NOTE));
}

{
  const { actions } = llmVsMate("llm", "tomato");
  const chop = actions.find((a) => a.kind === "chop");
  const place = actions.find((a) => a.kind === "place");
  check("llm holding tomato, mate idle: chop still offered (no deadlock)", Boolean(chop));
  check("llm holding tomato, mate idle: chop carries defer note", chop?.label.includes(DEFER_NOTE));
  check("llm holding tomato, mate idle: place suggests the handoff option", place?.label.includes("leave it here for your teammate"));
}

{
  const { actions } = llmVsMate("llm");
  const wait = actions.find((a) => a.kind === "wait");
  check("both idle: wait label warns against mutual waiting", wait?.label.includes("BOTH idle"));
}

{
  // Teammate already walking to the tomato dispenser, nothing raw anywhere:
  // the duplicate fetch stays filtered (teammate is busy, so no deadlock risk).
  const map = buildMap(MAP);
  const mate = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, controller: "llm" });
  mate.pendingInteract = { x: 1, y: 1, actionKind: "take" };
  const llm = createPlayer({ id: "p2", index: 1, spawn: { x: 6, y: 2 }, controller: "llm" });
  const actions = legalActions({ map, tick: 0, score: 0, players: [mate, llm] }, llm, mate);
  check("mate fetching tomato: duplicate fetch filtered", !actions.some((a) => a.kind === "take" && a.label.includes("tomato")));
}

{
  // Teammate walking to a counter: actions at that exact tile stay filtered.
  const map = buildMap(MAP);
  const mate = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, controller: "llm" });
  mate.pendingInteract = { x: 3, y: 1, actionKind: "place" };
  const llm = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 }, controller: "llm" });
  llm.item = "tomato";
  const actions = legalActions({ map, tick: 0, score: 0, players: [mate, llm] }, llm, mate);
  check("mate heading to counter: no action targets that tile", !actions.some((a) => a.x === 3 && a.y === 1));
}

{
  const map = buildMap(MAP);
  const human = createPlayer({ id: "p1", index: 0, spawn: { x: 4, y: 2 }, controller: "human" });
  human.item = "tomato";
  const llm = createPlayer({ id: "p2", index: 1, spawn: { x: 1, y: 2 }, controller: "llm" });
  const actions = legalActions({ map, tick: 0, score: 0, players: [human, llm] }, human, llm);
  const chop = actions.find((a) => a.kind === "chop");
  check("human player still gets chop", Boolean(chop));
  check("human player's labels carry no defer note", !chop?.label.includes(DEFER_NOTE));
}

console.log(failures ? `\n${failures} failed.` : "\nAll checks passed.");
if (failures) process.exitCode = 1;
