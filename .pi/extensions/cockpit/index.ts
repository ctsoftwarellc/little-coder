import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describeToolCall, fallbackVerdict } from "../_shared/narrate.ts";
import { formatStatusHeader } from "../_shared/agent-status.ts";

const WIDGET_KEY = "cockpit";
const MAX_ACTIVITY = 11;
const MAX_PANEL_ITEMS = 5;

type CockpitStatus = "idle" | "thinking" | "scanning" | "editing" | "verifying" | "blocked" | "complete";

interface VerifyState {
  ran: boolean;
  passed: boolean;
  command: string;
  summary?: string;
}

interface CockpitState {
  mission: string;
  objective: string;
  status: CockpitStatus;
  cwd: string;
  activity: string[];
  filesTouched: Set<string>;
  commands: string[];
  risks: string[];
  needs: string[];
  verify: VerifyState;
  startedAt: string;
}

function freshState(cwd = process.cwd()): CockpitState {
  return {
    mission: "",
    objective: "",
    status: "idle",
    cwd,
    activity: [],
    filesTouched: new Set(),
    commands: [],
    risks: [],
    needs: ["Set mission with /mission <objective>"],
    verify: { ran: false, passed: false, command: "" },
    startedAt: new Date().toISOString(),
  };
}

let state = freshState();

function cleanLine(value: string, limit = 84): string {
  const line = value.replace(/\s+/g, " ").trim();
  return line.length > limit ? `${line.slice(0, limit - 1)}...` : line;
}

function pushUnique(list: string[], value: string, max = MAX_ACTIVITY): void {
  const line = cleanLine(value);
  if (!line) return;
  const existing = list.indexOf(line);
  if (existing >= 0) list.splice(existing, 1);
  list.unshift(line);
  list.splice(max);
}

function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.slice(-3).join("/");
}

function toolInputPath(input: any): string | undefined {
  const value = input?.path ?? input?.file_path ?? input?.target;
  return typeof value === "string" ? value : undefined;
}

function commandFromInput(input: any): string | undefined {
  return typeof input?.command === "string" ? input.command : undefined;
}

function tagForTool(toolName: string): string {
  const tool = toolName.toLowerCase();
  if (["read", "grep", "glob", "find", "ls", "search"].includes(tool)) return "SCAN";
  if (["edit", "write", "fuzzyedit"].includes(tool)) return "EDIT";
  if (tool === "bash") return "SHELL";
  if (tool === "verify" || tool.includes("verify")) return "TEST";
  if (tool.startsWith("browser")) return "BROWSE";
  if (tool.startsWith("evidence")) return "EVIDENCE";
  if (tool.startsWith("arcova")) return "ARCOVA";
  return toolName.toUpperCase();
}

function statusForTool(toolName: string): CockpitStatus {
  const tag = tagForTool(toolName);
  if (tag === "SCAN" || tag === "ARCOVA" || tag === "BROWSE") return "scanning";
  if (tag === "EDIT") return "editing";
  if (tag === "TEST") return "verifying";
  return "thinking";
}

