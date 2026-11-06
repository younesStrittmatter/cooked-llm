import { normalizeConfig } from "../../shared/config.js";

const COLOR_PARTS = ["skin", "hair", "mustache", "apron", "hat"];

const byId = (id) => document.getElementById(id);

/** Collects every setup control once, so the rest of the page works with names. */
export function collectFormElements() {
  const playerEls = ["p1", "p2"].map((prefix) => ({
    controller: byId(`${prefix}-controller`),
    walkSpeed: byId(`${prefix}-walk-speed`),
    cutSpeed: byId(`${prefix}-cut-speed`),
    colors: Object.fromEntries(COLOR_PARTS.map((part) => [part, byId(`${prefix}-color-${part}`)])),
    extraInstructions: byId(`${prefix}-instructions`),
    instructionScheduleText: byId(`${prefix}-schedule`),
    personalityName: byId(`${prefix}-personality-name`),
  }));

  return {
    players: playerEls,
    trainSeconds: byId("phase-train"),
    gameSeconds: byId("phase-game"),
    freePlay: byId("phase-freeplay"),
    llmModel: byId("llm-model"),
    llmCooldown: byId("llm-cooldown"),
    llmMaxTokens: byId("llm-max-tokens"),
    llmIncludeReasoning: byId("llm-include-reasoning"),
    promptName: byId("prompt-name"),
    rulesText: byId("prompt-rules-text"),
    mapText: byId("map-text"),
    mapName: byId("map-name"),
  };
}

/** Form state as a normalized config object, ready to publish or run locally. */
export function readConfigForm(els) {
  return normalizeConfig({
    mapName: els.mapName.value.trim(),
    mapText: els.mapText.value,
    players: els.players.map((p, i) => ({
      id: `p${i + 1}`,
      controller: p.controller.value,
      walkSpeed: Number(p.walkSpeed.value),
      cutSpeed: Number(p.cutSpeed.value),
      colors: Object.fromEntries(
        COLOR_PARTS.map((part) => [part, p.colors[part].value]),
      ),
      extraInstructions: p.extraInstructions.value,
      instructionScheduleText: p.instructionScheduleText.value,
      personalityName: p.personalityName.value.trim(),
    })),
    llm: {
      model: els.llmModel.value.trim(),
      decisionCooldownMs: Number(els.llmCooldown.value),
      maxTokens: Number(els.llmMaxTokens.value),
      includeReasoning: els.llmIncludeReasoning.checked,
      promptName: els.promptName.value.trim(),
      rulesText: els.rulesText.value,
    },
    phases: {
      trainSeconds: Number(els.trainSeconds.value),
      gameSeconds: Number(els.gameSeconds.value),
      freePlay: els.freePlay.checked,
    },
  });
}

export function writeConfigForm(els, raw) {
  const config = normalizeConfig(raw);

  els.mapText.value = config.mapText.trimEnd();
  els.mapName.value = config.mapName ?? "";

  config.players.forEach((player, i) => {
    const el = els.players[i];
    if (!el) return;
    el.controller.value = player.controller;
    el.walkSpeed.value = player.walkSpeed;
    el.cutSpeed.value = player.cutSpeed;
    for (const part of COLOR_PARTS) el.colors[part].value = player.colors[part];
    el.extraInstructions.value = player.extraInstructions;
    el.instructionScheduleText.value = player.instructionScheduleText;
    el.personalityName.value = player.personalityName ?? "";
  });

  els.llmModel.value = config.llm.model;
  els.llmCooldown.value = config.llm.decisionCooldownMs;
  els.llmMaxTokens.value = config.llm.maxTokens;
  els.llmIncludeReasoning.checked = config.llm.includeReasoning;
  els.promptName.value = config.llm.promptName ?? "";
  els.rulesText.value = config.llm.rulesText;

  els.trainSeconds.value = config.phases.trainSeconds;
  els.gameSeconds.value = config.phases.gameSeconds;
  els.freePlay.checked = config.phases.freePlay;

  return config;
}

/** Fires `handler` whenever any control changes, so the test game stays in sync. */
export function onFormChange(els, handler) {
  const inputs = [
    els.trainSeconds,
    els.gameSeconds,
    els.freePlay,
    els.llmModel,
    els.llmCooldown,
    els.llmMaxTokens,
    els.llmIncludeReasoning,
    els.promptName,
    els.rulesText,
    ...els.players.flatMap((p) => [
      p.controller,
      p.walkSpeed,
      p.cutSpeed,
      p.extraInstructions,
      p.instructionScheduleText,
      p.personalityName,
      ...Object.values(p.colors),
    ]),
  ];

  for (const input of inputs) {
    input.addEventListener(input.type === "checkbox" ? "change" : "input", handler);
  }
}

export { COLOR_PARTS };
