/**
 * Shared between the browser (src/) and Cloudflare Pages Functions (functions/).
 * Keep this file free of browser- or Node-only APIs — plain data only.
 */

export const DEFAULT_MAP = `###############
#T......C....P#
#L....X.......#
#....B........#
#.............#
#...C..D..C...#
#.............#
#.............#
###############`;

export const DEFAULT_COLORS = {
  hat: "#ffffff",
  apron: "#0040ff",
  hair: "#ffc500",
  mustache: "#5a3a1a",
  skin: "#e3a691",
};

/** Second cook, visually distinct from the first. */
export const DEFAULT_COLORS_P2 = {
  hat: "#ffffff",
  apron: "#c62828",
  hair: "#4a2c12",
  mustache: "#2b1a0a",
  skin: "#c98d6b",
};

/** Fallback speeds for a cook with no per-player value set. */
export const DEFAULT_SETTINGS = {
  walkSpeed: 1,
  cutSpeed: 1,
};

export const CONTROLLERS = ["human", "llm", "none"];

export const DEFAULT_PLAYERS = [
  {
    id: "p1",
    controller: "human",
    colors: DEFAULT_COLORS,
    walkSpeed: 1,
    cutSpeed: 1,
    // Both are per-player: each Claude cook can be given its own personality,
    // and optionally have it change mid-round — see instruction-schedule.js.
    extraInstructions: "",
    instructionScheduleText: "",
    /** Name of the saved personality preset in the library, if any. */
    personalityName: "",
  },
  {
    id: "p2",
    controller: "llm",
    colors: DEFAULT_COLORS_P2,
    walkSpeed: 1,
    cutSpeed: 1,
    extraInstructions: "",
    instructionScheduleText: "",
    personalityName: "",
  },
];

export const DEFAULT_LLM = {
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
  rulesText: "",
};

export const DEFAULT_PHASES = {
  /** Practice round — points do not count. 0 disables it. */
  trainSeconds: 60,
  /** Scored round. 0 disables it. */
  gameSeconds: 180,
  /** Optional open-ended round the player ends with a Stop button. */
  freePlay: false,
};
