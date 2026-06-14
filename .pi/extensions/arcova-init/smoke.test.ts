import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import init from "./index.ts";

// Drives the registered /init handler end-to-end against a temp repo with a fake
// UI that accepts every prefilled default, and asserts PROJECT.md is written.

function loadHandler(): (args: string, ctx: any) => Promise<void> {
  let handler: any;
  const pi: any = {
    registerCommand: (_name: string, opts: any) => {
      handler = opts.handler;
    },
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
  };
  init(pi);
  return handler;
}

function nodeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "arcova-init-smoke-"));
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ name: "smoke-app", scripts: { test: "vitest run" }, devDependencies: { typescript: "^5" } }),
  );
  return cwd;
}

const acceptAllUI = () => ({
  confirm: async () => true,
  input: async (_title: string, def: string) => def,
  editor: async (_title: string, prefill: string) => prefill,
  notify: () => {},
});

describe("/init wizard", () => {
  it("writes .arcova/PROJECT.md from the interview answers", async () => {
    const handler = loadHandler();
    const cwd = nodeRepo();
    await handler("", { hasUI: true, cwd, ui: acceptAllUI() });

    const path = join(cwd, ".arcova", "PROJECT.md");
    expect(existsSync(path)).toBe(true);
    const doc = readFileSync(path, "utf-8");
    expect(doc).toContain("# Project Context — smoke-app");
    expect(doc).toContain("## How to verify");
    expect(doc).toContain("npm test");
    expect(doc).toContain("## Stack");
  });

  it("quick mode writes straight from the scan with no questions asked", async () => {
    const handler = loadHandler();
    const cwd = nodeRepo();
    let confirms = 0;
    const ui = { ...acceptAllUI(), confirm: async () => (confirms++, true) };
    await handler("quick", { hasUI: true, cwd, ui });

    expect(existsSync(join(cwd, ".arcova", "PROJECT.md"))).toBe(true);
    expect(confirms).toBe(0); // no run/write/overwrite prompts in quick mode
  });

  it("does nothing without an interactive UI", async () => {
    const handler = loadHandler();
    const cwd = nodeRepo();
    let notified = "";
    await handler("", { hasUI: false, cwd, ui: { notify: (m: string) => (notified = m) } });

    expect(existsSync(join(cwd, ".arcova", "PROJECT.md"))).toBe(false);
    expect(notified).toMatch(/interactive/i);
  });
});
