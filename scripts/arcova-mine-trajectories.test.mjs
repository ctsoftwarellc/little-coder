import { describe, expect, it } from "vitest";
import {
  applyRecommendations,
  generateReport,
  mineTrajectories,
  parseTrajectoryLines,
  recommend,
} from "./arcova-mine-trajectories.mjs";

function rec(over = {}) {
  return {
    session_id: "s",
    started_at: "2026-06-12T00:00:00.000Z",
    cwd: "/r",
    model: "lmstudio/qwen3.5-9b",
    task: "t",
    files_touched: ["a.php"],
    commands: [],
    verify: { ran: true, passed: true, command: "php artisan test" },
    tripwires: [],
    verified: true,
    edit_attempts: 4,
    edit_failures: 0,
    ...over,
  };
}

describe("arcova-mine-trajectories", () => {
  it("parses JSONL and skips malformed lines", () => {
    const text = `${JSON.stringify(rec())}\n{bad json\n${JSON.stringify(rec())}\n`;
    expect(parseTrajectoryLines(text)).toHaveLength(2);
  });

  it("aggregates per-model rates", () => {
    const records = [
      rec({ edit_attempts: 10, edit_failures: 4, verify: { ran: false, passed: false, command: "" }, verified: false }),
      rec({ edit_attempts: 10, edit_failures: 0, tripwires: ["sensitive path"] }),
    ];
    const stats = mineTrajectories(records).get("lmstudio/qwen3.5-9b");
    expect(stats.sessions).toBe(2);
    expect(stats.editFailureRate).toBeCloseTo(4 / 20, 5);
    expect(stats.verifyRate).toBe(0.5);
    expect(stats.tripwireRate).toBe(0.5);
  });

  it("recommends fuzzy edit on a high edit-failure rate", () => {
    const stats = mineTrajectories(
      Array.from({ length: 6 }, () => rec({ edit_attempts: 10, edit_failures: 4 })),
    ).get("lmstudio/qwen3.5-9b");
    const signals = recommend(stats).map((r) => r.signal);
    expect(signals).toContain("high-edit-failure");
    const fuzzy = recommend(stats).find((r) => r.signal === "high-edit-failure");
    expect(fuzzy.suggested_env).toBe("LITTLE_CODER_FUZZY_EDIT=1");
  });

  it("recommends ambient verify when the model rarely verifies", () => {
    const stats = mineTrajectories(
      Array.from({ length: 6 }, () => rec({ verify: { ran: false, passed: false, command: "" } })),
    ).get("lmstudio/qwen3.5-9b");
    expect(recommend(stats).map((r) => r.signal)).toContain("rarely-verifies");
  });

  it("withholds recommendations below the sample threshold", () => {
    const stats = mineTrajectories([rec()]).get("lmstudio/qwen3.5-9b");
    expect(recommend(stats).map((r) => r.signal)).toEqual(["insufficient-data"]);
  });

  it("merges recommendations into a settings object without clobbering it", () => {
    const byModel = mineTrajectories(
      Array.from({ length: 6 }, () => rec({ verify: { ran: false, passed: false, command: "" } })),
    );
    const before = { little_coder: { default_model_profile: { temperature: 0.3 }, model_profiles: {} } };
    const after = applyRecommendations(before, byModel);
    expect(after.little_coder.default_model_profile.temperature).toBe(0.3); // untouched
    const recs = after.little_coder.model_profiles["lmstudio/qwen3.5-9b"].tuning_recommendations;
    expect(recs.some((r) => r.suggested_env === "LITTLE_CODER_AMBIENT_PHP_LINT=1")).toBe(true);
    expect(before.little_coder.model_profiles).toEqual({}); // input not mutated
  });

  it("generates a readable report", () => {
    const byModel = mineTrajectories(Array.from({ length: 6 }, () => rec({ edit_attempts: 10, edit_failures: 4 })));
    const report = generateReport(byModel);
    expect(report).toContain("# Arcova Trajectory Mining Report");
    expect(report).toContain("lmstudio/qwen3.5-9b");
    expect(report).toContain("edit-failure-rate=40%");
  });
});
