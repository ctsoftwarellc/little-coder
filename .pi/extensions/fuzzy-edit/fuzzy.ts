// Fuzzy Edit matching (build order item #8).
//
// pi's edit tool is exact-match: oldText must reproduce the file byte-for-byte,
// whitespace and all. Frontier models do that reliably; small models don't, and
// every failed Edit burns a turn plus a correction turn. Aider's data says
// edit-format fit is worth double-digit pass-rate points — this is that lever,
// inside the tool instead of the prompt.
//
// SAFETY MODEL. We only ever rewrite the model's oldText to an EXACT substring
// already present in the file, and only when a normalization level yields
// exactly ONE matching region. Zero or multiple matches → we don't touch it
// (let pi's exact matcher fail loudly rather than edit the wrong place). The
// levels go strict→loose so the tightest interpretation that's unambiguous wins:
//   1. trailing-whitespace-insensitive
//   2. indentation-flexible (compare trimmed lines)
//   3. inner-whitespace-collapsed
// Matching is line-based, so the returned string is a real, contiguous slice of
// the file and is guaranteed to satisfy pi's exact matcher.

export type FuzzyResult =
  | { kind: "exact" } // oldText already matches verbatim — nothing to do
  | { kind: "matched"; matched: string; strategy: string }
  | { kind: "none" };

type Normalizer = (line: string) => string;

const stripCr = (s: string) => s.replace(/\r$/, "");
const trailingWs: Normalizer = (s) => stripCr(s).replace(/\s+$/, "");
const indentFlexible: Normalizer = (s) => stripCr(s).trim();
const collapseInner: Normalizer = (s) => stripCr(s).trim().replace(/\s+/g, " ");

const STRATEGIES: Array<{ name: string; norm: Normalizer }> = [
  { name: "trailing-whitespace", norm: trailingWs },
  { name: "indentation", norm: indentFlexible },
  { name: "inner-whitespace", norm: collapseInner },
];

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// oldText may carry a trailing newline (model included the line break); drop a
// single trailing empty segment so the window length matches real file lines.
function splitOldLines(oldText: string): string[] {
  const lines = oldText.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function findFuzzyMatch(fileText: string, oldText: string): FuzzyResult {
  if (!oldText) return { kind: "none" };
  if (fileText.includes(oldText)) return { kind: "exact" };

  const fileLines = fileText.split("\n");
  const oldLines = splitOldLines(oldText);
  const k = oldLines.length;
  if (k === 0 || k > fileLines.length) return { kind: "none" };

  for (const { name, norm } of STRATEGIES) {
    const normOld = oldLines.map(norm);
    // Refuse to match a region that normalizes to pure emptiness — that would
    // "match" any blank run and is never what the model meant.
    if (normOld.every((l) => l.length === 0)) return { kind: "none" };

    const hits: number[] = [];
    for (let i = 0; i + k <= fileLines.length; i++) {
      const window = fileLines.slice(i, i + k).map(norm);
      if (arraysEqual(window, normOld)) {
        hits.push(i);
        if (hits.length > 1) break; // ambiguous — stop early
      }
    }
    if (hits.length === 1) {
      const i = hits[0];
      // Reconstruct the EXACT file slice (preserving real indentation / CRs) so
      // pi's exact matcher applies it cleanly.
      return { kind: "matched", matched: fileLines.slice(i, i + k).join("\n"), strategy: name };
    }
    if (hits.length > 1) return { kind: "none" }; // ambiguous at this level → bail
  }
  return { kind: "none" };
}
