import { describe, expect, it } from "vitest";
import { findFuzzyMatch } from "./fuzzy.ts";

const FILE = [
  "function add(a, b) {",
  "    return a + b;",
  "}",
  "",
  "function sub(a, b) {",
  "    return a - b;",
  "}",
  "",
].join("\n");

describe("fuzzy-edit matching", () => {
  it("reports exact when oldText already matches verbatim", () => {
    expect(findFuzzyMatch(FILE, "    return a + b;").kind).toBe("exact");
  });

  it("matches across trailing-whitespace differences and returns the real slice", () => {
    const r = findFuzzyMatch(FILE, "    return a + b;   "); // trailing spaces the file lacks
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") {
      expect(r.matched).toBe("    return a + b;"); // exact file text, no trailing spaces
      expect(FILE.includes(r.matched)).toBe(true);
      expect(r.strategy).toBe("trailing-whitespace");
    }
  });

  it("matches a multi-line block across indentation differences", () => {
    // Middle line indented 2 spaces, file uses 4 — the block is NOT a substring,
    // so the indentation strategy is what rescues it.
    const r = findFuzzyMatch(FILE, "function sub(a, b) {\n  return a - b;\n}");
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") {
      expect(r.matched).toBe(["function sub(a, b) {", "    return a - b;", "}"].join("\n"));
      expect(r.strategy).toBe("indentation");
      expect(FILE.includes(r.matched)).toBe(true);
    }
  });

  it("matches a multi-line block across trailing-whitespace differences", () => {
    const r = findFuzzyMatch(FILE, "function sub(a, b) {   \n    return a - b;\n}");
    expect(r.kind).toBe("matched");
    if (r.kind === "matched") {
      expect(r.matched).toBe(["function sub(a, b) {", "    return a - b;", "}"].join("\n"));
      expect(r.strategy).toBe("trailing-whitespace");
    }
  });

  it("refuses an ambiguous match (two identical regions)", () => {
    const dup = ["x = 1;", "y = 2;", "x = 1;"].join("\n");
    // "x = 1 ;" normalizes to both occurrences → ambiguous → no rewrite
    expect(findFuzzyMatch(dup, "x = 1 ;").kind).toBe("none");
  });

  it("returns none when nothing resembles the target", () => {
    expect(findFuzzyMatch(FILE, "completely unrelated line").kind).toBe("none");
  });

  it("refuses to fabricate a match for whitespace-only oldText", () => {
    // Tabs aren't present in FILE, so this isn't an exact substring; the
    // empty-normalization guard must refuse rather than match any blank run.
    expect(findFuzzyMatch(FILE, "\t\t").kind).toBe("none");
  });
});
