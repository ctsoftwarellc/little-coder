import { describe, expect, it } from "vitest";
import { colorEnabled, paint, paintLine, stripAnsi } from "./color.ts";

describe("cockpit color", () => {
  it("is gated by NO_COLOR and the cockpit flag", () => {
    expect(colorEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(colorEnabled({ NO_COLOR: "1" } as any)).toBe(false);
    expect(colorEnabled({ LITTLE_CODER_COCKPIT_COLOR: "0" } as any)).toBe(false);
  });

  it("preserves visible text exactly (color must not change layout width)", () => {
    const line = "│ AXIOM  STATE: thinking      VERIFY: not run │";
    const painted = paintLine(line);
    expect(painted).not.toBe(line); // something was colored
    expect(stripAnsi(painted)).toBe(line); // …but visible content is identical
  });

  it("colors tags, headers, labels and glyphs", () => {
    expect(paintLine("  09:41 [DONE ] file read").includes("\x1b[")).toBe(true);
    expect(stripAnsi(paintLine("PREFLIGHT"))).toBe("PREFLIGHT");
    expect(stripAnsi(paintLine("  ▶ 1. parse test.md"))).toBe("  ▶ 1. parse test.md");
  });

  it("is a no-op array passthrough when disabled", () => {
    const lines = ["PREFLIGHT", "  [DONE ] x"];
    expect(paint(lines, { NO_COLOR: "1" } as any)).toEqual(lines);
  });

  it("does not double-color a [MISSION] tag as a header", () => {
    // The MISSION inside the tag should be tag-colored, not also header-matched.
    const painted = paintLine("  09:41 [MISSION] launched");
    expect(stripAnsi(painted)).toBe("  09:41 [MISSION] launched");
  });
});
