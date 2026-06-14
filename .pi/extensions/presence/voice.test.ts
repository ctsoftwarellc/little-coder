import { describe, expect, it } from "vitest";
import { bootBriefing, timeGreeting, watchRemark, type Situation } from "./voice.ts";

function sit(overrides: Partial<Situation> = {}): Situation {
  return {
    project: "arcova_ai",
    isGit: true,
    branch: "release/20260618",
    dirtyCount: 3,
    ahead: 2,
    behind: 0,
    lastCommit: "wire up insight widget",
    lastSessionMission: "AI operations insight widget",
    userName: "Caleb",
    verifyCommand: "php artisan test",
    hour: 20,
    ...overrides,
  };
}

describe("AXIOM voice", () => {
  it("greets by time of day across the boundaries", () => {
    expect(timeGreeting(8)).toBe("Good morning");
    expect(timeGreeting(14)).toBe("Good afternoon");
    expect(timeGreeting(20)).toBe("Good evening");
    expect(timeGreeting(2)).toMatch(/midnight/i);
  });

  it("briefs with greeting, name, branch, tree, sync, commit and a next move", () => {
    const lines = bootBriefing(sit());
    const text = lines.join("\n");
    expect(text).toContain("AXIOM online.");
    expect(text).toContain("Good evening, Caleb.");
    expect(text).toContain("arcova_ai · release/20260618");
    expect(text).toContain("3 uncommitted files.");
    expect(text).toContain("↑2 ahead of origin.");
    expect(text).toContain('Last commit: "wire up insight widget".');
    expect(text).toContain('Last session: "AI operations insight widget".');
    expect(text).toContain("Pick up where we left off");
  });

  it("drops the name when none is known and reports a clean tree", () => {
    const text = bootBriefing(sit({ userName: "", dirtyCount: 0, ahead: 0 })).join("\n");
    expect(text).toContain("Good evening.");
    expect(text).not.toContain(", .");
    expect(text).toContain("Working tree: clean.");
    expect(text).toContain("What are we building?");
  });

  it("handles a non-git directory gracefully", () => {
    const text = bootBriefing(sit({ isGit: false })).join("\n");
    expect(text).toContain("no git here, fresh ground");
    expect(text).not.toContain("Working tree:");
  });

  it("singularizes one file / one change", () => {
    expect(bootBriefing(sit({ dirtyCount: 1 })).join("\n")).toContain("1 uncommitted file.");
    expect(watchRemark({ kind: "foreign", count: 1 })).toBe("Spotted 1 change I didn't make.");
  });

  it("voices each watch remark in character", () => {
    expect(watchRemark({ kind: "branch", branch: "main" })).toBe("We're on main now.");
    expect(watchRemark({ kind: "commit", subject: "fix auth" })).toBe('Committed: "fix auth".');
    expect(watchRemark({ kind: "clean" })).toMatch(/clean again/);
    expect(watchRemark({ kind: "unverified", count: 6, verify: "npm test" })).toContain("`npm test`");
    expect(watchRemark({ kind: "foreign", count: 3 })).toContain("I didn't make");
  });
});
