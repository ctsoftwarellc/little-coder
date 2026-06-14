// The cockpit as a real pi Component (setWidget factory form) instead of a flat
// string[] widget. Two things change because of that:
//
//   1. No line cap. pi only truncates the string[] widget path at
//      MAX_WIDGET_LINES (10); a Component's render(width) is drawn verbatim. So
//      the panel can be a genuine multi-section HUD (status · mission · guard ·
//      plan · activity) instead of a 9-line instrument strip.
//   2. Real width + real theme. render(width) receives the actual viewport
//      width (no more process.stdout.columns guessing) and the factory receives
//      the active Theme, so colors track the user's chosen theme rather than the
//      hand-rolled 256-color palette in color.ts.
//
// Layout is a pure function (buildPanelPlain) so it stays unit-testable without
// a live TUI; coloring is a separate width-preserving pass (paintPanel), exactly
// like color.ts — visible content is identical with or without color.

import { contextHealth, joinSegments, truncate, useAscii } from "./render.ts";

// Structurally typed so the panel has no hard dependency on pi's Theme class
// (mirrors how _shared/intervention.ts types its UI). The real Theme satisfies
// this, and tests pass a trivial stub.
export interface PanelTheme {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

const IDENTITY_THEME: PanelTheme = { fg: (_c, t) => t, bold: (t) => t };

// Semantic tone → pi ThemeColor name. Keeping the panel in tone-space (not
// color-space) means a theme swap recolors everything for free.
export type Tone = "ok" | "warn" | "bad" | "info" | "muted" | "accent";
const TONE_COLOR: Record<Tone, string> = {
  ok: "success",
  warn: "warning",
  bad: "error",
  info: "accent",
  muted: "muted",
  accent: "accent",
};

export interface PlanView {
  current: number;
  total: number;
  steps: string[];
  done: number[];
}

export interface PanelView {
  header: string; // "AXIOM · project · model · branch"
  stateLabel: string; // e.g. "EDITING", "REVIEW READY"
  statusSegments: string[]; // ["ctx 41% OK", "3 files", "risk low", "verify pass"]
  mission: string;
  guard?: string; // "[LOCKED] unrelated changes  ·  [SAFE] protected workspace"
  banner?: { tone: Tone; text: string }; // pending-approval / blocked call-out
  plan?: PlanView;
  activity: { t: string; text: string }[];
  next: string;
  commands: string; // "/steer /plan /diff /verify /risk /context"
}

// Keep the HUD from ever growing tall enough to shove the chat off-screen. The
// fixed rows (header/status/mission/guard/banner/plan/rule/footer) plus this
// many activity rows is a comfortable ceiling for an above-editor panel.
const MAX_ACTIVITY_ROWS = 8;

export function stateTone(label: string): Tone {
  const s = label.toUpperCase();
  if (s === "DONE" || s === "REVIEW READY") return "ok";
  if (s === "BLOCKED" || s === "FAILED") return "bad";
  if (s === "WAITING APPROVAL") return "warn";
  return "accent";
}

function checkbox(index1: number, plan: PlanView, ascii: boolean): string {
  if (plan.done.includes(index1)) return ascii ? "[x]" : "✓";
  if (index1 === plan.current) return ascii ? "[>]" : "▷";
  return ascii ? "[ ]" : "○";
}

function planRows(plan: PlanView, width: number, ascii: boolean): string[] {
  const arrow = ascii ? ">>" : "▶";
  const current = plan.steps[plan.current - 1] ?? plan.steps[0] ?? "";
  const head = `PLAN  ${arrow} ${plan.current}/${plan.total}  ${current}`;
  // A compact checkbox ribbon for the remaining steps, wrapped to width.
  const ribbon = plan.steps
    .map((step, i) => `${checkbox(i + 1, plan, ascii)} ${shorten(step, 18)}`)
    .join("   ");
  return [truncate(head, width), ...wrap(`  ${ribbon}`, width)];
}

function shorten(value: string, limit: number): string {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length > limit ? `${v.slice(0, limit - 1)}…` : v;
}

// Greedy word-wrap that never emits a line wider than width.
function wrap(text: string, width: number): string[] {
  const words = text.split(/(\s+)/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + w).length > width && line.trim()) {
      out.push(line.replace(/\s+$/, ""));
      line = w.replace(/^\s+/, "");
    } else {
      line += w;
    }
  }
  if (line.trim()) out.push(line.replace(/\s+$/, ""));
  return out.length > 0 ? out.map((l) => truncate(l, width)) : [""];
}

