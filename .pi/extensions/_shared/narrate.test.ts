import { describe, expect, it } from "vitest";
import { basenameOf, describeToolCall, fallbackVerdict, shouldSummarize, tailLines } from "./narrate.ts";

describe("narrate helpers", () => {
  it("basenameOf handles posix and windows paths", () => {
    expect(basenameOf("app/Http/UserController.php")).toBe("UserController.php");
    expect(basenameOf("C:\\proj\\app\\Foo.php")).toBe("Foo.php");
    expect(basenameOf("trailing/slash/")).toBe("slash");
  });

  it("describes built-in tool calls in present tense", () => {
    expect(describeToolCall("read", { path: "a/b/Foo.php" })).toBe("📖 Reading Foo.php");
    expect(describeToolCall("edit", { path: "Foo.php", edits: [1, 2] })).toBe("✏️ Editing Foo.php (2 changes)");
    expect(describeToolCall("edit", { path: "Foo.php", edits: [1] })).toBe("✏️ Editing Foo.php (1 change)");
    expect(describeToolCall("bash", { command: "php artisan test" })).toContain("⚙️ Running: php artisan test");
    expect(describeToolCall("grep", { pattern: "login" })).toBe('🔎 Searching for "login"');
  });

  it("describes the Verify tool with scope", () => {
    expect(describeToolCall("Verify", { filter: "LoginTest" })).toBe("🧪 Verifying (LoginTest)");
    expect(describeToolCall("Verify", { target: "tests/Feature/AuthTest.php" })).toBe("🧪 Verifying (AuthTest.php)");
    expect(describeToolCall("Verify", {})).toBe("🧪 Verifying");
  });

  it("falls back gracefully for custom tools", () => {
    expect(describeToolCall("ArcovaListRoutes", {})).toBe("🛣️ Listing routes");
    expect(describeToolCall("EvidenceAdd", {})).toBe("📌 EvidenceAdd");
    expect(describeToolCall("SomethingElse", {})).toBe("🔧 SomethingElse");
  });

  it("tails the last N non-empty lines", () => {
    const log = "line1\n\nline2\nline3\n   \nline4\n";
    expect(tailLines(log, 2)).toEqual(["line3", "line4"]);
  });

  it("flags long or multi-line output for summarization", () => {
    expect(shouldSummarize("ok")).toBe(false);
    expect(shouldSummarize("x".repeat(900))).toBe(true);
    expect(shouldSummarize(Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n"))).toBe(true);
  });

  it("produces a deterministic verdict with a pass/fail count", () => {
    expect(fallbackVerdict("Verify", false, "Tests: 3 passed")).toBe("✓ Verify: 3 passed");
    expect(fallbackVerdict("Verify", true, "boom\nFatal error: x")).toContain("✗ Verify failed");
  });
});
