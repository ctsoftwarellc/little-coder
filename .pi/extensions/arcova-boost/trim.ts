import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function trimText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[trimmed to ${maxChars} chars]`;
}

export function listRouteFiles(cwd: string): string[] {
  const dir = join(cwd, "routes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".php"))
    .map((file) => `routes/${file}`)
    .sort();
}

export function renderRouteFileSummary(cwd: string, maxChars: number): string {
  const files = listRouteFiles(cwd);
  if (files.length === 0) return "(no routes/*.php files found)";
  const blocks = files.map((file) => {
    const lines = readFileSync(join(cwd, file), "utf-8")
      .split(/\r?\n/)
      .map((line, index) => ({ index: index + 1, text: line.trim() }))
      .filter(({ text }) => /\bRoute::|->name\(|->middleware\(|Inertia::render|Route::middleware/.test(text))
      .slice(0, 80)
      .map(({ index, text }) => `${file}:${index}: ${text}`);
    return lines.length ? lines.join("\n") : `${file}: (no obvious Route:: lines found)`;
  });
  return trimText(blocks.join("\n"), maxChars);
}
