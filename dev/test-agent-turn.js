/**
 * Plays a whole round headlessly against the local /api/llm endpoint, so the
 * action list, prompt, caching and reply parsing can be checked without a browser.
 *
 *   node dev/test-agent-turn.js [maxDecisions] [baseUrl]
 */
import { buildMap, findSpawnTiles, getCell, TILES } from "../src/game/map.js";
import { findPath, adjacentWalkable } from "../src/game/pathfind.js";
import { legalActions } from "../src/game/agent-actions.js";
import { buildKitchenBlock, buildStateMessage, RULES_TEXT } from "../src/game/llm-prompt.js";
import { JSON_PREFILL, parseDecision } from "../src/game/llm-agent.js";
import { createPlayer, isBusy } from "../src/game/player.js";
import { interactCuttingBoard, tickCutting } from "../src/game/cutting-board.js";
import { interactCounter } from "../src/game/counter.js";
import { interactDispenser } from "../src/game/dispenser.js";
import { interactTrash } from "../src/game/trash.js";
import { interactDelivery } from "../src/game/delivery.js";
import { DEFAULT_MAP } from "../shared/game-defaults.js";

const maxDecisions = Number(process.argv[2]) || 12;
const base = process.argv[3] || "http://localhost:8789";

/** Minimal headless stand-in for Game: same tick logic, no canvas or renderer. */
const map = buildMap(DEFAULT_MAP);
const spawns = findSpawnTiles(map, 2);
const me = createPlayer({ id: "p1", index: 0, controller: "llm", spawn: spawns[0] });
const mate = createPlayer({ id: "p2", index: 1, controller: "human", spawn: spawns[1] });
const game = { map, tick: 0, score: 0, paused: false, players: [me, mate] };

function click(player, x, y) {
  const cell = getCell(map, x, y);
  const tile = TILES[cell.type];
  if (tile.walkable) {
    player.path = findPath(map, player.x, player.y, x, y) ?? [];
    return;
  }
  const stand = adjacentWalkable(map, x, y, player.x, player.y);
  if (!stand) return;
  player.pendingInteract = { x, y };
  player.path = findPath(map, player.x, player.y, stand.x, stand.y) ?? [];
}

function interact(player, x, y) {
  const cell = getCell(map, x, y);
  const kind = TILES[cell.type].interact;
  if (kind === "exchange") interactCounter(player, cell);
  if (kind === "pickup") interactDispenser(player, cell);
  if (kind === "trash") interactTrash(player);
  if (kind === "cut") interactCuttingBoard(player, cell, game.players);
  if (kind === "deliver" && interactDelivery(player)) {
    game.score++;
    console.log(`    *** DELIVERED — score ${game.score} ***`);
  }
}

function step() {
  game.tick++;
  tickCutting(me, map, getCell);
  if (me.path.length > 0) {
    me.walkProgress += me.walkSpeed;
    while (me.walkProgress >= 1 && me.path.length > 0) {
      const next = me.path[0];
      if (next.x === mate.x && next.y === mate.y) {
        me.path = [];
        me.pendingInteract = null;
        me.walkProgress = 0;
        me.collidedWith = { x: next.x, y: next.y };
        console.log(`    (collided with teammate at (${next.x},${next.y}) — stopping short)`);
        return;
      }
      me.walkProgress -= 1;
      me.path.shift();
      me.x = next.x;
      me.y = next.y;
    }
    if (me.path.length === 0 && me.pendingInteract) {
      interact(me, me.pendingInteract.x, me.pendingInteract.y);
      me.pendingInteract = null;
    }
    return;
  }
  me.walkProgress = 0;
  if (me.pendingInteract) {
    interact(me, me.pendingInteract.x, me.pendingInteract.y);
    me.pendingInteract = null;
  }
}

const kitchen = buildKitchenBlock({
  map,
  player: me,
  teammate: mate,
  extraInstructions: "",
});

const estimate = (t) => Math.round(t.length / 3.7);
console.log(
  `prompt sizes — rules ≈${estimate(RULES_TEXT)} tok, kitchen ≈${estimate(kitchen)} tok, ` +
    `cached prefix ≈${estimate(RULES_TEXT + kitchen)} tok\n`,
);

let lastTurn = null;
let problems = 0;
let cacheWrites = 0;
let cacheReads = 0;

for (let decision = 1; decision <= maxDecisions; decision++) {
  // Advance the simulation until the cook has finished its previous action.
  let guard = 0;
  while (isBusy(me) && guard++ < 400) step();

  const collision = me.collidedWith;
  me.collidedWith = null;

  const actions = legalActions(game, me, mate);
  if (actions.length <= 1) {
    console.log("no useful actions available — stopping");
    break;
  }

  const state = buildStateMessage({
    game,
    player: me,
    teammate: mate,
    phase: { label: "Scored round", scored: true, secondsLeft: 180 },
    actions,
    lastTurn,
    collision,
  });

  const res = await fetch(`${base}/api/llm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      maxTokens: 300,
      system: [
        { text: RULES_TEXT, cache: true },
        { text: kitchen, cache: true },
      ],
      // Deliberately stateless — see the comment on LlmAgent.decide() for why.
      messages: [{ role: "user", content: state }, { role: "assistant", content: JSON_PREFILL }],
      stopSequences: ["}"],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(`decision ${decision} failed:`, data.error);
    break;
  }

  const replyText = JSON_PREFILL + data.text;
  const parsed = parseDecision(replyText);
  const chosen = actions.find((a) => a.index === parsed.actionIndex);
  const u = data.usage;

  cacheWrites += u.cacheCreationInputTokens ?? 0;
  cacheReads += u.cacheReadInputTokens ?? 0;

  if (!chosen) {
    problems++;
    console.log(`${decision}. INVALID choice ${parsed.actionIndex} (of ${actions.length - 1} offered)`);
  } else {
    console.log(
      `${decision}. [${actions.length - 1} options] ${chosen.label}` +
        ` — "${parsed.reasoning}" | ${data.latencyMs}ms | in ${u.inputTokens} out ${u.outputTokens}` +
        ` cacheWrite ${u.cacheCreationInputTokens} cacheRead ${u.cacheReadInputTokens}`,
    );
    if (chosen.kind !== "wait") click(me, chosen.x, chosen.y);
  }

  lastTurn = chosen ? `${chosen.index}. ${chosen.label}` : `nothing valid`;
}

console.log(
  `\nfinal score: ${game.score} | invalid choices: ${problems} | ` +
    `total cache write ${cacheWrites} tok, cache read ${cacheReads} tok`,
);
