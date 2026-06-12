import { describe, expect, it } from "vitest";
import { normalizeVerifyInput, resolvePhpCommand, buildVerifyCommands, validateVerifyInput, verifyTimeoutMs } from "./php.ts";

describe("arcova verify php helpers", () => {
  it("prefers ARCOVA_PHP when set", () => {
    expect(resolvePhpCommand({ ARCOVA_PHP: "C:\\php\\php.exe" }, () => false)).toBe("C:\\php\\php.exe");
  });

  it("builds focused pest and optional type commands without formatting by default", () => {
    const commands = buildVerifyCommands({ target: "tests/Feature/FooTest.php", includeTypes: true }, "php");

    expect(commands).toEqual(["php artisan test tests/Feature/FooTest.php", "npm run types"]);
  });

  it("runs Pint only when format is explicit", () => {
    const commands = buildVerifyCommands({ filter: "foo", format: true }, "php");

    expect(commands[0]).toBe("php vendor/bin/pint --dirty");
    expect(commands[1]).toBe("php artisan test --filter=foo");
  });

  it("uses a configurable verify timeout with a short default", () => {
    expect(verifyTimeoutMs({})).toBe(45_000);
    expect(verifyTimeoutMs({ ARCOVA_VERIFY_TIMEOUT_MS: "120000" })).toBe(120_000);
  });

  it("refuses broad suite targets by default", () => {
    expect(validateVerifyInput({ target: "tests/Feature" })).toMatch(/broad verify target/);
    expect(validateVerifyInput({})).toMatch(/requires target or filter/);
  });

  it("allows focused test files and filters", () => {
    expect(validateVerifyInput({ target: "tests/Feature/FooTest.php" })).toBeUndefined();
    expect(validateVerifyInput({ filter: "it rejects invalid input" })).toBeUndefined();
  });

  it("allows broad verify only with an explicit env override", () => {
    expect(validateVerifyInput({ target: "tests/Feature" }, { ARCOVA_ALLOW_BROAD_VERIFY: "1" })).toBeUndefined();
  });

  it("drops a broad directory target when a focused filter is present", () => {
    expect(normalizeVerifyInput({ target: "tests/Feature", filter: "this_test_should_not_exist" })).toEqual({
      filter: "this_test_should_not_exist",
    });
  });
});
