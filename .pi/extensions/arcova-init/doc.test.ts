import { describe, expect, it } from "vitest";
import { buildProjectDoc, bulletize, type ProjectInput } from "./doc.ts";

function input(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: "my-app",
    description: "A snazzy dashboard",
    stack: "React\nTypeScript",
    structure: ["Top-level: src, tests", "Entry points: src/index.ts"],
    verifyCommand: "npm test",
    guidelines: "Keep changes minimal\nFollow ESLint",
    conventions: "",
    dangerZones: ".env, secrets",
    generatedAt: "2026-06-13",
    ...overrides,
  };
}

describe("buildProjectDoc", () => {
  it("renders a titled doc with the expected sections", () => {
    const doc = buildProjectDoc(input());
    expect(doc).toContain("# Project Context — my-app");
    expect(doc).toContain("A snazzy dashboard");
    expect(doc).toContain("## Stack");
    expect(doc).toContain("- React");
    expect(doc).toContain("## Structure");
    expect(doc).toContain("- Top-level: src, tests");
    expect(doc).toContain("## How to verify");
    expect(doc).toContain("npm test");
    expect(doc).toContain("## Coding guidelines");
    expect(doc).toContain("## Danger zones — do not touch without asking");
  });

  it("omits empty sections so a minimal init stays small", () => {
    const doc = buildProjectDoc(input({ conventions: "", guidelines: "", dangerZones: "" }));
    expect(doc).not.toContain("## Conventions");
    expect(doc).not.toContain("## Coding guidelines");
    expect(doc).not.toContain("## Danger zones");
    expect(doc).toContain("## Stack"); // non-empty section still present
  });

  it("omits the verify section when no real command was set", () => {
    const doc = buildProjectDoc(input({ verifyCommand: "(set your test/verify command)" }));
    expect(doc).not.toContain("## How to verify");
  });

  it("never produces 3+ consecutive blank lines", () => {
    const doc = buildProjectDoc(input());
    expect(doc).not.toMatch(/\n{3,}/);
  });

  it("bulletizes newline- and comma-separated text, normalizing existing markers", () => {
    expect(bulletize("a\nb")).toEqual(["- a", "- b"]);
    expect(bulletize("x, y, z")).toEqual(["- x", "- y", "- z"]);
    expect(bulletize("- already\n* star")).toEqual(["- already", "- star"]);
    expect(bulletize("")).toEqual([]);
  });
});
