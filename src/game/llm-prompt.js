import { getCell } from "./map.js";
import { MAP_SYMBOLS } from "./map-symbols.js";
import { isCutDone, cutStage } from "./cutting.js";
import { itemName } from "./items.js";
import { describeActivity, destination, isBusy } from "./player.js";
import { describeActions } from "./agent-actions.js";
import { DEFAULT_RULES_TEXT, RULES_TEXT } from "./llm-rules.js";

export function resolveRulesText(config) {
  const text = config?.llm?.rulesText;
  return typeof text === "string" && text.trim() ? text : DEFAULT_RULES_TEXT;
}

const CHAR_BY_TYPE = {
  floor: ".",
  wall: "#",
  counter: "C",
  cuttingBoard: "B",
  trash: "X",
  delivery: "D",
};

const MAP_LEGEND = [
  `.  walkable floor — the ONLY tiles a cook can stand on or walk through`,
  `#  wall — not walkable`,
  `C  counter — not walkable; use from an adjacent .`,
  `B  cutting board — not walkable; use from an adjacent .`,
  `T/P/L  tomato / pumpkin / plate dispenser — not walkable; use from an adjacent .`,
  `X  trash — not walkable; use from an adjacent .`,
  `D  delivery window — not walkable; use from an adjacent .`,
  `Y  you (on a walkable floor tile)`,
  `M  your teammate (on a walkable floor tile)`,
].join("\n");

function charForCell(cell) {
  if (cell.type === "dispenser" && cell.dispenseItem) {
    const sym = MAP_SYMBOLS.find((s) => s.name === `${cell.dispenseItem} dispenser`);
    if (sym) return sym.char;
  }
  return CHAR_BY_TYPE[cell.type] ?? ".";
}

function asciiMap(map) {
  return map.cells.map((row) => row.map(charForCell).join("")).join("\n");
}

/**
 * Renders the kitchen with overlays on walkable floor tiles only.
 * `marks` is a Map of "x,y" -> single character (Y, M, …).
 * Later marks win when two claim the same tile.
 */
function asciiMapWithMarks(map, marks) {
  return map.cells
    .map((row) =>
      row
        .map((cell) => {
          const key = `${cell.x},${cell.y}`;
          const mark = marks.get(key);
          if (mark && cell.type === "floor") return mark;
          return charForCell(cell);
        })
        .join(""),
    )
    .join("\n");
}

function tileInventory(map) {
  const groups = { dispenser: [], cuttingBoard: [], counter: [], trash: [], delivery: [] };

  for (const row of map.cells) {
    for (const cell of row) {
      if (!(cell.type in groups)) continue;
      const label =
        cell.type === "dispenser" ? `(${cell.x},${cell.y}) gives ${cell.dispenseItem}` : `(${cell.x},${cell.y})`;
      groups[cell.type].push(label);
    }
  }

  const lines = [];
  if (groups.dispenser.length) lines.push(`Dispensers: ${groups.dispenser.join("; ")}`);
  if (groups.cuttingBoard.length) lines.push(`Cutting boards: ${groups.cuttingBoard.join(", ")}`);
  if (groups.counter.length) lines.push(`Counters: ${groups.counter.join(", ")}`);
  if (groups.trash.length) lines.push(`Trash: ${groups.trash.join(", ")}`);
  if (groups.delivery.length) lines.push(`Delivery windows: ${groups.delivery.join(", ")}`);
  return lines.join("\n");
}

/**
 * One line naming a cook's speed, with an explicit comparison against `compareTo`
 * (e.g. "your teammate" when describing your own speed, or "you" when describing
 * the teammate's).
 */
function speedLine(whose, speed, otherSpeed, compareTo) {
  const sentence = `${whose} walking speed is ${speed.walkSpeed} tiles/tick and chopping speed is ${speed.cutSpeed}x`;
  if (!otherSpeed) return `${sentence}.`;

  if (speed.walkSpeed === otherSpeed.walkSpeed && speed.cutSpeed === otherSpeed.cutSpeed) {
    return `${sentence} — the same as ${compareTo}.`;
  }

  const walkCmp =
    speed.walkSpeed === otherSpeed.walkSpeed
      ? `the same walk as ${compareTo}`
      : speed.walkSpeed > otherSpeed.walkSpeed
        ? `a faster walk than ${compareTo}`
        : `a slower walk than ${compareTo}`;
  const cutCmp =
    speed.cutSpeed === otherSpeed.cutSpeed
      ? "the same chopping speed"
      : speed.cutSpeed > otherSpeed.cutSpeed
        ? "faster chopping"
        : "slower chopping";

  return `${sentence} — that's ${walkCmp}, and ${cutCmp}.`;
}

