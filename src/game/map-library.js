import { apiListMaps, apiSaveMap, apiLoadMap, apiDeleteMap } from "./admin-api.js";

export function normalizeMapName(name) {
  return name.trim().replace(/\s+/g, " ");
}

/** Wire save / load / delete controls for the map editor against the server library. */
export function initMapLibrary({
  nameInput,
  select,
  saveBtn,
  loadBtn,
  deleteBtn,
  mapText,
  onLoad,
  onSaved,
  onError,
}) {
  function reportError(err) {
    console.error(err);
    onError?.(err.message ?? String(err));
  }

  async function refreshSelect(selectedName = select.value) {
    let maps = [];
    try {
      ({ maps } = await apiListMaps());
    } catch (err) {
      reportError(err);
    }

    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = maps.length ? "— saved maps —" : "— no saved maps —";
    select.appendChild(placeholder);

    for (const { name } of maps) {
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
    const key = normalizeMapName(name);
    if (!key) return false;

    try {
      const { text } = await apiLoadMap(key);
      mapText.value = text;
      nameInput.value = key;
      await refreshSelect(key);
      onLoad(text);
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  }

  saveBtn.addEventListener("click", async () => {
    const name = normalizeMapName(nameInput.value);
    if (!name) {
      alert("Enter a name for this map first.");
      return;
    }

    try {
      await apiSaveMap(name, mapText.value);
      nameInput.value = name;
      await refreshSelect(name);
      onSaved?.(name);
    } catch (err) {
      alert(err.message);
    }
  });

  loadBtn.addEventListener("click", async () => {
    if (!select.value) {
      alert("Pick a saved map to load.");
      return;
    }
    await loadNamed(select.value);
  });

  deleteBtn.addEventListener("click", async () => {
    const name = normalizeMapName(select.value);
    if (!name) {
      alert("Pick a saved map to delete.");
      return;
    }
    if (!confirm(`Delete saved map "${name}"?`)) return;

    try {
      await apiDeleteMap(name);
      if (normalizeMapName(nameInput.value) === name) nameInput.value = "";
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
