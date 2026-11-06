import { buildMap } from "./game/map.js";
import { Game } from "./game/game.js";
import { LlmAgent } from "./game/llm-agent.js";
import { PhaseController } from "./game/phases.js";
import { SessionLog } from "./game/session-log.js";
import { normalizeConfig } from "../shared/config.js";
import { chefRankForScore } from "./game/chef-rank.js";

const canvas = document.getElementById("game");
const viewport = document.getElementById("viewport");
const scoreValueEl = document.getElementById("score-value");
const scoreTitleEl = document.getElementById("score-title");
const phaseLabelEl = document.getElementById("phase-label");
const timerEl = document.getElementById("timer");
const stopBtn = document.getElementById("stop-play");
const controlHintEl = document.getElementById("control-hint");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayBody = document.getElementById("overlay-body");
const overlayCta = document.getElementById("overlay-cta");
const overlaySummary = document.getElementById("overlay-summary");
const overlayNote = document.getElementById("overlay-note");

function updateHudScore(score) {
  scoreValueEl.textContent = String(score);
  scoreTitleEl.textContent = chefRankForScore(score).title;
}

function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Untimed phases count up instead of down, so the player still sees a clock. */
function phaseClock(state) {
  return state.secondsLeft == null
    ? `${formatClock(state.secondsElapsed)} elapsed`
    : formatClock(state.secondsLeft);
}

function showOverlay({ title, body, cta, onCta, summary }) {
  overlayTitle.textContent = title;
  overlayBody.textContent = body;
  overlayCta.textContent = cta ?? "";
  overlayCta.hidden = !cta;
  overlayNote.hidden = true;

  overlaySummary.hidden = !summary;
  if (summary) overlaySummary.replaceChildren(...summary);

  overlayCta.onclick = onCta ?? null;
  overlay.hidden = false;
  if (cta) overlayCta.focus();
}

function hideOverlay() {
  overlay.hidden = true;
  overlayCta.onclick = null;
}

function setOverlayNote(text) {
  overlayNote.textContent = text;
  overlayNote.hidden = false;
}

async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error(`config request failed (${res.status})`);
    return normalizeConfig(await res.json());
  } catch (err) {
    console.warn("Falling back to default config:", err);
    return normalizeConfig();
  }
}

const CLICK_HINT =
  "Click a tile to move, or click a counter, board, dispenser, bin or the delivery window to use it.";

function describeControls(game) {
  const humans = game.humanPlayers;
  if (humans.length === 0) return "Both cooks are played by Claude — sit back and watch.";
  if (humans.length > 1) {
    return `${CLICK_HINT} Two cooks share this keyboard — press 1 or 2 to switch which one you control (currently ${game.activeHumanId}).`;
  }
  if (game.players.length > 1) return `${CLICK_HINT} Your teammate is played by Claude.`;
  return CLICK_HINT;
}

/** Lets a second person at the same keyboard take over the other cook. */
function wireCookSwitching(game, onChange) {
  if (game.humanPlayers.length < 2) return;
  window.addEventListener("keydown", (e) => {
    const index = Number(e.key) - 1;
    const target = game.humanPlayers[index];
    if (target && game.setActiveHuman(target.id)) onChange();
  });
}

function summaryLines(results) {
  return results.map((result) => {
    const el = document.createElement("p");
    el.textContent = result.scored
      ? `${result.label}: ${result.score} salad${result.score === 1 ? "" : "s"} delivered`
      : `${result.label}: not scored`;
    return el;
  });
}

async function main() {
  const config = await loadConfig();
  const map = buildMap(config.mapText);

  const game = new Game(map, canvas, viewport, { players: config.players });

  const log = new SessionLog({ config });
  game.onEvent = (event) => log.record(event);
  game.onDeliver = (score) => {
    updateHudScore(score);
  };

  function refreshControlHint() {
    controlHintEl.textContent = describeControls(game);
    controlHintEl.hidden = false;
  }

  refreshControlHint();
  wireCookSwitching(game, refreshControlHint);

  let phases;

  const agents = game.llmPlayers.map((player) => {
    const spec = config.players.find((p) => p.id === player.id);
    return new LlmAgent({
      game,
      playerId: player.id,
      config: config.llm,
      extraInstructions: spec?.extraInstructions,
      instructionSchedule: spec?.instructionScheduleText,
      getPhase: () => phases?.state() ?? null,
      onTurn: (turn) => log.recordLlmTurn(turn),
      onInstructionsChange: (change) => log.recordInstructionsChange(change),
    });
  });

  phases = new PhaseController({
    game,
    phases: config.phases,
    onNotice: (notice) => {
      for (const agent of agents) agent.stop();
      stopBtn.hidden = true;
      timerEl.textContent = "";
      phaseLabelEl.textContent = notice.title;
      showOverlay({
        title: notice.title,
        body: notice.body,
        cta: notice.cta,
        onCta: () => {
          hideOverlay();
          notice.acknowledge();
        },
      });
    },
    onPhaseStart: (step) => {
      log.recordPhaseStart(step);
      updateHudScore(0);
      stopBtn.hidden = !step.stoppable;
      for (const agent of agents) {
        agent.refreshKitchen();
        agent.start();
      }
    },
    onTick: (state) => {
      if (!state) return;
      phaseLabelEl.textContent = state.scored ? state.label : `${state.label} — not scored`;
      timerEl.textContent = phaseClock(state);
    },
    onPhaseEnd: (result) => {
      for (const agent of agents) agent.stop();
      log.recordPhaseEnd(result);
    },
    onFinish: async (results) => {
      for (const agent of agents) agent.stop();
      game.stop();
      stopBtn.hidden = true;
      timerEl.textContent = "";
      phaseLabelEl.textContent = "Session complete";

      showOverlay({
        title: "Thanks for playing!",
        body: `Final score: ${log.scoredTotal} salad${log.scoredTotal === 1 ? "" : "s"} — ${chefRankForScore(log.scoredTotal).title}!`,
        summary: summaryLines(results),
      });
      setOverlayNote("Saving your session…");

      const saved = await log.flush();
      setOverlayNote(
        saved.ok
          ? "Your session was saved. You can close this tab."
          : `Could not save automatically (${saved.error}). Use the button below to download it instead.`,
      );

      if (!saved.ok) {
        overlayCta.textContent = "Download session file";
        overlayCta.hidden = false;
        overlayCta.onclick = () => log.download();
      }
    },
  });

  stopBtn.addEventListener("click", () => phases.stopPhase());

  updateHudScore(0);
  game.start();
  game.pause();
  phases.start();
}

main();
