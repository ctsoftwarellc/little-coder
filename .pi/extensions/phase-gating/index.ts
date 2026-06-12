import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { harnessIntervention } from "../_shared/intervention.ts";
import { setPhaseStatus } from "../_shared/agent-status.ts";
import { allowedFor, INITIAL_PHASE, nextPhase, type Phase } from "./phases.ts";

// ── Phase-scoped tool exposure (build order item #6) ────────────────────────
// Drives tool-gating's LITTLE_CODER_ALLOWED_TOOLS from a deterministic phase
// machine (see phases.ts). Off by default; enable with
// LITTLE_CODER_PHASE_GATING=1.
//
// When on, this extension OWNS LITTLE_CODER_ALLOWED_TOOLS — do not also pin a
// benchmark allow-list, or the two will fight. Load order puts "phase-gating"
// before "tool-gating" alphabetically, so the env we set in tool_call is the
// env tool-gating reads for the same call: a mutate call flips the phase to
// edit (which permits it) BEFORE tool-gating enforces, so the triggering
// mutation is never spuriously blocked.

function enabled(): boolean {
  return process.env.LITTLE_CODER_PHASE_GATING === "1";
}

export default function (pi: ExtensionAPI) {
  let phase: Phase = INITIAL_PHASE;

  const applyEnv = () => {
    process.env.LITTLE_CODER_ALLOWED_TOOLS = allowedFor(phase).join(",");
    setPhaseStatus(phase); // publish for the narrator header
  };

  const setPhase = (next: Phase) => {
    if (next === phase) return;
    phase = next;
    applyEnv();
  };

  pi.on("session_start", async () => {
    if (!enabled()) return;
    phase = INITIAL_PHASE;
    applyEnv();
  });

  pi.on("before_agent_start", async () => {
    if (!enabled()) return;
    // Ensure tool-gating + skill-inject see the current phase's set from turn 1.
    applyEnv();
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!enabled()) return;
    const toolName = String((event as any).toolName ?? "");
    const next = nextPhase(phase, toolName);
    if (next !== phase) {
      setPhase(next);
      try {
        harnessIntervention(ctx, `entering ${next} phase — tool surface narrowed to ${next} tools.`);
      } catch {
        // best-effort
      }
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!enabled()) return;
    const toolName = String((event as any).toolName ?? "").toLowerCase();
    const isError = (event as any).isError === true;
    // A blocked/failed mutation (most importantly an arcova-tripwire hard stop)
    // bounces us back to explore: re-gather before trying to change anything.
    if (isError && (toolName === "edit" || toolName === "write") && phase !== "explore") {
      setPhase("explore");
      try {
        harnessIntervention(ctx, "edit was rejected — back to explore phase to re-gather context.");
      } catch {
        // best-effort
      }
    }
  });
}
