import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { digestVerifyOutput } from "./digest.ts";
import { buildVerifyCommands, normalizeVerifyInput, resolvePhpCommand, validateVerifyInput, verifyTimeoutMs, type VerifyInput } from "./php.ts";

interface CommandResult {
  output: string;
  exitCode: number;
  timedOut: boolean;
}

function terminateProcess(childPid: number | undefined): void {
  if (!childPid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(childPid), "/t", "/f"], { windowsHide: true });
    return;
  }
  try {
    process.kill(childPid, "SIGTERM");
  } catch {
    // already exited
  }
}

function runCommand(command: string, cwd: string, logPath: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true });
    let output = "";
    let settled = false;
    let timedOut = false;

    const write = (chunk: Buffer | string) => {
      const text = String(chunk);
      output += text;
      appendFileSync(logPath, text);
    };

    appendFileSync(logPath, `$ ${command}\n`);
    const timer = setTimeout(() => {
      timedOut = true;
      write(`\n[arcova-verify] command timed out after ${timeoutMs}ms; terminating child process\n`);
      terminateProcess(child.pid);
      setTimeout(() => {
        if (!settled) terminateProcess(child.pid);
      }, 2_000);
    }, timeoutMs);

    child.stdout?.on("data", write);
    child.stderr?.on("data", write);
    child.on("error", (error) => write(`\n[arcova-verify] failed to start command: ${error.message}\n`));
    child.on("close", (code) => {
      clearTimeout(timer);
      settled = true;
      appendFileSync(logPath, `\n[arcova-verify] exit_code=${timedOut ? 124 : code ?? 1}\n`);
      resolve({ output, exitCode: timedOut ? 124 : code ?? 1, timedOut });
    });
  });
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "Verify",
    label: "Verify",
    description: "Run focused Arcova verification and return a compact digest with a raw log path.",
    parameters: Type.Object({
      target: Type.Optional(Type.String()),
      filter: Type.Optional(Type.String()),
      includeTypes: Type.Optional(Type.Boolean()),
      format: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, input: VerifyInput) {
      const normalizedInput = normalizeVerifyInput(input);
      const validationError = validateVerifyInput(normalizedInput);
      if (validationError) {
        return {
          content: [{ type: "text", text: validationError }],
          details: { validationError },
          isError: true,
        };
      }
      const started = Date.now();
      const php = resolvePhpCommand();
      const commands = buildVerifyCommands(normalizedInput, php);
      const logDir = join(process.cwd(), ".arcova", "verify-logs");
      mkdirSync(logDir, { recursive: true });
      const logPath = join(logDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
      writeFileSync(logPath, "");
      let combined = "";
      let exitCode = 0;
      const timeoutMs = verifyTimeoutMs();
      for (const command of commands) {
        const result = await runCommand(command, process.cwd(), logPath, timeoutMs);
        combined += `$ ${command}\n${result.output}\n`;
        if (result.exitCode !== 0) {
          exitCode = result.exitCode;
          break;
        }
      }
      const digest = digestVerifyOutput(combined, commands.join(" && "), exitCode, Date.now() - started);
      return {
        content: [{ type: "text", text: `${digest.text}\nraw_log: ${logPath}` }],
        details: { command: commands.join(" && "), exitCode, elapsedMs: Date.now() - started, logPath, ...digest },
        isError: exitCode !== 0,
      };
    },
  });
}
