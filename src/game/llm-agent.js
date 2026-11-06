import { buildKitchenBlock, buildStateMessage } from "./llm-prompt.js";
import { DEFAULT_RULES_TEXT } from "./llm-rules.js";
import { legalActions } from "./agent-actions.js";
import { isBusy } from "./player.js";
import { parseInstructionSchedule } from "./instruction-schedule.js";

/** How often we check whether the cook has become idle. */
const WATCH_MS = 100;

/**
 * Safety net: if a cook somehow stays busy this long we ask anyway, so a wedged
 * state can never park an agent forever. Generous, because a slow chop is a
 * legitimately long busy period.
 */
const MAX_BUSY_MS = 60000;

/**
 * How long an explicit (or forced) "wait" lasts before asking again anyway, if
 * nothing on a counter changes first. Applies both when the model deliberately
 * picks "wait" and when the action list offers nothing else at all.
 */
const WAIT_MS = 2000;

/** Forces the reply to start as a JSON object instead of prose. */
export const JSON_PREFILL = "{";

/**
 * Cheap fingerprint of every counter's contents. A cook that is waiting for a
 * handoff cares about counters specifically — that's where items change hands —
 * so this is what wakes a "wait" up early instead of sitting out the full 2s.
 */
function counterSignature(map) {
  let sig = "";
  for (const row of map.cells) {
    for (const cell of row) {
      if (cell.type === "counter") sig += `${cell.item ?? "_"}|`;
    }
  }
  return sig;
}

/**
 * Last-resort extraction for replies that were cut off before the closing brace,
 * or (despite the "}" stop sequence and the "single object" instruction) still
 * contain more than one attempt. Takes the *last* match of each field rather
 * than the first, since a model that talks itself into reconsidering mid-reply
 * means its final stated answer is the one that reflects its actual decision.
 */
function scavengeDecision(text) {
  const actions = [...text.matchAll(/"action"\s*:\s*(-?\d+)/g)];
  const reasonings = [...text.matchAll(/"reasoning"\s*:\s*"([^"]*)"/g)];
  if (!actions.length) return null;
  return {
    reasoning: reasonings.at(-1)?.[1] ?? "",
    actionIndex: Number(actions.at(-1)[1]),
  };
}

/** Reads the chosen action number out of a reply, tolerating prose or truncation. */
export function parseDecision(text) {
  if (!text) return { error: "empty reply" };

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  let parsed = null;
  if (start !== -1 && end > start) {
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    const salvaged = scavengeDecision(text);
    if (salvaged) return salvaged;
    return { error: start === -1 ? "no JSON object in reply" : "malformed JSON in reply" };
  }

  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";
  const actionIndex = Number(parsed.action);
  if (!Number.isInteger(actionIndex)) {
    return { error: '"action" must be an integer from the list', reasoning };
  }

  return { reasoning, actionIndex };
}

/**
 * Drives one cook by offering Claude the actions that are currently possible and
 * carrying out the one it picks.
 *
 * A decision is requested only when the cook is idle — it has finished walking,
 * interacting and chopping — so one request maps to one completed action rather
 * than to a wall-clock interval. Requests never overlap.
 *
 * Each request is a single stateless turn: no conversation history is resent.
 * The static system prompt (rules + kitchen) is cached, but the per-turn user
 * message never is, so every prior turn's tokens would otherwise be paid for in
 * full on every subsequent request — a cost that compounds badly over a round.
 * `buildStateMessage()` already fully describes the current game state, and
 * `lastTurn` carries the one bit of continuity that matters.
 *
 * Each cook's extra instructions (its "personality") are independent, and can
 * optionally change mid-round on a schedule (`tickSchedule()`) — see
 * instruction-schedule.js. Only the kitchen cache block, which is small, gets
 * a fresh cache write when that happens; the much larger rules block is
 * completely unaffected since it never contains per-agent data.
 */
