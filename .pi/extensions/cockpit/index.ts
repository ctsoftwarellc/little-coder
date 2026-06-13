import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describeToolCall, fallbackVerdict } from "../_shared/narrate.ts";
import { claimPanel, getAgentStatus } from "../_shared/agent-status.ts";
import { defaultNext, nextAgentState, stateLabel, type AgentState, type StateSignal } from "../_shared/agent-state.ts";
import { box, contextHealth, hudRows, panelWidth, terminalCols, twoColumn, useAscii, verifyRows, type VerifyPhases } from "./render.ts";

// ── AXIOM cockpit: a persistent agent control surface ───────────────────────
// Not a log stream with a widget printed in it — a fixed operating panel driven
// by a state machine (_shared/agent-state.ts), rendered as a bordered HUD
// (render.ts). The narrator yields its widget to this panel (claimPanel) so
// there's one surface, not two stacked ones.

const WIDGET_KEY = "cockpit";
const MAX_ACTIVITY = 8;

interface VerifyState extends VerifyPhases {
  ran: boolean;
  passed: boolean;
  command: string;
  summary?: string;
}

interface Preflight {
  branch: string;
  dirty: boolean;
  safeMode: boolean;
}

interface ActivityEntry {
  t: string; // HH:MM:SS
  text: string;
}

interface CockpitState {
  mission: string;
  agentState: AgentState;
  cwd: string;
  activity: ActivityEntry[];
  filesTouched: Set<string>;
  commands: string[];
  risks: string[];
  next: string;
  verify: VerifyState;
  preflight: Preflight;
  startedAt: string;
}

function freshState(cwd = process.cwd()): CockpitState {
  return {
    mission: "",
    agentState: "BOOT",
    cwd,
    activity: [],
    filesTouched: new Set(),
    commands: [],
    risks: [],
    next: defaultNext("BOOT"),
    verify: { ran: false, passed: false, command: "", tests: "not run", lint: "not run", types: "not run", build: "not run" },
    preflight: { branch: "", dirty: false, safeMode: process.env.ARCOVA_SAFE_MODE === "1" },
    startedAt: new Date().toISOString(),
  };
}

let state = freshState();

function cleanLine(value: string, limit = 88): string {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}

function pushUnique(list: string[], value: string, max = 20): void {
  const line = cleanLine(value);
  if (!line) return;
  if (list[0] === line) return;
  const existing = list.indexOf(line);
  if (existing >= 0) list.splice(existing, 1);
  list.unshift(line);
  list.splice(max);
}

function timeNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Activity stream is newest-LAST (so it reads top-to-bottom like a log), with
// consecutive duplicate texts collapsed.
function pushActivity(text: string): void {
  const line = cleanLine(text);
  if (!line) return;
  const last = state.activity[state.activity.length - 1];
  if (last && last.text === line) return;
  state.activity.push({ t: timeNow(), text: line });
  if (state.activity.length > MAX_ACTIVITY) state.activity.splice(0, state.activity.length - MAX_ACTIVITY);
}

function riskSeverity(n: number): string {
  if (n >= 3) return "high";
  if (n >= 1) return "elevated";
  return "low";
}

function formatWindow(ctx: any): string {
  const w = Number(ctx?.model?.contextWindow);
  if (!Number.isFinite(w) || w <= 0) return "";
  return w >= 1000 ? `${Math.round(w / 1000)}K` : String(w);
}

function shortPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.slice(-3).join("/");
}

function modelShort(ctx: any): string {
  const id = String(ctx?.model?.id ?? process.env.LITTLE_CODER_MODEL ?? "unknown");
  return id.split("/").pop() || id;
}

function contextPercent(ctx: any): number | null {
  try {
    const u = ctx.getContextUsage?.();
    if (u && Number.isFinite(Number(u.percent))) return Number(u.percent);
    const tokens = Number(u?.tokens ?? 0);
    const window = Number(u?.contextWindow ?? ctx?.model?.contextWindow ?? 0);
    if (tokens > 0 && window > 0) return (tokens / window) * 100;
  } catch {
    // optional in non-interactive modes
  }
  return null;
}

function tagForTool(toolName: string): string {
  const t = toolName.toLowerCase();
  if (["read", "grep", "glob", "find", "ls", "search"].includes(t)) return "SCAN";
  if (["edit", "write", "fuzzyedit"].includes(t)) return "EDIT";
  if (t === "bash") return "SHELL";
  if (t === "verify" || t.includes("verify")) return "TEST";
  if (t.startsWith("browser")) return "BROWSE";
  if (t.startsWith("evidence")) return "EVIDENCE";
  if (t.startsWith("arcova")) return "ARCOVA";
  return toolName.toUpperCase();
}

