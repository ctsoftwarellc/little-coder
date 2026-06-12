// Pure helpers for ambient post-Edit PHP linting (build order item #5).
//
// The idea (from the doc): verification should be AMBIENT, not a tool the small
// model has to remember to call. After every Edit/Write that touches a .php
// file, run the cheapest possible check — `php -l` (milliseconds) — and feed one
// line back into the tool result. A syntax error then surfaces one turn after
// the edit instead of five turns later inside a Pest failure, and the model
// never had to decide to check.

export function shouldLint(toolName: string, path: string | undefined, editFailed: boolean): boolean {
  if (editFailed) return false; // the edit itself errored — nothing new on disk to lint
  const t = toolName.toLowerCase();
  if (t !== "edit" && t !== "write") return false;
  return typeof path === "string" && /\.php$/i.test(path);
}

export interface LintResult {
  ok: boolean;
  /** One compact line suitable for appending to the tool result. */
  line: string;
}

// `php -l` prints "No syntax errors detected in <file>" (exit 0) on success, or
// "PHP Parse error: <msg> in <file> on line N" (exit 255) on failure. We surface
// a compact, model-actionable line either way.
export function parsePhpLint(stdout: string, stderr: string, exitCode: number): LintResult {
  const combined = `${stdout}\n${stderr}`.trim();
  if (exitCode === 0) {
    return { ok: true, line: "php -l: syntax OK" };
  }
  // Pull the most informative line — the parse-error line if present.
  const errorLine =
    combined
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /parse error|fatal error|syntax error/i.test(l)) ?? combined.split(/\r?\n/)[0] ?? "";
  return { ok: false, line: `php -l FAILED: ${errorLine || `exit ${exitCode}`}` };
}
