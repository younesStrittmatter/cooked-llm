import { apiDeleteSession, apiGetSession, apiListSessions } from "../game/admin-api.js";

function describePlayers(players) {
  if (!players?.length) return "—";
  return players
    .map((p) => {
      const speed = p.walkSpeed != null ? ` (walk ${p.walkSpeed}, cut ${p.cutSpeed})` : "";
      const personality = p.extraInstructions ? " · custom personality" : "";
      const scheduled = p.instructionScheduleText ? " · scheduled changes" : "";
      return `${p.id}: ${p.controller}${speed}${personality}${scheduled}`;
    })
    .join(", ");
}

function describeScores(phaseResults) {
  if (!phaseResults?.length) return "no rounds finished";
  return phaseResults
    .map((r) => `${r.label} ${r.score}${r.scored ? "" : " (unscored)"}`)
    .join(" · ");
}

function describeUsage(llmUsage) {
  const entries = Object.entries(llmUsage ?? {});
  if (!entries.length) return "";
  return entries
    .map(
      ([id, u]) =>
        `${id}: ${u.turns} turns, ${u.errors} errors, ${u.cacheReadInputTokens} cached tokens read`,
    )
    .join(" · ");
}

function download(session) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cooked-session-${session.sessionId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function initSessionsPanel({ listEl, refreshBtn, onError }) {
  function row(session) {
    const el = document.createElement("div");
    el.className = "session-row";

    const when = new Date(session.startedAt).toLocaleString();
    const usage = describeUsage(session.llmUsage);

    el.innerHTML = `
      <div class="session-main">
        <strong>${when}</strong>
        <span class="session-meta">${session.mapName ?? "unnamed map"} · ${describePlayers(session.players)} · ${session.eventCount} actions</span>
        <span class="session-meta">Scored total ${session.scoredTotal} — ${describeScores(session.phaseResults)}</span>
        ${usage ? `<span class="session-meta">${usage}</span>` : ""}
      </div>
      <div class="session-actions">
        <button type="button" data-action="download">Download JSON</button>
        <button type="button" data-action="delete" class="map-delete">Delete</button>
      </div>
    `;

    el.querySelector('[data-action="download"]').addEventListener("click", async () => {
      try {
        download(await apiGetSession(session.key));
      } catch (err) {
        onError?.(err.message);
      }
    });

    el.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      if (!confirm("Delete this session log?")) return;
      try {
        await apiDeleteSession(session.key);
        refresh();
      } catch (err) {
        onError?.(err.message);
      }
    });

    return el;
  }

  async function refresh() {
    listEl.textContent = "Loading…";
    try {
      const { sessions } = await apiListSessions();
      listEl.textContent = "";
      if (!sessions.length) {
        listEl.textContent = "No sessions recorded yet.";
        return;
      }
      for (const session of sessions) listEl.append(row(session));
    } catch (err) {
      listEl.textContent = `Could not load sessions: ${err.message}`;
    }
  }

  refreshBtn.addEventListener("click", refresh);
  return { refresh };
}
