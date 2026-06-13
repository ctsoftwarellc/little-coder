import { describe, expect, it } from "vitest";
import { normalizeWindowsPathsInBashCommand, shouldRoute } from "./route.ts";

const norm = (c: string) => normalizeWindowsPathsInBashCommand(c);

describe("normalizeWindowsPathsInBashCommand", () => {
  it("quotes + forward-slashes an unquoted Windows exe path (the eval failure)", () => {
    const r = norm("C:\\Users\\Caleb\\.config\\herd\\bin\\php84\\php.exe artisan test");
    expect(r.changed).toBe(true);
    expect(r.command).toBe('"C:/Users/Caleb/.config/herd/bin/php84/php.exe" artisan test');
  });

  it("leaves an already-quoted Windows path untouched (it works as-is)", () => {
    const cmd = '"C:\\Users\\Caleb\\.config\\herd\\bin\\php84\\php.exe" artisan test';
    const r = norm(cmd);
    expect(r.changed).toBe(false);
    expect(r.command).toBe(cmd);
  });

  it("does not touch forward-slash Windows paths (already valid in MSYS)", () => {
    const cmd = "C:/Users/Caleb/php.exe artisan test";
    expect(norm(cmd).changed).toBe(false);
  });

  it("leaves pure POSIX commands alone", () => {
    const cmd = "php artisan test tests/Feature/Billing/ManualPaymentTest.php";
    const r = norm(cmd);
    expect(r.changed).toBe(false);
    expect(r.command).toBe(cmd);
  });

  it("rewrites a path used as a cd target", () => {
    const r = norm("cd C:\\Users\\Caleb\\little-coder && ls");
    expect(r.command).toBe('cd "C:/Users/Caleb/little-coder" && ls');
  });

  it("rewrites a VAR=path assignment", () => {
    const r = norm("ARCOVA_PHP=C:\\php\\php.exe php artisan test");
    expect(r.command).toBe('ARCOVA_PHP="C:/php/php.exe" php artisan test');
  });

  it("does not mistake a URL for a Windows path", () => {
    const cmd = "curl https://example.com/path && echo done";
    expect(norm(cmd).changed).toBe(false);
  });

  it("does not rewrite a drive path inside single quotes", () => {
    const cmd = "echo 'C:\\Users\\Caleb\\literal'";
    const r = norm(cmd);
    expect(r.changed).toBe(false);
    expect(r.command).toBe(cmd);
  });

  it("handles two unquoted paths in one command", () => {
    const r = norm("C:\\bin\\php.exe C:\\app\\artisan");
    expect(r.command).toBe('"C:/bin/php.exe" "C:/app/artisan"');
    expect(r.changed).toBe(true);
  });

  it("stops the path token at a shell metacharacter", () => {
    const r = norm("C:\\bin\\php.exe&&echo hi");
    expect(r.command).toBe('"C:/bin/php.exe"&&echo hi');
  });
});

describe("shouldRoute", () => {
  it("runs only on win32 and respects the disable flag", () => {
    expect(shouldRoute({} as NodeJS.ProcessEnv, "win32")).toBe(true);
    expect(shouldRoute({} as NodeJS.ProcessEnv, "linux")).toBe(false);
    expect(shouldRoute({ LITTLE_CODER_SHELL_ROUTER: "0" } as any, "win32")).toBe(false);
  });
});
