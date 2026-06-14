import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildArcovaContextBlock, isLaravelRepo, presentContextFiles } from "./index.ts";

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), "arcova-context-"));
}

describe("arcova-context", () => {
  it("does not inject outside Laravel repo", () => {
    const cwd = tempRepo();
    expect(isLaravelRepo(cwd)).toBe(false);
    expect(buildArcovaContextBlock(cwd)).toBe("");
  });

  it("injects MAP and RULES when .arcova artifacts exist", () => {
    const cwd = tempRepo();
    writeFileSync(join(cwd, "artisan"), "");
    writeFileSync(join(cwd, "composer.json"), "{}");
    mkdirSync(join(cwd, ".arcova"));
    writeFileSync(join(cwd, ".arcova", "MAP.md"), "# Map\nDomains");
    writeFileSync(join(cwd, ".arcova", "RULES.md"), "# Rules\nVerify");

    const block = buildArcovaContextBlock(cwd);

    expect(block).toContain("## Arcova Stable Context");
    expect(block).toContain("# Map");
    expect(block).toContain("# Rules");
  });

  it("truncates context to configured budget", () => {
    const cwd = tempRepo();
    writeFileSync(join(cwd, "artisan"), "");
    writeFileSync(join(cwd, "composer.json"), "{}");
    mkdirSync(join(cwd, ".arcova"));
    writeFileSync(join(cwd, ".arcova", "MAP.md"), "M".repeat(200));
    writeFileSync(join(cwd, ".arcova", "RULES.md"), "R".repeat(200));

    const block = buildArcovaContextBlock(cwd, 120);

    expect(block.length).toBeLessThanOrEqual(120);
    expect(block).toContain("[truncated]");
  });

  it("keeps stable context ordering deterministic", () => {
    const cwd = tempRepo();
    writeFileSync(join(cwd, "artisan"), "");
    writeFileSync(join(cwd, "composer.json"), "{}");
    mkdirSync(join(cwd, ".arcova"));
    writeFileSync(join(cwd, ".arcova", "MAP.md"), "MAP");
    writeFileSync(join(cwd, ".arcova", "RULES.md"), "RULES");

    const block = buildArcovaContextBlock(cwd);

    expect(block.indexOf("### .arcova/MAP.md")).toBeLessThan(block.indexOf("### .arcova/RULES.md"));
  });

  it("injects /init's PROJECT.md in a non-Laravel repo (no Laravel gate)", () => {
    const cwd = tempRepo();
    expect(isLaravelRepo(cwd)).toBe(false);
    mkdirSync(join(cwd, ".arcova"));
    writeFileSync(join(cwd, ".arcova", "PROJECT.md"), "# Project Context\nDo the thing.");

    const block = buildArcovaContextBlock(cwd);
    expect(block).toContain("### .arcova/PROJECT.md");
    expect(block).toContain("Do the thing.");
    expect(presentContextFiles(cwd)).toEqual(["PROJECT.md"]);
  });

  it("orders the human PROJECT.md before the generated MAP/RULES", () => {
    const cwd = tempRepo();
    mkdirSync(join(cwd, ".arcova"));
    writeFileSync(join(cwd, ".arcova", "PROJECT.md"), "PROJECT");
    writeFileSync(join(cwd, ".arcova", "MAP.md"), "MAP");
    writeFileSync(join(cwd, ".arcova", "RULES.md"), "RULES");

    const block = buildArcovaContextBlock(cwd);
    expect(block.indexOf("### .arcova/PROJECT.md")).toBeLessThan(block.indexOf("### .arcova/MAP.md"));
    expect(presentContextFiles(cwd)).toEqual(["PROJECT.md", "MAP.md", "RULES.md"]);
  });
});
