// Tier-2 narrator client: a tiny, SEPARATE local model that condenses opaque
// tool output (test logs, stack traces) into one human sentence. Runs on its
// own endpoint so it never competes with the main coding model for VRAM, and
// is invoked only in the dead time while a tool is executing.
//
// Default model: google/gemma-4-e2b. Point it at whatever local OpenAI-
// compatible server hosts it (Ollama on :11434 by default).
//
//   LITTLE_CODER_NARRATOR_MODEL     (default google/gemma-4-e2b)
//   LITTLE_CODER_NARRATOR_BASE_URL  (default http://127.0.0.1:11434/v1)
//   LITTLE_CODER_NARRATOR_API_KEY   (default "noop" — local servers ignore it)
//   LITTLE_CODER_NARRATOR=0         disables Tier 2 (Tier 0/1 still run)
//
// Everything here is best-effort: any error/timeout returns null and the
// narrator falls back to the deterministic verdict. Never throws into the loop.

export const DEFAULT_NARRATOR_MODEL = "google/gemma-4-e2b";
const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";

export interface NarratorConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

/** Resolve config from env, or null when Tier 2 is disabled. */
export function narratorConfig(env: NodeJS.ProcessEnv = process.env): NarratorConfig | null {
  if (env.LITTLE_CODER_NARRATOR === "0") return null;
  const model = env.LITTLE_CODER_NARRATOR_MODEL?.trim() || DEFAULT_NARRATOR_MODEL;
  const baseUrl = env.LITTLE_CODER_NARRATOR_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const apiKey = env.LITTLE_CODER_NARRATOR_API_KEY?.trim() || "noop";
  const parsedTimeout = Number(env.LITTLE_CODER_NARRATOR_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 8000;
  return { baseUrl, model, apiKey, timeoutMs };
}

const SYSTEM_PROMPT =
  "You narrate a coding agent's progress for a human watching. " +
  "Given raw tool output, reply with ONE short, plain sentence (max ~15 words) " +
  "describing the outcome — e.g. '3 tests failed in AuthTest, all password-hash mismatches'. " +
  "No preamble, no markdown, no quotes.";

type FetchLike = (url: string, init: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/**
 * Summarize raw tool output to a single line via the narrator model. Returns
 * null on any failure (timeout, connection refused, bad payload) so the caller
 * degrades to the deterministic verdict.
 */
export async function summarize(
  rawOutput: string,
  context: string,
  cfg: NarratorConfig,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<string | null> {
  const text = rawOutput.length > 6000 ? rawOutput.slice(-6000) : rawOutput; // tail is the interesting part
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 60,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Context: ${context}\n\nOutput:\n${text}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const line = content.replace(/\s+/g, " ").trim();
    return line.length > 0 ? line : null;
  } catch {
    return null; // aborted / network error / parse error — best-effort
  } finally {
    clearTimeout(timer);
  }
}
