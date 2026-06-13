// Pure helpers for test-impact selection.
//
// On the Arcova eval the agent ran the ENTIRE Billing suite for a one-method
// change — slow feedback that burns a local model's limited turn budget. Given
// a changed source file and the repo's test files, this picks the test(s) most
// likely to cover it, so the agent can Verify a narrow target and iterate fast.
//
// Pure ranking only; the index layer supplies the changed file (from git diff)
// and the list of *Test.php files on disk.

export interface TestMatch {
  /** Repo-relative path to the test file, forward-slashed. */
  path: string;
  /** Higher is a more confident match. */
  score: number;
  reason: string;
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function baseName(p: string): string {
  const file = normalize(p).split("/").pop() ?? p;
  return file.replace(/\.php$/i, "");
}

/** Path segments minus the leading source/test root and the filename. */
function midSegments(p: string): string[] {
  const parts = normalize(p).split("/").filter(Boolean);
  parts.pop(); // filename
  // Drop a leading conventional root so app/Billing and tests/Feature/Billing align on "Billing".
  const roots = new Set(["app", "src", "tests", "test", "packages", "modules", "database", "lib"]);
  while (parts.length > 0 && roots.has(parts[0].toLowerCase())) parts.shift();
  // tests often nest under Feature/Unit — drop those too for alignment.
  const suites = new Set(["feature", "unit", "integration"]);
  while (parts.length > 0 && suites.has(parts[0].toLowerCase())) parts.shift();
  return parts;
}

function overlapCount(a: string[], b: string[]): number {
  const set = new Set(a.map((s) => s.toLowerCase()));
  return b.reduce((n, s) => (set.has(s.toLowerCase()) ? n + 1 : n), 0);
}

/**
 * Rank candidate test files by likelihood of covering `changedFile`.
 * Signals, strongest first:
 *   • exact `<Class>Test.php` name match
 *   • the changed class name appears in the test's name (e.g. InvoiceTest, InvoiceRefundTest)
 *   • shared mid-path segments (app/Billing ↔ tests/Feature/Billing)
 */
export function rankTests(changedFile: string, testFiles: string[]): TestMatch[] {
  const cls = baseName(changedFile);
  if (!cls) return [];
  const clsLower = cls.toLowerCase();
  const changedMid = midSegments(changedFile);

  const matches: TestMatch[] = [];
  for (const raw of testFiles) {
    const path = normalize(raw);
    if (!/test\.php$/i.test(path)) continue;
    const tBase = baseName(path);
    const tLower = tBase.toLowerCase();

    let score = 0;
    const reasons: string[] = [];

    if (tLower === `${clsLower}test`) {
      score += 100;
      reasons.push("exact name match");
    } else if (tLower.startsWith(clsLower) || tLower.includes(clsLower)) {
      score += 50;
      reasons.push("class name in test");
    }

    const overlap = overlapCount(changedMid, midSegments(path));
    if (overlap > 0) {
      score += overlap * 10;
      reasons.push(`${overlap} shared path segment${overlap > 1 ? "s" : ""}`);
    }

    if (score > 0) matches.push({ path, score, reason: reasons.join(", ") });
  }

  return matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

/** True for paths that are themselves tests — editing a test means just run it. */
export function isTestFile(path: string): boolean {
  return /test\.php$/i.test(normalize(path));
}

/**
 * Resolve relevant tests for a set of changed files. A changed *Test.php is its
 * own best target. Returns ranked unique test paths (cap applied by caller).
 */
export function relevantTestsForFiles(changedFiles: string[], testFiles: string[]): TestMatch[] {
  const byPath = new Map<string, TestMatch>();
  const add = (m: TestMatch) => {
    const prev = byPath.get(m.path);
    if (!prev || m.score > prev.score) byPath.set(m.path, m);
  };
  for (const file of changedFiles) {
    const norm = normalize(file);
    if (!/\.php$/i.test(norm)) continue;
    if (isTestFile(norm)) {
      add({ path: norm, score: 1000, reason: "changed test file" });
      continue;
    }
    for (const m of rankTests(norm, testFiles)) add(m);
  }
  return [...byPath.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}
