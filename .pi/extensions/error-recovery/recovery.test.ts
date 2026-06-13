import { describe, expect, it } from "vitest";
import { isRecoverableTool, matchRecovery, RECOVERY_RULES } from "./recovery.ts";

describe("isRecoverableTool", () => {
  it("targets command/test executions only", () => {
    expect(isRecoverableTool("bash")).toBe(true);
    expect(isRecoverableTool("Verify")).toBe(true);
    expect(isRecoverableTool("RunRelevantTests")).toBe(true);
    expect(isRecoverableTool("edit")).toBe(false);
    expect(isRecoverableTool("read")).toBe(false);
  });
});

describe("matchRecovery", () => {
  it("maps a Laravel container resolution failure", () => {
    const m = matchRecovery("Illuminate\\Contracts\\Container\\BindingResolutionException: Target class [App\\Services\\Charger] does not exist.");
    expect(m?.id).toBe("target-class-missing");
    expect(m?.hint).toContain("FindSymbol");
  });

  it("maps a class-not-found fatal", () => {
    const m = matchRecovery('PHP Fatal error: Uncaught Error: Class "App\\Models\\Invoce" not found in ...');
    expect(m?.id).toBe("class-not-found");
    expect(m?.hint).toContain("FindSymbol");
  });

  it("maps an undefined method call to FindSymbol", () => {
    const m = matchRecovery("Error: Call to undefined method App\\Models\\Invoice::markAsPaid()");
    expect(m?.id).toBe("undefined-method");
    expect(m?.hint).toContain("FindSymbol");
  });

  it("maps a missing table to schema inspection, not migration editing", () => {
    const m = matchRecovery("SQLSTATE[42S02]: Base table or view not found: 1146 Table 'arcova.invoices' doesn't exist");
    expect(m?.id).toBe("db-missing-table");
    expect(m?.hint).toContain("ArcovaDatabaseSchema");
    expect(m?.hint.toLowerCase()).toContain("do not");
  });

  it("maps an unknown column", () => {
    const m = matchRecovery("SQLSTATE[42S22]: Unknown column 'total_cents' in 'field list'");
    expect(m?.id).toBe("db-unknown-column");
  });

  it("maps a command-not-found to quoting guidance", () => {
    const m = matchRecovery("/usr/bin/bash: line 1: C:UsersCalebphp.exe: command not found");
    expect(m?.id).toBe("command-not-found");
    expect(m?.hint).toContain("forward slashes");
  });

  it("maps PHPUnit assertion failures to RelevantTests", () => {
    const m = matchRecovery("FAILURES!\nTests: 12, Assertions: 30, Failures: 2.");
    expect(m?.id).toBe("phpunit-failures");
    expect(m?.hint).toContain("RelevantTests");
  });

  it("maps a parse error to fixing syntax first", () => {
    const m = matchRecovery("PHP Parse error: syntax error, unexpected '}' in app/Foo.php on line 12");
    // syntax rule is lower priority than class/method, but the only match here
    expect(m?.id).toBe("syntax-fatal");
  });

  it("returns null when nothing matches", () => {
    expect(matchRecovery("Process completed successfully.")).toBeNull();
    expect(matchRecovery("")).toBeNull();
  });

  it("prefers the more specific rule (undefined method over phpunit) when both could appear", () => {
    const m = matchRecovery("Call to undefined method Foo::bar()\nFAILURES!\nTests: 1, Failures: 1.");
    expect(m?.id).toBe("undefined-method");
  });

  it("every rule has a unique id and a non-empty hint", () => {
    const ids = RECOVERY_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(RECOVERY_RULES.every((r) => r.hint.length > 0)).toBe(true);
  });
});
