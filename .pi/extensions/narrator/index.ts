import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describeToolCall, fallbackVerdict, shouldSummarize, tailLines } from "../_shared/narrate.ts";
import { narratorConfig, summarize } from "../_shared/mini-llm.ts";
import { clearAgentStatus, formatStatusHeader } from "../_shared/agent-status.ts";

// ── The narrator (agent-feel UX) ────────────────────────────────────────────
// Replaces the bare spinner with a running, human-readable account of what the
// agent is doing, in a widget above the editor:
//
//   ✏️ Editing UserController.php (2 changes)
//   🧪 Verifying (LoginTest)
//     › PASS  it validates the password hash
//     › FAIL  it rejects an expired token
//   3 tests failed in AuthTest, all password-hash mismatches   ← Tier-2 summary
//
// Three tiers (see _shared/narrate.ts and _shared/mini-llm.ts):
//   0. Deterministic phrase per tool call — free.
//   1. Live tail of streaming tool output (Verify forwards via onUpdate) — free.
//   2. A separate tiny model (google/gemma-4-e2b) condenses big/opaque output
//      into one sentence, run in the dead time while the tool executes.
//
// Disable entirely with LITTLE_CODER_NARRATOR_UI=0. Tier 2 alone is gated by
// narratorConfig() (LITTLE_CODER_NARRATOR=0 turns just it off). All UI calls are
// best-effort — in RPC/benchmark modes setWidget is a no-op and we stay silent.

const WIDGET_KEY = "narrator";
const MAX_TAIL = 6;

function uiDisabled(): boolean {
  return process.env.LITTLE_CODER_NARRATOR_UI === "0";
}

function contentText(content: any): string {
  if (!Array.isArray(content)) return "";
  return content.filter((c) => c?.type === "text").map((c) => c.text).join("\n");
}

export default function (pi: ExtensionAPI) {
  if (uiDisabled()) return;

  // Per-tool-call streamed-output buffers, and the phrase currently shown.
  const buffers = new Map<string, string>();
  const phrases = new Map<string, string>();
  let currentPhrase = "";
  // Last activity/verdict line(s), so a turn-boundary header refresh keeps the
  // most recent narration beneath the updated header.
  let lastLines: string[] = [];

  // Every render prepends the persistent status header (phase · plan · cache ·
  // tok/s) when any of those facts are known, so "where am I / how fast" sits
  // above "what am I doing right now".
  const render = (ctx: any, lines: string[]) => {
    lastLines = lines;
    const header = formatStatusHeader();
    const body = header ? [header, ...lines] : lines;
    try {
      ctx.ui.setWidget(WIDGET_KEY, body);
    } catch {
      // UI unavailable (RPC/print) — narration is purely cosmetic, ignore.
    }
  };

  // Re-render with the same body so the header picks up fresh phase/plan/timing
  // facts at turn boundaries (cache% + tok/s are published at turn_end).
  const refreshHeader = (ctx: any) => render(ctx, lastLines);

  const clear = (ctx: any) => {
    try {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    } catch {
      // ignore
    }
  };

  pi.on("tool_call", async (event, ctx) => {
    const id = String((event as any).toolCallId ?? "");
    const toolName = String((event as any).toolName ?? "");
    const phrase = describeToolCall(toolName, (event as any).input);
    currentPhrase = phrase;
    if (id) phrases.set(id, phrase);
    render(ctx, [phrase]);
  });

  // Tier 1: tail streamed output (Verify forwards chunks through onUpdate).
  pi.on("tool_execution_update", async (event, ctx) => {
    const id = String((event as any).toolCallId ?? "");
    const chunk = contentText((event as any).partialResult?.content);
    if (!chunk) return;
    const prev = buffers.get(id) ?? "";
    const next = prev + (prev ? "\n" : "") + chunk;
    buffers.set(id, next);
    const phrase = phrases.get(id) ?? currentPhrase;
    render(ctx, [phrase, ...tailLines(next, MAX_TAIL).map((l) => `  › ${l}`)]);
  });

  pi.on("tool_result", async (event, ctx) => {
    const id = String((event as any).toolCallId ?? "");
    const toolName = String((event as any).toolName ?? "");
    const isError = (event as any).isError === true;
    const streamed = buffers.get(id) ?? "";
    buffers.delete(id);
    phrases.delete(id);
    const text = streamed || contentText((event as any).content);

    const verdict = fallbackVerdict(toolName, isError, text);
    render(ctx, [verdict]);

    // Tier 2: condense opaque output with the tiny model, in the gap before the
    // main model's next turn. Best-effort and async — never blocks the loop.
    const cfg = narratorConfig();
    if (cfg && shouldSummarize(text)) {
      summarize(text, describeToolCall(toolName, (event as any).input), cfg)
        .then((summary) => {
          if (summary) render(ctx, [verdict, `  ${summary}`]);
        })
        .catch(() => {
          /* best-effort */
        });
    }
  });

  // Header refresh at turn boundaries (timings publish at turn_end).
  pi.on("turn_start", async (_e, ctx) => refreshHeader(ctx));
  pi.on("turn_end", async (_e, ctx) => refreshHeader(ctx));

  // Reset between tasks / sessions so a stale verdict doesn't linger.
  pi.on("session_start", async (_e, ctx) => {
    buffers.clear();
    phrases.clear();
    currentPhrase = "";
    lastLines = [];
    clearAgentStatus();
    clear(ctx);
  });
  pi.on("agent_end", async (_e, ctx) => {
    buffers.clear();
    phrases.clear();
  });
}
