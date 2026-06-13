// Pure helpers for symbol grounding.
//
// Small local models' single most common failure isn't faulty reasoning — it's
// inventing symbols: calling `Invoice::markAsPaid()` when the real method is
// `settle()`, or referencing `App\Services\Foo` when the file is actually
// `App\Billing\Foo`. The schema tool grounds columns/tables; nothing grounded
// PHP class/method symbols. This module backs two things:
//
//   1. FindSymbol — a lookup tool the model can call to confirm a symbol exists
//      before it commits to an edit (zero false positives, pure discovery).
//   2. An ambient check on edit — when an edit references an `App\…` class whose
//      PSR-4 file doesn't exist, append a "class not found, did you mean …" line.
//      Scoped to first-party `App\` namespaces so framework/vendor classes
//      (Illuminate\…, etc.) are never flagged → no false positives.

export type SymbolKind = "class" | "interface" | "trait" | "enum" | "function";

export interface SymbolDef {
  kind: SymbolKind | "method";
  name: string;
  line: number;
  /** The trimmed source line the definition was found on. */
  signature: string;
}

// ── Definition matching (FindSymbol) ─────────────────────────────────────────

const TYPE_DEF = /\b(?:abstract\s+|final\s+|readonly\s+)*(class|interface|trait|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/;
const FUNC_DEF = /\bfunction\s+&?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

/** Classify a single source line as a definition of `name`, if it is one. */
export function definitionOnLine(line: string, name: string): SymbolDef["kind"] | null {
  const type = TYPE_DEF.exec(line);
  if (type && type[2] === name) return type[1] as SymbolKind;
  const fn = FUNC_DEF.exec(line);
  if (fn && fn[1] === name) {
    // A function defined at file scope vs. a method inside a class reads the
    // same here; "method" is the safe label for grep hits (most are methods).
    return "method";
  }
  return null;
}

/** Extract every top-level/method definition from a PHP source file. */
export function parsePhpDefinitions(text: string): SymbolDef[] {
  const out: SymbolDef[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const type = TYPE_DEF.exec(line);
    if (type) out.push({ kind: type[1] as SymbolKind, name: type[2], line: i + 1, signature: line.trim() });
    const fn = FUNC_DEF.exec(line);
    if (fn) out.push({ kind: "method", name: fn[1], line: i + 1, signature: line.trim() });
  }
  return out;
}

// ── "Did you mean" suggestion ─────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Closest candidate to `name`, case-insensitive, within an edit-distance
 * proportional to the name length. Returns null when nothing is close enough —
 * a bad suggestion is worse than none for a model that trusts the harness.
 */
export function suggestSimilar(name: string, candidates: string[]): string | null {
  const lower = name.toLowerCase();
  const budget = Math.max(2, Math.floor(name.length / 3));
  let best: string | null = null;
  let bestDist = Infinity;
  for (const cand of candidates) {
    if (cand === name) continue;
    const d = levenshtein(lower, cand.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best != null && bestDist <= budget ? best : null;
}

// ── PSR-4 App\-class reference checking (ambient) ─────────────────────────────

export type Psr4Map = Record<string, string>; // FQCN prefix (with trailing \) → dir (with trailing /)

export const DEFAULT_PSR4: Psr4Map = { "App\\": "app/" };

/** Parse composer.json's autoload psr-4 map; falls back to App\ → app/. */
export function parsePsr4(composerJson: string): Psr4Map {
  try {
    const json = JSON.parse(composerJson);
    const raw = { ...(json?.autoload?.["psr-4"] ?? {}), ...(json?.["autoload-dev"]?.["psr-4"] ?? {}) };
    const out: Psr4Map = {};
    for (const [prefix, dir] of Object.entries(raw)) {
      const d = Array.isArray(dir) ? dir[0] : dir;
      if (typeof d === "string") out[prefix] = d.replace(/\/?$/, "/");
    }
    return Object.keys(out).length > 0 ? out : { ...DEFAULT_PSR4 };
  } catch {
    return { ...DEFAULT_PSR4 };
  }
}

/** Map a FQCN to its expected file path under the PSR-4 map, or null if no prefix matches. */
export function fqcnToRelPath(fqcn: string, psr4: Psr4Map = DEFAULT_PSR4): string | null {
  const clean = fqcn.replace(/^\\+/, "");
  // Longest matching prefix wins (App\ vs App\Domain\).
  const prefixes = Object.keys(psr4).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (clean.startsWith(prefix)) {
      const rest = clean.slice(prefix.length).replace(/\\/g, "/");
      return `${psr4[prefix]}${rest}.php`;
    }
  }
  return null;
}

const RESERVED_TAIL = new Set(["class", "self", "static", "this", "parent"]);

/**
 * Collect first-party class references from PHP source: `use` imports plus
 * inline fully-qualified `App\…` tokens (from `new`, `::`, type hints, etc.).
 * Only namespaces present in `psr4` are returned, so framework/vendor classes
 * are never considered. The file's own `namespace` declaration is excluded.
 */
export function referencedClasses(text: string, psr4: Psr4Map = DEFAULT_PSR4): string[] {
  const prefixes = Object.keys(psr4);
  const matchesPrefix = (fqcn: string) => prefixes.some((p) => fqcn.startsWith(p));
  const found = new Set<string>();

  // `use App\Foo\Bar;` / `use App\Foo\Bar as Baz;` (grouped uses left to inline scan)
  const useRe = /^\s*use\s+([A-Za-z_][A-Za-z0-9_\\]*)\s*(?:as\s+\w+)?\s*;/gm;
  for (let m = useRe.exec(text); m; m = useRe.exec(text)) {
    const fqcn = m[1].replace(/^\\+/, "");
    if (matchesPrefix(fqcn)) found.add(fqcn);
  }

  // The file's own namespace — a reference to it isn't a class file.
  const own = /^\s*namespace\s+([A-Za-z_][A-Za-z0-9_\\]*)\s*;/m.exec(text)?.[1]?.replace(/^\\+/, "");

  // Inline fully-qualified tokens: \App\Foo\Bar or App\Foo\Bar (2+ segments).
  const inlineRe = /\\?\b([A-Z][A-Za-z0-9_]*(?:\\[A-Za-z0-9_]+)+)\b/g;
  for (let m = inlineRe.exec(text); m; m = inlineRe.exec(text)) {
    let fqcn = m[1].replace(/^\\+/, "");
    if (!matchesPrefix(fqcn)) continue;
    // Strip a trailing `::class`, `::method`, etc. so `App\Foo\Bar::class` → `App\Foo\Bar`.
    const parts = fqcn.split("\\");
    if (RESERVED_TAIL.has(parts[parts.length - 1])) parts.pop();
    fqcn = parts.join("\\");
    if (parts.length < 2) continue; // need namespace + class
    if (own && fqcn === own) continue;
    found.add(fqcn);
  }

  return [...found];
}

export interface GroundingHint {
  fqcn: string;
  expectedPath: string;
  suggestion: string | null;
}

/**
 * Given the referenced first-party classes in an edited file, return hints for
 * the ones whose PSR-4 file is missing. `fileExists` and `siblingClasses` are
 * injected so the core stays pure and unit-testable.
 *   - fileExists(relPath): does that file exist in the repo?
 *   - siblingClasses(dirRelPath): class names (no extension) alongside the
 *     expected file, used for "did you mean".
 */
export function groundingHints(
  fqcns: string[],
  fileExists: (relPath: string) => boolean,
  siblingClasses: (dirRelPath: string) => string[],
  psr4: Psr4Map = DEFAULT_PSR4,
): GroundingHint[] {
  const hints: GroundingHint[] = [];
  for (const fqcn of fqcns) {
    const rel = fqcnToRelPath(fqcn, psr4);
    if (!rel || fileExists(rel)) continue;
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    const baseName = fqcn.split("\\").pop() ?? fqcn;
    const suggestion = suggestSimilar(baseName, siblingClasses(dir));
    hints.push({ fqcn, expectedPath: rel, suggestion });
  }
  return hints;
}

/** One compact, model-actionable line summarising the unresolved references. */
export function formatGroundingLine(hints: GroundingHint[]): string {
  const parts = hints.map((h) => {
    const did = h.suggestion ? ` — did you mean ${h.suggestion}?` : "";
    return `${h.fqcn} (no file at ${h.expectedPath})${did}`;
  });
  return `symbol-grounding: unresolved first-party class${hints.length > 1 ? "es" : ""}: ${parts.join("; ")}`;
}
