import { describe, expect, it } from "vitest";
import { applyPlanUpdate, EMPTY_PLAN, formatPlanReminder } from "./plan.ts";

describe("plan-anchor state", () => {
  it("declaring steps resets current to 1 and clears done", () => {
    const s = applyPlanUpdate(EMPTY_PLAN, { steps: ["a", "b", "c"] });
    expect(s.steps).toEqual(["a", "b", "c"]);
    expect(s.current).toBe(1);
    expect(s.done).toEqual([]);
  });

  it("marks steps done and advances current past completed steps", () => {
    let s = applyPlanUpdate(EMPTY_PLAN, { steps: ["a", "b", "c"] });
    s = applyPlanUpdate(s, { done: [1], current: 2 });
    expect(s.done).toEqual([1]);
    expect(s.current).toBe(2);
  });

  it("re-derives current when the current step is marked done", () => {
    let s = applyPlanUpdate(EMPTY_PLAN, { steps: ["a", "b", "c"] }); // current 1
    s = applyPlanUpdate(s, { done: [1] }); // current 1 now done → moves to 2
    expect(s.current).toBe(2);
  });

  it("clamps / drops out-of-range and junk indices", () => {
    let s = applyPlanUpdate(EMPTY_PLAN, { steps: ["a", "b"] });
    s = applyPlanUpdate(s, { done: [99, 0, -3, 2], current: 99 });
    expect(s.done).toEqual([2]); // 99→clamped to 2; 0/-3 dropped
    // current 99 clamps to 2, but step 2 is done → re-derives to first open step (1)
    expect(s.current).toBe(1);
  });

  it("renders the canonical one-line reminder", () => {
    let s = applyPlanUpdate(EMPTY_PLAN, { steps: ["x", "add the migration", "y", "z", "w"] });
    s = applyPlanUpdate(s, { done: [1, 2], current: 3 });
    expect(formatPlanReminder(s)).toBe(
      "Plan: 5 steps. Done: 1,2. Current: 3 — y. Remaining: 4,5.",
    );
  });

  it("renders nothing without a plan", () => {
    expect(formatPlanReminder(EMPTY_PLAN)).toBe("");
  });
});
