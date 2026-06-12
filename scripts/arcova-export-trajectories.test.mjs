import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exportVerifiedTrajectories } from "./arcova-export-trajectories.mjs";

describe("arcova-export-trajectories", () => {
  it("exports only verified trajectories as SFT JSONL without raw commands", () => {
    const repo = mkdtempSync(join(tmpdir(), "arcova-sft-"));
    const dir = join(repo, ".arcova", "trajectories");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2026-06-12.jsonl"), [
      JSON.stringify({
        session_id: "ok",
        task: "Clarify a test description",
        files_touched: ["tests/Feature/FooTest.php"],
        commands: ["php artisan test tests/Feature/FooTest.php"],
        verify: { ran: true, passed: true, command: "php artisan test tests/Feature/FooTest.php" },
        tripwires: [],
        verified: true,
      }),
      JSON.stringify({
        session_id: "bad",
        task: "Touch env",
        files_touched: [".env"],
        commands: ["env"],
        verify: { ran: false, passed: false, command: "" },
        tripwires: ["guarded path touched: .env"],
        verified: false,
      }),
    ].join("\n"));

    const out = join(repo, ".arcova", "sft.jsonl");
    const count = exportVerifiedTrajectories(repo, out);
    const lines = readFileSync(out, "utf-8").trim().split("\n");

    expect(count).toBe(1);
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]);
    expect(row.messages[0].role).toBe("user");
    expect(row.messages[1].content).toContain("Verify passed: true");
    expect(row.messages[1].content).not.toContain("php artisan test");
  });
});
