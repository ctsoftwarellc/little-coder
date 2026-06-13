import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  definitionOnLine,
  formatGroundingLine,
  groundingHints,
  parsePsr4,
  referencedClasses,
  type Psr4Map,
  type SymbolDef,
} from "./symbols.ts";

// ── Symbol grounding ─────────────────────────────────────────────────────────
// Two grounding aids against the small-model habit of inventing symbols:
//   • FindSymbol — on-demand "does this class/method/function exist, and where?"
//   • ambient check — after an Edit/Write, flag references to first-party App\
//     classes whose PSR-4 file is missing (with a did-you-mean), so a typo'd or
//     hallucinated class surfaces immediately instead of inside a fatal later.
//
// Ambient check disabled with LITTLE_CODER_SYMBOL_GROUNDING=0.

const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "dist", "build", ".next", "coverage", "storage", "bootstrap"]);
const SEARCH_ROOTS = ["app", "src", "packages", "modules", "database", "tests", "routes"];
const MAX_SCAN = 4000;

function ambientDisabled(): boolean {
  return process.env.LITTLE_CODER_SYMBOL_GROUNDING === "0";
}

function loadPsr4(cwd: string): Psr4Map {
  const composer = join(cwd, "composer.json");
  return existsSync(composer) ? parsePsr4(readFileSync(composer, "utf-8")) : parsePsr4("{}");
}

// ── FindSymbol: bounded definition search across first-party roots ────────────

interface SymbolHit extends SymbolDef {
  file: string;
}

function searchDefinitions(cwd: string, name: string, limit: number): { hits: SymbolHit[]; scanned: boolean } {
  const hits: SymbolHit[] = [];
  let scanned = 0;
  let truncated = false;

  const roots = SEARCH_ROOTS.map((r) => join(cwd, r)).filter(existsSync);
  // If none of the conventional roots exist, fall back to the repo root.
  const start = roots.length > 0 ? roots : [cwd];

  const walk = (dir: string) => {
    if (hits.length >= limit || scanned >= MAX_SCAN) {
      truncated = scanned >= MAX_SCAN;
      return;
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= limit || scanned >= MAX_SCAN) break;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(full);
      } else if (e.isFile() && e.name.endsWith(".php")) {
        scanned++;
        let text = "";
        try {
          text = readFileSync(full, "utf-8");
        } catch {
          continue;
        }
        if (!text.includes(name)) continue; // cheap pre-filter before line scan
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length && hits.length < limit; i++) {
          const kind = definitionOnLine(lines[i], name);
          if (kind) hits.push({ kind, name, line: i + 1, signature: lines[i].trim(), file: relative(cwd, full).replace(/\\/g, "/") });
        }
      }
    }
  };

  for (const root of start) walk(root);
  return { hits, scanned: truncated };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "FindSymbol",
    label: "Find Symbol",
    description:
      "Locate where a PHP class, interface, trait, enum, function, or method is DEFINED in this repo. " +
      "Use it to confirm a symbol exists and check its exact name/signature BEFORE referencing or calling it — " +
      "this avoids inventing methods or misremembering class names. Pass the bare symbol name (e.g. 'Invoice' or 'settle').",
    parameters: Type.Object({
      name: Type.String({ description: "Bare symbol name to find (class/method/function), no namespace or parentheses" }),
      limit: Type.Optional(Type.Number({ description: "Max definitions to return (default 20)" })),
    }),
    async execute(_id, { name, limit }) {
      const cwd = process.cwd();
      const cap = Math.max(1, Math.min(Number(limit ?? 20) || 20, 100));
      const clean = String(name).trim().replace(/\(\)$/, "").split(/::|->|\\/).pop() ?? String(name).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean)) {
        return { content: [{ type: "text", text: `Not a bare symbol name: '${name}'. Pass just the class/method name.` }], details: { found: 0 }, isError: true };
      }
      const { hits, scanned } = searchDefinitions(cwd, clean, cap);
      if (hits.length === 0) {
        return {
          content: [{ type: "text", text: `No definition of '${clean}' found in app/src/tests. It may not exist (check spelling), live in vendor, or be defined dynamically.` }],
          details: { found: 0 },
        };
      }
      const body = hits.map((h) => `${h.file}:${h.line}  [${h.kind}] ${h.signature}`).join("\n");
      const note = scanned ? "\n\n[search bounded; narrow the repo if a definition seems missing]" : "";
      return { content: [{ type: "text", text: `${hits.length} definition(s) of '${clean}':\n${body}${note}` }], details: { found: hits.length } };
    },
  });

  // ── ambient PSR-4 first-party class existence check ─────────────────────────
  pi.on("tool_result", async (event, ctx) => {
    if (ambientDisabled()) return;
    const toolName = String((event as any).toolName ?? "").toLowerCase();
    if (toolName !== "edit" && toolName !== "write") return;
    if ((event as any).isError === true) return;
    const input = ((event as any).input ?? {}) as Record<string, unknown>;
    const rawPath = (input.path ?? input.file_path) as string | undefined;
    if (typeof rawPath !== "string" || !/\.php$/i.test(rawPath)) return;

    const cwd = (ctx as any)?.cwd ?? process.cwd();
    const absPath = isAbsolute(rawPath) ? rawPath : join(cwd, rawPath);
    let text = "";
    try {
      text = readFileSync(absPath, "utf-8");
    } catch {
      return; // can't read what we just edited — stay silent
    }

    const psr4 = loadPsr4(cwd);
    const refs = referencedClasses(text, psr4);
    if (refs.length === 0) return;

    const fileExists = (rel: string) => existsSync(resolve(cwd, rel));
    const siblingClasses = (dirRel: string) => {
      try {
        return readdirSync(resolve(cwd, dirRel))
          .filter((f) => f.endsWith(".php"))
          .map((f) => f.slice(0, -4));
      } catch {
        return [];
      }
    };

    const hints = groundingHints(refs, fileExists, siblingClasses, psr4);
    if (hints.length === 0) return;

    const line = formatGroundingLine(hints);
    try {
      ctx.ui.notify(line, "warning");
    } catch {
      // best-effort
    }
    const existing = (event as any).content ?? [];
    return {
      content: [...existing, { type: "text" as const, text: `${line} — confirm with FindSymbol, fix the reference, or create the class.` }],
    };
  });
}
