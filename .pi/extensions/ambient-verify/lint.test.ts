import { describe, expect, it } from "vitest";
import { parsePhpLint, shouldLint } from "./lint.ts";

describe("ambient-verify lint", () => {
  it("lints only edit/write on .php files that succeeded", () => {
    expect(shouldLint("edit", "app/Foo.php", false)).toBe(true);
    expect(shouldLint("write", "app/Bar.php", false)).toBe(true);
    expect(shouldLint("Edit", "app/Foo.PHP", false)).toBe(true); // case-insensitive
  });

  it("skips non-php, non-edit, and failed edits", () => {
    expect(shouldLint("edit", "app/Foo.ts", false)).toBe(false);
    expect(shouldLint("read", "app/Foo.php", false)).toBe(false);
    expect(shouldLint("edit", "app/Foo.php", true)).toBe(false); // edit itself failed
    expect(shouldLint("edit", undefined, false)).toBe(false);
  });

  it("reports syntax OK on exit 0", () => {
    const r = parsePhpLint("No syntax errors detected in app/Foo.php", "", 0);
    expect(r.ok).toBe(true);
    expect(r.line).toContain("syntax OK");
  });

  it("surfaces the parse error line on failure", () => {
    const stderr = "PHP Parse error:  syntax error, unexpected '}' in app/Foo.php on line 12";
    const r = parsePhpLint("", stderr, 255);
    expect(r.ok).toBe(false);
    expect(r.line).toContain("php -l FAILED");
    expect(r.line).toContain("line 12");
  });

  it("degrades to an exit-code line when output is empty", () => {
    const r = parsePhpLint("", "", 255);
    expect(r.ok).toBe(false);
    expect(r.line).toContain("exit 255");
  });
});
