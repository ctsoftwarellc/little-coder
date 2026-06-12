import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateRankMap } from "./arcova-rank-map.mjs";

describe("arcova-rank-map", () => {
  it("writes a ranked PHP entrypoint map", () => {
    const repo = mkdtempSync(join(tmpdir(), "arcova-rank-"));
    mkdirSync(join(repo, "app", "Services"), { recursive: true });
    writeFileSync(join(repo, "artisan"), "");
    writeFileSync(join(repo, "composer.json"), "{}");
    writeFileSync(join(repo, "app", "Services", "Alpha.php"), "<?php\nclass Alpha { public function x() { return new Beta(); } }");
    writeFileSync(join(repo, "app", "Services", "Beta.php"), "<?php\nclass Beta {}");

    const out = generateRankMap(repo);
    const map = readFileSync(out, "utf-8");

    expect(map).toContain("# Arcova Ranked PHP Map");
    expect(map).toContain("app/Services/Alpha.php");
    expect(map).toContain("app/Services/Beta.php");
  });
});
