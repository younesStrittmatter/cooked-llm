const KEY_STORAGE = "cooked-llm-admin-key";

export function getAdminKey() {
  return sessionStorage.getItem(KEY_STORAGE) || "";
}

export function setAdminKey(key) {
  if (key) sessionStorage.setItem(KEY_STORAGE, key);
  else sessionStorage.removeItem(KEY_STORAGE);
}

export function clearAdminKey() {
  sessionStorage.removeItem(KEY_STORAGE);
}

export async function checkAdminKey(key) {
  try {
    const res = await fetch("/api/admin/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: key }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    if (data.error) return { ok: false, error: data.error };
    return { ok: false, error: res.status === 401 ? "Incorrect password." : `Login failed (${res.status}).` };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

/** Whether this deployment has ADMIN_PASSWORD configured (no secret exposed). */
export async function adminConfigured() {
  try {
    const res = await fetch("/api/admin/check");
    if (!res.ok) return null;
    const data = await res.json();
    return Boolean(data.configured);
  } catch {
    return null;
  }
}

function authHeaders() {
  return {
    "x-admin-key": getAdminKey(),
    "content-type": "application/json",
  };
}

async function errorMessage(res) {
  try {
    const data = await res.json();
    return data.error || `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function request(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    clearAdminKey();
    throw new Error("Session expired — please unlock again.");
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export function apiListMaps() {
  return request("/api/maps", { headers: authHeaders() });
}

export function apiSaveMap(name, text) {
  return request("/api/maps", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, text }),
  });
}

export function apiLoadMap(name) {
  return request(`/api/maps/${encodeURIComponent(name)}`, { headers: authHeaders() });
}

export function apiDeleteMap(name) {
  return request(`/api/maps/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export function apiListPrompts() {
  return request("/api/prompts", { headers: authHeaders() });
}

export function apiSavePrompt(name, text) {
  return request("/api/prompts", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, text }),
  });
}

export function apiLoadPrompt(name) {
  return request(`/api/prompts/${encodeURIComponent(name)}`, { headers: authHeaders() });
}

export function apiDeletePrompt(name) {
  return request(`/api/prompts/${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export function apiListPersonalities(cook) {
  return request(`/api/personalities?cook=${encodeURIComponent(cook)}`, { headers: authHeaders() });
}

export function apiSavePersonality(cook, name, extraInstructions, instructionScheduleText) {
  return request("/api/personalities", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ cook, name, extraInstructions, instructionScheduleText }),
  });
}

export function apiLoadPersonality(cook, name) {
  const qs = `cook=${encodeURIComponent(cook)}`;
  return request(`/api/personalities/${encodeURIComponent(name)}?${qs}`, { headers: authHeaders() });
}

export function apiDeletePersonality(cook, name) {
  const qs = `cook=${encodeURIComponent(cook)}`;
  return request(`/api/personalities/${encodeURIComponent(name)}?${qs}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export function apiGetConfig() {
  return request("/api/config", { headers: authHeaders() });
}

export function apiPublishConfig(config) {
  return request("/api/config", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(config),
  });
}

export function apiListSessions() {
  return request("/api/sessions", { headers: authHeaders() });
}

export function apiGetSession(key) {
  return request(`/api/sessions/${encodeURIComponent(key)}`, { headers: authHeaders() });
}

export function apiDeleteSession(key) {
  return request(`/api/sessions/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}
