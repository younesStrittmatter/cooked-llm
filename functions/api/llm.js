const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

/**
 * Cache-control markers are applied server-side so the client only sends plain
 * text blocks. The breakpoint marks the END of a cached prefix, so every system
 * block flagged `cache: true` gets one (max 4 allowed by the API).
 */
function buildSystem(blocks) {
  const flagged = blocks.filter((b) => b.cache).slice(-4);

  return blocks.map((block) => {
    const out = { type: "text", text: block.text };
    if (flagged.includes(block)) out.cache_control = { type: "ephemeral" };
    return out;
  });
}

function normalizeBlocks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b) => b && typeof b.text === "string" && b.text.trim())
    .map((b) => ({ text: b.text, cache: Boolean(b.cache) }));
}

function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const system = buildSystem(normalizeBlocks(body.system));
  let messages = normalizeMessages(body.messages);

  // Backwards compatible single-prompt form.
  if (messages.length === 0 && typeof body.prompt === "string" && body.prompt.trim()) {
    messages = [{ role: "user", content: body.prompt.trim() }];
  }

  if (messages.length === 0) {
    return Response.json({ error: "messages or prompt is required" }, { status: 400 });
  }

  const model = body.model || env.CLAUDE_MODEL || DEFAULT_MODEL;
  const maxTokens = Math.min(4096, Math.max(64, Number(body.maxTokens) || 512));

  const payload = { model, max_tokens: maxTokens, messages };
  if (system.length) payload.system = system;
  if (typeof body.temperature === "number") payload.temperature = body.temperature;

  // Callers that force a JSON-only reply (see JSON_PREFILL in llm-agent.js) pass
  // stopSequences: ["}"] so generation halts the instant the model closes its one
  // permitted object, instead of trusting a prompt instruction alone to stop it
  // from rambling on with a second attempt afterwards.
  if (Array.isArray(body.stopSequences)) {
    const stops = body.stopSequences.filter((s) => typeof s === "string" && s).slice(0, 4);
    if (stops.length) payload.stop_sequences = stops;
  }

  const started = Date.now();
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return Response.json({ error: `upstream request failed: ${err.message}` }, { status: 502 });
  }

  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: res.status });
  }

  const data = await res.json();
  let text = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "";
  const usage = data.usage ?? {};

  // The Anthropic API omits the matched stop sequence from the returned text, so
  // a "}" stop puts back the closing brace it swallowed — otherwise every reply
  // stopped this way would arrive missing the character that makes it valid JSON.
  if (data.stop_reason === "stop_sequence" && typeof data.stop_sequence === "string") {
    text += data.stop_sequence;
  }

  return Response.json({
    text,
    model: data.model ?? model,
    latencyMs: Date.now() - started,
    stopReason: data.stop_reason ?? null,
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    },
  });
}
