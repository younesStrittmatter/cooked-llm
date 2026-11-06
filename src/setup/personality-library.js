import {
  apiListPersonalities,
  apiSavePersonality,
  apiLoadPersonality,
  apiDeletePersonality,
} from "../game/admin-api.js";

export function normalizePersonalityName(name) {
  return name.trim().replace(/\s+/g, " ");
}

/** Wire save / load / delete controls for one cook's personality + schedule. */
export function initPersonalityLibrary({
  cookId,
  nameInput,
  select,
  saveBtn,
  loadBtn,
  deleteBtn,
  instructionsEl,
  scheduleEl,
  onLoad,
  onSaved,
  onError,
}) {
  function reportError(err) {
    console.error(err);
    onError?.(err.message ?? String(err));
  }

  async function refreshSelect(selectedName = select.value) {
    let personalities = [];
    try {
      ({ personalities } = await apiListPersonalities(cookId));
    } catch (err) {
      reportError(err);
    }

    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = personalities.length
      ? "— saved personalities —"
      : "— no saved personalities —";
    select.appendChild(placeholder);

    for (const { name } of personalities) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }

    if (selectedName && [...select.options].some((o) => o.value === selectedName)) {
      select.value = selectedName;
    }
  }

  async function loadNamed(name) {
    const key = normalizePersonalityName(name);
    if (!key) return false;

    try {
      const { extraInstructions, instructionScheduleText } = await apiLoadPersonality(cookId, key);
      instructionsEl.value = extraInstructions;
      scheduleEl.value = instructionScheduleText;
      nameInput.value = key;
      await refreshSelect(key);
      onLoad?.({ extraInstructions, instructionScheduleText }, key);
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  }

  saveBtn.addEventListener("click", async () => {
    const name = normalizePersonalityName(nameInput.value);
    if (!name) {
      alert("Enter a name for this personality first.");
      return;
    }

    try {
      await apiSavePersonality(cookId, name, instructionsEl.value, scheduleEl.value);
      nameInput.value = name;
      await refreshSelect(name);
      onSaved?.(name);
    } catch (err) {
      alert(err.message);
    }
  });

  loadBtn.addEventListener("click", async () => {
    if (!select.value) {
      alert("Pick a saved personality to load.");
      return;
    }
    await loadNamed(select.value);
  });

  deleteBtn.addEventListener("click", async () => {
    const name = normalizePersonalityName(select.value);
    if (!name) {
      alert("Pick a saved personality to delete.");
      return;
    }
    if (!confirm(`Delete saved personality "${name}" for ${cookId}?`)) return;

    try {
      await apiDeletePersonality(cookId, name);
      if (normalizePersonalityName(nameInput.value) === name) nameInput.value = "";
      await refreshSelect();
    } catch (err) {
      alert(err.message);
    }
  });

  select.addEventListener("change", () => {
    if (select.value) nameInput.value = select.value;
  });

  refreshSelect();

  return { refreshSelect, loadNamed };
}
