import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { resolvePhpCommand } from "../arcova-verify/php.ts";
import { analyseMode, parsePhpstanJson, shouldAnalyse, type AnalyseMode } from "./phpstan.ts";

// ── Ambient static analysis (PHPStan / Larastan) ─────────────────────────────
// After an Edit/Write on a .php file, run PHPStan on just that file and append
// the top findings to the tool result. Semantic errors (undefined method, bad
// type, missing property) — the ones a small model invents — then surface one
// turn after the edit instead of inside a later fatal.
//
// Gating (LITTLE_CODER_AMBIENT_PHPSTAN):
//   auto (default) — run iff vendor/bin/phpstan exists
//   1 / on         — always try
//   0 / off        — never run
//
// Findings are appended as info and the result is NOT flipped to an error: a
// project's pre-existing baseline can be noisy, so we inform rather than block.

function phpstanBinary(cwd: string): string | null {
  for (const rel of ["vendor/bin/phpstan", "vendor/bin/phpstan.phar"]) {
    const abs = join(cwd, rel);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function analyseTimeoutMs(): number {
  const parsed = Number(process.env.LITTLE_CODER_AMBIENT_PHPSTAN_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20_000;
}

function maxFindings(): number {
  const parsed = Number(process.env.LITTLE_CODER_AMBIENT_PHPSTAN_MAX);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
}

function resolveEnabled(mode: AnalyseMode, bin: string | null): boolean {
  if (mode === "off") return false;
  if (mode === "auto") return bin != null;
  return true; // "on" — try even if we couldn't find the binary in the usual place
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event, ctx) => {
    const mode = analyseMode();
    if (mode === "off") return;

    const toolName = String((event as any).toolName ?? "");
    const input = ((event as any).input ?? {}) as Record<string, unknown>;
    const rawPath = (input.path ?? input.file_path) as string | undefined;
    if (!shouldAnalyse(toolName, rawPath, (event as any).isError === true)) return;

    const cwd = (ctx as any)?.cwd ?? process.cwd();
    const bin = phpstanBinary(cwd);
    if (!resolveEnabled(mode, bin)) return;
    if (!bin) return; // "on" but no binary resolvable — nothing to run

    const absPath = rawPath && isAbsolute(rawPath) ? rawPath : join(cwd, rawPath as string);
    const php = resolvePhpCommand();
    const res = spawnSync(
      php,
      [bin, "analyse", "--no-progress", "--error-format=json", "--no-interaction", absPath],
      { cwd, encoding: "utf-8", timeout: analyseTimeoutMs(), windowsHide: true },
    );
    if (res.error) return; // couldn't spawn — stay silent

    const result = parsePhpstanJson(`${res.stdout ?? ""}\n${res.stderr ?? ""}`, maxFindings());
    if (result.ok || result.findings.length === 0) return; // clean or unparseable — no noise

    try {
      ctx.ui.notify(result.line, "warning");
    } catch {
      // best-effort
    }
    const existing = (event as any).content ?? [];
    return { content: [...existing, { type: "text" as const, text: result.line }] };
  });
}
