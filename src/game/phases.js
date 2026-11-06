export const PHASE_LABELS = {
  train: "Practice round",
  game: "Scored round",
  freeplay: "Free play",
};

const TICK_MS = 200;

/**
 * Builds the run of steps for a session: each playable phase is preceded by a
 * notice the player has to acknowledge, which is also where state gets reset.
 */
export function buildSchedule({ trainSeconds, gameSeconds, freePlay }) {
  const steps = [];
  const hasTrain = trainSeconds > 0;
  const hasGame = gameSeconds > 0;

  if (hasTrain) {
    steps.push({
      kind: "notice",
      phase: "train",
      title: "Practice round",
      body:
        `You have ${trainSeconds} seconds to get familiar with the kitchen. ` +
        `Nothing you do here counts towards your score.`,
      cta: "Start practice",
      reset: true,
    });
    steps.push({ kind: "play", phase: "train", seconds: trainSeconds, scored: false });
  }

  if (hasGame) {
    steps.push({
      kind: "notice",
      phase: "game",
      title: hasTrain ? "Practice is over — the real game starts now" : "The game starts now",
      body:
        `The kitchen has been reset. For the next ${gameSeconds} seconds every salad you ` +
        `deliver counts towards your score. Good luck!`,
      cta: hasTrain ? "Start the game" : "Start",
      reset: true,
    });
    steps.push({ kind: "play", phase: "game", seconds: gameSeconds, scored: true });
  }

  if (freePlay) {
    steps.push({
      kind: "notice",
      phase: "freeplay",
      title: "Free play",
      body:
        "Take as long as you like in the kitchen. Press “Stop playing” when you are done.",
      cta: "Start free play",
      reset: true,
    });
    steps.push({ kind: "play", phase: "freeplay", seconds: null, scored: true, stoppable: true });
  }

  return steps;
}

export class PhaseController {
  /**
   * @param {object} handlers
   * @param {(notice: object) => void} handlers.onNotice   Show a blocking notice; call `acknowledge()` to continue.
   * @param {(step: object) => void} handlers.onPhaseStart
   * @param {(state: object) => void} handlers.onTick
   * @param {(result: object) => void} handlers.onPhaseEnd
   * @param {(results: object[]) => void} handlers.onFinish
   */
  constructor({ game, phases, onNotice, onPhaseStart, onTick, onPhaseEnd, onFinish }) {
    this.game = game;
    this.steps = buildSchedule(phases);
    this.index = -1;
    this.step = null;
    this.startedAt = 0;
    this.timer = null;
    this.results = [];
    this.finished = false;

    this.onNotice = onNotice ?? (() => {});
    this.onPhaseStart = onPhaseStart ?? (() => {});
    this.onTick = onTick ?? (() => {});
    this.onPhaseEnd = onPhaseEnd ?? (() => {});
    this.onFinish = onFinish ?? (() => {});
  }

  get isPlaying() {
    return this.step?.kind === "play";
  }

  /** Snapshot for the LLM prompt and the HUD. */
  state() {
    if (!this.isPlaying) return null;
    return {
      phase: this.step.phase,
      label: PHASE_LABELS[this.step.phase] ?? this.step.phase,
      scored: Boolean(this.step.scored),
      stoppable: Boolean(this.step.stoppable),
      secondsLeft: this.secondsLeft(),
      secondsElapsed: Math.floor(this.elapsedSeconds()),
    };
  }

  secondsLeft() {
    if (!this.isPlaying || this.step.seconds == null) return null;
    const elapsed = (Date.now() - this.startedAt) / 1000;
    return Math.max(0, Math.ceil(this.step.seconds - elapsed));
  }

  elapsedSeconds() {
    return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
  }

  start() {
    if (this.steps.length === 0) {
      this.finish();
      return;
    }
    this.next();
  }

  next() {
    this.clearTimer();
    this.index++;

    if (this.index >= this.steps.length) {
      this.finish();
      return;
    }

    this.step = this.steps[this.index];

    if (this.step.kind === "notice") {
      this.game.pause();
      this.onNotice({ ...this.step, acknowledge: () => this.acknowledge() });
      return;
    }

    this.startedAt = Date.now();
    this.game.resume();
    this.onPhaseStart(this.step);
    this.onTick(this.state());

    this.timer = setInterval(() => {
      const left = this.secondsLeft();
      this.onTick(this.state());
      if (left !== null && left <= 0) this.endPhase("time");
    }, TICK_MS);
  }

  acknowledge() {
    if (this.step?.kind !== "notice") return;
    if (this.step.reset) this.game.resetRound();
    this.next();
  }

  /** Ends the current playable phase early — the free-play Stop button. */
  stopPhase() {
    if (this.isPlaying) this.endPhase("player");
  }

  endPhase(cause) {
    if (!this.isPlaying) return;
    this.clearTimer();
    this.game.pause();

    const result = {
      phase: this.step.phase,
      label: PHASE_LABELS[this.step.phase] ?? this.step.phase,
      scored: Boolean(this.step.scored),
      score: this.game.score,
      durationSeconds: Math.round(this.elapsedSeconds()),
      endedBy: cause,
    };
    this.results.push(result);
    this.onPhaseEnd(result);
    this.next();
  }

  finish() {
    this.clearTimer();
    this.step = null;
    this.finished = true;
    this.game.pause();
    this.onFinish(this.results);
  }

  clearTimer() {
    clearInterval(this.timer);
    this.timer = null;
  }

  destroy() {
    this.clearTimer();
  }
}
