// Pure layout for the cockpit control surface. Kept separate from index.ts so
// the box drawing, context-health thresholds, and verify rows are unit-testable
// without a live TUI.

const ICONS = {
  emoji: { read: "📖", edit: "✏️", verify: "🧪", done: "✓", fail: "✗", wait: "⏳", plan: "🧭", guard: "🛡️" },
  ascii: { read: "[R]", edit: "[E]", verify: "[V]", done: "OK", fail: "XX", wait: "..", plan: ">>", guard: "##" },
};

export function useAscii(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LITTLE_CODER_COCKPIT_ASCII === "1";
}

function clampWidth(cols: number | undefined): number {
  const c = Number(cols);
  if (!Number.isFinite(c) || c <= 0) return 78; // unknown terminal → sane default
  return Math.max(48, Math.min(c - 1, 100));
}

// Truncate to a visible width (cheap: assumes 1 col/char; box-drawing + ASCII
// labels are width-1, which is what we control here).
function fit(s: string, width: number): string {
  if (s.length <= width) return s;
  return width <= 1 ? s.slice(0, width) : s.slice(0, width - 1) + "…";
}

/**
 * Draw a titled box:
 *   ┌─ <title> ───────────────────────── <right> ─┐
 *   │ row…                                          │
 *   └───────────────────────────────────────────────┘
 */
export function box(title: string, right: string, rows: string[], cols?: number): string[] {
  const width = clampWidth(cols);
  const inner = width - 2; // space between the two vertical bars
  const top = topBorder(title, right, width);
  const body = rows.map((r) => `│ ${fit(r, inner - 2).padEnd(inner - 2)} │`);
  const bottom = `└${"─".repeat(inner)}┘`;
  return [top, ...body, bottom];
}

function topBorder(title: string, right: string, width: number): string {
  const inner = width - 2;
  const left = title ? `─ ${title} ` : "─";
  const rightLabel = right ? ` ${right} ─` : "";
  const fillLen = Math.max(0, inner - left.length - rightLabel.length);
  return `┌${left}${"─".repeat(fillLen)}${rightLabel}┐`;
}

/** A two-column key/value cell, padded to a fixed cell width. */
export function cell(key: string, value: string, keyWidth = 8, cellWidth = 34): string {
  const text = `${key.padEnd(keyWidth)} ${value}`;
  return text.length >= cellWidth ? text.slice(0, cellWidth) : text.padEnd(cellWidth);
}

/** Health verdict for context usage, e.g. "6% OK", "84% HIGH", "96% COMPACT SOON". */
export function contextHealth(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(Number(percent))) return "—";
  const p = Math.round(Number(percent));
  if (p >= 95) return `${p}% COMPACT SOON`;
  if (p >= 80) return `${p}% HIGH`;
  return `${p}% OK`;
}

export interface VerifyPhases {
  tests?: "pass" | "fail" | "not run";
  lint?: "pass" | "fail" | "not run";
  types?: "pass" | "fail" | "not run";
  build?: "pass" | "fail" | "not run";
}

/** Render VERIFY as a first-class multi-row phase. */
export function verifyRows(phases: VerifyPhases, ascii = false): string[] {
  const mark = (s: string | undefined) => {
    if (s === "pass") return ascii ? "OK  " : "✓   ";
    if (s === "fail") return ascii ? "FAIL" : "✗   ";
    return "—   ";
  };
  return (["tests", "lint", "types", "build"] as const).map(
    (k) => `  ${k.padEnd(7)} ${mark(phases[k])} ${phases[k] ?? "not run"}`,
  );
}

export function icon(name: keyof typeof ICONS.emoji, ascii: boolean): string {
  return (ascii ? ICONS.ascii : ICONS.emoji)[name];
}

export function terminalCols(): number | undefined {
  return process.stdout && typeof process.stdout.columns === "number" ? process.stdout.columns : undefined;
}

export function terminalRows(): number | undefined {
  return process.stdout && typeof process.stdout.rows === "number" ? process.stdout.rows : undefined;
}

// pi's interactive mode hard-caps string-array widgets at 10 lines
// (InteractiveMode.MAX_WIDGET_LINES) and appends "... (widget truncated)" past
// that. We render at most BUDGET lines so that never fires — and so the panel
// stays an instrument strip, not a full screen that buries the chat.
export const WIDGET_LINE_BUDGET = 9;

/** Truncate a line to a visible width with an ellipsis (mirrors box's fit). */
export function truncate(s: string, width: number): string {
  if (width <= 0) return "";
  if (s.length <= width) return s;
  return width <= 1 ? s.slice(0, width) : s.slice(0, width - 1) + "…";
}

/** A horizontal rule sized to the panel width. */
export function rule(cols?: number): string {
  return "─".repeat(Math.max(8, panelWidth(cols)));
}

/**
 * Join status segments with " · " and drop trailing ones that don't fit the
 * width — so the strip degrades gracefully on a narrow terminal instead of
 * wrapping or being hard-cut mid-word.
 */
export function joinSegments(segments: string[], cols?: number): string {
  const width = panelWidth(cols);
  const kept: string[] = [];
  for (const seg of segments.filter(Boolean)) {
    const candidate = [...kept, seg].join(" · ");
    if (candidate.length > width && kept.length > 0) break;
    kept.push(seg);
  }
  return truncate(kept.join(" · "), width);
}

/** Total usable width (mirrors box's clamp) for laying out the body columns. */
export function panelWidth(cols?: number): number {
  return clampWidth(cols);
}

/**
 * Lay two text columns side by side. Left column is padded to `leftW`; the
 * right column starts after a gutter. Rows are zipped to the taller column.
 */
export function twoColumn(left: string[], right: string[], totalWidth: number, gutter = 3): string[] {
  const leftW = Math.max(20, Math.floor((totalWidth - gutter) * 0.52));
  const rightW = Math.max(10, totalWidth - gutter - leftW);
  const rows = Math.max(left.length, right.length);
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    const l = fit(left[i] ?? "", leftW).padEnd(leftW);
    const r = fit(right[i] ?? "", rightW);
    out.push(`${l}${" ".repeat(gutter)}${r}`.replace(/\s+$/, ""));
  }
  return out;
}

/**
 * The two-row labeled HUD inside the box. `axiomLabel` prefixes row 1; row 2 is
 * indented to align. Each row is an array of "LABEL: value" cells laid out in
 * equal thirds of the inner width.
 */
export function hudRows(axiomLabel: string, row1: string[], row2: string[], cols?: number): string[][] {
  const inner = clampWidth(cols) - 4; // inside "│ " … " │"
  const labelW = Math.max(6, axiomLabel.length + 2);
  const colW = Math.max(12, Math.floor((inner - labelW) / row1.length));
  const lay = (cells: string[]) => cells.map((c, i) => (i < cells.length - 1 ? c.padEnd(colW) : c)).join("");
  return [
    [`${axiomLabel.padEnd(labelW)}${lay(row1)}`],
    [`${" ".repeat(labelW)}${lay(row2)}`],
  ];
}
