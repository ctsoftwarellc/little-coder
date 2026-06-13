import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { applyPlanUpdate, EMPTY_PLAN, formatPlanReminder, type PlanState } from "./plan.ts";
import { setPlanStatus } from "../_shared/agent-status.ts";

// ── Harness-owned plan re-anchoring (build order item #7) ───────────────────
// Registers a `Plan` tool the model uses to declare/update its step list, then
// appends a one-line reminder at the message tail every turn so the plan stays
// in front of a model that would otherwise lose the thread. See plan.ts.
//
// Opt-in via LITTLE_CODER_PLAN_ANCHOR=1: registering a tool adds schema to every
// request (the very cost #6 fights), so it's off unless asked for. The reminder
// is delivered at the TAIL (like #2's cards) to stay cache-friendly.

function enabled(): boolean {
  return process.env.LITTLE_CODER_PLAN_ANCHOR === "1";
}

export default function (pi: ExtensionAPI) {
  if (!enabled()) return;

  let plan: PlanState = EMPTY_PLAN;

  pi.on("session_start", async () => {
    plan = EMPTY_PLAN;
  });

  pi.registerTool({
    name: "Plan",
    label: "Plan",
    description:
      "Record or update your task plan so the harness can keep it in front of you each turn. " +
      "Set `steps` to (re)declare the ordered step list. Set `current` (1-based) to the step you " +
      "are working on now. Set `done` to the 1-based indices you have completed. Use this whenever " +
      "the task has multiple steps, and update it as you make progress.",
    parameters: Type.Object({
      steps: Type.Optional(Type.Array(Type.String())),
      current: Type.Optional(Type.Number()),
      done: Type.Optional(Type.Array(Type.Number())),
    }),
    async execute(_id, input: { steps?: string[]; current?: number; done?: number[] }) {
      plan = applyPlanUpdate(plan, input);
      setPlanStatus(plan.current, plan.steps.length, plan.steps, plan.done); // publish for cockpit PLAN + narrator header
      const reminder = formatPlanReminder(plan) || "Plan cleared.";
      return {
        content: [{ type: "text", text: `Plan updated.\n${reminder}` }],
        details: { ...plan },
      };
    },
  });

  // Append the re-anchor line at the tail of the context every turn. Transient
  // (re-applied each request from the held state), so it always reflects the
  // latest plan without bloating session history.
  pi.on("context", async (event) => {
    const reminder = formatPlanReminder(plan);
    if (!reminder) return;
    const messages = [...((event as any).messages ?? [])];
    if (messages.length === 0) return;
    messages.push({
      role: "user",
      content: [{ type: "text", text: `<system-reminder>\n${reminder}\n</system-reminder>` }],
      timestamp: Date.now(),
    });
    return { messages };
  });
}
