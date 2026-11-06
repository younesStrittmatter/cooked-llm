const MAX_EVENTS = 20000;

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * One session = one visit to the play page. Holds the metadata needed to
 * reproduce the run plus every action both cooks took.
 */
export class SessionLog {
  constructor({ config, extra = {} }) {
    this.id = randomId();
    this.startedAt = new Date().toISOString();
    this.events = [];
    this.truncated = false;
    this.phaseResults = [];
    this.currentPhase = null;

    this.metadata = {
      sessionId: this.id,
      startedAt: this.startedAt,
      mapName: config.mapName || null,
      mapText: config.mapText,
      players: config.players.map((p) => ({
        id: p.id,
        controller: p.controller,
        colors: p.colors,
        walkSpeed: p.walkSpeed,
        cutSpeed: p.cutSpeed,
        extraInstructions: p.extraInstructions,
        instructionScheduleText: p.instructionScheduleText,
      })),
      llm: {
        model: config.llm.model,
        decisionCooldownMs: config.llm.decisionCooldownMs,
        maxTokens: config.llm.maxTokens,
        includeReasoning: Boolean(config.llm.includeReasoning),
      },
      phases: { ...config.phases },
      configPublishedAt: config.publishedAt ?? null,
      userAgent: globalThis.navigator?.userAgent ?? null,
      ...extra,
    };

    this.llmUsage = {};
  }

  setPhase(phase) {
    this.currentPhase = phase;
  }

  record(event) {
    if (this.events.length >= MAX_EVENTS) {
      this.truncated = true;
      return;
    }
    this.events.push({
      at: event.at ?? Date.now(),
      phase: this.currentPhase,
      ...event,
    });
  }

  recordPhaseStart(step) {
    this.setPhase(step.phase);
    this.record({
      type: "phase_start",
      phase: step.phase,
      scored: Boolean(step.scored),
      seconds: step.seconds ?? null,
    });
  }

  recordPhaseEnd(result) {
    this.record({ type: "phase_end", ...result });
    this.phaseResults.push(result);
  }

  /** A scheduled personality change just took effect for one cook — see instruction-schedule.js. */
  recordInstructionsChange(change) {
    this.record({ type: "instructions_change", ...change });
  }

  recordLlmTurn(turn) {
    const usage = this.llmUsage[turn.playerId] ?? {
      turns: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };

    usage.turns++;
    if (turn.error || turn.problem) usage.errors++;
    for (const key of ["inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens"]) {
      usage[key] += turn.usage?.[key] ?? 0;
    }
    this.llmUsage[turn.playerId] = usage;

    this.record({ type: "llm_turn", ...turn });
  }

  /** Total across scored phases only — the number that matters for the study. */
  get scoredTotal() {
    return this.phaseResults.filter((r) => r.scored).reduce((sum, r) => sum + r.score, 0);
  }

  toJSON() {
    return {
      ...this.metadata,
      endedAt: new Date().toISOString(),
      truncated: this.truncated,
      phaseResults: this.phaseResults,
      scoredTotal: this.scoredTotal,
      llmUsage: this.llmUsage,
      eventCount: this.events.length,
      events: this.events,
    };
  }

  /** Ships the log to the server. Resolves to `{ ok, error }` and never throws. */
  async flush() {
    const payload = this.toJSON();
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
      return { ok: true, id: data.id ?? this.id };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /** Offline escape hatch: saves the log as a file from the browser. */
  download() {
    const blob = new Blob([JSON.stringify(this.toJSON(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cooked-session-${this.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

/** Feeds a stored log's clicks back into a fresh game for deterministic replay. */
export function replaySession(game, log) {
  const data = typeof log === "string" ? JSON.parse(log) : log;
  const clicks = (data.events ?? []).filter((e) => e.type === "click" && e.ok);

  for (const { tick, playerId, x, y } of clicks) {
    while (game.tick < tick) game.step();
    game.handleClick(playerId, x, y);
  }
}
