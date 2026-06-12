// Deterministic narration helpers (Tier 0) for the narrator extension.
//
// Most of "what is the agent doing right now" can be described for free from
// the tool call itself — no inference needed. These pure functions turn a tool
// call / result into a short human line and decide when a result is opaque
// enough to be worth a Tier-2 LLM summary. Kept in _shared (no index.ts) so it's
// a library, trivially unit-testable.

export function basenameOf(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, "");
  const seg = cleaned.split(/[\\/]/).pop();
  return seg && seg.length > 0 ? seg : p;
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + "…" : oneLine;
}

/** A short, present-tense phrase describing a tool call (Tier 0 narration). */
export function describeToolCall(toolName: string, input: Record<string, unknown> | undefined): string {
  const i = input ?? {};
  const path = typeof i.path === "string" ? i.path : typeof i.file_path === "string" ? i.file_path : undefined;
  const t = toolName.toLowerCase();

  switch (t) {
    case "read":
      return path ? `📖 Reading ${basenameOf(path)}` : "📖 Reading a file";
    case "edit": {
      const n = Array.isArray((i as any).edits) ? (i as any).edits.length : 0;
      const where = path ? ` ${basenameOf(path)}` : "";
      return n > 0 ? `✏️ Editing${where} (${n} change${n === 1 ? "" : "s"})` : `✏️ Editing${where}`;
    }
    case "write":
      return path ? `📝 Writing ${basenameOf(path)}` : "📝 Writing a file";
    case "bash":
      return typeof i.command === "string" ? `⚙️ Running: ${truncate(i.command, 48)}` : "⚙️ Running a command";
    case "grep":
      return typeof i.pattern === "string" ? `🔎 Searching for "${truncate(i.pattern, 32)}"` : "🔎 Searching";
    case "glob":
      return typeof i.pattern === "string" ? `🗂️ Finding files: ${truncate(i.pattern, 32)}` : "🗂️ Finding files";
    case "find":
      return "🗂️ Finding files";
    case "ls":
      return "🗂️ Listing files";
    case "verify": {
      const filter = typeof i.filter === "string" ? i.filter : undefined;
      const target = typeof i.target === "string" ? basenameOf(i.target) : undefined;
      const scope = filter ? ` (${truncate(filter, 24)})` : target ? ` (${target})` : "";
      return `🧪 Verifying${scope}`;
    }
    case "webfetch":
      return typeof i.url === "string" ? `🌐 Fetching ${truncate(String(i.url), 40)}` : "🌐 Fetching a page";
    case "websearch":
      return typeof i.query === "string" ? `🌐 Searching the web: ${truncate(String(i.query), 32)}` : "🌐 Searching the web";
  }

  // Custom Arcova / browser / evidence tools and anything else.
  if (toolName.startsWith("Browser")) return `🧭 ${toolName.replace(/^Browser/, "Browser ")}`;
  if (toolName.startsWith("Evidence")) return `📌 ${toolName}`;
  if (toolName === "ArcovaListRoutes") return "🛣️ Listing routes";
  if (toolName === "ArcovaDatabaseSchema") return "🗄️ Reading DB schema";
  if (toolName === "ArcovaSearchDocs") return "📚 Searching docs";
  if (toolName === "Plan") return "🗒️ Updating the plan";
  return `🔧 ${toolName}`;
}

/** Last `n` non-empty lines of streamed output, for a live log tail. */
export function tailLines(text: string, n: number): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  return nonEmpty.slice(-n);
}

/** Worth a Tier-2 summary? Big or multi-line output that a one-liner can't capture. */
export function shouldSummarize(text: string, maxLines = 12, maxChars = 800): boolean {
  if (!text) return false;
  if (text.length > maxChars) return true;
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).length > maxLines;
}

/** Deterministic one-line verdict used when no Tier-2 summary is produced. */
export function fallbackVerdict(toolName: string, isError: boolean, text: string): string {
  const t = toolName.toLowerCase();
  if (t === "verify" || t === "bash") {
    // Try to surface a pass/fail count or the first error-ish line.
    const m = text.match(/(\d+)\s+(passed|failed|errors?)/i);
    if (isError) {
      const errLine = tailLines(text, 1)[0];
      return `✗ ${toolName} failed${errLine ? `: ${truncate(errLine, 60)}` : ""}`;
    }
    return m ? `✓ ${toolName}: ${m[0]}` : `✓ ${toolName} done`;
  }
  return isError ? `✗ ${toolName} failed` : `✓ ${describeToolCall(toolName, {}).replace(/^\S+\s/, "")} done`;
}
