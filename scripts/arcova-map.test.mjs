import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildArcovaArtifacts } from "./arcova-map.mjs";

function laravelRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "arcova-map-"));
  writeFileSync(join(cwd, "artisan"), "");
  writeFileSync(join(cwd, "composer.json"), "{}");
  mkdirSync(join(cwd, "app", "Domains"), { recursive: true });
  mkdirSync(join(cwd, "app", "Core"), { recursive: true });
  mkdirSync(join(cwd, "app", "Providers"), { recursive: true });
  mkdirSync(join(cwd, "routes"), { recursive: true });
  mkdirSync(join(cwd, "tests", "Feature"), { recursive: true });
  mkdirSync(join(cwd, ".planning", "codebase"), { recursive: true });
  writeFileSync(join(cwd, "routes", "web.php"), "<?php");
  writeFileSync(join(cwd, "app", "Providers", "AppServiceProvider.php"), "<?php");
  writeFileSync(join(cwd, ".planning", "codebase", "SECURITY.md"), "# Security");
  return cwd;
}

describe("arcova-map", () => {
  it("generates MAP, RULES, and guards artifacts for a Laravel repo", () => {
    const cwd = laravelRepo();
    const generated = buildArcovaArtifacts(cwd);

    expect(generated).toEqual([
      join(cwd, ".arcova", "MAP.md"),
      join(cwd, ".arcova", "RULES.md"),
      join(cwd, ".arcova", "guards.json"),
    ]);

    const map = readFileSync(join(cwd, ".arcova", "MAP.md"), "utf-8");
    const rules = readFileSync(join(cwd, ".arcova", "RULES.md"), "utf-8");
    const guards = JSON.parse(readFileSync(join(cwd, ".arcova", "guards.json"), "utf-8"));

    expect(map).toContain("app/Domains");
    expect(map).toContain("routes/web.php");
    expect(map).toContain(".planning/codebase/SECURITY.md");
    expect(rules).toContain("Run focused verification");
    expect(guards.hardBlock).toContain("**/.env");
  });

  it("rejects non-Laravel directories", () => {
    const cwd = mkdtempSync(join(tmpdir(), "arcova-map-"));
    expect(() => buildArcovaArtifacts(cwd)).toThrow(/Laravel/);
  });
});
