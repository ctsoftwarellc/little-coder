// Phase-scoped tool exposure (build order item #6).
//
// Small models call the wrong tool when every tool is visible. Claude Code
// defers most tool schemas; we approximate that by driving the existing
// enforcement layer (tool-gating, which reads LITTLE_CODER_ALLOWED_TOOLS) with
// a tiny deterministic state machine. As a bonus, skill-inject filters its
// cards to the allowed set, so in explore phase the model also isn't shown
// Edit/Write/Verify guidance it can't act on yet.
//
//   explore → (first edit/write) → edit → (Verify) → verify → (edit/write) → edit
//   any phase → (tripwire / failed edit) → explore
//
// Tool names appear in both lower- and PascalCase because pi emits built-ins
// lowercase (read/write/edit/bash) while the model/skills reference PascalCase
// (Read/Edit/...). tool-gating matches exactly, so we list both — same
// convention as the benchmark ALLOWED_TOOLS lists.

export type Phase = "explore" | "edit" | "verify";

// Non-mutating discovery tools — available in every phase. Deliberately broad
// (browser/evidence/web included) so research-shaped work isn't starved; the
// point of the machine is to gate MUTATION, not to blind exploration.
const READONLY = [
  "read", "Read", "grep", "Grep", "glob", "Glob", "find", "ls",
  "search", "Search",
  "webfetch", "WebFetch", "websearch", "WebSearch",
  "ArcovaListRoutes", "ArcovaDatabaseSchema", "ArcovaSearchDocs",
  "BrowserNavigate", "BrowserClick", "BrowserType", "BrowserScroll",
  "BrowserExtract", "BrowserBack", "BrowserHistory",
  "EvidenceAdd", "EvidenceGet", "EvidenceList",
];
const MUTATE = ["edit", "Edit", "write", "Write"];
const VERIFY_TOOLS = ["Verify", "bash", "Bash", "ShellSession", "ShellSessionCwd", "ShellSessionReset"];

const ALLOWED: Record<Phase, string[]> = {
  // Explore: read & discover only.
  explore: [...READONLY],
  // Edit: mutate, re-read, and verify the change you just made.
  edit: [...READONLY, ...MUTATE, ...VERIFY_TOOLS],
  // Verify/finalize: run checks; no fresh mutations until you go back to edit.
  verify: [...READONLY, ...VERIFY_TOOLS],
};

export function allowedFor(phase: Phase): string[] {
  return ALLOWED[phase];
}

/**
 * Deterministic transition. A mutate tool moves to (or stays in) edit; Verify
 * moves to verify; anything else holds the phase. Because edit/write themselves
 * cause the transition, a mutation is never the call that gets blocked — the
 * machine reshapes the FUTURE surface, it doesn't trap the current step.
 */
export function nextPhase(current: Phase, toolName: string): Phase {
  const t = toolName.toLowerCase();
  if (t === "edit" || t === "write") return "edit";
  if (t === "verify") return "verify";
  return current;
}

export const INITIAL_PHASE: Phase = "explore";
