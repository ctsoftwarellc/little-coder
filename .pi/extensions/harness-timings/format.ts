// Pure formatting for the per-turn timing/cache stat line.
//
// Build order item #1 from docs/harness-design-notes.md: "Surface llama.cpp
// `timings` per turn in the TUI — prefill vs cached tokens, tok/s." This is the
// local-model equivalent of Claude Code's `/context`: it lets you SEE when a
// harness change murders the KV cache (a system-prompt mutation at token 0
// drops `cached` to ~0 and forces a full re-prefill).
//
// Pi's `after_provider_response` event only exposes status + headers, NOT the
// llama.cpp response body, so the raw `timings` object (prompt_ms / predicted_ms
// / cache_n) isn't reachable from an extension. What IS reachable is the
// normalized `usage` on the finished assistant message (pi-ai maps the
// provider's token accounting into Usage): `input` = prompt/prefill tokens,
// `cacheRead` = tokens served from cache, `output` = generated tokens. Combined
// with a wall-clock measurement taken around the provider request, that is
// enough to surface the cache story and an approximate generation throughput.

export interface TimingUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}

export interface TimingStat {
  /** Newly-prefilled prompt tokens (input not served from cache). */
  prefill: number;
  /** Prompt tokens served from the KV cache. */
  cached: number;
  /** cached / input, 0..1; 0 when input is 0. */
  cachedFraction: number;
  /** Generated (decoded) tokens. */
  output: number;
  /** Approximate generation throughput (output tokens / wall-clock seconds). */
  tokensPerSecond: number;
  elapsedMs: number;
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function computeTimingStat(usage: Partial<TimingUsage> | undefined, elapsedMs: number): TimingStat {
  const input = safeNumber(usage?.input);
  const output = safeNumber(usage?.output);
  // cacheRead can't exceed the prompt it was read for; clamp defensively so a
  // mis-reporting provider can't produce a negative "prefill".
  const cached = Math.min(safeNumber(usage?.cacheRead), input);
  const prefill = Math.max(0, input - cached);
  const ms = safeNumber(elapsedMs);
  const tokensPerSecond = ms > 0 ? (output * 1000) / ms : 0;
  return {
    prefill,
    cached,
    cachedFraction: input > 0 ? cached / input : 0,
    output,
    tokensPerSecond,
    elapsedMs: ms,
  };
}

function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

// A compact single line, e.g.
//   ⏱ 5.2s · 237 tok/s · prefill 1200 · cached 1100 (92%) · out 340
// When the provider reports no cache info (cached 0), the cached segment still
// renders as "cached 0 (0%)" — that zero IS the signal the doc wants surfaced.
export function formatTimingLine(stat: TimingStat): string {
  const seconds = round(stat.elapsedMs / 1000, 1);
  const tps = round(stat.tokensPerSecond);
  const pct = round(stat.cachedFraction * 100);
  return (
    `⏱ ${seconds}s · ${tps} tok/s · ` +
    `prefill ${stat.prefill} · cached ${stat.cached} (${pct}%) · out ${stat.output}`
  );
}

// A one-line JSONL record for offline analysis (LITTLE_CODER_TIMINGS_LOG).
export function timingLogRecord(model: string, stat: TimingStat, isoTimestamp: string): string {
  return JSON.stringify({
    ts: isoTimestamp,
    model,
    elapsed_ms: round(stat.elapsedMs),
    tokens_per_second: round(stat.tokensPerSecond, 1),
    prefill_tokens: stat.prefill,
    cached_tokens: stat.cached,
    cached_fraction: round(stat.cachedFraction, 3),
    output_tokens: stat.output,
  });
}