function replyFormatBlock(includeReasoning) {
  if (includeReasoning) {
    return [
      `# Your reply format`,
      ``,
      `Reply with a single JSON object and nothing else:`,
      `{"reasoning": "<short explanation>", "action": <number from the list>}`,
      ``,
      `- "action" must be one of the numbers offered this turn.`,
      `- In "reasoning", briefly say what job each of you should do given positions`,
      `  and speeds, whether a missing input should be fetched by you or by them,`,
      `  and why this action (including wait) fits that.`,
    ].join("\n");
  }

  return [
    `# Your reply format`,
    ``,
    `Reply with a single JSON object and nothing else — no prose, no "reasoning" field:`,
    `{"action": <number from the list>}`,
    ``,
    `- "action" must be one of the numbers offered this turn.`,
    `- Do not explain your choice. Do not add any other keys.`,
  ].join("\n");
}

/**
 * Kitchen layout and per-session settings. Stable for the whole session, so it is
 * the second prompt-cache breakpoint (after the rules block).
 *
 * `player` and `teammate` only need `{ id, walkSpeed, cutSpeed }` — pass the live
 * player object, or null for teammate when playing solo.
 *
 * `includeReasoning` selects the reply JSON shape (lives here, not in the rules
 * block, so toggling it only rewrites the smaller kitchen cache entry).
 */
export function buildKitchenBlock({ map, player, teammate, extraInstructions, includeReasoning = false }) {
  const parts = [
    `# This kitchen`,
    ``,
    `Grid is ${map.width} tiles wide and ${map.height} tall, so x runs 0..${map.width - 1} and y runs 0..${map.height - 1}.`,
    `y increases downward; (0,0) is the top-left tile.`,
    ``,
    `Symbol legend (same for every map you see):`,
    MAP_LEGEND,
    ``,
    `Static layout (no cooks — empty kitchen geometry only), row by row from y=0:`,
    ``,
    "```",
    asciiMap(map),
    "```",
    ``,
    tileInventory(map),
    ``,
    `# You`,
    ``,
    `You control the cook "${player.id}". Your teammate is "${teammate?.id ?? "nobody — you are alone in the kitchen"}".`,
    speedLine("Your", player, teammate, "your teammate"),
  ];

  if (teammate) {
    parts.push(speedLine("Your teammate's", teammate, player, "you"));
  }

  if (extraInstructions?.trim()) {
    parts.push(
      ``,
      `# Extra instructions from the experimenter`,
      ``,
      `These override the general strategy advice above where they conflict.`,
      ``,
      extraInstructions.trim(),
    );
  }

  parts.push(``, replyFormatBlock(includeReasoning));

  return parts.join("\n");
}

function boardStatus(cell) {
  if (!cell.item) return `(${cell.x},${cell.y}) empty`;
  const progress = cell.cutProgress ?? 0;
  if (isCutDone(progress)) return `(${cell.x},${cell.y}) finished chopped ${cell.item}, ready to pick up`;
  return `(${cell.x},${cell.y}) ${cell.item}, chopping ${cutStage(progress)}/3 done`;
}

/**
 * The tile this player is currently focused on — where they're chopping, or
 * walking to interact with or reach — if any. Used to tell whether "last
 * clicked" would just be repeating the activity line.
 */
function focusTile(player) {
  if (player.activeCut) return player.activeCut;
  const target = destination(player);
  return target ? { x: target.x, y: target.y } : null;
}

function describePlayer(game, player, label, verb, teammate) {
  const activity = describeActivity(player, game.map, getCell, teammate);
  const lines = [
    `${label} ${verb} at (${player.x},${player.y}), holding ${itemName(player.item)}, ${activity}.`,
  ];

  // Skip this when it would just restate the activity line above — e.g. "walking
  // to (0,2) to start chopping" already says everything "last clicked the cutting
  // board at (0,2)" would, redundantly, and just from a different angle.
  const focus = focusTile(player);
  const isRedundant = focus && player.lastClick && focus.x === player.lastClick.x && focus.y === player.lastClick.y;

  if (player.lastClick && !isRedundant) {
    const age = game.tick - player.lastClick.tick;
    lines.push(
      `${label} last clicked the ${player.lastClick.target} at (${player.lastClick.x},${player.lastClick.y}), ${age} ticks ago.`,
    );
  }

  return lines.join("\n");
}

/**
 * One-line, per-turn restatement of the two cooks' relative speeds. The kitchen
 * block already states the raw numbers once, but a small model deciding turn by
 * turn needs the comparison in front of it every time — otherwise "7 steps"
 * reads the same for a slow cook and a fast one.
 */
function speedCheckLine(player, teammate) {
  if (!teammate) return null;

  let walk;
  if (player.walkSpeed === teammate.walkSpeed) {
    walk = "you both walk at the same speed";
  } else if (player.walkSpeed > teammate.walkSpeed) {
    walk = `you walk ${(player.walkSpeed / teammate.walkSpeed).toFixed(1)}x as fast as your teammate — long fetches and deliveries are cheaper for YOU`;
  } else {
    walk = `your teammate walks ${(teammate.walkSpeed / player.walkSpeed).toFixed(1)}x as fast as you — long fetches and deliveries are cheaper for THEM; stay near your station and hand off via counters`;
  }

  const chop =
    player.cutSpeed === teammate.cutSpeed
      ? "equal chopping speed"
      : player.cutSpeed > teammate.cutSpeed
        ? "you chop faster, so boards are your job when there is a choice"
        : "they chop faster, so boards are their job when there is a choice";

  return `Speed check: ${walk}; ${chop}.`;
}

