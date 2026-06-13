import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { normalizeWindowsPathsInBashCommand, shouldRoute } from "./route.ts";

// ── Shell router ─────────────────────────────────────────────────────────────
// pi's bash tool runs through POSIX bash on Windows, which strips backslashes
// from unquoted Windows paths ("C:\…\php.exe" → "command not found"). This
// tool_call hook rewrites such paths in place to a quoted, forward-slash form
// BEFORE bash sees them, so the first attempt works instead of failing and
// burning a turn. Already-quoted paths and POSIX commands are left untouched.
//
// Disable with LITTLE_CODER_SHELL_ROUTER=0.

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (String((event as any).toolName ?? "").toLowerCase() !== "bash") return;
    if (!shouldRoute()) return;

    const input = (event as any).input as { command?: unknown } | undefined;
    const command = input?.command;
    if (typeof command !== "string" || command.length === 0) return;

    const { command: rewritten, changed } = normalizeWindowsPathsInBashCommand(command);
    if (!changed) return;

    // Mutate in place — pi runs the patched command (event.input is mutable).
    (input as { command: string }).command = rewritten;
    try {
      ctx.ui.notify("shell-router: normalized Windows path for bash (quoted + forward slashes)", "info");
    } catch {
      // best-effort
    }
  });
}
