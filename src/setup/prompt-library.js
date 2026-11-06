import { apiListPrompts, apiSavePrompt, apiLoadPrompt, apiDeletePrompt } from "../game/admin-api.js";

export function normalizePromptName(name) {
  return name.trim().replace(/\s+/g, " ");
}

/** Wire save / load / delete controls for the rules prompt editor. */
export function initPromptLibrary({
  nameInput,
  select,
  saveBtn,
  loadBtn,
  deleteBtn,
  rulesText,
  onLoad,
  onSaved,
  onError,
}) {
  function reportError(err) {
    console.error(err);
    onError?.(err.message ?? String(err));
  }

  async function refreshSelect(selectedName = select.value) {
    let prompts = [];
    try {
      ({ prompts } = await apiListPrompts());
    } catch (err) {
      reportError(err);
    }

    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = prompts.length ? "— saved prompts —" : "— no saved prompts —";
    select.appendChild(placeholder);

    for (const { name } of prompts) {
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
    const key = normalizePromptName(name);
    if (!key) return false;

    try {
      const { text } = await apiLoadPrompt(key);
      rulesText.value = text;
      nameInput.value = key;
      await refreshSelect(key);
      onLoad?.(text, key);
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  }

  saveBtn.addEventListener("click", async () => {
    const name = normalizePromptName(nameInput.value);
    if (!name) {
      alert("Enter a name for this prompt first.");
      return;
    }

    try {
      await apiSavePrompt(name, rulesText.value);
      nameInput.value = name;
      await refreshSelect(name);
      onSaved?.(name);
    } catch (err) {
      alert(err.message);
    }
  });

  loadBtn.addEventListener("click", async () => {
    if (!select.value) {
      alert("Pick a saved prompt to load.");
      return;
    }
    await loadNamed(select.value);
  });

  deleteBtn.addEventListener("click", async () => {
    const name = normalizePromptName(select.value);
    if (!name) {
      alert("Pick a saved prompt to delete.");
      return;
    }
    if (!confirm(`Delete saved prompt "${name}"?`)) return;

    try {
      await apiDeletePrompt(name);
      if (normalizePromptName(nameInput.value) === name) nameInput.value = "";
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
