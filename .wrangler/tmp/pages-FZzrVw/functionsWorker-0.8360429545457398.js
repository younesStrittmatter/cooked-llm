var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/admin/check.js
async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!env.ADMIN_PASSWORD) {
    return Response.json({ ok: false, error: "ADMIN_PASSWORD not configured" }, { status: 500 });
  }
  const ok = typeof body.password === "string" && body.password === env.ADMIN_PASSWORD;
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}
__name(onRequestPost, "onRequestPost");

// ../shared/api-auth.js
function isAuthorized(request, env) {
  const key = request.headers.get("x-admin-key") || "";
  return Boolean(env.ADMIN_PASSWORD) && key === env.ADMIN_PASSWORD;
}
__name(isAuthorized, "isAuthorized");
function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
__name(unauthorized, "unauthorized");
function noStorage() {
  return Response.json(
    { error: "Storage not configured (MAPS_KV binding missing)" },
    { status: 500 }
  );
}
__name(noStorage, "noStorage");
async function readJson(request) {
  try {
    return { body: await request.json() };
  } catch {
    return { error: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  }
}
__name(readJson, "readJson");

// api/maps/[name].js
async function onRequestGet({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ error: "Not found" }, { status: 404 });
  const name = decodeURIComponent(params.name);
  const raw = await env.MAPS_KV.get(`map:${name}`);
  if (!raw) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const record = JSON.parse(raw);
    return Response.json({ name, ...record });
  } catch {
    return Response.json({ error: "Corrupt map data" }, { status: 500 });
  }
}
__name(onRequestGet, "onRequestGet");
async function onRequestDelete({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();
  const name = decodeURIComponent(params.name);
  await env.MAPS_KV.delete(`map:${name}`);
  return Response.json({ deleted: name });
}
__name(onRequestDelete, "onRequestDelete");

// api/prompts/[name].js
async function onRequestGet2({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ error: "Not found" }, { status: 404 });
  const name = decodeURIComponent(params.name);
  const raw = await env.MAPS_KV.get(`prompt:${name}`);
  if (!raw) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const record = JSON.parse(raw);
    return Response.json({ name, ...record });
  } catch {
    return Response.json({ error: "Corrupt prompt data" }, { status: 500 });
  }
}
__name(onRequestGet2, "onRequestGet");
async function onRequestDelete2({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();
  const name = decodeURIComponent(params.name);
  await env.MAPS_KV.delete(`prompt:${name}`);
  return Response.json({ deleted: name });
}
__name(onRequestDelete2, "onRequestDelete");

// api/sessions/[key].js
var PREFIX = "session:";
function resolveKey(params) {
  const raw = decodeURIComponent(params.key ?? "");
  return raw.startsWith(PREFIX) ? raw : `${PREFIX}${raw}`;
}
__name(resolveKey, "resolveKey");
async function onRequestGet3({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ error: "Storage not configured" }, { status: 500 });
  const raw = await env.MAPS_KV.get(resolveKey(params));
  if (!raw) return Response.json({ error: "Session not found" }, { status: 404 });
  return new Response(raw, { headers: { "content-type": "application/json" } });
}
__name(onRequestGet3, "onRequestGet");
async function onRequestDelete3({ request, env, params }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ error: "Storage not configured" }, { status: 500 });
  await env.MAPS_KV.delete(resolveKey(params));
  return Response.json({ ok: true });
}
__name(onRequestDelete3, "onRequestDelete");

// ../src/game/map-symbols.js
var MAP_SYMBOLS = [
  { char: ".", name: "floor" },
  { char: "#", name: "wall" },
  { char: "C", name: "counter" },
  { char: "B", name: "cutting board" },
  { char: "T", name: "tomato dispenser" },
  { char: "P", name: "pumpkin dispenser" },
  { char: "L", name: "plate dispenser" },
  { char: "X", name: "trash" },
  { char: "D", name: "delivery" }
];
var DISPENSE_ITEMS = {
  T: "tomato",
  P: "pumpkin",
  L: "plate"
};
function symbolByChar(char) {
  const entry = MAP_SYMBOLS.find((s) => s.char === char);
  if (!entry) return null;
  const dispenseItem = DISPENSE_ITEMS[char];
  return {
    char: entry.char,
    type: typeForChar(char),
    name: entry.name,
    dispenseItem
  };
}
__name(symbolByChar, "symbolByChar");
function typeForChar(char) {
  if (char === ".") return "floor";
  if (char === "#") return "wall";
  if (char === "C") return "counter";
  if (char === "B") return "cuttingBoard";
  if (char === "X") return "trash";
  if (char === "D") return "delivery";
  if (char in DISPENSE_ITEMS) return "dispenser";
  return "floor";
}
__name(typeForChar, "typeForChar");

