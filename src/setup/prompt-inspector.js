import { buildKitchenBlock, buildStateMessage, resolveRulesText } from "../game/llm-prompt.js";
import { legalActions } from "../game/agent-actions.js";
import { JSON_PREFILL, parseDecision } from "../game/llm-agent.js";

/** Rough character-per-token estimate — enough to see how far off the cache floor we are. */
const CHARS_PER_TOKEN = 3.7;

function estimateTokens(text) {
  return Math.round(text.length / CHARS_PER_TOKEN);
}

function cacheNote(tokens, model) {
  const floor = /haiku-4-5|opus-4-[56]/.test(model) ? 4096 : 1024;
  return tokens >= floor
    ? `≈${tokens} tokens — above this model's ${floor}-token cache minimum, so it will be cached.`
    : `≈${tokens} tokens — below this model's ${floor}-token cache minimum, so Anthropic will not cache it (no error, just full price).`;
}

/**
 * Shows the three prompt layers exactly as the agent sends them, and can fire a
 * single real request so the operator can sanity-check the model's behaviour.
 */
export function initPromptInspector({ getConfig, getGame, elements }) {
  const { rulesEl, kitchenEl, stateEl, replyEl, statusEl, refreshBtn, testBtn, playerSelect } = elements;

  function buildBlocks() {
    const config = getConfig();
    const game = getGame();
    if (!game) return null;

    const previewId = playerSelect?.value || "p1";
    const player = game.players.find((p) => p.id === previewId) ?? game.players[0];
    const teammate = game.players.find((p) => p.id !== player?.id) ?? null;
    const spec = config.players.find((p) => p.id === player?.id);

    const kitchen = buildKitchenBlock({
      map: game.map,
      player,
      teammate,
      extraInstructions: spec?.extraInstructions,
      includeReasoning: config.llm.includeReasoning,
    });

    const actions = player ? legalActions(game, player, teammate) : [];
    const state = player
      ? buildStateMessage({
          game,
          player,
          teammate,
          phase: { label: "Scored round", scored: true, secondsLeft: 120 },
          actions,
          lastTurn: null,
        })
      : "(no cook enabled)";

    return { config, kitchen, state, actions };
  }

  function refresh() {
    const blocks = buildBlocks();
    if (!blocks) {
      statusEl.textContent = "Fix the map and apply it to the test game to preview the prompt.";
      return null;
    }

    const { config, kitchen, state, actions } = blocks;
    const rulesText = resolveRulesText(config);
    const rulesTokens = estimateTokens(rulesText);
    const prefixTokens = estimateTokens(rulesText + kitchen);

    rulesEl.textContent = rulesText;
    kitchenEl.textContent = kitchen;
    stateEl.textContent = state;
    statusEl.textContent =
      `Rules block: ${cacheNote(rulesTokens, config.llm.model)} ` +
      `Rules + kitchen: ≈${prefixTokens} tokens. ` +
      `Per-turn state: ≈${estimateTokens(state)} tokens, ` +
      `offering ${Math.max(0, actions.length - 1)} possible actions.`;
    return blocks;
  }

  async function testTurn() {
    const blocks = refresh();
    if (!blocks) return;

    const { config, kitchen, state, actions } = blocks;
    const rulesText = resolveRulesText(config);
    testBtn.disabled = true;
    statusEl.textContent = "Sending one turn to the model…";
    replyEl.textContent = "";

    try {
      const res = await fetch("/api/llm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.llm.model,
          maxTokens: config.llm.maxTokens,
          system: [
            { text: rulesText, cache: true },
            { text: kitchen, cache: true },
          ],
          messages: [
            { role: "user", content: state },
            { role: "assistant", content: JSON_PREFILL },
          ],
          stopSequences: ["}"],
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      const replyText = JSON_PREFILL + data.text;
      const decision = parseDecision(replyText);
      const chosen = actions.find((a) => a.index === decision.actionIndex);
      const u = data.usage ?? {};
      replyEl.textContent = replyText;
      statusEl.textContent =
        `${data.model} replied in ${data.latencyMs}ms. ` +
        (decision.error
          ? `Could not parse a choice: ${decision.error}. `
          : chosen
            ? `Chose ${chosen.index}: ${chosen.label}. `
            : `Chose ${decision.actionIndex}, which was not on the list. `) +
        `Tokens — input ${u.inputTokens}, output ${u.outputTokens}, ` +
        `cache write ${u.cacheCreationInputTokens}, cache read ${u.cacheReadInputTokens}. ` +
        (u.cacheReadInputTokens > 0
          ? "Cache hit."
          : u.cacheCreationInputTokens > 0
            ? "Cache written — send again to see a hit."
            : "No caching: the prefix is under this model's minimum.");
    } catch (err) {
      statusEl.textContent = `Test failed: ${err.message}`;
    } finally {
      testBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", refresh);
  testBtn.addEventListener("click", testTurn);
  playerSelect?.addEventListener("change", refresh);

  return { refresh };
}
