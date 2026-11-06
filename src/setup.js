import { buildMap } from "./game/map.js";
import { initMapPreview } from "./game/map-preview.js";
import { initMapLibrary } from "./game/map-library.js";
import { Game } from "./game/game.js";
import { LlmAgent } from "./game/llm-agent.js";
import { parseInstructionSchedule } from "./game/instruction-schedule.js";
import { DEFAULT_MAP } from "../shared/game-defaults.js";
import {
  getAdminKey,
  setAdminKey,
  clearAdminKey,
  checkAdminKey,
  adminConfigured,
  apiGetConfig,
  apiPublishConfig,
} from "./game/admin-api.js";
import {
  collectFormElements,
  onFormChange,
  readConfigForm,
  writeConfigForm,
} from "./setup/config-form.js";
import { initPromptInspector } from "./setup/prompt-inspector.js";
import { initPromptLibrary } from "./setup/prompt-library.js";
import { initPersonalityLibrary } from "./setup/personality-library.js";
import { initSessionsPanel } from "./setup/sessions-panel.js";
import { DEFAULT_RULES_TEXT } from "./game/llm-rules.js";

const gate = document.getElementById("admin-gate");
const gateForm = document.getElementById("admin-gate-form");
const gateError = document.getElementById("admin-gate-error");
const gatePasswordInput = document.getElementById("admin-password");
const content = document.getElementById("admin-content");

const publishLive = document.getElementById("publish-live");
const publishBtn = document.getElementById("map-publish");
const publishStatus = document.getElementById("publish-status");
const lockBtn = document.getElementById("admin-lock");

let appInitialized = false;

function showPublishStatus(message, isError = false) {
  publishStatus.textContent = message;
  publishStatus.hidden = false;
  publishStatus.classList.toggle("publish-status-error", isError);
}

function describeLive(config) {
  if (!config.publishedAt) return "Nothing published yet — players get the built-in default map.";
  const label = config.mapName || "unnamed draft";
  const prompt = config.llm?.promptName ? `prompt "${config.llm.promptName}"` : "built-in prompt";
  const personalities = config.players
    .filter((p) => p.personalityName)
    .map((p) => `${p.id} "${p.personalityName}"`)
    .join(", ");
  const personalityLabel = personalities ? ` — personalities ${personalities}` : "";
  const cooks = config.players.map((p) => `${p.id} ${p.controller}`).join(", ");
  const when = new Date(config.publishedAt).toLocaleString();
  return `Live now: "${label}" — ${prompt}${personalityLabel} — ${cooks} — published ${when}`;
}

function revealContent() {
  gate.hidden = true;
  content.hidden = false;
  if (!appInitialized) {
    appInitialized = true;
    initApp();
  }
}

function showGate() {
  gate.hidden = false;
  content.hidden = true;
  gatePasswordInput.value = "";
}

gateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = gatePasswordInput.value;
  const result = await checkAdminKey(pw);
  if (result.ok) {
    setAdminKey(pw);
    gateError.hidden = true;
    revealContent();
  } else {
    gateError.textContent = result.error ?? "Incorrect password.";
    gateError.hidden = false;
  }
});

lockBtn?.addEventListener("click", () => {
  clearAdminKey();
  showGate();
});

async function tryStoredKey() {
  const configured = await adminConfigured();
  if (configured === false) {
    gateError.textContent =
      "This deployment has no setup password configured. Add ADMIN_PASSWORD in Cloudflare (Production and Preview) — see README — then redeploy.";
    gateError.hidden = false;
    return;
  }

  const stored = getAdminKey();
  if (!stored) return;
  const result = await checkAdminKey(stored);
  if (result.ok) revealContent();
  else clearAdminKey();
}