// ../src/game/map.js
function buildMap(text2) {
  const layout = text2.trimEnd();
  const rows = layout.split("\n");
  const width = Math.max(...rows.map((row) => row.length));
  const height = rows.length;
  const cells = rows.map(
    (row, y) => [...row.padEnd(width, ".")].map((char, x) => {
      const sym = symbolByChar(char);
      const type = sym?.type ?? "floor";
      const cell = { x, y, type, item: null, cutProgress: 0 };
      if (sym?.dispenseItem) {
        cell.dispenseItem = sym.dispenseItem;
      }
      return cell;
    })
  );
  return { width, height, cells };
}
__name(buildMap, "buildMap");

// ../shared/game-defaults.js
var DEFAULT_MAP = `###############
#T......C....P#
#L....X.......#
#....B........#
#.............#
#...C..D..C...#
#.............#
#.............#
###############`;
var DEFAULT_COLORS = {
  hat: "#ffffff",
  apron: "#0040ff",
  hair: "#ffc500",
  mustache: "#5a3a1a",
  skin: "#e3a691"
};
var DEFAULT_COLORS_P2 = {
  hat: "#ffffff",
  apron: "#c62828",
  hair: "#4a2c12",
  mustache: "#2b1a0a",
  skin: "#c98d6b"
};
var CONTROLLERS = ["human", "llm", "none"];
var DEFAULT_PLAYERS = [
  {
    id: "p1",
    controller: "human",
    colors: DEFAULT_COLORS,
    walkSpeed: 1,
    cutSpeed: 1,
    // Both are per-player: each Claude cook can be given its own personality,
    // and optionally have it change mid-round — see instruction-schedule.js.
    extraInstructions: "",
    instructionScheduleText: ""
  },
  {
    id: "p2",
    controller: "llm",
    colors: DEFAULT_COLORS_P2,
    walkSpeed: 1,
    cutSpeed: 1,
    extraInstructions: "",
    instructionScheduleText: ""
  }
];
var DEFAULT_LLM = {
  model: "claude-haiku-4-5-20251001",
  /**
   * Minimum pause after one action completes before the next decision is
   * requested. Agents are driven by the cook finishing its action, not by a
   * clock, so this only throttles back-to-back decisions.
   */
  decisionCooldownMs: 400,
  maxTokens: 512,
  /**
   * When false, the model is asked only for `{"action": N}` — much less output
   * (and usually lower latency) than asking it to write reasoning first.
   */
  includeReasoning: false,
  /** Name of the saved rules prompt in the library, if any. */
  promptName: "",
  /** Full rules block sent as cached system prompt block 1. Empty → built-in default. */
  rulesText: ""
};
var DEFAULT_PHASES = {
  /** Practice round — points do not count. 0 disables it. */
  trainSeconds: 60,
  /** Scored round. 0 disables it. */
  gameSeconds: 180,
  /** Optional open-ended round the player ends with a Stop button. */
  freePlay: false
};

