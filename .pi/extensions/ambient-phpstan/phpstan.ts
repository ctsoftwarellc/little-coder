// Pure helpers for ambient static analysis (PHPStan / Larastan).
//
// `php -l` (ambient-verify) only catches *syntax* errors. The errors a small
// model actually introduces are semantic: calling an undefined method, passing
// the wrong type, accessing a property that doesn't exist. PHPStan/Larastan
// catch exactly those. This runs it on the single changed file after an edit
// and feeds the top findings back — same ambient principle as `php -l`, one
// level deeper. Reported as info (not a hard error): a project's existing
// baseline can be noisy, so we surface, we don't block.

export interface PhpstanFinding {
  line: number | null;
  message: string;
}

export interface PhpstanResult {
  ok: boolean;
  findings: PhpstanFinding[];
  /** One compact line suitable for appending to a tool result. */
  line: string;
}

/**
 * Parse `phpstan analyse --error-format=json` output. Shape:
 *   { totals: { errors, file_errors }, files: { "<path>": { errors, messages: [{ message, line }] } } }
 * Tolerant of extra leading/trailing noise (some setups print warnings first).
 */
export function parsePhpstanJson(stdout: string, maxFindings = 3): PhpstanResult {
  const json = extractJson(stdout);
  if (!json) {
    return { ok: true, findings: [], line: "phpstan: no parseable output (skipped)" };
  }

  const findings: PhpstanFinding[] = [];
  const files = json.files && typeof json.files === "object" ? json.files : {};
  for (const entry of Object.values(files) as any[]) {
    for (const msg of (entry?.messages ?? []) as any[]) {
      if (msg && typeof msg.message === "string") {
        findings.push({ line: Number.isFinite(Number(msg.line)) ? Number(msg.line) : null, message: msg.message });
      }
    }
  }
  // Also surface file-agnostic errors (e.g. config issues) if present.
  for (const err of (json.errors ?? []) as any[]) {
    if (typeof err === "string") findings.push({ line: null, message: err });
  }

  if (findings.length === 0) {
    return { ok: true, findings: [], line: "phpstan: no issues on changed file" };
  }

  const shown = findings.slice(0, maxFindings);
  const rendered = shown
    .map((f) => `${f.line != null ? `L${f.line}: ` : ""}${truncateMessage(f.message)}`)
    .join(" | ");
  const more = findings.length > shown.length ? ` (+${findings.length - shown.length} more)` : "";
  return { ok: false, findings, line: `phpstan: ${findings.length} issue(s) — ${rendered}${more}` };
}

function truncateMessage(message: string, limit = 140): string {
  const clean = message.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

/** Find the first balanced JSON object in a noisy stdout blob. */
function extractJson(stdout: string): any | null {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < stdout.length; i++) {
    const ch = stdout[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(stdout.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function shouldAnalyse(toolName: string, path: string | undefined, editFailed: boolean): boolean {
  if (editFailed) return false;
  const t = toolName.toLowerCase();
  if (t !== "edit" && t !== "write") return false;
  return typeof path === "string" && /\.php$/i.test(path);
}

export type AnalyseMode = "off" | "auto" | "on";

/** Resolve the gating mode from the env flag (default: auto = on iff phpstan is installed). */
export function analyseMode(env: NodeJS.ProcessEnv = process.env): AnalyseMode {
  const raw = env.LITTLE_CODER_AMBIENT_PHPSTAN;
  if (raw === "0" || raw === "off") return "off";
  if (raw === "1" || raw === "on") return "on";
  return "auto";
}
