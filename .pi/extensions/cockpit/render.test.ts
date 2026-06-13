import { describe, expect, it } from "vitest";
import { box, cell, contextHealth, joinSegments, rule, truncate, useAscii, verifyRows, WIDGET_LINE_BUDGET } from "./render.ts";

describe("cockpit render", () => {
  it("draws a titled box with aligned borders", () => {
    const lines = box("AXIOM repo", "main", ["STATE READING"], 50);
    expect(lines[0].startsWith("┌─ AXIOM repo ")).toBe(true);
    expect(lines[0].endsWith("┐")).toBe(true);
    expect(lines[0]).toContain("main");
    expect(lines[lines.length - 1].startsWith("└")).toBe(true);
    // every line is the same visible width
    const widths = new Set(lines.map((l) => l.length));
    expect(widths.size).toBe(1);
  });

  it("classifies context health by threshold", () => {
    expect(contextHealth(6)).toBe("6% OK");
    expect(contextHealth(84)).toBe("84% HIGH");
    expect(contextHealth(96)).toBe("96% COMPACT SOON");
    expect(contextHealth(null)).toBe("—");
  });

  it("renders verify as four phase rows", () => {
    const rows = verifyRows({ tests: "pass", lint: "not run", types: "fail", build: "not run" });
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain("tests");
    expect(rows[0]).toContain("pass");
    expect(rows[2]).toContain("types");
    expect(rows[2]).toContain("fail");
  });

  it("pads key/value cells to a fixed width for grid alignment", () => {
    const c = cell("STATE", "READING");
    expect(c.startsWith("STATE")).toBe(true);
    expect(c.length).toBe(34);
  });

  it("ascii mode is opt-in", () => {
    expect(useAscii({} as NodeJS.ProcessEnv)).toBe(false);
    expect(useAscii({ LITTLE_CODER_COCKPIT_ASCII: "1" } as any)).toBe(true);
  });

  it("stays under pi's 10-line widget cap with headroom", () => {
    expect(WIDGET_LINE_BUDGET).toBeLessThan(10);
  });

  it("truncates to a visible width with an ellipsis", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello world", 5)).toBe("hell…");
    expect(truncate("x", 0)).toBe("");
  });

  it("joins status segments and drops the ones that don't fit", () => {
    const wide = joinSegments(["READING", "ctx 18% OK", "3 files"], 80);
    expect(wide).toBe("READING · ctx 18% OK · 3 files");
    // When the segments overflow the panel (min width 48), keep the leading ones
    // and drop the tail instead of wrapping or hard-cutting mid-word.
    const segs = ["AAAAAAAAAA", "BBBBBBBBBB", "CCCCCCCCCC", "DDDDDDDDDD", "EEEEEEEEEE"];
    const full = segs.join(" · ").length; // 62
    const narrow = joinSegments(segs, 48);
    expect(narrow.length).toBeLessThanOrEqual(48);
    expect(narrow.length).toBeLessThan(full); // tail was dropped
    expect(narrow.startsWith("AAAAAAAAAA")).toBe(true);
  });

  it("draws a rule sized to the panel width", () => {
    expect(rule(50)).toMatch(/^─+$/);
    expect(rule(50).length).toBeGreaterThan(8);
  });
});