// ../src/game/llm-rules.js
var DEFAULT_RULES_TEXT = `# Cooked \u2014 cooperative kitchen game

You control one cook in a top-down, tile-based kitchen. Your teammate controls
the other cook. You score as a team: every delivered salad is one point, no
matter who delivers it. Each turn, pick the one action that gets the TEAM the
most salads \u2014 not the one that keeps you personally busy.

## The salad pipeline

Every salad takes these steps, in this order:

1. Take a raw tomato from a tomato dispenser.
2. Put it on a cutting board and chop until finished. Chopping only advances
   while a cook is standing next to that board.
3. Take a plate from a plate dispenser.
4. Combine the finished chopped tomato and the plate on a counter (place one
   onto the other). The salad stays on that counter.
5. Carry the salad to the delivery window. That scores the point.

Raw vegetables never combine with plates \u2014 only finished chopped ones do.
The steps can be split between the two cooks in any way; splitting them well
is usually how you win.

## The kitchen grid

The kitchen is a rectangular grid. Coordinates are (x,y): x grows rightward,
y grows downward, (0,0) is the top-left tile. Symbols:

${MAP_SYMBOLS.map((s) => `- "${s.char}" \u2014 ${s.name}`).join("\n")}
- "Y" \u2014 you
- "M" \u2014 your teammate

Walkability is absolute:

- "." is the only tile a cook can stand on or walk through.
- Every other symbol is solid. You use a machine while standing on an
  orthogonally adjacent "." tile (up/down/left/right, not diagonal).
- Two cooks can never share a tile. Walking into your teammate stops you one
  tile short, and you are immediately asked to decide again.

The empty layout is given once in the kitchen block. Every turn you also get a
live map with Y and M on it \u2014 trust the live map for where the two cooks are.

## How turns work

Each turn you get a numbered list of every action currently available, and you
answer with one number. Your cook then walks there and does it on its own. You
are asked again when it finishes, when it bumps into your teammate, or when
the plan goes stale mid-walk (the target tile changed, or your teammate will
get there first) \u2014 stale plans are cancelled automatically and you are told why.

About the list:

- Each non-wait action names the machine tile, how many walk steps away it is
  for you right now, and the exact "." tile you would end up standing on.
- The list is sorted roughly most-useful-first, but it cannot see your team
  plan \u2014 you judge.
- The list changes every turn. Read it fresh; numbers do not carry over.

You can hold at most ONE item:

- Dispensers are only offered while your hands are empty.
- While holding an item you cannot take another until you place, combine,
  deliver, or trash it.
- An item on a counter is safe and available to BOTH cooks. Do not pick
  something up until your NEXT action actually uses it \u2014 carrying a plate
  around "for later" freezes you and starves the pipeline.
- Never take back an item you yourself just set down (one exception: picking
  up a salad to deliver it). Moving an item from counter to counter scores
  nothing \u2014 if you catch yourself shuffling items around, stop and do a
  pipeline step instead.

## Machines

- Dispenser (tomato / pumpkin / plate): infinite; puts one item into your
  empty hands.
- Cutting board: holding a raw vegetable with the board free, you place it and
  start chopping. Empty-handed at a part-chopped item, you resume chopping.
  Empty-handed at a finished item, you pick it up. Chopping pauses the moment
  the chopping cook steps away, and either cook can resume it empty-handed.
  Only one cook can chop at a given board at a time.
- Counter: place, pick up, or swap items. A chopped vegetable meeting a plate
  on a counter combines into a salad, which stays on the counter.
- Trash: destroys what you hold.
- Delivery window: accepts finished salads only; delivering scores the point.

## How to pick your action

Go down this list and take the FIRST step that applies \u2014 unless your teammate
is already walking to do exactly that step (then take the next one):

1. Holding a salad? Get it delivered \u2014 by the right cook. If you are the
   faster walker, or your teammate is busy, or the window is near: deliver it
   yourself. If your teammate is the clearly faster runner and free, put the
   salad on a counter they can reach and go start the next tomato instead.
2. Can a chopped tomato and a plate be combined right now? Combine them.
3. A board holds a finished chopped tomato? Collect it (and combine with a
   staged plate).
4. A board holds a part-chopped vegetable that nobody is chopping? Resume it.
5. Holding a raw vegetable? Chop it \u2014 or, if your teammate is clearly better
   placed to chop, put it on a counter within their easy reach.
6. Is the pipeline missing an input? Fetch the missing tomato or plate and
   stage it on a counter near where it will be used \u2014 not in your hands.
7. Everything above is claimed or impossible? Wait.

"Missing an input" means: count what exists anywhere (hands, counters,
boards). At any moment the team ideally has one tomato being chopped AND a
plate already staged for it, with the next tomato on the way.

Before ANY counter pickup, name the action you will do with that item
immediately afterwards (combine it, chop it, deliver it). If you have no
answer, leave it on the counter \u2014 it is already exactly where both of you
can use it.

## Working together

Every turn you see where your teammate stands, what they hold, and what they
are walking toward. Infer their current job from that \u2014 not from a fixed role.

Division of labor comes from geometry and speed, and differs per kitchen:

- If one cook is much faster, or spawns near the dispensers, that cook runs
  fetching and delivering (courier) while the other stays near the boards to
  chop and combine (chef). A courier drops items on counters near the chef
  rather than carrying them into the chef's lane.
- If the kitchen is small and everything is close, roles are a waste \u2014 both
  cooks run full salads in parallel, using different boards and counters and
  staying out of each other's path.
- Counters are the handoff mechanism: a counter reachable from both sides lets
  one cook load it from one side and the other unload from the other side,
  saving whole trips. Prefer handing off across such a counter to walking
  around the kitchen.

Never duplicate: if your teammate is already walking to fetch, chop, or
deliver something, do the step BEFORE or AFTER theirs instead \u2014 stage what
they will need next, or position yourself to use what they are producing.

Delivering is courier work. A finished salad does not care who carries it,
so the cook with the faster walk (or the freer hands) runs it in while the
other starts the next salad. Check the speed line every turn: a trip that
costs you 10 seconds may cost your teammate 3. The same goes for dispenser
runs \u2014 the slow cook doing a long fetch while the fast cook chops is almost
always the wrong assignment.

## When to wait \u2014 and when waiting is wrong

Waiting is right only when BOTH are true:

- every useful step is already claimed by your teammate's current walk or
  chop, and
- your best contribution is to stay put (you are next to where the next item
  lands, or moving would jam a corridor).

Waiting is wrong whenever a pipeline step is unclaimed. In particular:

- If you and your teammate are BOTH standing idle, waiting is forbidden \u2014 one
  of you must move. Take the highest-priority unclaimed step if you are at
  least as close to it as your teammate; skip it only if they are strictly
  better placed. A wasted duplicate costs half a second; two cooks waiting
  for each other is the worst outcome in the game.
- "Acting" means a real pipeline step. Shuffling items between counters is
  NOT acting \u2014 if every non-wait option is a pointless pickup, place, or
  swap, waiting is the productive choice after all.
- "They will probably do it" is not a claim. Only their actual walk target,
  shown to you every turn, claims a step.

A deliberate wait when you ARE the stay-put cook is still valuable: if your
faster teammate should make the long fetch, do local work or hold your station
rather than undoing the split with a cross-kitchen run.

## Blocking and giving way

Before committing, glance at the live map:

- Do not park on the only "." tile adjacent to a board or counter your
  teammate needs, or inside a one-tile corridor they must pass through.
- An action may note that your teammate is on your route. If a detour exists,
  your cook takes it automatically. If they are on the ONLY route, choosing
  that action just walks you up to them and stops \u2014 pick it only if you
  expect them to move away.

When you actually bump into your teammate (you are told when this happens),
NEVER simply repeat your previous choice \u2014 it will end exactly the same way.
Either they are mid-walk and a single wait clears the path, or you are
blocking each other and one of you must give way:

- The cook with the LONGER remaining trip gives way, using the "step aside"
  action that appears in the list when this situation arises.
- If that is unclear or tied, the cook whose id sorts later alphabetically
  gives way. Never both: one yields, the other proceeds.
- After stepping aside, wait for them to pass before resuming your plan.

If no step-aside action is offered, you are cornered \u2014 wait and let your
teammate route around or clear the way.

## Your reply format

Reply with a single JSON object and nothing else. No prose before or after it,
no markdown fences. The exact shape (whether a "reasoning" field is required)
is given in the kitchen block for this session \u2014 follow that. "action" must be
one of the numbers offered on the current turn.
`;

