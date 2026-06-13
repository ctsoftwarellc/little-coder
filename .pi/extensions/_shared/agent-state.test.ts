import { describe, expect, it } from "vitest";
import { defaultNext, nextAgentState, stateLabel } from "./agent-state.ts";

const clean = { filesChanged: false };
const dirty = { filesChanged: true };

describe("agent-state machine", () => {
  it("boots and runs preflight before work", () => {
    expect(nextAgentState("BOOT", "boot", clean)).toBe("BOOT");
    expect(nextAgentState("BOOT", "preflight", clean)).toBe("PREFLIGHT");
  });

  it("maps tool signals to phases", () => {
    expect(nextAgentState("PLANNING", "read", clean)).toBe("READING");
    expect(nextAgentState("READING", "edit", clean)).toBe("EDITING");
    expect(nextAgentState("EDITING", "verify", clean)).toBe("VERIFYING");
  });

  it("a passing verify with edits is REVIEW_READY, without edits is DONE", () => {
    expect(nextAgentState("VERIFYING", "verify_pass", dirty)).toBe("REVIEW_READY");
    expect(nextAgentState("VERIFYING", "verify_pass", clean)).toBe("DONE");
  });

  it("a failing verify or tool error blocks", () => {
    expect(nextAgentState("VERIFYING", "verify_fail", dirty)).toBe("BLOCKED");
    expect(nextAgentState("EDITING", "blocked", dirty)).toBe("BLOCKED");
  });

  it("does not downgrade a blocked run to DONE at loop end", () => {
    expect(nextAgentState("BLOCKED", "done", dirty)).toBe("BLOCKED");
    expect(nextAgentState("EDITING", "done", dirty)).toBe("DONE");
  });

  it("think only nudges neutral states into PLANNING", () => {
    expect(nextAgentState("BOOT", "think", clean)).toBe("PLANNING");
    expect(nextAgentState("EDITING", "think", clean)).toBe("EDITING"); // holds meaningful state
  });

  it("labels are space-separated and there's a default next hint per state", () => {
    expect(stateLabel("REVIEW_READY")).toBe("REVIEW READY");
    expect(defaultNext("EDITING")).toContain("smallest correct change");
  });
});