function signalForTag(tag: string): StateSignal {
  if (tag === "EDIT") return "edit";
  if (tag === "TEST") return "verify";
  if (tag === "SHELL") return "shell";
  return "read";
}

function advance(signal: StateSignal): void {
  state.agentState = nextAgentState(state.agentState, signal, { filesChanged: state.filesTouched.size > 0 });
  state.next = defaultNext(state.agentState);
}

function promptHeadline(prompt: string): string {
  const first = prompt.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  return cleanLine(first.replace(/^#+\s*/, ""), 80);
}

// ── Rendering ───────────────────────────────────────────────────────────────

function preflightBlock(): string[] {
  const lines = [
    "PREFLIGHT",
    state.preflight.dirty
      ? "  [LOCKED] unrelated uncommitted changes detected"
      : "  [CLEAN]  working tree clean",
    "  [ALLOW]  only files your task lists may be modified",
  ];
  if (state.preflight.safeMode) lines.push("  [SAFE]   no revert, clean, or unrelated fixes");
  return lines;
}

function activityBlock(): string[] {
  const head = ["ACTIVITY"];
  if (state.activity.length === 0) return [...head, "  --:--:--  [WAIT]  waiting for launch"];
  const rows = state.activity.map((a) => {
    const m = a.text.match(/^\[([A-Z]+)\]\s*(.*)$/);
    const tag = m ? m[1].padEnd(6) : "INFO  ";
    const body = m ? m[2] : a.text;
    return `  ${a.t}  [${tag.trim().padEnd(5)}] ${body}`;
  });
  // The forward-looking step reads as the latest [NEXT] line.
  rows.push(`  ${timeNow()}  [NEXT ] ${state.next}`);
  return [...head, ...rows];
}

function missionBlock(): string[] {
  return ["MISSION", `  ${state.mission || "unassigned — /mission <objective>"}`];
}

function planBlock(): string[] {
  const s = getAgentStatus();
  const steps = s.planSteps ?? [];
  if (steps.length === 0) return ["PLAN", "  (none yet — model hasn't called Plan)"];
  const done = new Set(s.planDone ?? []);
  const cur = s.planCurrent ?? 0;
  return [
    "PLAN",
    ...steps.slice(0, 8).map((step, i) => {
      const n = i + 1;
      const mark = done.has(n) ? "✓" : n === cur ? "▶" : " ";
      return `  ${mark} ${n}. ${step}`;
    }),
  ];
}

function renderLines(ctx: any): string[] {
  const ascii = useAscii();
  const cols = terminalCols();
  const width = panelWidth(cols);
  const project = basename(state.cwd || process.cwd());
  const pct = contextPercent(ctx);
  const window = formatWindow(ctx);
  const ctxField = pct != null ? `${Math.round(pct)}%${window ? ` (${window})` : ""}` : window || "—";
  const verifyField = state.verify.ran ? (state.verify.passed ? "pass" : "FAIL") : "not run";

  const [r1, r2] = hudRows(
    "AXIOM",
    [`Project: ${project}`, `STATE: ${stateLabel(state.agentState)}`, `MODEL: ${modelShort(ctx)}`],
    [`CONTEXT: ${ctxField}`, `VERIFY: ${verifyField}`, `FILES: ${state.filesTouched.size}  RISK: ${riskSeverity(state.risks.length)}`],
    cols,
  );
  const hud = box("", state.preflight.branch || "", [...r1, ...r2], cols);

  const left = [...preflightBlock(), "", ...activityBlock()];
  const right = [...missionBlock(), "", ...planBlock()];
  const body = twoColumn(left, right, width);

  const changed = Array.from(state.filesTouched).sort().map(shortPath);

  return [
    ...hud,
    "",
    ...body,
    "",
    "VERIFY",
    ...verifyRows(state.verify, ascii),
    ...(changed.length > 0 ? ["", "CHANGED", ...changed.slice(0, 5).map((c) => `  ${c}`)] : []),
    "",
    "COMMAND",
    "  /plan  /diff  /verify  /risk  /context  /preflight  /export-session",
  ];
}

function render(ctx: any): void {
  try {
    ctx.ui.setWidget(WIDGET_KEY, renderLines(ctx));
  } catch {
    // UI unavailable (print/RPC).
  }
  try {
    const pct = contextPercent(ctx);
    const ctxBit = pct != null ? ` · ctx ${contextHealth(pct)}` : "";
    ctx.ui.setStatus(
      WIDGET_KEY,
      `${stateLabel(state.agentState)} · ${state.filesTouched.size} files · ${state.risks.length} risks${ctxBit}`,
    );
  } catch {
    // Status is cosmetic.
  }
}

function notify(ctx: any, message: string, type: "info" | "warning" | "error" = "info"): void {
  try {
    ctx.ui.notify(message, type);
  } catch {
    // best-effort
  }
}

// ── Tracking ─────────────────────────────────────────────────────────────────

function trackToolCall(toolName: string, input: any): void {
  const tag = tagForTool(toolName);
  const phrase = describeToolCall(toolName, input);
  const path = input?.path ?? input?.file_path;
  const command = input?.command;

  if (tag === "EDIT" && typeof path === "string") state.filesTouched.add(path);
  if (typeof command === "string") pushUnique(state.commands, command, 20);

  advance(signalForTag(tag));
  pushActivity(`[${tag}] ${phrase}`);
}

function trackToolResult(event: any): void {
  const toolName = String(event?.toolName ?? "");
  const isError = event?.isError === true;
  const tag = tagForTool(toolName);
  const verdict = fallbackVerdict(toolName, isError, "");

  if (tag === "TEST") {
    state.verify.ran = true;
    state.verify.passed = !isError;
    state.verify.command = String(event?.details?.command ?? "");
    state.verify.summary = cleanLine(verdict, 72);
    state.verify.tests = isError ? "fail" : "pass";
    if (String(state.verify.command).includes("types") || String(state.verify.command).includes("npm run types")) {
      state.verify.types = isError ? "fail" : "pass";
    }
    advance(isError ? "verify_fail" : "verify_pass");
  } else if (isError) {
    advance("blocked");
    pushUnique(state.risks, `${toolName} failed`);
  } else {
    advance("think");
  }

  pushActivity(`[${isError ? "FAIL" : "DONE"}] ${verdict}`);
}

// ── git preflight ─────────────────────────────────────────────────────────────

async function computePreflight(pi: ExtensionAPI, cwd: string): Promise<void> {
  const run = (args: string[]) =>
    pi.exec("git", args, { cwd, timeout: 4000 }).catch(() => ({ code: 1, stdout: "", stderr: "" }) as any);
  const branch = String((await run(["rev-parse", "--abbrev-ref", "HEAD"])).stdout ?? "").trim();
  const status = String((await run(["status", "--porcelain"])).stdout ?? "").trim();
  state.preflight.branch = branch && branch !== "HEAD" ? branch : "";
  state.preflight.dirty = status.length > 0;
  if (state.preflight.dirty) pushActivity("[GUARD] protected workspace — unrelated changes locked");
}

// ── export ─────────────────────────────────────────────────────────────────

function sessionSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 44) || "agent-session";
}
function markdownList(items: string[], empty: string): string {
  return items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : `- ${empty}`;
}
function exportSession(cwd: string, name?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = sessionSlug(name || state.mission || "agent-session");
  const dir = join(cwd, "docs", "agent-sessions");
  const path = join(dir, `${date}-${slug}.md`);
  const files = Array.from(state.filesTouched).sort().map(shortPath);
  const verify = state.verify.ran ? `${state.verify.passed ? "passed" : "failed"}${state.verify.command ? `: ${state.verify.command}` : ""}` : "not run";
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path,
    [
      `# ${state.mission || "Agent Session"}`,
      "",
      `- Started: ${state.startedAt}`,
      `- Exported: ${new Date().toISOString()}`,
      `- Workspace: ${cwd}`,
      `- Branch: ${state.preflight.branch || "(unknown)"}`,
      `- Final state: ${stateLabel(state.agentState)}`,
      `- Verification: ${verify}`,
      "",
      "## Mission", "", state.mission || "Unassigned", "",
      "## Changed Files", "", markdownList(files, "No files tracked"), "",
      "## Commands", "", markdownList(state.commands, "No shell commands tracked"), "",
      "## Risks", "", markdownList(state.risks, "No risks captured"), "",
      "## Activity", "", markdownList(state.activity.map((a) => `${a.t} ${a.text}`), "No activity captured"), "",
    ].join("\n"),
  );
  return path;
}