// ../shared/config.js
var HEX = /^#[0-9a-f]{6}$/i;
function num(value, fallback, { min = 0, max = Infinity } = {}) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
__name(num, "num");
function colors(raw, fallback) {
  const out = { ...fallback };
  if (!raw || typeof raw !== "object") return out;
  for (const part of Object.keys(fallback)) {
    if (HEX.test(raw[part])) out[part] = raw[part];
  }
  return out;
}
__name(colors, "colors");
function controller(raw, fallback) {
  return CONTROLLERS.includes(raw) ? raw : fallback;
}
__name(controller, "controller");
function text(raw, fallback, maxLength = 8e3) {
  return typeof raw === "string" ? raw.slice(0, maxLength) : fallback;
}
__name(text, "text");
function players(raw, legacy) {
  const list = Array.isArray(raw) ? raw : [];
  return DEFAULT_PLAYERS.map((base, i) => {
    const given = list[i] ?? {};
    const fallbackColors = i === 0 ? colors(legacy.colors, base.colors) : base.colors;
    const fallbackWalk = i === 0 ? legacy.walkSpeed ?? base.walkSpeed : base.walkSpeed;
    const fallbackCut = i === 0 ? legacy.cutSpeed ?? base.cutSpeed : base.cutSpeed;
    const fallbackInstructions = legacy.extraInstructions ?? base.extraInstructions;
    return {
      id: base.id,
      controller: controller(given.controller, base.controller),
      colors: colors(given.colors, fallbackColors),
      walkSpeed: num(given.walkSpeed, fallbackWalk, { min: 0.05, max: 10 }),
      cutSpeed: num(given.cutSpeed, fallbackCut, { min: 0.05, max: 10 }),
      // Free text, sent to Claude as-is: this cook's baseline personality, and
      // (optionally) a "@seconds" schedule of later changes to it — see
      // src/game/instruction-schedule.js for the format.
      extraInstructions: text(given.extraInstructions, fallbackInstructions),
      instructionScheduleText: text(given.instructionScheduleText, base.instructionScheduleText)
    };
  });
}
__name(players, "players");
function normalizeConfig(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    mapName: typeof src.mapName === "string" ? src.mapName : "",
    mapText: typeof src.mapText === "string" && src.mapText.trim() ? src.mapText : DEFAULT_MAP,
    // Walk/cut speed and extra instructions are per-player; these top-level
    // fields only exist so a config saved before that support can still seed
    // player one's values.
    players: players(src.players, {
      colors: src.colors,
      walkSpeed: src.walkSpeed,
      cutSpeed: src.cutSpeed,
      extraInstructions: src.llm?.extraInstructions
    }),
    llm: {
      model: typeof src.llm?.model === "string" && src.llm.model ? src.llm.model : DEFAULT_LLM.model,
      decisionCooldownMs: num(src.llm?.decisionCooldownMs, DEFAULT_LLM.decisionCooldownMs, {
        min: 0,
        max: 3e4
      }),
      maxTokens: num(src.llm?.maxTokens, DEFAULT_LLM.maxTokens, { min: 64, max: 4096 }),
      includeReasoning: Boolean(src.llm?.includeReasoning ?? DEFAULT_LLM.includeReasoning),
      promptName: typeof src.llm?.promptName === "string" ? src.llm.promptName.slice(0, 120) : "",
      rulesText: text(src.llm?.rulesText, "", 64e3) || DEFAULT_RULES_TEXT
    },
    phases: {
      trainSeconds: Math.round(num(src.phases?.trainSeconds, DEFAULT_PHASES.trainSeconds, { max: 7200 })),
      gameSeconds: Math.round(num(src.phases?.gameSeconds, DEFAULT_PHASES.gameSeconds, { max: 7200 })),
      freePlay: Boolean(src.phases?.freePlay ?? DEFAULT_PHASES.freePlay)
    },
    publishedAt: typeof src.publishedAt === "string" ? src.publishedAt : null
  };
}
__name(normalizeConfig, "normalizeConfig");

