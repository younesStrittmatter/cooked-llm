import {
  CONTROLLERS,
  DEFAULT_COLORS,
  DEFAULT_LLM,
  DEFAULT_MAP,
  DEFAULT_PHASES,
  DEFAULT_PLAYERS,
} from "./game-defaults.js";
import { DEFAULT_RULES_TEXT } from "../src/game/llm-rules.js";

const HEX = /^#[0-9a-f]{6}$/i;

function num(value, fallback, { min = 0, max = Infinity } = {}) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function colors(raw, fallback) {
  const out = { ...fallback };
  if (!raw || typeof raw !== "object") return out;
  for (const part of Object.keys(fallback)) {
    if (HEX.test(raw[part])) out[part] = raw[part];
  }
  return out;
}

function controller(raw, fallback) {
  return CONTROLLERS.includes(raw) ? raw : fallback;
}

function text(raw, fallback, maxLength = 8000) {
  return typeof raw === "string" ? raw.slice(0, maxLength) : fallback;
}

function players(raw, legacy) {
  const list = Array.isArray(raw) ? raw : [];
  return DEFAULT_PLAYERS.map((base, i) => {
    const given = list[i] ?? {};
    // Pre-multiplayer configs stored a single `colors`/speed pair for player one,
    // and a single global instructions string shared by whichever cook was Claude.
    // Backfill both so nothing already saved silently disappears.
    const fallbackColors = i === 0 ? colors(legacy.colors, base.colors) : base.colors;
    const fallbackWalk = i === 0 ? (legacy.walkSpeed ?? base.walkSpeed) : base.walkSpeed;
    const fallbackCut = i === 0 ? (legacy.cutSpeed ?? base.cutSpeed) : base.cutSpeed;
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
      instructionScheduleText: text(given.instructionScheduleText, base.instructionScheduleText),
      personalityName:
        typeof given.personalityName === "string" ? given.personalityName.slice(0, 120) : base.personalityName,
    };
  });
}

/**
 * Fills in every field the game needs, so neither the client nor the API has to
 * guard against partial or legacy stored configs.
 */
export function normalizeConfig(raw = {}) {
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
      extraInstructions: src.llm?.extraInstructions,
    }),
    llm: {
      model: typeof src.llm?.model === "string" && src.llm.model ? src.llm.model : DEFAULT_LLM.model,
      decisionCooldownMs: num(src.llm?.decisionCooldownMs, DEFAULT_LLM.decisionCooldownMs, {
        min: 0,
        max: 30000,
      }),
      maxTokens: num(src.llm?.maxTokens, DEFAULT_LLM.maxTokens, { min: 64, max: 4096 }),
      includeReasoning: Boolean(src.llm?.includeReasoning ?? DEFAULT_LLM.includeReasoning),
      promptName: typeof src.llm?.promptName === "string" ? src.llm.promptName.slice(0, 120) : "",
      rulesText: text(src.llm?.rulesText, "", 64000) || DEFAULT_RULES_TEXT,
    },
    phases: {
      trainSeconds: Math.round(num(src.phases?.trainSeconds, DEFAULT_PHASES.trainSeconds, { max: 7200 })),
      gameSeconds: Math.round(num(src.phases?.gameSeconds, DEFAULT_PHASES.gameSeconds, { max: 7200 })),
      freePlay: Boolean(src.phases?.freePlay ?? DEFAULT_PHASES.freePlay),
    },
    publishedAt: typeof src.publishedAt === "string" ? src.publishedAt : null,
  };
}

/** Colors of the first player, for code paths that still expect a single cook. */
export function primaryColors(config) {
  return config.players[0]?.colors ?? DEFAULT_COLORS;
}
