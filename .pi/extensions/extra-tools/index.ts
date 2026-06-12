import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { globFiles, renderGlobOutcome } from "./glob.ts";

// Ports of tools.py::_glob, _webfetch, _websearch. Pi ships its own grep/find,
// so those are not re-registered here.
export default function (pi: ExtensionAPI) {
  // ── search ─────────────────────────────────────────────────────────────
  // Compatibility alias for Claude-style agents that emit:
  //   search { path, query, maxResults }
  // Pi's native content-search tool is `grep`, but small/local models often
  // remember the generic `search` name from other harnesses. Registering this
  // narrow alias turns that drift into a useful ripgrep call instead of
  // "Tool search not found".
  pi.registerTool({
    name: "search",
    label: "Search",
    description:
      "Search file contents for a literal string. Compatibility alias for grep. " +
      "Use `query` for the text to find and optional `path` to limit the search.",
    parameters: Type.Object({
      query: Type.String({ description: "Literal text to search for" }),
      path: Type.Optional(Type.String({ description: "Directory or file to search (default: cwd)" })),
      maxResults: Type.Optional(Type.Number({ description: "Maximum matches to return (default: 50)" })),
    }),
    async execute(_id, { query, path, maxResults }) {
      try {
        const limit = Math.max(1, Math.min(Number(maxResults ?? 50) || 50, 500));
        const root = resolve(path || process.cwd());
        const skipDirs = new Set([".git", "node_modules", "vendor", "dist", "build", ".next", ".nuxt", "coverage", "storage"]);
        const results: string[] = [];
        let scanned = 0;
        const maxScanned = 5000;

        const searchFile = async (file: string) => {
          if (results.length >= limit) return;
          let text = "";
          try {
            text = await readFile(file, "utf-8");
          } catch {
            return;
          }
          const rel = relative(root, file).replace(/\\/g, "/") || file;
          const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
          for (let i = 0; i < lines.length && results.length < limit; i++) {
            const line = lines[i];
            if (!line.includes(query)) continue;
            const trimmed = line.length > 300 ? `${line.slice(0, 300)}...` : line;
            results.push(`${rel}:${i + 1}: ${trimmed}`);
          }
        };

        const walk = async (entry: string) => {
          if (results.length >= limit || scanned >= maxScanned) return;
          let s;
          try {
            s = await stat(entry);
          } catch {
            return;
          }
          scanned++;
          if (s.isFile()) {
            await searchFile(entry);
            return;
          }
          if (!s.isDirectory()) return;
          let children;
          try {
            children = await readdir(entry, { withFileTypes: true });
          } catch {
            return;
          }
          for (const child of children) {
            if (results.length >= limit || scanned >= maxScanned) break;
            if (child.isDirectory() && skipDirs.has(child.name)) continue;
            await walk(resolve(entry, child.name));
          }
        };

        await walk(root);
        let text = results.length > 0 ? results.join("\n") : "No matches found";
        if (scanned >= maxScanned) text += `\n\n[Search stopped after scanning ${maxScanned} filesystem entries; narrow path for more complete results]`;
        return { content: [{ type: "text", text }], details: { resultCount: results.length, scanned } };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ── glob ────────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "glob",
    label: "Glob",
    description:
      "Find files matching a glob pattern. Returns a sorted list of matching paths (up to 500). " +
      "Common dependency/build/cache dirs (node_modules, .git, dist, …) are skipped, and the walk " +
      "is bounded — for a focused search, pass a `path` rather than globbing a whole home directory.",
    parameters: Type.Object({
      pattern: Type.String({ description: "Glob pattern e.g. **/*.py" }),
      path: Type.Optional(Type.String({ description: "Base directory (default: cwd)" })),
    }),
    async execute(_id, { pattern, path }) {
      try {
        const base = path || process.cwd();
        // Bounded walk: prunes heavy dirs and caps total entries scanned so a
        // recursive glob from a huge root can't exhaust the process heap.
        const outcome = await globFiles(pattern, { base });
        return {
          content: [{ type: "text", text: renderGlobOutcome(outcome) }],
          details: {},
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ── webfetch ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "webfetch",
    label: "WebFetch",
    description: "Fetch a URL and return its text content (HTML stripped). Capped at 25K chars.",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      prompt: Type.Optional(Type.String({ description: "Hint for what to extract (informational)" })),
    }),
    async execute(_id, { url }) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const res = await fetch(url, {
          headers: { "User-Agent": "little-coder/0.1" },
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          return {
            content: [{ type: "text", text: `Error: HTTP ${res.status} ${res.statusText}` }],
            details: {},
            isError: true,
          };
        }
        const ct = res.headers.get("content-type") || "";
        let text = await res.text();
        if (ct.includes("html")) {
          text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
          text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
          text = text.replace(/<[^>]+>/g, " ");
          text = text.replace(/\s+/g, " ").trim();
        }
        if (text.length > 25_000) text = text.slice(0, 25_000);
        return { content: [{ type: "text", text }], details: {} };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ── websearch ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "websearch",
    label: "WebSearch",
    description: "Search the web via DuckDuckGo and return the top ~8 results as Markdown.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
    }),
    async execute(_id, { query }) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timer);
        const body = await res.text();
        const titleRe = /class="result__title"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/div>/g;
        const titles: Array<{ link: string; title: string }> = [];
        let m: RegExpExecArray | null;
        while ((m = titleRe.exec(body)) && titles.length < 8) {
          titles.push({ link: m[1], title: m[2].replace(/<[^>]+>/g, "").trim() });
        }
        const snippets: string[] = [];
        while ((m = snippetRe.exec(body)) && snippets.length < 8) {
          snippets.push(m[1].replace(/<[^>]+>/g, "").trim());
        }
        if (titles.length === 0) {
          return {
            content: [{ type: "text", text: "No results found" }],
            details: {},
          };
        }
        const out = titles
          .map((t, i) => `**${t.title}**\n${t.link}\n${snippets[i] ?? ""}`)
          .join("\n\n");
        return { content: [{ type: "text", text: out }], details: {} };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          details: {},
          isError: true,
        };
      }
    },
  });
}