// api/config.js
var ACTIVE_KEY = "active";
async function onRequestGet4({ env }) {
  if (!env.MAPS_KV) return Response.json(normalizeConfig());
  const raw = await env.MAPS_KV.get(ACTIVE_KEY);
  if (!raw) return Response.json(normalizeConfig());
  try {
    return Response.json(normalizeConfig(JSON.parse(raw)));
  } catch {
    return Response.json(normalizeConfig());
  }
}
__name(onRequestGet4, "onRequestGet");
async function onRequestPost2({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();
  const { body, error } = await readJson(request);
  if (error) return error;
  const config = normalizeConfig(body);
  try {
    buildMap(config.mapText);
  } catch (err) {
    return Response.json({ error: `Invalid map: ${err.message}` }, { status: 400 });
  }
  if (!config.players.some((p) => p.controller !== "none")) {
    return Response.json({ error: "At least one cook must be enabled" }, { status: 400 });
  }
  if (config.phases.trainSeconds === 0 && config.phases.gameSeconds === 0 && !config.phases.freePlay) {
    return Response.json(
      { error: "Enable at least one phase: practice, scored round or free play" },
      { status: 400 }
    );
  }
  config.publishedAt = (/* @__PURE__ */ new Date()).toISOString();
  await env.MAPS_KV.put(ACTIVE_KEY, JSON.stringify(config));
  return Response.json(config);
}
__name(onRequestPost2, "onRequestPost");

// api/llm.js
var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var DEFAULT_MODEL = "claude-haiku-4-5-20251001";
function buildSystem(blocks) {
  const flagged = blocks.filter((b) => b.cache).slice(-4);
  return blocks.map((block) => {
    const out = { type: "text", text: block.text };
    if (flagged.includes(block)) out.cache_control = { type: "ephemeral" };
    return out;
  });
}
__name(buildSystem, "buildSystem");
function normalizeBlocks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((b) => b && typeof b.text === "string" && b.text.trim()).map((b) => ({ text: b.text, cache: Boolean(b.cache) }));
}
__name(normalizeBlocks, "normalizeBlocks");
function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m) => m && typeof m.content === "string" && m.content.trim()).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
}
__name(normalizeMessages, "normalizeMessages");
async function onRequestPost3({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }
  const system = buildSystem(normalizeBlocks(body.system));
  let messages = normalizeMessages(body.messages);
  if (messages.length === 0 && typeof body.prompt === "string" && body.prompt.trim()) {
    messages = [{ role: "user", content: body.prompt.trim() }];
  }
  if (messages.length === 0) {
    return Response.json({ error: "messages or prompt is required" }, { status: 400 });
  }
  const model = body.model || env.CLAUDE_MODEL || DEFAULT_MODEL;
  const maxTokens = Math.min(4096, Math.max(64, Number(body.maxTokens) || 512));
  const payload = { model, max_tokens: maxTokens, messages };
  if (system.length) payload.system = system;
  if (typeof body.temperature === "number") payload.temperature = body.temperature;
  if (Array.isArray(body.stopSequences)) {
    const stops = body.stopSequences.filter((s) => typeof s === "string" && s).slice(0, 4);
    if (stops.length) payload.stop_sequences = stops;
  }
  const started = Date.now();
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    return Response.json({ error: `upstream request failed: ${err.message}` }, { status: 502 });
  }
  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: res.status });
  }
  const data = await res.json();
  let text2 = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "";
  const usage = data.usage ?? {};
  if (data.stop_reason === "stop_sequence" && typeof data.stop_sequence === "string") {
    text2 += data.stop_sequence;
  }
  return Response.json({
    text: text2,
    model: data.model ?? model,
    latencyMs: Date.now() - started,
    stopReason: data.stop_reason ?? null,
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0
    }
  });
}
__name(onRequestPost3, "onRequestPost");

