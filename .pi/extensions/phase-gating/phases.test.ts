import { describe, expect, it } from "vitest";
import { allowedFor, INITIAL_PHASE, nextPhase } from "./phases.ts";

describe("phase-gating state machine", () => {
  it("starts in explore", () => {
    expect(INITIAL_PHASE).toBe("explore");
  });

  it("explore exposes read/discovery but not mutation", () => {
    const a = allowedFor("explore");
    expect(a).toContain("read");
    expect(a).toContain("Grep");
    expect(a).not.toContain("edit");
    expect(a).not.toContain("Write");
  });

  it("first edit/write moves to edit phase (lower- and PascalCase)", () => {
    expect(nextPhase("explore", "edit")).toBe("edit");
    expect(nextPhase("explore", "Write")).toBe("edit");
  });

  it("edit phase permits the mutation that triggered it", () => {
    const a = allowedFor("edit");
    expect(a).toContain("edit");
    expect(a).toContain("Write");
    expect(a).toContain("Verify");
    expect(a).toContain("read"); // can still re-read
  });

  it("Verify moves to verify phase; verify forbids fresh mutation", () => {
    expect(nextPhase("edit", "Verify")).toBe("verify");
    const a = allowedFor("verify");
    expect(a).toContain("Verify");
    expect(a).not.toContain("edit");
    expect(a).not.toContain("Write");
  });

  it("verify → edit when the model needs to change something again", () => {
    expect(nextPhase("verify", "edit")).toBe("edit");
  });

  it("non-mutating tools hold the current phase", () => {
    expect(nextPhase("edit", "read")).toBe("edit");
    expect(nextPhase("explore", "Grep")).toBe("explore");
  });
});
