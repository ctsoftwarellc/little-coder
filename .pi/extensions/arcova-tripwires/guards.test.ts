import { describe, expect, it } from "vitest";
import { evaluateTripwires, loadTripwireConfig } from "./guards.ts";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("arcova tripwire guards", () => {
  it("hard blocks existing migration edits", () => {
    const result = evaluateTripwires(["database/migrations/2024_01_01_000000_create_users_table.php"], { existingFiles: new Set(["database/migrations/2024_01_01_000000_create_users_table.php"]) });
    expect(result.block).toBe(true);
    expect(result.reasons[0]).toContain("existing migration");
  });

  it("warns over five files and hard stops over twelve", () => {
    expect(evaluateTripwires(Array.from({ length: 6 }, (_, i) => `app/File${i}.php`)).warnings).toContain("more than 5 distinct files touched");
    expect(evaluateTripwires(Array.from({ length: 13 }, (_, i) => `app/File${i}.php`)).block).toBe(true);
  });

  it("hard blocks guarded sensitive paths", () => {
    const result = evaluateTripwires([".env"]);
    expect(result.block).toBe(true);
    expect(result.reasons).toContain("guarded path touched: .env");
  });

  it("honors configured guards and file limits", () => {
    const result = evaluateTripwires(["custom/Risky.php", "a.php", "b.php"], {
      config: {
        hardBlock: ["custom/**"],
        softFileLimit: 1,
        hardFileLimit: 2,
        generated: [],
      },
    });

    expect(result.warnings).toContain("more than 1 distinct files touched");
    expect(result.reasons).toContain("more than 2 distinct files touched");
    expect(result.reasons).toContain("guarded path touched: custom/Risky.php");
  });

  it("blocks generated files unless explicitly allowed", () => {
    const result = evaluateTripwires(["resources/js/wayfinder/routes.ts"], {
      config: {
        hardBlock: [],
        softFileLimit: 5,
        hardFileLimit: 12,
        generated: ["resources/js/wayfinder/**"],
      },
    });

    expect(result.block).toBe(true);
    expect(result.reasons).toContain("generated file edit blocked: resources/js/wayfinder/routes.ts");
  });

  it("loads guards.json from .arcova when present", () => {
    const cwd = mkdtempSync(join(tmpdir(), "arcova-guards-"));
    mkdirSync(join(cwd, ".arcova"));
    writeFileSync(join(cwd, ".arcova", "guards.json"), JSON.stringify({
      hardBlock: ["custom/**"],
      softFileLimit: 2,
      hardFileLimit: 3,
      generated: ["generated/**"],
    }));

    expect(loadTripwireConfig(cwd)).toEqual({
      hardBlock: ["custom/**"],
      softFileLimit: 2,
      hardFileLimit: 3,
      generated: ["generated/**"],
    });
  });
});
