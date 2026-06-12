import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { harnessIntervention } from "../_shared/intervention.ts";
import { findFuzzyMatch } from "./fuzzy.ts";

// ── Fuzzy Edit with a diff receipt (build order item #8) ────────────────────
// Two pieces:
//   1. tool_call(edit): when an oldText doesn't match the file verbatim, find a
//      UNIQUE fuzzy match and rewrite oldText in place to the exact file slice,
//      so pi's exact matcher then applies it. Only safe rewrites happen (see
//      fuzzy.ts) — ambiguous/absent matches are left for pi to reject.
//   2. tool_result(edit): echo the applied unified diff (pi computes it into
//      details.diff) back in the result so the model SEES exactly what changed.
//
// On by default (it only acts when exact matching would fail). Disable with
// LITTLE_CODER_FUZZY_EDIT=0.

function disabled(): boolean {
  return process.env.LITTLE_CODER_FUZZY_EDIT === "0";
}

interface EditEntry {
  oldText: string;
  newText: string;
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (disabled()) return;
    if (String((event as any).toolName ?? "").toLowerCase() !== "edit") return;
    const input = (event as any).input as { path?: string; edits?: EditEntry[] } | undefined;
    if (!input || !Array.isArray(input.edits) || input.edits.length === 0) return;

    const rawPath = input.path;
    if (typeof rawPath !== "string") return;
    const cwd = (ctx as any)?.cwd ?? process.cwd();
    const absPath = isAbsolute(rawPath) ? rawPath : join(cwd, rawPath);

    let fileText: string;
    try {
      fileText = readFileSync(absPath, "utf-8");
    } catch {
      return; // unreadable / new file — let pi's edit handle the error
    }

    // Apply matches against an evolving copy so multi-edit uniqueness mirrors
    // pi's sequential application.
    let working = fileText;
    const adjusted: string[] = [];
    for (const edit of input.edits) {
      if (typeof edit.oldText !== "string") continue;
      if (working.includes(edit.oldText)) {
        working = working.replace(edit.oldText, edit.newText ?? "");
        continue; // already exact — nothing to fix
      }
      const result = findFuzzyMatch(working, edit.oldText);
      if (result.kind === "matched") {
        working = working.replace(result.matched, edit.newText ?? "");
        edit.oldText = result.matched; // mutate in place so pi applies it
        adjusted.push(result.strategy);
      }
      // kind "none" / "exact" handled implicitly — leave for pi to apply/reject.
    }

    if (adjusted.length > 0) {
      try {
        harnessIntervention(
          ctx,
          `fuzzy-matched ${adjusted.length} edit(s) the model wrote with imperfect whitespace ` +
            `(${adjusted.join(", ")}) — applied to the exact file text.`,
        );
      } catch {
        // best-effort
      }
    }
  });

  // Echo the applied diff back so the model sees the concrete result.
  pi.on("tool_result", async (event) => {
    if (disabled()) return;
    if (String((event as any).toolName ?? "").toLowerCase() !== "edit") return;
    if ((event as any).isError === true) return;
    const diff = (event as any).details?.diff;
    if (typeof diff !== "string" || diff.trim().length === 0) return;
    const existing = (event as any).content ?? [];
    return {
      content: [...existing, { type: "text" as const, text: `Applied diff:\n\`\`\`diff\n${diff}\n\`\`\`` }],
    };
  });
}