function promptHeadline(prompt: string): string {
  const first = prompt.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  return cleanLine(first.replace(/^#+\s*/, ""), 72);
}

function contextLine(ctx: any): string {
  const header = formatStatusHeader();
  let usage = "";
  try {
    const current = ctx.getContextUsage?.();
    const percent = Number(current?.percent);
    const tokens = Number(current?.tokens ?? current?.usedTokens ?? 0);
    const window = Number(current?.contextWindow ?? current?.maxTokens ?? ctx.model?.contextWindow ?? 0);
    if (Number.isFinite(percent)) usage = `context ${Math.round(percent)}%`;
    else if (tokens > 0 && window > 0) usage = `context ${Math.round((tokens / window) * 100)}%`;
  } catch {
    // Context usage is optional in non-interactive modes.
  }
  return [header, usage].filter(Boolean).join(" | ");
}

function modelLine(ctx: any): string {
  const provider = ctx.model?.provider ?? "";
  const id = ctx.model?.id ?? "";
  const fromCtx = provider && id ? `${provider}/${id}` : id || "";
  return fromCtx || process.env.LITTLE_CODER_MODEL || "unknown";
}

function renderList(label: string, items: string[], empty: string, max = MAX_PANEL_ITEMS): string[] {
  const body = items.slice(0, max);
  if (body.length === 0) return [`${label.padEnd(9)} ${empty}`];
  return [`${label.padEnd(9)} ${body[0]}`, ...body.slice(1).map((item) => `${"".padEnd(9)} ${item}`)];
}

function renderLines(ctx: any): string[] {
  const cwdName = basename(state.cwd || process.cwd());
  const mission = state.mission || "Unassigned";
  const objective = state.objective && state.objective !== mission ? state.objective : "";
  const changed = Array.from(state.filesTouched).sort().map(shortPath);
  const risks = state.risks.length > 0 ? state.risks : ["None detected yet"];
  const verify = state.verify.ran
    ? `${state.verify.passed ? "PASS" : "FAIL"} ${state.verify.summary ?? state.verify.command ?? "verification"}`
    : "Not run";
  const needs = state.needs.length > 0 ? state.needs : ["Proceeding"];
  const ctxLine = contextLine(ctx);

  return [
    `AXIOM AGENT ${cwdName}`.padEnd(42),
    `MISSION   ${mission}`,
    objective ? `OBJECTIVE ${objective}` : `OBJECTIVE ${mission}`,
    `STATE     ${state.status}${ctxLine ? ` | ${ctxLine}` : ""}`,
    `MODEL     ${modelLine(ctx)}`,
    `VERIFY    ${verify}`,
    "",
    ...renderList("ACTIVITY", state.activity, "Waiting for launch"),
    ...renderList("CHANGED", changed, "No files changed"),
    ...renderList("RISK", risks, "None detected yet", 3),
    ...renderList("NEEDS", needs, "Proceeding", 3),
    "",
    "COMMANDS  /mission <text> | /diff | /risk | /export-session",
  ];
}

function setNeed(value: string): void {
  state.needs = [value];
}

function render(ctx: any): void {
  try {
    ctx.ui.setWidget(WIDGET_KEY, renderLines(ctx));
  } catch {
    // UI may be unavailable in print/RPC modes.
  }
  try {
    const mission = state.mission || "no mission";
    ctx.ui.setStatus(WIDGET_KEY, `${state.status} | ${mission} | ${state.filesTouched.size} files | ${state.risks.length} risks`);
  } catch {
    // Status is cosmetic.
  }
}

function notify(ctx: any, message: string, type: "info" | "warning" | "error" = "info"): void {
  try {
    ctx.ui.notify(message, type);
  } catch {
    // Notification is best-effort.
  }
}

function sessionSlug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
  return base || "agent-session";
}

function markdownList(items: string[], empty: string): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
}

function exportSession(cwd: string, name?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = sessionSlug(name || state.mission || state.objective || "agent-session");
  const dir = join(cwd, "docs", "agent-sessions");
  const path = join(dir, `${date}-${slug}.md`);
  const files = Array.from(state.filesTouched).sort().map(shortPath);
  const verify = state.verify.ran
    ? `${state.verify.passed ? "passed" : "failed"}${state.verify.command ? `: ${state.verify.command}` : ""}`
    : "not run";

  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path,
    [
      `# ${state.mission || "Agent Session"}`,
      "",
      `- Started: ${state.startedAt}`,
      `- Exported: ${new Date().toISOString()}`,
      `- Workspace: ${cwd}`,
      `- Status: ${state.status}`,
      `- Verification: ${verify}`,
      "",
      "## Objective",
      "",
      state.objective || state.mission || "Unassigned",
      "",
      "## Changed Files",
      "",
      markdownList(files, "No files tracked"),
      "",
      "## Commands",
      "",
      markdownList(state.commands, "No shell commands tracked"),
      "",
      "## Risks",
      "",
      markdownList(state.risks, "No risks captured"),
      "",
      "## Needs",
      "",
      markdownList(state.needs, "No open needs"),
      "",
      "## Activity",
      "",
      markdownList(state.activity.slice().reverse(), "No activity captured"),
      "",
    ].join("\n"),
  );
  return path;
}

function trackToolCall(toolName: string, input: any): void {
  const tag = tagForTool(toolName);
  const phrase = describeToolCall(toolName, input);
  const path = toolInputPath(input);
  const command = commandFromInput(input);

  if (path && (tag === "EDIT" || tag === "SCAN")) {
    if (tag === "EDIT") state.filesTouched.add(path);
  }
  if (command) pushUnique(state.commands, command, 20);

  state.status = statusForTool(toolName);
  setNeed(tag === "EDIT" ? "Review diff before final" : tag === "TEST" ? "Use test result to decide next action" : "Continue mission");
  pushUnique(state.activity, `[${tag}] ${phrase}`);
}

