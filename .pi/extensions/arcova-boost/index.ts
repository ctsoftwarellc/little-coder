import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderRouteFileSummary, trimText } from "./trim.ts";

const DEFAULT_MAX = 12_000;

function isLaravelRepo(cwd: string): boolean {
  return existsSync(join(cwd, "artisan")) && existsSync(join(cwd, "composer.json"));
}

function walkMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(path));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(path);
  }
  return out;
}

function migrationInventory(cwd: string, maxChars: number): string {
  const dir = join(cwd, "database", "migrations");
  if (!existsSync(dir)) return "(no database/migrations directory)";
  const files = readdirSync(dir).filter((file) => file.endsWith(".php")).sort();
  return trimText(files.map((file) => `- database/migrations/${file}`).join("\n"), maxChars);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ArcovaListRoutes",
    label: "ArcovaListRoutes",
    description: "List Laravel route files and route-like lines with output trimming. Read-only and does not run artisan.",
    parameters: Type.Object({
      maxChars: Type.Optional(Type.Number()),
    }),
    async execute(_id, { maxChars }) {
      if (!isLaravelRepo(process.cwd())) {
        return { content: [{ type: "text", text: "Not a Laravel repo." }], details: {}, isError: true };
      }
      return { content: [{ type: "text", text: renderRouteFileSummary(process.cwd(), maxChars ?? DEFAULT_MAX) }], details: {} };
    },
  });

  pi.registerTool({
    name: "ArcovaDatabaseSchema",
    label: "ArcovaDatabaseSchema",
    description: "Return a compact migration inventory as a schema entrypoint. Read-only.",
    parameters: Type.Object({
      maxChars: Type.Optional(Type.Number()),
    }),
    async execute(_id, { maxChars }) {
      return { content: [{ type: "text", text: migrationInventory(process.cwd(), maxChars ?? DEFAULT_MAX) }], details: {} };
    },
  });

  pi.registerTool({
    name: "ArcovaSearchDocs",
    label: "ArcovaSearchDocs",
    description: "Search .arcova and .planning/codebase markdown with trimmed output. Read-only.",
    parameters: Type.Object({
      query: Type.String(),
      maxChars: Type.Optional(Type.Number()),
    }),
    async execute(_id, { query, maxChars }) {
      const q = query.toLowerCase();
      const files = [
        ...walkMarkdown(join(process.cwd(), ".arcova")),
        ...walkMarkdown(join(process.cwd(), ".planning", "codebase")),
      ];
      const hits: string[] = [];
      for (const file of files) {
        const lines = readFileSync(file, "utf-8").split(/\r?\n/);
        lines.forEach((line, i) => {
          if (line.toLowerCase().includes(q)) hits.push(`${file}:${i + 1}: ${line}`);
        });
      }
      return { content: [{ type: "text", text: trimText(hits.length ? hits.join("\n") : "(no matches)", maxChars ?? DEFAULT_MAX) }], details: {} };
    },
  });
}