/**
 * Build the panel as plain (uncolored) lines fit to `width`. Pure and uncapped
 * in section count; activity is bounded so the HUD can't grow unbounded.
 */
export function buildPanelPlain(view: PanelView, width: number, env: NodeJS.ProcessEnv = process.env): string[] {
  const w = Math.max(20, Math.floor(width));
  const ascii = useAscii(env);
  const out: string[] = [];

  out.push(truncate(view.header, w));
  out.push(truncate(`${view.stateLabel}  ${joinSegments(view.statusSegments, w - view.stateLabel.length - 2)}`, w));
  out.push(truncate(`MISSION  ${view.mission}`, w));

  if (view.guard) out.push(truncate(`GUARD  ${view.guard}`, w));
  if (view.banner) out.push(truncate(`▌ ${view.banner.text}`, w));
  if (view.plan && view.plan.steps.length > 0) out.push(...planRows(view.plan, w, ascii));

  out.push("─".repeat(w));

  const rows = view.activity.slice(-MAX_ACTIVITY_ROWS);
  if (rows.length === 0) {
    out.push(truncate("--:--:--  waiting for launch", w));
  } else {
    for (const a of rows) out.push(truncate(`${a.t}  ${a.text}`, w));
  }

  out.push(truncate(`→ ${view.next}   ·   ${view.commands}`, w));
  return out;
}

// ── Coloring (width-preserving, mirrors color.ts) ────────────────────────────

function activityTone(text: string): Tone {
  const tag = text.match(/\[([A-Z]+)/)?.[1] ?? "";
  if (["DONE", "PASS", "CLEAN"].includes(tag)) return "ok";
  if (["FAIL", "HALT", "LOCKED", "BLOCKED"].includes(tag)) return "bad";
  if (["EDIT", "TEST", "SHELL", "DIFF", "GUARD", "MISSION", "EXPORT", "WAIT", "NEXT"].includes(tag)) return "warn";
  return "info";
}

/**
 * Apply theme color to already-laid-out lines. Color codes are zero-width, so
 * wrapping placed characters preserves alignment — stripAnsi(paint) === plain.
 */
export function paintPanel(lines: string[], view: PanelView, theme: PanelTheme = IDENTITY_THEME): string[] {
  const paint = (tone: Tone, s: string) => theme.fg(TONE_COLOR[tone], s);
  return lines.map((line, i) => {
    let s = line;
    // Status row: tone the leading state label (REVIEW READY → ok, BLOCKED → bad…).
    if (i === 1 && view.stateLabel && s.startsWith(view.stateLabel)) {
      s = paint(stateTone(view.stateLabel), theme.bold(view.stateLabel)) + s.slice(view.stateLabel.length);
    }
    // Banner row: tone the call-out text by its severity.
    if (view.banner && s.includes(view.banner.text)) {
      s = s.replace(view.banner.text, paint(view.banner.tone, view.banner.text));
    }
    // Box rule / vertical bar → border.
    s = s.replace(/[─▌]+/g, (m) => theme.fg("border", m));
    // Activity rows: "HH:MM:SS  [TAG] …" — dim the time, tone the tag.
    s = s.replace(/^(\d{2}:\d{2}:\d{2})(\s+)(\[[A-Z]+\s*\])?/, (_m, t, gap, tag) => {
      const head = `${theme.fg("muted", t)}${gap}`;
      return tag ? `${head}${paint(activityTone(tag), tag)}` : head;
    });
    // Plan / status glyphs.
    s = s.replace(/[▶▷]/g, (m) => paint("warn", m));
    s = s.replace(/✓/g, (m) => paint("ok", m));
    s = s.replace(/[✗×]/g, (m) => paint("bad", m));
    if (i === 0) s = theme.bold(s); // header row
    return s;
  });
}

// ── The Component ─────────────────────────────────────────────────────────────

export interface Component {
  render(width: number): string[];
  invalidate(): void;
}

export class CockpitPanel implements Component {
  constructor(
    private readonly view: PanelView,
    private readonly theme: PanelTheme = IDENTITY_THEME,
  ) {}

  render(width: number): string[] {
    // Defensive: this runs inside pi's render loop (not at setWidget time), so a
    // layout bug must degrade to a visible line, never throw into the TUI.
    try {
      return paintPanel(buildPanelPlain(this.view, width), this.view, this.theme);
    } catch (err) {
      return [`AXIOM cockpit render error: ${err instanceof Error ? err.message : String(err)}`];
    }
  }

  invalidate(): void {
    // Stateless: a fresh CockpitPanel is built from a view snapshot on every
    // cockpit event, so there is nothing cached to clear.
  }
}
