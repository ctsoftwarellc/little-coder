import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { relevantTestsForFiles, type TestMatch } from "./impact.ts";

// ── Test-impact selection ────────────────────────────────────────────────────
// RelevantTests maps a changed file (or the current git diff) to the test files
// most likely to cover it, and hands back ready-to-run Verify targets. This
// lets a small model verify a narrow, fast target instead of the whole suite —
// more iterations per turn budget, which matters far more locally than on a
// frontier model. Discovery only: it never runs anything itself.

const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "dist", "build", "coverage", "storage"]);
const TEST_ROOTS = ["tests", "test"];
const MAX_TEST_FILES = 5000;

function collectTestFiles(cwd: string): string[] {
  const out: string[] = [];
  let scanned = 0;
  const roots = TEST_ROOTS.map((r) => join(cwd, r)).filter(existsSync);
  const walk = (dir: string) => {
    if (scanned >= MAX_TEST_FILES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (scanned >= MAX_TEST_FILES) break;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(full);
      } else if (e.isFile() && /test\.php$/i.test(e.name)) {
        scanned++;
        out.push(relative(cwd, full).replace(/\\/g, "/"));
      }
    }
  };
  for (const root of roots) walk(root);
  return out;
}

async function changedPhpFiles(pi: ExtensionAPI, cwd: string): Promise<string[]> {
  const run = (args: string[]) =>
    pi.exec("git", args, { cwd, timeout: 5000 }).catch(() => ({ code: 1, stdout: "", stderr: "" }) as any);
  // Unstaged + staged + untracked, deduped.
  const outs = await Promise.all([
    run(["diff", "--name-only"]),
    run(["diff", "--name-only", "--cached"]),
    run(["ls-files", "--others", "--exclude-standard"]),
  ]);
  const files = new Set<string>();
  for (const o of outs) {
    for (const l of String((o as any).stdout ?? "").split(/\r?\n/)) {
      const p = l.trim();
      if (p && /\.php$/i.test(p)) files.add(p.replace(/\\/g, "/"));
    }
  }
  return [...files];
}

function renderMatches(matches: TestMatch[], cap: number): string {
  const shown = matches.slice(0, cap);
  const lines = shown.map((m) => `  ${m.path}  (${m.reason})`);
  const targets = shown.map((m) => m.path);
  const verifyHint =
    targets.length === 1
      ? `Run it: Verify with target="${targets[0]}".`
      : `Run the top one with Verify target="${targets[0]}", or widen as needed.`;
  return [`Relevant test file(s), most likely first:`, ...lines, "", verifyHint].join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "RelevantTests",
    label: "Relevant Tests",
    description:
      "Given a changed source file (or, with no argument, the current git diff), find the test file(s) most likely " +
      "to cover it, so you can Verify a narrow, fast target instead of the whole suite. Returns ranked paths plus a " +
      "ready-to-run Verify target. Does not run anything.",
    parameters: Type.Object({
      file: Type.Optional(
        Type.String({ description: "Repo-relative source file to find tests for. Omit to use the current git diff." }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max test files to return (default 5)" })),
    }),
    async execute(_id, { file, limit }) {
      const cwd = process.cwd();
      const cap = Math.max(1, Math.min(Number(limit ?? 5) || 5, 25));
      const testFiles = collectTestFiles(cwd);
      if (testFiles.length === 0) {
        return { content: [{ type: "text", text: "No *Test.php files found under tests/. Is this a PHP test suite?" }], details: { matched: 0 } };
      }

      let changed: string[];
      if (typeof file === "string" && file.trim()) {
        const norm = (isAbsolute(file) ? relative(cwd, file) : file).replace(/\\/g, "/");
        changed = [norm];
      } else {
        changed = await changedPhpFiles(pi, cwd);
        if (changed.length === 0) {
          return { content: [{ type: "text", text: "No changed .php files in the git diff. Pass a `file` to target one explicitly." }], details: { matched: 0 } };
        }
      }

      const matches = relevantTestsForFiles(changed, testFiles);
      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: `No test file clearly maps to: ${changed.join(", ")}. Search tests/ by the class name, or the change may be untested.` }],
          details: { matched: 0 },
        };
      }
      return { content: [{ type: "text", text: renderMatches(matches, cap) }], details: { matched: matches.length } };
    },
  });
}
