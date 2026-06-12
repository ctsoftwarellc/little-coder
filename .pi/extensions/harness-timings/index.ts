import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync } from "node:fs";
import { computeTimingStat, formatTimingLine, timingLogRecord, type TimingUsage } from "./format.ts";

// ── Per-turn timing / cache stat (build order item #1) ──────────────────────
// Surfaces a compact line after every assistant turn so the cache economics the
// rest of the harness design hinges on become VISIBLE:
//
//     ⏱ 5.2s · 237 tok/s · prefill 1200 · cached 1100 (92%) · out 340
//
// Watch `cached`: it should stay high turn-over-turn within a task. The instant
// a harness change mutates token 0 (a per-turn system-prompt rebuild), `cached`
// collapses toward 0 and `prefill` spikes — that's a full KV re-prefill, the
// dominant latency on laptop-class VRAM. This extension is the measurement tool
// the doc says to build first; #2 (frozen prefix) is validated by watching this.
//
// Delivery:
//   - footer status (ctx.ui.setStatus) — persistent, glanceable.
//   - a per-turn notify line — scrolls with the transcript.
//   - optional JSONL append when LITTLE_CODER_TIMINGS_LOG is set (benchmarking).
//
// Disable with LITTLE_CODER_TIMINGS=0.

function disabled(): boolean {
  return process.env.LITTLE_CODER_TIMINGS === "0";
}

export default function (pi: ExtensionAPI) {
  // Wall-clock around the provider request. before_provider_request fires once
  // per turn (a turn = one assistant message); record the start there and read
  // it back at turn_end. A turn with provider retries overwrites the start, so
  // the measured span is always the final (successful) request — which is the
  // one whose `usage` we read, keeping the two consistent.
  let requestStartedAt = 0;

  pi.on("before_provider_request", async () => {
    if (disabled()) return;
    requestStartedAt = Date.now();
  });

  pi.on("turn_end", async (event, ctx) => {
    if (disabled()) return;
    const message: any = (event as any).message;
    // Only assistant messages carry usage; tool-result turns don't.
    if (!message || message.role !== "assistant") return;
    const usage = message.usage as Partial<TimingUsage> | undefined;
    if (!usage) return;

    const elapsedMs = requestStartedAt > 0 ? Date.now() - requestStartedAt : 0;
    const stat = computeTimingStat(usage, elapsedMs);
    const line = formatTimingLine(stat);

    try {
      ctx.ui.setStatus("timings", line);
    } catch {
      // Footer unavailable (RPC / print mode) — fall through to notify/log.
    }
    try {
      ctx.ui.notify(line, "info");
    } catch {
      // UI unavailable — best-effort.
    }

    const logPath = process.env.LITTLE_CODER_TIMINGS_LOG;
    if (logPath) {
      try {
        const model = typeof message.model === "string" ? message.model : process.env.LITTLE_CODER_MODEL || "";
        appendFileSync(logPath, timingLogRecord(model, stat, new Date().toISOString()) + "\n");
      } catch {
        // Non-essential telemetry — never break the turn over a failed append.
      }
    }
  });
}
