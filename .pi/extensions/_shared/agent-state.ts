// The agent control-surface state machine. The cockpit is always in exactly one
// of these states, and the HUD changes with it — that's what makes it read as a
// software agent rather than a terminal that occasionally prints UI.
//
// Pure + tested; the cockpit feeds it signals derived from pi lifecycle events.

export type AgentState =
  | "BOOT"
  | "PREFLIGHT"
  | "READING"
  | "PLANNING"
  | "WAITING_APPROVAL"
  | "EDITING"
  | "VERIFYING"
  | "REVIEW_READY"
  | "DONE"
  | "BLOCKED"
  | "FAILED";

// Signals the cockpit emits from events. Kept small and intent-revealing.
export type StateSignal =
  | "boot"
  | "preflight"
  | "think"
  | "read"
  | "edit"
  | "shell"
  | "verify"
  | "verify_pass"
  | "verify_fail"
  | "blocked"
  | "done";

export interface StateContext {
  /** Whether any file has been changed this session (drives REVIEW_READY vs DONE). */
  filesChanged: boolean;
}

/**
 * Compute the next state. Most signals map directly; a couple are
 * context-dependent (a passing verify with edits means there's a diff to
 * review; without edits the task is simply done). Terminal-ish states are
 * "sticky" against stray think signals so the panel doesn't flap.
 */
export function nextAgentState(current: AgentState, signal: StateSignal, ctx: StateContext): AgentState {
  switch (signal) {
    case "boot":
      return "BOOT";
    case "preflight":
      return "PREFLIGHT";
    case "read":
      return "READING";
    case "edit":
      return "EDITING";
    case "shell":
      // A shell command during editing is part of editing; otherwise it's
      // inspection.
      return current === "EDITING" ? "EDITING" : "READING";
    case "verify":
      return "VERIFYING";
    case "verify_pass":
      return ctx.filesChanged ? "REVIEW_READY" : "DONE";
    case "verify_fail":
      return "BLOCKED";
    case "blocked":
      return "BLOCKED";
    case "done":
      // Don't downgrade a blocked/failed run to DONE just because the loop ended.
      return current === "BLOCKED" || current === "FAILED" ? current : "DONE";
    case "think":
      // Thinking holds a meaningful state; only the very early/neutral states
      // become PLANNING so the panel shows forward motion.
      return current === "BOOT" || current === "PREFLIGHT" || current === "DONE" ? "PLANNING" : current;
    default:
      return current;
  }
}

/** A one-word, fixed-width-friendly label. */
export function stateLabel(state: AgentState): string {
  return state.replace(/_/g, " ");
}

// Short human gloss used for the "NEXT" hint default per state.
const NEXT_HINT: Record<AgentState, string> = {
  BOOT: "initializing session",
  PREFLIGHT: "running safety checks",
  READING: "inspecting allowed files",
  PLANNING: "forming an execution plan",
  WAITING_APPROVAL: "awaiting your approval",
  EDITING: "applying the smallest correct change",
  VERIFYING: "running verification",
  REVIEW_READY: "diff ready for review",
  DONE: "mission complete",
  BLOCKED: "stopped at a guardrail",
  FAILED: "unrecoverable failure",
};

export function defaultNext(state: AgentState): string {
  return NEXT_HINT[state];
}
