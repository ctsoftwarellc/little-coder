// Harness-owned plan state + re-anchoring line (build order item #7).
//
// Small models drift mid-task: they forget step 3 exists while doing step 2.
// The fix is to move "remember the plan" from a model job to a harness job —
// the harness holds the step list and appends a one-line reminder at the tail
// every turn (cheap tokens, cache-friendly because it's at the tail, #2):
//
//   Plan: 5 steps. Done: 1,2. Current: 3 — add the migration. Remaining: 4,5.
//
// finalize-warn / turn-cap manage the END of the budget; this manages the
// MIDDLE. Pure functions here; the extension wires them to a Plan tool + the
// context hook.

export interface PlanState {
  steps: string[];
  /** 1-based index of the in-progress step, or 0 when none is current. */
  current: number;
  /** 1-based indices of completed steps, sorted & deduped. */
  done: number[];
}

export const EMPTY_PLAN: PlanState = { steps: [], current: 0, done: [] };

export interface PlanUpdate {
  steps?: string[];
  current?: number;
  done?: number[];
}

function clampIndex(i: number, n: number): number {
  if (!Number.isFinite(i)) return 0;
  const r = Math.trunc(i);
  if (r < 1) return 0;
  return r > n ? n : r;
}

function uniqSorted(xs: number[], n: number): number[] {
  return Array.from(new Set(xs.map((x) => clampIndex(x, n)).filter((x) => x >= 1))).sort((a, b) => a - b);
}

/**
 * Apply a Plan tool call to the current state, returning a NEW state.
 * - `steps` replaces the list and resets done/current (a new plan is a fresh
 *   start) unless the same call also specifies them.
 * - `done` is merged into the completed set.
 * - `current` sets the in-progress step.
 * Indices are clamped to the step count; out-of-range / non-integer inputs are
 * dropped rather than throwing — a small model passing junk shouldn't crash.
 */
export function applyPlanUpdate(state: PlanState, update: PlanUpdate): PlanState {
  let steps = state.steps;
  let done = state.done;
  let current = state.current;

  if (Array.isArray(update.steps)) {
    steps = update.steps.map((s) => String(s)).filter((s) => s.trim().length > 0);
    done = [];
    current = steps.length > 0 ? 1 : 0;
  }

  const n = steps.length;
  if (Array.isArray(update.done)) {
    done = uniqSorted([...done, ...update.done], n);
  }
  if (update.current !== undefined) {
    current = clampIndex(update.current, n);
  }
  // A current step that's been marked done shouldn't also read as "current".
  if (current !== 0 && done.includes(current)) {
    const nextOpen = steps.findIndex((_, i) => !done.includes(i + 1)) + 1;
    current = nextOpen || 0;
  }
  return { steps, current, done };
}

function listOrNone(xs: number[]): string {
  return xs.length > 0 ? xs.join(",") : "none";
}

/** One-line re-anchor reminder, or "" when there's no plan to show. */
export function formatPlanReminder(state: PlanState): string {
  if (state.steps.length === 0) return "";
  const remaining: number[] = [];
  for (let i = 1; i <= state.steps.length; i++) {
    if (i !== state.current && !state.done.includes(i)) remaining.push(i);
  }
  const head = `Plan: ${state.steps.length} steps. Done: ${listOrNone(state.done)}.`;
  const cur =
    state.current >= 1 && state.current <= state.steps.length
      ? ` Current: ${state.current} — ${state.steps[state.current - 1]}.`
      : "";
  return `${head}${cur} Remaining: ${listOrNone(remaining)}.`;
}
