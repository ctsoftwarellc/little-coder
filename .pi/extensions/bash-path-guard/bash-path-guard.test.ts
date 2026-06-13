import { describe, expect, it } from "vitest";
import { bashPathGuardReason } from "./index.ts";

describe("bash path guard", () => {
  it("blocks raw Windows Herd PHP paths in Bash commands", () => {
    const reason = bashPathGuardReason(
      "C:\\Users\\Caleb\\.config\\herd\\bin\\php84\\php.exe artisan test tests/Feature/FooTest.php",
    );

    expect(reason).toContain("blocked before execution");
    expect(reason).toContain('"/c/Users/Caleb/.config/herd/bin/php84/php.exe"');
    expect(reason).toContain('"name":"Verify"');
  });

  it("blocks PowerShell-only cmdlets in Bash commands", () => {
    const reason = bashPathGuardReason("php artisan test 2>&1 | Select-String -Pattern fail");

    expect(reason).toContain("PowerShell cmdlets");
    expect(reason).toContain("grep");
  });

  it("allows normal Bash commands", () => {
    expect(bashPathGuardReason("php artisan test tests/Feature/FooTest.php | head -100")).toBeUndefined();
  });
});