export default function (pi: ExtensionAPI) {
  claimPanel(); // the cockpit owns the persistent panel; narrator yields its widget

  pi.on("session_start", async (_event, ctx) => {
    state = freshState(ctx.cwd);
    advance("boot");
    render(ctx);
    await computePreflight(pi, ctx.cwd);
    advance("preflight");
    render(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    state.cwd = ctx.cwd;
    const prompt = String((event as any).prompt ?? "");
    if (!state.mission && prompt.trim()) state.mission = promptHeadline(prompt);
    advance("think");
    pushActivity("[MISSION] launched");
    render(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    advance("think");
    render(ctx);
  });

  pi.on("tool_call", async (event, ctx) => {
    trackToolCall(String((event as any).toolName ?? ""), (event as any).input ?? {});
    render(ctx);
  });

  pi.on("tool_result", async (event, ctx) => {
    trackToolResult(event);
    render(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => render(ctx));

  pi.on("agent_end", async (_event, ctx) => {
    advance("done");
    render(ctx);
  });

  pi.registerCommand("mission", {
    description: "Set the cockpit mission",
    handler: async (args, ctx) => {
      const text = cleanLine(String(args ?? "").trim(), 120);
      if (!text) return notify(ctx, "Usage: /mission <objective>", "warning");
      state.mission = text;
      state.startedAt = new Date().toISOString();
      pushActivity(`[MISSION] ${text}`);
      render(ctx);
      notify(ctx, `Mission set: ${text}`);
    },
  });

  pi.registerCommand("cockpit", {
    description: "Show the agent cockpit",
    handler: async (_args, ctx) => {
      render(ctx);
      notify(ctx, "Cockpit online: /plan /diff /verify /risk /context /preflight /export-session");
    },
  });

  pi.registerCommand("preflight", {
    description: "Show the cockpit preflight / guardrail status in detail",
    handler: async (_args, ctx) => {
      await computePreflight(pi, ctx.cwd);
      render(ctx);
      const dirty = state.preflight.dirty ? "uncommitted changes present" : "clean tree";
      notify(
        ctx,
        `PREFLIGHT — branch ${state.preflight.branch || "(detached)"}; ${dirty}; ` +
          `${state.preflight.safeMode ? "Arcova safe mode ON (protected workspace)" : "safe mode off"}.`,
      );
    },
  });

  pi.registerCommand("context", {
    description: "Show context-window usage and health",
    handler: async (_args, ctx) => {
      render(ctx);
      notify(ctx, `Context ${contextHealth(contextPercent(ctx))}`);
    },
  });

  pi.registerCommand("risk", {
    description: "Show current cockpit risks",
    handler: async (_args, ctx) => {
      render(ctx);
      notify(ctx, `Risk radar: ${state.risks.length > 0 ? state.risks.join("; ") : "no risks detected yet"}`);
    },
  });

  pi.registerCommand("diff", {
    description: "Show git diff stat in the cockpit",
    handler: async (_args, ctx) => {
      const result = await pi
        .exec("git", ["diff", "--stat"], { cwd: ctx.cwd, timeout: 5000 })
        .catch((e: unknown) => ({ code: 1, stdout: "", stderr: e instanceof Error ? e.message : String(e) }));
      const stdout = String((result as any).stdout ?? "").trim();
      const summary = stdout || "No working-tree diff";
      pushActivity(`[DIFF] ${cleanLine(summary.split(/\r?\n/).pop() ?? summary)}`);
      render(ctx);
      notify(ctx, cleanLine(summary, 220), stdout ? "info" : "warning");
    },
  });

  pi.registerCommand("verify", {
    description: "Show the cockpit verification phase status",
    handler: async (_args, ctx) => {
      render(ctx);
      notify(ctx, state.verify.ran ? `Verify: ${state.verify.summary ?? (state.verify.passed ? "passed" : "failed")}` : "Verify not run yet — use the Verify tool.");
    },
  });

  pi.registerCommand("export-session", {
    description: "Export the cockpit black-box markdown to docs/agent-sessions",
    handler: async (args, ctx) => {
      const path = exportSession(ctx.cwd, String(args ?? "").trim());
      pushActivity(`[EXPORT] ${shortPath(path)}`);
      render(ctx);
      notify(ctx, `Session black box exported: ${path}`);
    },
  });
}
