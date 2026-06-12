import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { resolvePhpCommand } from "../arcova-verify/php.ts";
import { parsePhpLint, shouldLint, type LintResult } from "./lint.ts";

// ── Ambient post-Edit PHP lint (build order item #5) ────────────────────────
// A PostToolUse-style hook: after every Edit/Write on a .php file, run `php -l`
// on the touched file and append one line to the tool result. The model never
// decides whether to check — checking is ambient — so a syntax error surfaces
// immediately instead of inside a later Pest failure.
//
// Disable with LITTLE_CODER_AMBIENT_PHP_LINT=0. Silently skips when no php
// binary is resolvable (resolvePhpCommand falls back to "php"; if that isn't on
// PATH the spawn errors and we leave the result untouched).

function disabled(): boolean {
  return process.env.LITTLE_CODER_AMBIENT_PHP_LINT === "0";
}

function lintTimeoutMs(): number {
  const parsed = Number(process.env.LITTLE_CODER_AMBIENT_PHP_LINT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
}

function runPhpLint(php: string, absPath: string, timeoutMs: number): LintResult | null {
  const res = spawnSync(php, ["-l", absPath], { encoding: "utf-8", timeout: timeoutMs, windowsHide: true });
  if (res.error) return null; // php not found / spawn failure — skip ambiently
  return parsePhpLint(res.stdout ?? "", res.stderr ?? "", res.status ?? 1);
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    if (disabled()) return;
    const toolName = String((event as any).toolName ?? "");
    const input = ((event as any).input ?? {}) as Record<string, unknown>;
    const rawPath = (input.path ?? input.file_path) as string | undefined;
    if (!shouldLint(toolName, rawPath, (event as any).isError === true)) return;

    const cwd = (ctx as any)?.cwd ?? process.cwd();
    const absPath = rawPath && isAbsolute(rawPath) ? rawPath : join(cwd, rawPath as string);

    const result = runPhpLint(resolvePhpCommand(), absPath, lintTimeoutMs());
    if (!result) return; // php unavailable — stay silent

    const existing = (event as any).content ?? [];
    const appended = [...existing, { type: "text" as const, text: result.line }];

    if (!result.ok) {
      try {
        ctx.ui.notify(`ambient-verify: ${result.line}`, "warning");
      } catch {
        // best-effort
      }
      // Flip the result to an error so the model treats the broken syntax as a
      // problem to fix on the next turn rather than moving on.
      return { content: appended, isError: true };
    }
    return { content: appended };
  });
}
