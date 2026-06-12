import { describe, expect, it } from "vitest";
import { listRouteFiles, renderRouteFileSummary, trimText } from "./trim.ts";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("arcova boost trimming", () => {
  it("keeps short output unchanged", () => {
    expect(trimText("abc", 10)).toBe("abc");
  });

  it("trims long output with a marker", () => {
    const out = trimText("a".repeat(20), 10);
    expect(out).toBe("aaaaaaaaaa\n[trimmed to 10 chars]");
  });

  it("lists route PHP files without artisan", () => {
    const repo = mkdtempSync(join(tmpdir(), "arcova-routes-"));
    mkdirSync(join(repo, "routes"), { recursive: true });
    writeFileSync(join(repo, "routes", "web.php"), "<?php\nRoute::get('/dashboard', DashboardController::class);");
    writeFileSync(join(repo, "routes", "api.php"), "<?php\nRoute::post('/foo', FooController::class);");

    expect(listRouteFiles(repo)).toEqual(["routes/api.php", "routes/web.php"]);
    expect(renderRouteFileSummary(repo, 10_000)).toContain("Route::get('/dashboard'");
  });
});