function initApp() {
  const els = collectFormElements();
  const canvas = document.getElementById("game");
  const viewport = document.getElementById("viewport");
  const scoreEl = document.getElementById("score");
  const mapPreviewCanvas = document.getElementById("map-preview");
  const testRunLlm = document.getElementById("test-run-llm");
  const testRestart = document.getElementById("test-restart");
  const testLlmLog = document.getElementById("test-llm-log");

  const mapPreview = initMapPreview(els.mapText, mapPreviewCanvas, DEFAULT_MAP);

  let config = readConfigForm(els);
  let game = null;
  let agents = [];

  const logLines = [];
  function logAgent(line) {
    logLines.push(line);
    if (logLines.length > 40) logLines.shift();
    testLlmLog.textContent = logLines.join("\n");
    testLlmLog.scrollTop = testLlmLog.scrollHeight;
  }

  function updateScore(score) {
    scoreEl.textContent = `Delivered: ${score}`;
  }

  function stopAgents() {
    for (const agent of agents) agent.stop();
    agents = [];
  }

  function startAgents() {
    stopAgents();
    if (!testRunLlm.checked || !game) return;

    agents = game.llmPlayers.map((player) => {
      const spec = config.players.find((p) => p.id === player.id);
      return new LlmAgent({
        game,
        playerId: player.id,
        config: config.llm,
        extraInstructions: spec?.extraInstructions,
        instructionSchedule: spec?.instructionScheduleText,
        getPhase: () => ({ label: "Test game", scored: true, secondsLeft: null }),
        onTurn: (turn) => {
          if (turn.error) return logAgent(`[${turn.playerId}] error: ${turn.error}`);
          if (turn.discarded) return logAgent(`[${turn.playerId}] discarded: ${turn.discarded}`);
          if (turn.problem) return logAgent(`[${turn.playerId}] ${turn.problem}`);
          logAgent(
            `[${turn.playerId}] ${turn.chosen?.label ?? "waited"}` +
              `${turn.reasoning ? ` — "${turn.reasoning}"` : ""} (${turn.offered.length - 1} options)`,
          );
        },
        onInstructionsChange: (change) =>
          logAgent(`[${change.playerId}] personality changed at ${change.atSeconds}s: "${change.text}"`),
      });
    });

    for (const agent of agents) agent.start();
  }

  /** The test game is rebuilt from scratch whenever the setup changes shape. */
  function rebuildGame() {
    stopAgents();
    game?.stop();

    try {
      const map = buildMap(els.mapText.value || DEFAULT_MAP);
      game = new Game(map, canvas, viewport, { players: config.players });
      game.onDeliver = (score) => updateScore(score);
      updateScore(0);
      game.start();
      startAgents();
    } catch (err) {
      showPublishStatus(`Invalid map: ${err.message}`, true);
    }
  }

  const inspector = initPromptInspector({
    getConfig: () => config,
    getGame: () => game,
    elements: {
      rulesEl: document.getElementById("llm-prompt-rules"),
      kitchenEl: document.getElementById("llm-prompt-kitchen"),
      stateEl: document.getElementById("llm-prompt-state"),
      replyEl: document.getElementById("llm-reply"),
      statusEl: document.getElementById("llm-test-status"),
      refreshBtn: document.getElementById("llm-refresh-prompt"),
      testBtn: document.getElementById("llm-test-turn"),
      playerSelect: document.getElementById("llm-preview-player"),
    },
  });

  const sessions = initSessionsPanel({
    listEl: document.getElementById("sessions-list"),
    refreshBtn: document.getElementById("sessions-refresh"),
    onError: (message) => showPublishStatus(message, true),
  });

  onFormChange(els, () => {
    const previous = config;
    config = readConfigForm(els);

    const controllersChanged = config.players.some(
      (p, i) => p.controller !== previous.players[i].controller,
    );

    if (controllersChanged) {
      rebuildGame();
      return;
    }

    for (const player of config.players) {
      game?.setPlayerSpeeds(player.id, { walkSpeed: player.walkSpeed, cutSpeed: player.cutSpeed });
      game?.setPlayerColors(player.id, player.colors);
    }

    // The kitchen block (which embeds extraInstructions) is only rebuilt on
    // refreshKitchen(), so a running agent otherwise keeps sending the old text
    // forever — swapping the config reference alone silently has no effect.
    // extraInstructions/schedule are per-player, so only refresh the one agent
    // whose own text actually changed, not every agent in the game.
    const reasoningToggled = previous.llm?.includeReasoning !== config.llm.includeReasoning;
    const rulesChanged = previous.llm?.rulesText !== config.llm.rulesText;

    for (const agent of agents) {
      agent.config = config.llm;
      if (rulesChanged) {
        agent.rulesText = config.llm.rulesText;
        agent.generation++;
      }
      const before = previous.players.find((p) => p.id === agent.playerId);
      const after = config.players.find((p) => p.id === agent.playerId);
      const instructionsChanged =
        before &&
        after &&
        (before.extraInstructions !== after.extraInstructions ||
          before.instructionScheduleText !== after.instructionScheduleText);
      if (instructionsChanged) {
        agent.baseInstructions = after.extraInstructions;
        agent.scheduleTemplate = parseInstructionSchedule(after.instructionScheduleText);
      }
      // Reply-format lives in the kitchen block — rebuild when instructions or
      // the includeReasoning toggle change so the next decision uses the new shape.
      if (instructionsChanged || reasoningToggled) {
        agent.refreshKitchen();
      }
    }
  });

  testRunLlm.addEventListener("change", startAgents);
  testRestart.addEventListener("click", rebuildGame);

  initMapLibrary({
    nameInput: els.mapName,
    select: document.getElementById("map-select"),
    saveBtn: document.getElementById("map-save"),
    loadBtn: document.getElementById("map-load"),
    deleteBtn: document.getElementById("map-delete"),
    mapText: els.mapText,
    onLoad: (text) => {
      mapPreview.show(text);
      rebuildGame();
      inspector.refresh();
    },
    onError: (message) => showPublishStatus(message, true),
  });

  initPromptLibrary({
    nameInput: els.promptName,
    select: document.getElementById("prompt-select"),
    saveBtn: document.getElementById("prompt-save"),
    loadBtn: document.getElementById("prompt-load"),
    deleteBtn: document.getElementById("prompt-delete"),
    rulesText: els.rulesText,
    onLoad: () => {
      config = readConfigForm(els);
      for (const agent of agents) agent.rulesText = config.llm.rulesText;
      inspector.refresh();
    },
    onSaved: (name) => showPublishStatus(`Saved prompt "${name}".`),
    onError: (message) => showPublishStatus(message, true),
  });

  function wirePersonalityLibrary(playerIndex, cookId) {
    const player = els.players[playerIndex];
    initPersonalityLibrary({
      cookId,
      nameInput: player.personalityName,
      select: document.getElementById(`${cookId}-personality-select`),
      saveBtn: document.getElementById(`${cookId}-personality-save`),
      loadBtn: document.getElementById(`${cookId}-personality-load`),
      deleteBtn: document.getElementById(`${cookId}-personality-delete`),
      instructionsEl: player.extraInstructions,
      scheduleEl: player.instructionScheduleText,
      onLoad: () => {
        player.extraInstructions.dispatchEvent(new Event("input"));
        inspector.refresh();
      },
      onSaved: (name) => showPublishStatus(`Saved ${cookId} personality "${name}".`),
      onError: (message) => showPublishStatus(message, true),
    });
  }

  wirePersonalityLibrary(0, "p1");
  wirePersonalityLibrary(1, "p2");

  document.getElementById("prompt-reset").addEventListener("click", () => {
    els.rulesText.value = DEFAULT_RULES_TEXT;
    els.promptName.value = "";
    document.getElementById("prompt-select").value = "";
    config = readConfigForm(els);
    for (const agent of agents) agent.rulesText = config.llm.rulesText;
    inspector.refresh();
  });

  document.getElementById("map-apply").addEventListener("click", () => {
    config = readConfigForm(els);
    rebuildGame();
    inspector.refresh();
  });

  document.getElementById("map-reset").addEventListener("click", () => {
    els.mapText.value = DEFAULT_MAP.trimEnd();
    els.mapName.value = "";
    document.getElementById("map-select").value = "";
    mapPreview.show(els.mapText.value);
    config = readConfigForm(els);
    rebuildGame();
    inspector.refresh();
  });

  publishBtn.addEventListener("click", async () => {
    publishBtn.disabled = true;
    showPublishStatus("Publishing…");
    try {
      config = readConfigForm(els);
      const published = await apiPublishConfig(config);
      publishLive.textContent = describeLive(published);
      showPublishStatus("Published — players will get this on their next visit.");
    } catch (err) {
      showPublishStatus(err.message, true);
    } finally {
      publishBtn.disabled = false;
    }
  });

  async function loadLiveIntoEditor() {
    try {
      const live = await apiGetConfig();
      publishLive.textContent = describeLive(live);
      config = writeConfigForm(els, live);
    } catch (err) {
      publishLive.textContent = "Could not load current live config.";
      console.error(err);
    }

    mapPreview.show(els.mapText.value);
    rebuildGame();
    inspector.refresh();
    sessions.refresh();
  }

  loadLiveIntoEditor();
}

tryStoredKey();