export class LlmAgent {
  /**
   * `extraInstructions` and `instructionSchedule` are per-agent: two agents in
   * the same game can be given entirely different personalities. `instructionSchedule`
   * is either the raw "@seconds" text (see instruction-schedule.js) or an
   * already-parsed array — it's re-parsed and reset every time this cook starts
   * a round, so the same schedule replays from scratch each phase.
   */
  constructor({ game, playerId, config, extraInstructions = "", instructionSchedule, onTurn, onInstructionsChange, getPhase }) {
    this.game = game;
    this.playerId = playerId;
    this.config = config;
    this.rulesText =
      typeof config.rulesText === "string" && config.rulesText.trim() ? config.rulesText : DEFAULT_RULES_TEXT;
    this.baseInstructions = extraInstructions ?? "";
    this.scheduleTemplate =
      typeof instructionSchedule === "string"
        ? parseInstructionSchedule(instructionSchedule)
        : Array.isArray(instructionSchedule)
          ? instructionSchedule
          : [];
    this.onTurn = onTurn ?? null;
    this.onInstructionsChange = onInstructionsChange ?? null;
    this.getPhase = getPhase ?? (() => null);

    this.running = false;
    this.inFlight = false;
    this.timer = null;
    /** Bumped on every stop/reset so a request still in flight can't apply late. */
    this.generation = 0;
    this.lastTurn = null;
    /** Consecutive decisions triggered by bumping into the teammate — fuels escalating prompt warnings. */
    this.collisionStreak = 0;
    this.nextDecisionAt = 0;
    /** Set while sitting out a "wait" — cleared early if a counter changes. */
    this.waitUntil = 0;
    this.waitSignature = null;
    this.busySince = 0;
    this.turns = 0;
    this.errors = 0;
    this.usage = { cacheReadInputTokens: 0, cacheCreationInputTokens: 0, inputTokens: 0, outputTokens: 0 };
    this.kitchenBlock = null;

    this.resetInstructions();
  }

  get player() {
    return this.game.getPlayer(this.playerId);
  }

  get teammate() {
    return this.game.players.find((p) => p.id !== this.playerId) ?? null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resetInstructions();
    this.kitchenBlock = this.buildKitchen();
    this.busySince = Date.now();
    this.timer = setInterval(() => {
      this.tickSchedule();
      this.maybeDecide();
    }, WATCH_MS);
    this.maybeDecide();
  }

