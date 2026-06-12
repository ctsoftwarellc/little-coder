import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendTrajectory, sanitizeCommand } from "./index.ts";

describe("arcova trajectory", () => {
  it("logs sanitized JSONL under .arcova trajectories", () => {
    const cwd = mkdtempSync(join(tmpdir(), "arcova-trajectory-"));
    const path = appendTrajectory(cwd, {
      session_id: "s1",
      started_at: "2026-06-12T00:00:00.000Z",
      cwd,
      model: "lmstudio/local-model",
      task: "fix test",
      files_touched: ["app/Foo.php"],
      commands: ["env"],
      verify: { ran: true, passed: true, command: "php artisan test" },
      tripwires: [],
      verified: true,
    }, new Date("2026-06-12T00:00:00.000Z"));

    const lines = readFileSync(path, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).commands).toEqual(["[redacted sensitive command]"]);
  });

  it("redacts env dumps", () => {
    expect(sanitizeCommand("printenv")).toBe("[redacted sensitive command]");
  });
});
