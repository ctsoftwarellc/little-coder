import { describe, expect, it } from "vitest";
import { digestVerifyOutput } from "./digest.ts";

describe("digestVerifyOutput", () => {
  it("returns a compact digest with failing test names and assertion diff", () => {
    const raw = `
FAIL  Tests\\Feature\\ExampleTest
  - it rejects invalid input
  Failed asserting that two strings are identical.
-'expected'
+'actual'
  at tests/Feature/ExampleTest.php:42
`;

    const digest = digestVerifyOutput(raw, "php artisan test --filter=invalid", 1, 123);

    expect(digest.text.length).toBeLessThan(4000);
    expect(digest.failingTests).toContain("it rejects invalid input");
    expect(digest.firstAssertionDiff).toContain("-'expected'");
    expect(digest.relevantLocation).toBe("tests/Feature/ExampleTest.php:42");
  });
});
