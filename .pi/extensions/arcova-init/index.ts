import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanRepo, type RepoScan } from "./scan.ts";
import { buildProjectDoc, type ProjectInput } from "./doc.ts";

// ── /init — teach the agent about THIS repo ──────────────────────────────────
// Scans the repo to pre-fill an interview, then writes .arcova/PROJECT.md, which
// the arcova-context extension injects into the stable (KV-cached) prompt prefix
// on the next message. NOTE: writing CLAUDE.md / AGENTS.md would be useless here
// — the launcher runs pi with --no-context-files (bin/little-coder.mjs), so the
// user's instruction files are deliberately ignored and the bundled persona
// wins. .arcova/PROJECT.md is the one sink that actually reaches the model.
//
// `/init`        full interview (auto-scan → confirm/edit each field → write)
// `/init quick`  skip the questions; write straight from the scan + smart seeds

const PROJECT_REL = join(".arcova", "PROJECT.md");

function notify(ctx: any, message: string, type: "info" | "warning" | "error" = "info"): void {
  try {
    ctx.ui.notify(message, type);
  } catch {
    // best-effort
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "scripts", "arcova-map.mjs");
}

function firstLine(value: string | undefined): string {
  return (value ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
}

function orDefault(value: string | undefined, fallback: string): string {
  const t = (value ?? "").trim();
  return t || fallback;
}

function structureLines(scan: RepoScan): string[] {
  const out: string[] = [];
  if (scan.topDirs.length) out.push(`Top-level: ${scan.topDirs.join(", ")}`);
  if (scan.entryPoints.length) out.push(`Entry points: ${scan.entryPoints.join(", ")}`);
  return out;
}

function stackSeed(scan: RepoScan): string {
  return [...scan.frameworks, ...scan.languages, ...scan.tooling].join("\n");
}

function guidelinesSeed(scan: RepoScan): string {
  const lines = ["Match the surrounding code; make the smallest correct change."];
  const fmt = scan.tooling.filter((t) => ["ESLint", "Prettier", "Pint", "Ruff", "Black"].includes(t));
  if (fmt.length) lines.push(`Follow the existing ${fmt.join(" + ")} config — don't reformat unrelated code.`);
  if (scan.verifyCommand && !scan.verifyCommand.startsWith("(")) {
    lines.push(`Run \`${scan.verifyCommand}\` before calling the work done.`);
  }
  return lines.join("\n");
}

function dangerSeed(scan: RepoScan): string {
  const lines = [".env files, secrets, credentials, API keys"];
  if (scan.isLaravel) lines.push("Existing migrations, and auth / session / tenancy code");
  lines.push("Generated, vendored, or build-output files");
  return lines.join("\n");
}

function scanSummary(scan: RepoScan): string {
  const stack = scan.frameworks.length ? scan.frameworks.join("/") : scan.languages.join("/") || "unknown stack";
  const dirs = scan.topDirs.length ? scan.topDirs.slice(0, 6).join(", ") : "—";
  return [
    `Detected:  ${scan.name} · ${stack}`,
    `Verify:    ${scan.verifyCommand}`,
    `Top dirs:  ${dirs}`,
  ].join("\n");
}

function previewDoc(doc: string): string {
  const lines = doc.split(/\r?\n/);
  const head = lines.slice(0, 16).join("\n");
  return lines.length > 16 ? `${head}\n… (+${lines.length - 16} more lines)` : head;
}

function quickInput(scan: RepoScan): ProjectInput {
  return {
    name: scan.name,
    description: scan.description,
    stack: stackSeed(scan),
    structure: structureLines(scan),
    verifyCommand: scan.verifyCommand,
    guidelines: guidelinesSeed(scan),
    conventions: "",
    dangerZones: dangerSeed(scan),
    generatedAt: isoDate(),
  };
}

async function interview(ctx: any, scan: RepoScan): Promise<ProjectInput | null> {
  const start = await ctx.ui.confirm(
    "Run /init?",
    `${scanSummary(scan)}\n\nI'll ask a few questions (each pre-filled — edit or accept) and write ${PROJECT_REL}.`,
  );
  if (!start) return null;

  const name = orDefault(await ctx.ui.input("Project name", scan.name), scan.name);
  const description = orDefault(firstLine(await ctx.ui.editor("One-line description of the project", scan.description)), scan.description);
  const stack = orDefault(await ctx.ui.editor("Stack & frameworks (one per line)", stackSeed(scan)), stackSeed(scan));
  const verifyCommand = orDefault(await ctx.ui.input("Verify command (how to run tests/checks)", scan.verifyCommand), scan.verifyCommand);
  const guidelines = orDefault(await ctx.ui.editor("Coding guidelines — how you want code written", guidelinesSeed(scan)), "");
  const conventions = orDefault(await ctx.ui.editor("Conventions — naming, structure, patterns to follow", ""), "");
  const dangerZones = orDefault(await ctx.ui.editor("Danger zones — areas to never touch without asking", dangerSeed(scan)), "");

  return {
    name,
    description,
    stack,
    structure: structureLines(scan),
    verifyCommand,
    guidelines,
    conventions,
    dangerZones,
    generatedAt: isoDate(),
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("init", {
    description: "Scan the repo + interview you, then write .arcova/PROJECT.md (injected as stable context). `/init quick` to skip questions.",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        notify(ctx, "/init needs interactive mode (it asks questions). Run it in the TUI.", "warning");
        return;
      }

      const cwd = ctx.cwd;
      const projectPath = join(cwd, PROJECT_REL);
      const quick = String(args ?? "").trim().toLowerCase() === "quick";

      notify(ctx, "Scanning the repository…");
      let scan: RepoScan;
      try {
        scan = scanRepo(cwd);
      } catch (e) {
        notify(ctx, `/init: scan failed — ${errText(e)}`, "error");
        return;
      }

      if (existsSync(projectPath)) {
        const overwrite = await ctx.ui.confirm("Overwrite project context?", `${PROJECT_REL} already exists. Replace it?`);
        if (!overwrite) {
          notify(ctx, "/init cancelled — existing PROJECT.md kept.");
          return;
        }
      }

      const input = quick ? quickInput(scan) : await interview(ctx, scan);
      if (!input) {
        notify(ctx, "/init cancelled.");
        return;
      }

      const doc = buildProjectDoc(input);

      if (!quick) {
        const write = await ctx.ui.confirm("Write .arcova/PROJECT.md?", previewDoc(doc));
        if (!write) {
          notify(ctx, "/init cancelled — nothing written.");
          return;
        }
      }

      try {
        mkdirSync(join(cwd, ".arcova"), { recursive: true });
        writeFileSync(projectPath, doc);
      } catch (e) {
        notify(ctx, `/init: write failed — ${errText(e)}`, "error");
        return;
      }

      notify(ctx, `Wrote ${PROJECT_REL} (${doc.length} chars). It'll be injected as stable context on your next message.`);

      // Laravel bonus: offer the richer auto-generated codebase map + guardrails.
      if (scan.isLaravel && !existsSync(join(cwd, ".arcova", "MAP.md"))) {
        const gen = await ctx.ui.confirm(
          "Generate the Laravel codebase map too?",
          "Runs arcova-map to write .arcova/MAP.md + RULES.md (structure map + edit guardrails).",
        );
        if (gen) {
          notify(ctx, "Generating codebase map…");
          const res = await pi
            .exec("node", [mapScriptPath(), cwd], { cwd, timeout: 30000 })
            .catch((e: unknown) => ({ code: 1, stdout: "", stderr: errText(e) }) as any);
          notify(
            ctx,
            res.code === 0
              ? "Codebase map written: .arcova/MAP.md + RULES.md."
              : `map generation failed: ${String(res.stderr ?? "").slice(0, 200)}`,
            res.code === 0 ? "info" : "warning",
          );
        }
      }
    },
  });
}
