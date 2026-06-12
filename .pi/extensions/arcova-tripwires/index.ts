import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { evaluateTripwires } from "./guards.ts";

const touched = new Set<string>();
let taskSummary = "";

function inputPath(input: Record<string, unknown>): string | undefined {
  const value = input.path ?? input.file_path;
  return typeof value === "string" ? value : undefined;
}

function writeHandoff(cwd: string, reason: string): string {
  const dir = join(cwd, ".arcova");
  mkdirSync(dir, { recursive: true });
  let diffSummary = "";
  try {
    diffSummary = execSync("git diff --stat", { cwd, encoding: "utf-8" });
  } catch {
    diffSummary = "(git diff unavailable)";
  }
  const path = join(dir, "HANDOFF.md");
  writeFileSync(path, [
    "# Arcova Handoff",
    "",
    `Reason: ${reason}`,
    "",
    "## Task Summary",
    taskSummary || "(unavailable)",
    "",
    "## Files Touched",
    ...Array.from(touched).sort().map((file) => `- ${file}`),
    "",
    "## Suggested Next Verifier",
    "- Run focused tests with the `Verify` tool, then review guarded paths manually.",
    "",
    "## Git Diff Summary",
    "```",
    diffSummary.trim(),
    "```",
    "",
  ].join("\n"));
  return path;
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    if (!taskSummary) taskSummary = (event.prompt ?? "").slice(0, 500);
  });

  pi.on("tool_call", async (event, ctx) => {
    const tool = String((event as any).toolName ?? "").toLowerCase();
    if (tool !== "write" && tool !== "edit") return;
    const input = ((event as any).input ?? {}) as Record<string, unknown>;
    const path = inputPath(input);
    if (!path) return;
    touched.add(path);
    const result = evaluateTripwires(Array.from(touched));
    if (!result.block) return;
    const reason = result.reasons.join("; ");
    const handoff = writeHandoff(ctx.cwd, reason);
    return { block: true, reason: `${reason}\nWrote handoff: ${handoff}` };
  });
}
