import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface TrajectoryRecord {
  session_id: string;
  started_at: string;
  cwd: string;
  model: string;
  task: string;
  files_touched: string[];
  commands: string[];
  verify: { ran: boolean; passed: boolean; command: string };
  tripwires: string[];
  verified: boolean;
}

export function sanitizeCommand(command: string): string {
  return /^\s*(env|printenv|set)(?:\s|$)/i.test(command) ? "[redacted sensitive command]" : command;
}

export function appendTrajectory(cwd: string, record: TrajectoryRecord, date = new Date()): string {
  const dir = join(cwd, ".arcova", "trajectories");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${date.toISOString().slice(0, 10)}.jsonl`);
  const sanitized = { ...record, commands: record.commands.map(sanitizeCommand) };
  appendFileSync(path, JSON.stringify(sanitized) + "\n");
  return path;
}

export default function (pi: ExtensionAPI) {
  const sessionId = process.env.LITTLE_CODER_SESSION_ID || randomUUID();
  const startedAt = new Date().toISOString();
  const files = new Set<string>();
  const commands: string[] = [];
  const tripwires: string[] = [];
  let task = "";
  let cwd = process.cwd();
  let verify = { ran: false, passed: false, command: "" };

  pi.on("before_agent_start", async (event, ctx) => {
    cwd = ctx.cwd;
    if (!task) task = (event.prompt ?? "").slice(0, 500);
  });
  pi.on("tool_call", async (event) => {
    const tool = String((event as any).toolName ?? "");
    const input: any = (event as any).input ?? {};
    const changedPath = input.path ?? input.file_path;
    if ((tool.toLowerCase() === "write" || tool.toLowerCase() === "edit") && typeof changedPath === "string") {
      files.add(changedPath);
    }
    if ((tool === "Bash" || tool === "bash") && typeof input.command === "string") commands.push(input.command);
  });
  pi.on("tool_result", async (event) => {
    const tool = String((event as any).toolName ?? "");
    if (tool === "Verify") {
      verify = {
        ran: true,
        passed: (event as any).isError !== true,
        command: String((event as any).details?.command ?? ""),
      };
    }
    if ((event as any).isError && typeof (event as any).reason === "string") tripwires.push((event as any).reason);
  });
  pi.on("session_shutdown", async () => {
    appendTrajectory(cwd, {
      session_id: sessionId,
      started_at: startedAt,
      cwd,
      model: process.env.LITTLE_CODER_MODEL || "",
      task,
      files_touched: Array.from(files).sort(),
      commands,
      verify,
      tripwires,
      verified: verify.ran && verify.passed,
    });
  });
}
