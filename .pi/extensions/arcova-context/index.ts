import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_BUDGET = 12_000;

export function isLaravelRepo(cwd: string): boolean {
  return existsSync(join(cwd, "artisan")) && existsSync(join(cwd, "composer.json"));
}

// The stable-context files, in injection order: the human-authored PROJECT.md
// (from /init) frames the auto-generated structure (MAP.md) and guardrails
// (RULES.md, both from arcova-map) that follow. Any subset may be present — the
// block injects whatever exists, so /init alone teaches a non-Laravel repo.
const CONTEXT_FILES: ReadonlyArray<{ rel: string; label: string }> = [
  { rel: "PROJECT.md", label: "### .arcova/PROJECT.md" },
  { rel: "MAP.md", label: "### .arcova/MAP.md" },
  { rel: "RULES.md", label: "### .arcova/RULES.md" },
];

function configuredBudget(): number {
  const raw = process.env.ARCOVA_CONTEXT_CHAR_BUDGET;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_BUDGET;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BUDGET;
}

/** Names of the .arcova context files that currently exist (in injection order). */
export function presentContextFiles(cwd: string): string[] {
  const dir = join(cwd, ".arcova");
  return CONTEXT_FILES.filter((f) => existsSync(join(dir, f.rel))).map((f) => f.rel);
}

export function buildArcovaContextBlock(cwd: string, budget: number = configuredBudget()): string {
  const dir = join(cwd, ".arcova");
  const present = CONTEXT_FILES.filter((f) => existsSync(join(dir, f.rel)));
  if (present.length === 0) return "";

  const parts: string[] = [
    "",
    "## Arcova Stable Context",
    "This block is deterministic and intentionally appears before variable tool and knowledge cards.",
    "",
  ];
  for (const f of present) {
    parts.push(f.label, readFileSync(join(dir, f.rel), "utf-8").trim(), "");
  }

  const block = parts.join("\n");
  if (block.length <= budget) return block;
  const suffix = "\n[truncated]";
  return block.slice(0, Math.max(0, budget - suffix.length)) + suffix;
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const block = buildArcovaContextBlock(ctx.cwd);
    if (!block) return;
    try {
      ctx.ui.notify(`arcova-context: injected ${presentContextFiles(ctx.cwd).join(" + ")}`, "info");
    } catch {
      // best-effort
    }
    return { systemPrompt: (event.systemPrompt ?? "") + block };
  });
}
