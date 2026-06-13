import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { harnessIntervention } from "../_shared/intervention.ts";

const WINDOWS_PHP_IN_BASH = /\b[A-Za-z]:\\[^\r\n|&;]*\\php(?:\d+)?\\php\.exe\b/i;
const POWERSHELL_ONLY = /\b(Select-String|Get-Content|Get-ChildItem|Test-Path)\b/i;

function msysPath(windowsPath: string): string {
  return windowsPath
    .replace(/^([A-Za-z]):\\/, (_m, drive: string) => `/${drive.toLowerCase()}/`)
    .replaceAll("\\", "/");
}

export function bashPathGuardReason(command: string): string | undefined {
  const phpMatch = command.match(WINDOWS_PHP_IN_BASH);
  const usesPowerShellOnly = POWERSHELL_ONLY.test(command);
  if (!phpMatch && !usesPowerShellOnly) return undefined;

  const lines = [
    "This Bash command mixes shell syntaxes and was blocked before execution.",
    "",
  ];

  if (phpMatch) {
    const windowsPhp = phpMatch[0];
    const bashPhp = msysPath(windowsPhp);
    const bashCommand = command.replace(windowsPhp, `"${bashPhp}"`).replace(/\bSelect-String\b/g, "grep");
    lines.push(
      `Raw Windows executable path: ${windowsPhp}`,
      `Bash-compatible path: "${bashPhp}"`,
      "",
      "For Arcova/Laravel tests, prefer the Verify tool instead of Bash:",
      '  {"name":"Verify","input":{"target":"tests/Feature/.../SomeTest.php"}}',
      '  {"name":"Verify","input":{"filter":"focused test name"}}',
      "",
      "If Bash is truly required, convert the executable path first:",
      `  ${bashCommand}`,
    );
  }

  if (usesPowerShellOnly) {
    lines.push(
      "",
      "PowerShell cmdlets such as Select-String/Get-Content do not exist in Bash.",
      "Use grep/cat/find/head in Bash, or run the whole command through powershell.exe.",
    );
  }

  return lines.join("\n").trim();
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const toolName = String((event as any).toolName ?? "").toLowerCase();
    if (toolName !== "bash") return;
    const input = ((event as any).input ?? (event as any).args ?? {}) as { command?: unknown };
    if (typeof input.command !== "string") return;

    const reason = bashPathGuardReason(input.command);
    if (!reason) return;

    harnessIntervention(
      ctx,
      "blocked a Bash command that mixed Windows paths/PowerShell syntax with Bash.",
    );
    return { block: true, reason };
  });
}
