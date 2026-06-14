import { describe, expect, it } from "vitest";
import { countDirty, detectChange, firstName, parseTracking } from "./situation.ts";
import type { Situation } from "./voice.ts";

function sit(overrides: Partial<Situation> = {}): Situation {
  return {
    project: "repo",
    isGit: true,
    branch: "main",
    dirtyCount: 0,
    ahead: 0,
    behind: 0,
    lastCommit: "init",
    lastSessionMission: "",
    userName: "Caleb",
    verifyCommand: "npm test",
    hour: 12,
    ...overrides,
  };
}

const opts = { agentActive: false, nudgeThreshold: 5, nudged: false };

describe("situation parsing", () => {
  it("counts dirty entries, ignoring blank lines", () => {
    expect(countDirty(" M a.ts\n?? b.ts\n")).toBe(2);
    expect(countDirty("")).toBe(0);
  });

  it("parses branch + ahead/behind from `status -sb`", () => {
    expect(parseTracking("## main...origin/main [ahead 2, behind 1]")).toEqual({ branch: "main", ahead: 2, behind: 1 });
    expect(parseTracking("## release/20260618...origin/release/20260618 [ahead 24]")).toEqual({
      branch: "release/20260618",
      ahead: 24,
      behind: 0,
    });
    expect(parseTracking("## main")).toEqual({ branch: "main", ahead: 0, behind: 0 });
  });

  it("extracts a first name for a personal address", () => {
    expect(firstName("Caleb Stanley")).toBe("Caleb");
    expect(firstName("  octocat ")).toBe("octocat");
    expect(firstName("")).toBe("");
  });
});

describe("detectChange", () => {
  it("returns null when nothing notable changed", () => {
    expect(detectChange(sit(), sit(), opts)).toBeNull();
  });

  it("flags a branch switch first", () => {
    expect(detectChange(sit({ branch: "main" }), sit({ branch: "feature/x" }), opts)).toEqual({
      kind: "branch",
      branch: "feature/x",
    });
  });

  it("flags a new commit", () => {
    expect(detectChange(sit({ lastCommit: "a" }), sit({ lastCommit: "b" }), opts)).toEqual({
      kind: "commit",
      subject: "b",
    });
  });

  it("notices the tree going clean", () => {
    expect(detectChange(sit({ dirtyCount: 4 }), sit({ dirtyCount: 0 }), opts)).toEqual({ kind: "clean" });
  });

  it("attributes idle-time growth to the user (foreign)", () => {
    const change = detectChange(sit({ dirtyCount: 1 }), sit({ dirtyCount: 3 }), { ...opts, agentActive: false });
    expect(change).toEqual({ kind: "foreign", count: 2 });
  });

  it("does NOT call agent-made growth foreign, but nudges past the threshold", () => {
    const change = detectChange(sit({ dirtyCount: 1 }), sit({ dirtyCount: 6 }), { ...opts, agentActive: true });
    expect(change).toEqual({ kind: "unverified", count: 6, verify: "npm test" });
  });

  it("only nudges once per batch", () => {
    const change = detectChange(sit({ dirtyCount: 1 }), sit({ dirtyCount: 6 }), { ...opts, agentActive: true, nudged: true });
    expect(change).toBeNull();
  });
});
