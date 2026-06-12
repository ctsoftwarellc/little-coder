import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_BUDGET = 12_000;

export function isLaravelRepo(cwd: string): boolean {
  return existsSync(join(cwd, "artisan")) && existsSync(join(cwd, "composer.json"));
}

function configuredBudget(): number {
  const raw = process.env.ARCOVA_CONTEXT_CHAR_BUDGET;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_BUDGET;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BUDGET;
}

export function buildArcovaContextBlock(cwd: string, budget: number = configuredBudget()): string {
  if (!isLaravelRepo(cwd)) return "";
  const mapPath = join(cwd, ".arcova", "MAP.md");
  const rulesPath = join(cwd, ".arcova", "RULES.md");
  if (!existsSync(mapPath) || !existsSync(rulesPath)) return "";

  const block = [
    "",
    "## Arcova Stable Context",
    "This block is deterministic and intentionally appears before variable tool and knowledge cards.",
    "",
    "### .arcova/MAP.md",
    readFileSync(mapPath, "utf-8").trim(),
    "",
    "### .arcova/RULES.md",
    readFileSync(rulesPath, "utf-8").trim(),
    "",
  ].join("\n");

  if (block.length <= budget) return block;
  const suffix = "\n[truncated]";
  return block.slice(0, Math.max(0, budget - suffix.length)) + suffix;
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    const block = buildArcovaContextBlock(ctx.cwd);
    if (!block) return;
    try {
      ctx.ui.notify("arcova-context: injected MAP.md + RULES.md", "info");
    } catch {
      // best-effort
    }
    return { systemPrompt: (event.systemPrompt ?? "") + block };
  });
}
