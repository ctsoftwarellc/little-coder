// Shared agent-status registry: the single source of truth for the persistent
// header line the narrator shows above its live narration —
//
//     🔍 explore · ▶ 2/5 · cache 92% · 237 tok/s
//
// Each fact is owned by a different extension (phase ← phase-gating #6, plan ←
// plan-anchor #7, cache/throughput ← harness-timings #1). Rather than couple
// those extensions to the narrator, they each publish here and the narrator
// reads. Library module (no index.ts), so the launcher's auto-discovery skips
// it.

export interface AgentStatus {
  phase?: "explore" | "edit" | "verify";
  planCurrent?: number;
  planTotal?: number;
  planSteps?: string[];
  planDone?: number[];
  cachedPercent?: number; // 0..100
  tokensPerSecond?: number;
}

let status: AgentStatus = {};

// Panel ownership: when the cockpit is loaded it claims the single persistent
// panel, and the narrator yields its own widget (it keeps driving the
// working-message spinner only) so the two don't stack into a duplicated HUD.
let panelClaimed = false;
export function claimPanel(): void {
  panelClaimed = true;
}
export function isPanelClaimed(): boolean {
  return panelClaimed;
}

export function setPhaseStatus(phase: AgentStatus["phase"]): void {
  status.phase = phase;
}

export function setPlanStatus(current: number, total: number, steps?: string[], done?: number[]): void {
  status.planCurrent = current;
  status.planTotal = total;
  if (steps) status.planSteps = steps;
  if (done) status.planDone = done;
}

export function setTimingStatus(cachedPercent: number, tokensPerSecond: number): void {
  status.cachedPercent = cachedPercent;
  status.tokensPerSecond = tokensPerSecond;
}

export function getAgentStatus(): AgentStatus {
  return status;
}

export function clearAgentStatus(): void {
  status = {};
  ambientNote = null;
}

// Ambient note: a short proactive remark from the presence extension (AXIOM's
// watcher) that the cockpit surfaces in its banner slot — e.g. "3 files changed
// and no verify yet". Owned here so presence and cockpit stay decoupled: one
// writes, the other reads. null = no standing remark.
let ambientNote: string | null = null;
export function setAmbientNote(note: string | null): void {
  ambientNote = note && note.trim() ? note.trim() : null;
}
export function getAmbientNote(): string | null {
  return ambientNote;
}

const PHASE_EMOJI: Record<NonNullable<AgentStatus["phase"]>, string> = {
  explore: "🔍",
  edit: "✏️",
  verify: "✅",
};

/** Render the header line, omitting any fact that isn't known yet. "" if empty. */
export function formatStatusHeader(s: AgentStatus = status): string {
  const parts: string[] = [];
  if (s.phase) parts.push(`${PHASE_EMOJI[s.phase]} ${s.phase}`);
  if (typeof s.planTotal === "number" && s.planTotal > 0) {
    parts.push(`▶ ${s.planCurrent ?? 0}/${s.planTotal}`);
  }
  if (typeof s.cachedPercent === "number") parts.push(`cache ${Math.round(s.cachedPercent)}%`);
  if (typeof s.tokensPerSecond === "number") parts.push(`${Math.round(s.tokensPerSecond)} tok/s`);
  return parts.join(" · ");
}