function contents(map, type) {
  const out = [];
  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.type !== type) continue;
      if (type === "cuttingBoard") out.push(boardStatus(cell));
      else if (cell.item) out.push(`(${cell.x},${cell.y}) holds ${itemName(cell.item)}`);
    }
  }
  return out;
}

function fence(title, body) {
  return [`${title}`, "```", body, "```"].join("\n");
}

/**
 * Dynamic turn state, including the action list. Changes every request, so it goes
 * in the messages array, after every cache breakpoint.
 *
 * `collision`, when given, is a one-shot `{x, y}` reported by the game the
 * moment this cook was stopped by walking into its teammate.
 *
 * `staleTarget`, when given, is a one-shot `{x, y, reason}` reported the
 * moment a queued walk-and-interact was cancelled mid-route because the tile
 * it was heading for stopped matching what this cook committed to — either
 * something already changed there, or the teammate is about to get there
 * first (see `Game.revalidatePlans`).
 */
export function buildStateMessage({ game, player, teammate, actions, lastTurn, collision, collisionStreak = 0, staleTarget }) {
  const boards = contents(game.map, "cuttingBoard");
  const counters = contents(game.map, "counter");

  const lines = [`# Your turn`, ``];

  if (collision) {
    lines.push(
      `You just walked into your teammate at (${collision.x},${collision.y}) and had to stop.`,
      `Do not repeat your last choice unchanged — it will end the same way. If they are mid-walk,`,
      `one wait may clear the path. If you are blocking each other, apply the yield rule: the cook`,
      `with the longer remaining trip steps aside (use the step-aside action); if that is unclear`,
      `or tied, the cook whose id sorts later alphabetically steps aside. Never both.`,
      ``,
    );
    if (collisionStreak >= 2) {
      lines.push(
        `You have now collided ${collisionStreak} times in a row. Heading for the same tile again is`,
        `guaranteed to fail — this turn you must do something different: step aside, take a job on`,
        `your own side of the kitchen, or wait.`,
        ``,
      );
    }
  }

  if (staleTarget) {
    lines.push(
      `You were on your way to use (${staleTarget.x},${staleTarget.y}), but ${staleTarget.reason} — so that plan was cancelled and you are being asked again.`,
      ``,
    );
  }

  lines.push(describePlayer(game, player, "You", "are", teammate));
  if (teammate) lines.push(``, describePlayer(game, teammate, "Your teammate", "is", player));

  const speedCheck = speedCheckLine(player, teammate);
  if (speedCheck) lines.push(``, speedCheck);

  // --- live maps ---
  const nowMarks = new Map([[`${player.x},${player.y}`, "Y"]]);
  if (teammate) nowMarks.set(`${teammate.x},${teammate.y}`, "M");

  lines.push(
    ``,
    fence(
      "Kitchen right now (Y = you, M = teammate; only . is walkable):",
      asciiMapWithMarks(game.map, nowMarks),
    ),
  );

  lines.push(``, `Cutting boards: ${boards.length ? boards.join(" | ") : "none in this kitchen"}`);
  lines.push(`Counters with something on them: ${counters.length ? counters.join(" | ") : "all empty"}`);

  if (teammate) {
    if (!isBusy(teammate)) {
      lines.push(
        ``,
        `# Teammate is idle — you are BOTH idle`,
        ``,
        `Your teammate (${teammate.id}) is standing still, and so are you. Someone must act`,
        `now — never wait for each other. Find the highest-priority unclaimed pipeline step:`,
        `if you are at least as close to it (at your speeds), do it yourself. Only if your`,
        `teammate is strictly better placed should you instead do the step before/after`,
        `theirs (e.g. stage their next input on a counter near them).`,
      );
    } else {
      lines.push(
        ``,
        `# Teammate is busy`,
        ``,
        `Your teammate is ${describeActivity(teammate, game.map, getCell, player)}. Do not duplicate`,
        `that job — do the step before or after it: stage the input they will need next, or`,
        `position yourself to use what they are producing. Wait only if every listed action`,
        `would duplicate or block them.`,
      );
    }
  }

  if (lastTurn) {
    lines.push(``, `Last turn you chose: ${lastTurn}`);
  }

  lines.push(
    ``,
    `# Available actions`,
    ``,
    describeActions(actions),
    ``,
    `Reply with the JSON object choosing one of the numbers above.`,
  );

  return lines.join("\n");
}

export { RULES_TEXT, DEFAULT_RULES_TEXT };
