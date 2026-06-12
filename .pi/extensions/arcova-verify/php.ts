import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface VerifyInput {
  target?: string;
  filter?: string;
  includeTypes?: boolean;
  format?: boolean;
}

function normalizedTarget(target: string | undefined): string | undefined {
  return target?.replaceAll("\\", "/").replace(/\/+$/, "");
}

function isBroadTarget(target: string | undefined): boolean {
  const normalized = normalizedTarget(target);
  return Boolean(normalized && !normalized.endsWith(".php"));
}

export function normalizeVerifyInput(input: VerifyInput): VerifyInput {
  if (input.filter && isBroadTarget(input.target)) {
    const { target: _target, ...rest } = input;
    return rest;
  }
  return input;
}

export function resolvePhpCommand(env: NodeJS.ProcessEnv = process.env, exists: (path: string) => boolean = existsSync): string {
  if (env.ARCOVA_PHP) return env.ARCOVA_PHP;
  for (const version of ["php85", "php84", "php83", "php82"]) {
    const candidate = join(env.USERPROFILE || homedir(), ".config", "herd", "bin", version, "php.exe");
    if (exists(candidate)) return candidate;
  }
  return "php";
}

function quoteArg(value: string): string {
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

export function buildVerifyCommands(input: VerifyInput, php: string): string[] {
  const commands: string[] = [];
  if (input.format) commands.push(`${quoteArg(php)} vendor/bin/pint --dirty`);
  const test = input.target
    ? `${quoteArg(php)} artisan test ${quoteArg(input.target)}`
    : `${quoteArg(php)} artisan test${input.filter ? ` --filter=${quoteArg(input.filter)}` : ""}`;
  commands.push(test);
  if (input.includeTypes) commands.push("npm run types");
  return commands;
}

export function verifyTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.ARCOVA_VERIFY_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45_000;
}

export function validateVerifyInput(input: VerifyInput, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.ARCOVA_ALLOW_BROAD_VERIFY === "1") return undefined;
  const target = normalizedTarget(input.target);
  if (!target && !input.filter) {
    return "Verify requires target or filter. Refusing to run the full test suite without ARCOVA_ALLOW_BROAD_VERIFY=1.";
  }
  if (isBroadTarget(target)) {
    return `Refusing broad verify target '${input.target}'. Pass a specific *Test.php file, use filter, or set ARCOVA_ALLOW_BROAD_VERIFY=1.`;
  }
  return undefined;
}
