import { describe, expect, it } from "vitest";
import { evaluateTripwires } from "./guards.ts";

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
});
