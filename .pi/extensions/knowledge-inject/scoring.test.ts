import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSkillFile } from "../skill-inject/frontmatter.ts";

// Duplicate scoring so tests can exercise it as a pure function.
function scoreEntry(userText: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const textLower = userText.toLowerCase();
  const words = new Set(textLower.split(/\s+/).filter(Boolean));
  let score = 0;
  for (const kw of keywords) {
    if (kw.includes(" ")) {
      if (textLower.includes(kw)) score += 2.0;
    } else {
      if (words.has(kw)) score += 1.0;
    }
  }
  return score;
}

describe("knowledge entry scoring", () => {
  it("scores single word matches at 1.0 each", () => {
    expect(scoreEntry("find the bucket", ["bucket"])).toBe(1.0);
    expect(scoreEntry("find the bucket and pour", ["bucket", "pour"])).toBe(2.0);
  });

  it("scores bigram/phrase matches at 2.0 each", () => {
    expect(scoreEntry("minimum moves to solve", ["minimum moves"])).toBe(2.0);
    expect(scoreEntry("state space search", ["state space"])).toBe(2.0);
  });

  it("combines word + bigram scores", () => {
    const kw = ["bucket", "minimum moves", "pour"];
    // "bucket" word (1.0) + "minimum moves" phrase (2.0) + "pour" word (1.0) = 4.0
    expect(scoreEntry("bucket pouring problem with minimum moves and pour", kw)).toBe(4.0);
  });

  it("does not match partial words", () => {
    // 'bucket' shouldn't match 'buckets' because the scorer tokenizes on whitespace
    expect(scoreEntry("many buckets here", ["bucket"])).toBe(0);
  });

  it("threshold at 2.0 requires at least two signals", () => {
    // The extension's MIN_SCORE_THRESHOLD = 2.0 means one word isn't enough
    expect(scoreEntry("find bucket", ["bucket", "pour"])).toBeLessThan(2.0);
    expect(scoreEntry("bucket pour together", ["bucket", "pour"])).toBeGreaterThanOrEqual(2.0);
  });
});

describe("knowledge directory loads from repo", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const kDir = join(here, "..", "..", "..", "skills", "knowledge");
  const pDir = join(here, "..", "..", "..", "skills", "protocols");

  it("knowledge dir has 19 files", () => {
    expect(existsSync(kDir)).toBe(true);
    expect(readdirSync(kDir).filter((f) => f.endsWith(".md")).length).toBe(19);
  });

  it("protocols dir has 4 files", () => {
    expect(existsSync(pDir)).toBe(true);
    expect(readdirSync(pDir).filter((f) => f.endsWith(".md")).length).toBe(4);
  });

  it("every knowledge entry has topic + keywords in frontmatter", () => {
    const files = readdirSync(kDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const parsed = parseSkillFile(readFileSync(join(kDir, file), "utf-8"));
      expect(parsed, `${file} should parse`).not.toBeNull();
      expect(typeof parsed!.frontmatter.topic).toBe("string");
      expect(Array.isArray(parsed!.frontmatter.keywords), `${file} keywords`).toBe(true);
    }
  });

  it("workspace_docs declares requires_tools", () => {
    const parsed = parseSkillFile(readFileSync(join(kDir, "workspace_docs.md"), "utf-8"));
    expect(parsed!.frontmatter.requires_tools).toEqual(["Read", "Glob"]);
  });

  it("arcova windows php tests card requires bash and verify", () => {
    const parsed = parseSkillFile(readFileSync(join(kDir, "arcova_windows_php_tests.md"), "utf-8"));
    expect(parsed!.frontmatter.topic).toBe("arcova_windows_php_tests");
    expect(parsed!.frontmatter.keywords).toContain("artisan test");
    expect(parsed!.frontmatter.requires_tools).toEqual(["Bash", "Verify"]);
  });

  it("arcova task loop protocol is keyword-triggered and requires verify", () => {
    const parsed = parseSkillFile(readFileSync(join(pDir, "arcova_task_loop.md"), "utf-8"));
    expect(parsed!.frontmatter.topic).toBe("arcova_task_loop");
    expect(parsed!.frontmatter.keywords).toContain("arcova task loop");
    expect(parsed!.frontmatter.keywords).toContain("test.md");
    expect(parsed!.frontmatter.requires_tools).toEqual(["Read", "Grep", "Verify"]);
  });
});
