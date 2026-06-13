import { describe, expect, it } from "vitest";
import { box, cell, contextHealth, useAscii, verifyRows } from "./render.ts";

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
});