  stop() {
    this.running = false;
    this.generation++;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Called after a map change or round reset, so the cached kitchen block stays accurate. */
  refreshKitchen() {
    this.generation++;
    this.resetInstructions();
    this.kitchenBlock = this.buildKitchen();
    this.lastTurn = null;
    this.collisionStreak = 0;
    this.nextDecisionAt = 0;
    this.waitUntil = 0;
    this.waitSignature = null;
    this.busySince = Date.now();
  }

  /** Rewinds this cook's personality (and its schedule) back to how the round begins. */
  resetInstructions() {
    this.extraInstructions = this.baseInstructions;
    this.schedule = this.scheduleTemplate.map((entry) => ({ ...entry }));
    this.scheduleStartedAt = Date.now();
  }

  /**
   * Applies any scheduled personality change whose time has come. Runs on the
   * same watch tick as `maybeDecide()`, so a change lands before the *next*
   * decision is requested rather than waiting for this cook to go idle first.
   */
  tickSchedule() {
    if (!this.schedule.length) return;
    const elapsedSeconds = (Date.now() - this.scheduleStartedAt) / 1000;

    let applied = null;
    while (this.schedule.length && this.schedule[0].atSeconds <= elapsedSeconds) {
      applied = this.schedule.shift();
      this.extraInstructions = applied.text;
    }
    if (!applied) return;

    this.kitchenBlock = this.buildKitchen();
    this.onInstructionsChange?.({ playerId: this.playerId, atSeconds: applied.atSeconds, text: applied.text });
  }

  buildKitchen() {
    return buildKitchenBlock({
      map: this.game.map,
      player: this.player,
      teammate: this.teammate,
      extraInstructions: this.extraInstructions,
      includeReasoning: Boolean(this.config.includeReasoning),
    });
  }

  /**
   * Fires a decision once the cook has finished what it was doing. While it is
   * walking, interacting or chopping we stay silent, so one request corresponds to
   * one completed action rather than to a wall-clock interval.
   */
  maybeDecide() {
    if (!this.running || this.inFlight || this.game.paused) return;

    const player = this.player;
    if (!player) return;

    // A collision or a stale plan already cleared the cook's path — see
    // Game.handleCollision and Game.invalidatePlan — so it reads as idle
    // below. Both bypass every cooldown too: the point is a fresh decision
    // right away, not after the usual pause.
    const collision = player.collidedWith;
    const staleTarget = player.staleTarget;
    const interrupted = collision || staleTarget;

    if (isBusy(player)) {
      if (!this.busySince) this.busySince = Date.now();
      if (Date.now() - this.busySince < MAX_BUSY_MS) return;
    } else {
      this.busySince = 0;

      if (!interrupted) {
        if (this.waitUntil) {
          const waitOver =
            Date.now() >= this.waitUntil || counterSignature(this.game.map) !== this.waitSignature;
          if (!waitOver) return;
        } else if (Date.now() < this.nextDecisionAt) {
          return;
        }
      }
    }

    player.collidedWith = null;
    player.staleTarget = null;
    this.waitUntil = 0;
    this.waitSignature = null;

    const actions = legalActions(this.game, player, this.teammate, { collided: Boolean(collision) });
    if (actions.length <= 1) {
      // Only "wait" is possible — no point spending a request on it.
      this.startWaiting();
      return;
    }

    this.inFlight = true;
    this.decide(actions, collision, staleTarget).finally(() => {
      this.inFlight = false;
      this.busySince = 0;
    });
  }

  /** Sits out up to WAIT_MS, or until a counter's contents change, whichever first. */
  startWaiting() {
    this.waitUntil = Date.now() + WAIT_MS;
    this.waitSignature = counterSignature(this.game.map);
  }

  async decide(actions, collision = null, staleTarget = null) {
    const player = this.player;
    this.collisionStreak = collision ? this.collisionStreak + 1 : 0;

    const stateMessage = buildStateMessage({
      game: this.game,
      player,
      teammate: this.teammate,
      phase: this.getPhase(),
      actions,
      lastTurn: this.lastTurn,
      collision,
      collisionStreak: this.collisionStreak,
      staleTarget,
    });

    // Deliberately stateless: the state message already fully describes the
    // current game (a Markov state), and `lastTurn` covers the one thing about
    // history that matters. Resending prior turns would just repeat their tokens,
    // uncached, on every single request — a cost that compounds across a round.
    const messages = [
      { role: "user", content: stateMessage },
      { role: "assistant", content: JSON_PREFILL },
    ];
    const requestedAtTick = this.game.tick;
    const generation = this.generation;

    let reply;
    try {
      reply = await this.request(messages);
    } catch (err) {
      this.errors++;
      this.cooldown();
      this.onTurn?.({
        playerId: this.playerId,
        tick: requestedAtTick,
        error: err.message,
        prompt: stateMessage,
      });
      return;
    }

    // The round ended or reset while this request was out — discard it rather than
    // acting on a state that no longer exists.
    if (generation !== this.generation) {
      this.onTurn?.({
        playerId: this.playerId,
        tick: requestedAtTick,
        reply: JSON_PREFILL + reply.text,
        discarded: "arrived after the round ended",
        usage: reply.usage,
      });
      return;
    }

    for (const [key, value] of Object.entries(reply.usage ?? {})) {
      this.usage[key] = (this.usage[key] ?? 0) + value;
    }

    const replyText = JSON_PREFILL + reply.text;
    const decision = parseDecision(replyText);
    this.turns++;

    const chosen = decision.error ? null : actions.find((a) => a.index === decision.actionIndex);
    let problem = decision.error ?? null;
    if (!problem && !chosen) problem = `action ${decision.actionIndex} was not on the list`;
    if (problem) this.errors++;

    if (chosen && chosen.kind !== "wait") {
      this.game.handleClick(this.playerId, chosen.x, chosen.y);
    }

    this.lastTurn = chosen ? `${chosen.index}. ${chosen.label}` : `nothing — ${problem}`;

    if (chosen?.kind === "wait") this.startWaiting();
    else this.cooldown();

    this.onTurn?.({
      playerId: this.playerId,
      tick: requestedAtTick,
      prompt: stateMessage,
      reply: replyText,
      reasoning: decision.reasoning ?? "",
      actionIndex: decision.actionIndex ?? null,
      chosen: chosen ? { kind: chosen.kind, label: chosen.label, x: chosen.x, y: chosen.y } : null,
      offered: actions.map((a) => ({ index: a.index, kind: a.kind, x: a.x, y: a.y })),
      problem,
      collision,
      staleTarget,
      usage: reply.usage,
      latencyMs: reply.latencyMs,
      model: reply.model,
    });
  }

  cooldown() {
    this.nextDecisionAt = Date.now() + Math.max(0, this.config.decisionCooldownMs ?? 0);
  }

  async request(messages) {
    const res = await fetch("/api/llm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        system: [
          { text: this.rulesText, cache: true },
          { text: this.kitchenBlock, cache: true },
        ],
        messages,
        // Belt-and-suspenders alongside the "single JSON object" instruction in
        // RULES_TEXT: this halts generation the instant the object closes, so a
        // model that starts second-guessing itself can't ramble on or emit a
        // second attempt afterwards — see functions/api/llm.js.
        stopSequences: ["}"],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `LLM request failed (${res.status})`);
    return data;
  }
}