function trackToolResult(event: any): void {
  const toolName = String(event?.toolName ?? "");
  const isError = event?.isError === true;
  const verdict = fallbackVerdict(toolName, isError, "");
  const tag = tagForTool(toolName);

  if (isError) {
    state.status = "blocked";
    pushUnique(state.risks, `${toolName} failed`);
    setNeed("Resolve failing tool or choose alternate route");
  } else {
    state.status = tag === "TEST" ? "complete" : "thinking";
  }

  if (tag === "TEST") {
    state.verify = {
      ran: true,
      passed: !isError,
      command: String(event?.details?.command ?? ""),
      summary: cleanLine(verdict, 72),
    };
    if (isError) pushUnique(state.risks, "Verification failed");
    else state.needs = state.filesTouched.size > 0 ? ["Final diff review"] : ["Ready for next mission"];
  }

  pushUnique(state.activity, `[${isError ? "FAIL" : "DONE"}] ${verdict}`);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    state = freshState(ctx.cwd);
    render(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    state.cwd = ctx.cwd;
    const prompt = String((event as any).prompt ?? "");
    if (!state.mission && prompt.trim()) state.mission = promptHeadline(prompt);
    if (!state.objective && prompt.trim()) state.objective = promptHeadline(prompt);
    state.status = "thinking";
    state.needs = ["Build plan, inspect files, then act"];
    pushUnique(state.activity, "[MISSION] launch");
    render(ctx);
  });

  pi.on("agent_start", async (_event, ctx) => {
    state.status = "thinking";
    render(ctx);
  });

  pi.on("turn_start", async (_event, ctx) => {
    if (state.status === "idle" || state.status === "complete") state.status = "thinking";
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

  pi.registerCommand("mission", {
    description: "Set the current cockpit mission",
    handler: async (args, ctx) => {
      const text = cleanLine(String(args ?? "").trim(), 120);
      if (!text) {
        notify(ctx, "Usage: /mission <objective>", "warning");
        render(ctx);
        return;
      }
      state.cwd = ctx.cwd;
      state.mission = text;
      state.objective = text;
      state.status = "idle";
      state.startedAt = new Date().toISOString();
      state.needs = ["Launch work or refine mission"];
      pushUnique(state.activity, `[MISSION] ${text}`);
      render(ctx);
      notify(ctx, `Mission set: ${text}`);
    },
  });

  pi.registerCommand("cockpit", {
    description: "Show the agent cockpit",
    handler: async (_args, ctx) => {
      render(ctx);
      notify(ctx, "Cockpit online: /mission, /diff, /risk, /export-session");
    },
  });

  pi.registerCommand("risk", {
    description: "Show current cockpit risks and needs",
    handler: async (_args, ctx) => {
      if (state.risks.length === 0) pushUnique(state.activity, "[RISK] no risks detected");
      render(ctx);
      const risks = state.risks.length > 0 ? state.risks.join("; ") : "No risks detected yet";
      notify(ctx, `Risk radar: ${risks}`);
    },
  });

  pi.registerCommand("diff", {
    description: "Show git diff stat in the cockpit",
    handler: async (_args, ctx) => {
      const result = await pi.exec("git", ["diff", "--stat"], { cwd: ctx.cwd, timeout: 5000 }).catch((error: unknown) => ({
        code: 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      }));
      const stdout = String((result as any).stdout ?? "").trim();
      const stderr = String((result as any).stderr ?? "").trim();
      const summary = stdout || stderr || "No working-tree diff";
      pushUnique(state.activity, `[DIFF] ${cleanLine(summary.split(/\r?\n/)[0] ?? summary)}`);
      if (!stdout && stderr) pushUnique(state.risks, "Unable to read git diff");
      setNeed(stdout ? "Review changed files before final" : "No diff to review");
      render(ctx);
      notify(ctx, cleanLine(summary, 220), stdout ? "info" : "warning");
    },
  });

  pi.registerCommand("export-session", {
    description: "Export cockpit black box markdown to docs/agent-sessions",
    handler: async (args, ctx) => {
      const path = exportSession(ctx.cwd, String(args ?? "").trim());
      pushUnique(state.activity, `[EXPORT] ${shortPath(path)}`);
      render(ctx);
      notify(ctx, `Session black box exported: ${path}`);
    },
  });
}