// api/maps/index.js
function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}
__name(normalizeName, "normalizeName");
async function onRequestGet5({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ maps: [] });
  const list = await env.MAPS_KV.list({ prefix: "map:" });
  const maps = [];
  for (const key of list.keys) {
    const raw = await env.MAPS_KV.get(key.name);
    if (!raw) continue;
    try {
      const { savedAt } = JSON.parse(raw);
      maps.push({ name: key.name.slice("map:".length), savedAt });
    } catch {
    }
  }
  maps.sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ maps });
}
__name(onRequestGet5, "onRequestGet");
async function onRequestPost4({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();
  const { body, error } = await readJson(request);
  if (error) return error;
  const name = normalizeName(body.name);
  if (!name) {
    return Response.json({ error: "Map name is required" }, { status: 400 });
  }
  const text2 = String(body.text ?? "");
  try {
    buildMap(text2);
  } catch (err) {
    return Response.json({ error: `Invalid map: ${err.message}` }, { status: 400 });
  }
  const record = { text: text2.trimEnd(), savedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await env.MAPS_KV.put(`map:${name}`, JSON.stringify(record));
  return Response.json({ name, ...record });
}
__name(onRequestPost4, "onRequestPost");

// api/prompts/index.js
function normalizeName2(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}
__name(normalizeName2, "normalizeName");
async function onRequestGet6({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ prompts: [] });
  const list = await env.MAPS_KV.list({ prefix: "prompt:" });
  const prompts = [];
  for (const key of list.keys) {
    const raw = await env.MAPS_KV.get(key.name);
    if (!raw) continue;
    try {
      const { savedAt } = JSON.parse(raw);
      prompts.push({ name: key.name.slice("prompt:".length), savedAt });
    } catch {
    }
  }
  prompts.sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ prompts });
}
__name(onRequestGet6, "onRequestGet");
async function onRequestPost5({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return noStorage();
  const { body, error } = await readJson(request);
  if (error) return error;
  const name = normalizeName2(body.name);
  if (!name) {
    return Response.json({ error: "Prompt name is required" }, { status: 400 });
  }
  const text2 = String(body.text ?? "").trim();
  if (text2.length < 80) {
    return Response.json({ error: "Prompt text is too short" }, { status: 400 });
  }
  const record = { text: text2, savedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await env.MAPS_KV.put(`prompt:${name}`, JSON.stringify(record));
  return Response.json({ name, ...record });
}
__name(onRequestPost5, "onRequestPost");

// api/sessions/index.js
var PREFIX2 = "session:";
var MAX_BYTES = 10 * 1024 * 1024;
function sessionKey(startedAt, id) {
  return `${PREFIX2}${startedAt}_${id}`;
}
__name(sessionKey, "sessionKey");
async function onRequestPost6({ request, env }) {
  if (!env.MAPS_KV) return noStorage();
  const { body, error } = await readJson(request);
  if (error) return error;
  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_BYTES) {
    return Response.json({ error: "Session log too large" }, { status: 413 });
  }
  if (!Array.isArray(body.events)) {
    return Response.json({ error: "events array is required" }, { status: 400 });
  }
  const id = String(body.sessionId ?? crypto.randomUUID()).slice(0, 64);
  const startedAt = typeof body.startedAt === "string" ? body.startedAt : (/* @__PURE__ */ new Date()).toISOString();
  const record = { ...body, sessionId: id, startedAt, receivedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await env.MAPS_KV.put(sessionKey(startedAt, id), JSON.stringify(record));
  return Response.json({ ok: true, id });
}
__name(onRequestPost6, "onRequestPost");
async function onRequestGet7({ request, env }) {
  if (!isAuthorized(request, env)) return unauthorized();
  if (!env.MAPS_KV) return Response.json({ sessions: [] });
  const list = await env.MAPS_KV.list({ prefix: PREFIX2 });
  const sessions = [];
  for (const key of list.keys) {
    const raw = await env.MAPS_KV.get(key.name);
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      sessions.push({
        key: key.name,
        sessionId: data.sessionId,
        startedAt: data.startedAt,
        endedAt: data.endedAt ?? null,
        mapName: data.mapName ?? null,
        players: data.players ?? [],
        phaseResults: data.phaseResults ?? [],
        scoredTotal: data.scoredTotal ?? 0,
        eventCount: data.eventCount ?? (data.events?.length ?? 0),
        llmUsage: data.llmUsage ?? {}
      });
    } catch {
    }
  }
  sessions.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return Response.json({ sessions });
}
__name(onRequestGet7, "onRequestGet");

// ../.wrangler/tmp/pages-FZzrVw/functionsRoutes-0.24786197347224592.mjs
var routes = [
  {
    routePath: "/api/admin/check",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/maps/:name",
    mountPath: "/api/maps",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/maps/:name",
    mountPath: "/api/maps",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/prompts/:name",
    mountPath: "/api/prompts",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete2]
  },
  {
    routePath: "/api/prompts/:name",
    mountPath: "/api/prompts",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/sessions/:key",
    mountPath: "/api/sessions",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete3]
  },
  {
    routePath: "/api/sessions/:key",
    mountPath: "/api/sessions",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/config",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/config",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/llm",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/maps",
    mountPath: "/api/maps",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/maps",
    mountPath: "/api/maps",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/prompts",
    mountPath: "/api/prompts",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/prompts",
    mountPath: "/api/prompts",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/sessions",
    mountPath: "/api/sessions",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/api/sessions",
    mountPath: "/api/sessions",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
