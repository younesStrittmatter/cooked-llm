/**
 * Sanity-checks the personality schedule end to end: the "@seconds" text parser,
 * and LlmAgent actually swapping its extraInstructions (and rebuilding the
 * kitchen block) at the right time, and replaying the same schedule fresh on a
 * restart. No network calls — `request()` is stubbed.
 *
 *   node dev/check-instructions.js
 */
import { parseInstructionSchedule } from "../src/game/instruction-schedule.js";
import { LlmAgent } from "../src/game/llm-agent.js";
import { buildMap, findSpawnTiles } from "../src/game/map.js";
import { createPlayer } from "../src/game/player.js";
import { DEFAULT_MAP } from "../shared/game-defaults.js";

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? "ok  " : "FAIL"} — ${label}`);
  if (!cond) failures++;
}

// --- parser ---

const parsed = parseInstructionSchedule(
  "ignored preamble\n@90\nBe faster.\nStop double-checking.\n\n@30\nStart cooperative.\n",
);
check("parses two blocks", parsed.length === 2);
check("sorts by atSeconds ascending", parsed[0]?.atSeconds === 30 && parsed[1]?.atSeconds === 90);
check("keeps multi-line block text, trimmed", parsed[0]?.text === "Start cooperative.");
check("drops text before the first @ line", !parsed.some((b) => b.text.includes("ignored preamble")));
check("empty input parses to []", parseInstructionSchedule("").length === 0);
check("text with no @ markers parses to []", parseInstructionSchedule("just some text").length === 0);

// --- LlmAgent scheduling (no network: request() is stubbed) ---

const map = buildMap(DEFAULT_MAP);
const [spawnA, spawnB] = findSpawnTiles(map, 2);
const p1 = createPlayer({ id: "p1", index: 0, spawn: spawnA });
const p2 = createPlayer({ id: "p2", index: 1, spawn: spawnB });
const game = {
  map,
  tick: 0,
  paused: false,
  players: [p1, p2],
  getPlayer(id) {
    return this.players.find((p) => p.id === id) ?? null;
  },
  handleClick() {},
};

const changes = [];
const agent = new LlmAgent({
  game,
  playerId: "p1",
  config: { model: "stub", decisionCooldownMs: 100000, maxTokens: 200 },
  extraInstructions: "Base personality.",
  instructionSchedule: "@0.2\nSwitched personality.",
  onInstructionsChange: (change) => changes.push(change),
});
// Real network calls aren't needed to test scheduling — only tickSchedule() and
// the kitchen-block rebuild matter here.
agent.request = async () => ({ text: '"reasoning":"stub","action":0}', usage: {}, latencyMs: 0, model: "stub" });

check("starts with the base personality", agent.extraInstructions === "Base personality.");
check("kitchen block is not built until start()/refreshKitchen()", agent.kitchenBlock == null);

agent.start();
check("kitchen block is built on start()", agent.kitchenBlock.includes("Base personality."));

await new Promise((r) => setTimeout(r, 400));
check("personality switched after its scheduled time", agent.extraInstructions === "Switched personality.");
check("kitchen block was rebuilt with the new text", agent.kitchenBlock.includes("Switched personality."));
check("onInstructionsChange fired exactly once", changes.length === 1);
check("the change reports the right player and time", changes[0]?.playerId === "p1" && changes[0]?.atSeconds === 0.2);

agent.stop();
agent.start();
check("restarting replays the schedule from the base personality", agent.extraInstructions === "Base personality.");

agent.stop();

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
