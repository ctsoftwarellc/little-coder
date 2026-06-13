import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatRecoveryLine, isRecoverableTool, matchRecovery } from "./recovery.ts";

// ── Error-driven recovery hints ──────────────────────────────────────────────
// When a command/test fails, match its output against a playbook of common
// PHP/Laravel/shell error signatures and append ONE next-action line that points
// at this harness's own tools (FindSymbol, RelevantTests, ArcovaDatabaseSchema).
// Turns "model flails after a failure" into "model knows the next move."
//
// Scoped to failed bash/Verify/test results so it never double-annotates edit
// results (those are covered by php -l, phpstan, and symbol-grounding). Disable
// with LITTLE_CODER_ERROR_RECOVERY=0.

function disabled(): boolean {
  return process.env.LITTLE_CODER_ERROR_RECOVERY === "0";
}

function resultText(event: any): string {
  const content = Array.isArray(event?.content) ? event.content : [];
  const parts = content.map((c: any) => (typeof c?.text === "string" ? c.text : "")).filter(Boolean);
  return parts.join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    if (disabled()) return;
    if ((event as any).isError !== true) return; // only failures
    const toolName = String((event as any).toolName ?? "");
    if (!isRecoverableTool(toolName)) return;

    const match = matchRecovery(resultText(event));
    if (!match) return;

    const line = formatRecoveryLine(match);
    try {
      ctx.ui.notify(line, "info");
    } catch {
      // best-effort
    }
    const existing = (event as any).content ?? [];
    // Keep isError true — the failure is still a failure; we only add guidance.
    return { content: [...existing, { type: "text" as const, text: line }], isError: true };
  });
}
