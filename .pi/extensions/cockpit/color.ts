// ANSI color pass for the cockpit. Applied as the LAST step, after all layout
// and padding are done in plain text — color codes don't advance the terminal
// cursor, so wrapping already-placed characters preserves alignment.
//
// Gated: disabled by NO_COLOR (the de-facto standard) or
// LITTLE_CODER_COCKPIT_COLOR=0. If a terminal renders the escapes as literal
// garbage, that's the off switch.

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

// 256-color palette tuned to the target mock (teal labels, amber values).
const C = {
  border: 240, // dim grey
  header: 80, // teal — section headers
  label: 73, // cyan/teal — field labels
  value: 180, // soft amber — values
  ok: 71, // green
  warn: 214, // amber
  bad: 167, // red
  scan: 75, // blue
  dim: 244,
};

function fg(code: number, s: string, bold = false): string {
  return `${ESC}${bold ? "1;" : ""}38;5;${code}m${s}${RESET}`;
}

export function colorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.LITTLE_CODER_COCKPIT_COLOR === "0") return false;
  return true;
}

// Per-tag semantics → color.
function tagColor(tag: string): number {
  const t = tag.trim();
  if (["DONE", "CLEAN", "ALLOW", "SAFE", "PASS"].includes(t)) return C.ok;
  if (["FAIL", "LOCKED", "BLOCKED"].includes(t)) return C.bad;
  if (["WAIT", "NEXT", "GUARD", "TEST", "SHELL", "DIFF", "EDIT", "EXPORT", "MISSION"].includes(t)) return C.warn;
  return C.scan; // SCAN, READ, BROWSE, ARCOVA, EVIDENCE, INFO…
}

const HEADERS = "PREFLIGHT|MISSION|ACTIVITY|PLAN|VERIFY|CHANGED|COMMAND|NEXT|AXIOM|GUARD";
const LABELS = "Project|STATE|MODEL|CONTEXT|VERIFY|FILES|RISK|MODE";

/** Paint a single already-laid-out line. Visible characters are unchanged. */
export function paintLine(line: string): string {
  let s = line;

  // Box-drawing characters → dim.
  s = s.replace(/[┌┐└┘├┤┬┴┼─│]+/g, (m) => fg(C.border, m));

  // Bracketed status tags, e.g. "[SCAN ]" "[DONE ]" "[LOCKED]".
  s = s.replace(/\[([A-Z]+)\s*\]/g, (m, tag) => fg(tagColor(tag), m, true));

  // HUD field labels "Foo:" (not preceded by a tag bracket).
  s = s.replace(new RegExp(`\\b(${LABELS}):`, "g"), (m) => fg(C.label, m, true));

  // Section headers — standalone words, not "VERIFY:" labels and not "[MISSION]" tags.
  s = s.replace(new RegExp(`(?<!\\[)\\b(${HEADERS})\\b(?!:)(?!\\])`, "g"), (m) => fg(C.header, m, true));

  // Plan / status glyphs.
  s = s.replace(/▶/g, (m) => fg(C.warn, m, true));
  s = s.replace(/✓/g, (m) => fg(C.ok, m, true));
  s = s.replace(/✗/g, (m) => fg(C.bad, m, true));

  return s;
}

export function paint(lines: string[], env: NodeJS.ProcessEnv = process.env): string[] {
  if (!colorEnabled(env)) return lines;
  return lines.map(paintLine);
}

// Test helper: strip ANSI so assertions can check visible content is preserved.
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
