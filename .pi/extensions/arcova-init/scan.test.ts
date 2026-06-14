import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanRepo } from "./scan.ts";

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), "arcova-init-scan-"));
}

describe("scanRepo", () => {
  it("detects a Node/React/TS project with its verify script", () => {
    const cwd = tempRepo();
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        name: "my-app",
        description: "A snazzy dashboard",
        scripts: { test: "vitest run" },
        dependencies: { react: "^18" },
        devDependencies: { typescript: "^5", eslint: "^9", vitest: "^2" },
      }),
    );
    writeFileSync(join(cwd, "tsconfig.json"), "{}");
    writeFileSync(join(cwd, "package-lock.json"), "{}");
    mkdirSync(join(cwd, "src"));
    writeFileSync(join(cwd, "src", "index.ts"), "");

    const scan = scanRepo(cwd);
    expect(scan.name).toBe("my-app");
    expect(scan.description).toBe("A snazzy dashboard");
    expect(scan.languages).toContain("TypeScript");
    expect(scan.frameworks).toContain("React");
    expect(scan.tooling).toEqual(expect.arrayContaining(["ESLint", "Vitest"]));
    expect(scan.packageManager).toBe("npm");
    expect(scan.verifyCommand).toBe("npm test");
    expect(scan.topDirs).toContain("src");
    expect(scan.entryPoints).toContain("src/index.ts");
    expect(scan.isLaravel).toBe(false);
  });

  it("detects a Laravel repo and its artisan verify command", () => {
    const cwd = tempRepo();
    writeFileSync(join(cwd, "artisan"), "#!/usr/bin/env php");
    writeFileSync(
      join(cwd, "composer.json"),
      JSON.stringify({ description: "API backend", require: { "laravel/framework": "^11" }, "require-dev": { "laravel/pint": "^1" } }),
    );
    mkdirSync(join(cwd, "app"));

    const scan = scanRepo(cwd);
    expect(scan.isLaravel).toBe(true);
    expect(scan.languages).toContain("PHP");
    expect(scan.frameworks).toContain("Laravel");
    expect(scan.tooling).toContain("Pint");
    expect(scan.verifyCommand).toBe("php artisan test");
    expect(scan.entryPoints).toEqual(expect.arrayContaining(["app", "artisan"]));
  });

  it("falls back gracefully on an unknown/empty repo", () => {
    const cwd = tempRepo();
    const scan = scanRepo(cwd);
    expect(scan.name.length).toBeGreaterThan(0);
    expect(scan.languages).toEqual([]);
    expect(scan.frameworks).toEqual([]);
    expect(scan.verifyCommand).toMatch(/set your test/);
    expect(scan.isLaravel).toBe(false);
  });

  it("pulls a description from the README when no manifest has one", () => {
    const cwd = tempRepo();
    writeFileSync(join(cwd, "README.md"), "# Cool Tool\n\n![badge](x)\n\nDoes cool things fast.\n");
    const scan = scanRepo(cwd);
    expect(scan.description).toBe("Does cool things fast.");
  });

  it("ignores heavy/noise directories in the top-level listing", () => {
    const cwd = tempRepo();
    for (const d of ["src", "node_modules", "vendor", "dist", ".git"]) mkdirSync(join(cwd, d));
    const scan = scanRepo(cwd);
    expect(scan.topDirs).toContain("src");
    expect(scan.topDirs).not.toContain("node_modules");
    expect(scan.topDirs).not.toContain("vendor");
    expect(scan.topDirs).not.toContain("dist");
  });
});
