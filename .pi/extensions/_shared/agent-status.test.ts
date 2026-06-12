import { describe, expect, it, beforeEach } from "vitest";
import {
  clearAgentStatus,
  formatStatusHeader,
  setPhaseStatus,
  setPlanStatus,
  setTimingStatus,
} from "./agent-status.ts";

describe("agent-status header", () => {
  beforeEach(() => clearAgentStatus());

  it("is empty when nothing is known", () => {
    expect(formatStatusHeader()).toBe("");
  });

  it("renders phase with an emoji", () => {
    setPhaseStatus("explore");
    expect(formatStatusHeader()).toBe("🔍 explore");
    setPhaseStatus("edit");
    expect(formatStatusHeader()).toBe("✏️ edit");
  });

  it("combines phase, plan, cache and throughput", () => {
    setPhaseStatus("verify");
    setPlanStatus(2, 5);
    setTimingStatus(91.6, 236.7);
    expect(formatStatusHeader()).toBe("✅ verify · ▶ 2/5 · cache 92% · 237 tok/s");
  });

  it("omits the plan segment when there are no steps", () => {
    setPhaseStatus("explore");
    setPlanStatus(0, 0);
    setTimingStatus(80, 100);
    expect(formatStatusHeader()).toBe("🔍 explore · cache 80% · 100 tok/s");
  });

  it("shows timing alone before a phase/plan exists", () => {
    setTimingStatus(50, 42);
    expect(formatStatusHeader()).toBe("cache 50% · 42 tok/s");
  });
});
