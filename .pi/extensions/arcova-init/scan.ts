// Repo auto-scan for /init. Pure-ish (reads the filesystem under a given root,
// no globals) so it can be unit-tested against a temp fixture. The goal is to
// pre-fill the /init interview so the user confirms/edits detected facts rather
// than typing everything from a blank prompt.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export interface RepoScan {
  name: string;
  description: string;
  languages: string[];
  frameworks: string[];
  tooling: string[];
  packageManager?: string;
  topDirs: string[];
  entryPoints: string[];
  verifyCommand: string;
  isLaravel: boolean;
}

// Directories that are noise in a "what does this repo contain" summary.
const IGNORE_DIRS = new Set([
  "node_modules", ".git", "vendor", "dist", "build", ".next", "out", "target",
  "__pycache__", ".venv", "venv", ".pytest_cache", "coverage", ".idea", ".vscode",
  ".cache", ".turbo", "tmp", "temp", ".pi", ".arcova", ".planning",
]);

function readJson(path: string): any | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function safeRead(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function has(root: string, rel: string): boolean {
  return existsSync(join(root, rel));
}

function cleanOneLine(value: string): string {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function pmRun(pm: string): string {
  if (pm === "npm") return "npm run";
  if (pm === "yarn") return "yarn";
  if (pm === "bun") return "bun run";
  return "pnpm";
}

function detectPackageManager(root: string, pkg: any): string {
  if (typeof pkg.packageManager === "string" && pkg.packageManager) return pkg.packageManager.split("@")[0];
  if (has(root, "pnpm-lock.yaml")) return "pnpm";
  if (has(root, "yarn.lock")) return "yarn";
  if (has(root, "bun.lockb")) return "bun";
  return "npm";
}

function nodeVerifyCommand(pkg: any, pm: string): string {
  const scripts = (pkg && pkg.scripts) || {};
  const run = pmRun(pm);
  for (const key of ["test", "check", "ci"]) {
    if (typeof scripts[key] === "string" && scripts[key]) {
      return pm === "npm" && key === "test" ? "npm test" : `${run} ${key}`;
    }
  }
  return pm === "npm" ? "npm test" : `${run} test`;
}

function readReadmeDescription(root: string): string {
  for (const file of ["README.md", "README.MD", "Readme.md", "readme.md"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const lines = safeRead(path).split(/\r?\n/);
    for (const raw of lines) {
      const t = raw.trim();
      if (!t || t.startsWith("#") || t.startsWith("![") || t.startsWith("[!") || t.startsWith("<")) continue;
      return t;
    }
    const heading = lines.find((l) => l.trim().startsWith("#"));
    if (heading) return heading.replace(/^#+\s*/, "").trim();
  }
  return "";
}

function topLevelDirs(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORE_DIRS.has(e.name))
      .map((e) => e.name)
      .sort()
      .slice(0, 12);
  } catch {
    return [];
  }
}

function detectEntryPoints(root: string): string[] {
  const candidates = [
    "src/index.ts", "src/index.js", "src/main.ts", "src/main.tsx", "src/main.js",
    "index.ts", "index.js", "main.py", "app.py", "manage.py",
    "src/main.rs", "main.go", "cmd", "bin", "app", "artisan",
  ];
  return candidates.filter((c) => existsSync(join(root, c))).slice(0, 8);
}

export function scanRepo(root: string): RepoScan {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const tooling = new Set<string>();
  let name = basename(root.replace(/[\\/]+$/, "")) || "this project";
  let description = "";
  let packageManager: string | undefined;
  let verify = "";

  // ---- Node / JS / TS ----
  const pkg = readJson(join(root, "package.json"));
  if (pkg) {
    if (typeof pkg.name === "string" && pkg.name) name = pkg.name;
    if (typeof pkg.description === "string") description = pkg.description;
    const deps: Record<string, string> = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const dep = (n: string) => Object.prototype.hasOwnProperty.call(deps, n);
    languages.add(has(root, "tsconfig.json") || dep("typescript") ? "TypeScript" : "JavaScript");
    if (dep("next")) frameworks.add("Next.js");
    if (dep("react")) frameworks.add("React");
    if (dep("vue")) frameworks.add("Vue");
    if (dep("@angular/core")) frameworks.add("Angular");
    if (dep("svelte")) frameworks.add("Svelte");
    if (dep("@nestjs/core")) frameworks.add("NestJS");
    if (dep("express")) frameworks.add("Express");
    if (Object.keys(deps).some((d) => d.startsWith("@inertiajs/"))) frameworks.add("Inertia");
    if (dep("vite")) tooling.add("Vite");
    if (dep("eslint")) tooling.add("ESLint");
    if (dep("prettier")) tooling.add("Prettier");
    if (dep("typescript")) tooling.add("tsc");
    if (dep("vitest")) tooling.add("Vitest");
    else if (dep("jest")) tooling.add("Jest");
    packageManager = detectPackageManager(root, pkg);
    verify = nodeVerifyCommand(pkg, packageManager);
  }

  // ---- PHP / Laravel ----
  const composer = readJson(join(root, "composer.json"));
  const isLaravel = has(root, "artisan") && has(root, "composer.json");
  if (composer) {
    languages.add("PHP");
    const cdeps: Record<string, string> = { ...(composer.require || {}), ...(composer["require-dev"] || {}) };
    const cdep = (n: string) => Object.prototype.hasOwnProperty.call(cdeps, n);
    if (cdep("laravel/framework")) frameworks.add("Laravel");
    if (cdep("pestphp/pest")) tooling.add("Pest");
    if (cdep("laravel/pint")) tooling.add("Pint");
    if (!description && typeof composer.description === "string") description = composer.description;
    if (!verify) verify = isLaravel ? "php artisan test" : "vendor/bin/phpunit";
  }

  // ---- Python ----
  if (has(root, "pyproject.toml") || has(root, "requirements.txt") || has(root, "manage.py") || has(root, "setup.py")) {
    languages.add("Python");
    const py = safeRead(join(root, "pyproject.toml"));
    if (has(root, "manage.py")) frameworks.add("Django");
    if (py.includes("fastapi")) frameworks.add("FastAPI");
    if (py.includes("flask")) frameworks.add("Flask");
    if (py.includes("ruff")) tooling.add("Ruff");
    if (py.includes("black")) tooling.add("Black");
    if (!verify) {
      verify = py.includes("pytest") || has(root, "pytest.ini")
        ? "pytest"
        : has(root, "manage.py")
          ? "python manage.py test"
          : "python -m pytest";
    }
  }

  // ---- Rust / Go ----
  if (has(root, "Cargo.toml")) {
    languages.add("Rust");
    if (!verify) verify = "cargo test";
  }
  if (has(root, "go.mod")) {
    languages.add("Go");
    if (!verify) verify = "go test ./...";
  }

  if (!verify) verify = "(set your test/verify command)";
  if (!description) description = readReadmeDescription(root);

  return {
    name,
    description: cleanOneLine(description),
    languages: [...languages],
    frameworks: [...frameworks],
    tooling: [...tooling],
    packageManager,
    topDirs: topLevelDirs(root),
    entryPoints: detectEntryPoints(root),
    verifyCommand: verify,
    isLaravel,
  };
}
