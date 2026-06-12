import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { forceToolChoice, isConstrainableProvider, requireAnyTool } from "./constrain.ts";
import { getForcedTool } from "../_shared/forced-tool.ts";

// ── Constrained tool-call decoding (build order item #4) ────────────────────
// Promotes constrained output from an LM Studio note to the default path for
// local servers: when the harness knows the next request should be a tool call
// (the phase machine #6 sets a forced tool, or LITTLE_CODER_FORCE_TOOL is set),
// pin llama.cpp's `tool_choice` so the server's grammar makes a malformed call
// impossible — and still emits a native tool_call pi can dispatch. See
// constrain.ts for why this beats response_format for tool calls.
//
// Default behavior is unchanged: with no forced-tool signal this is a complete
// pass-through, and it never touches cloud providers (they tool-call reliably
// already). output-parser stays loaded as the fallback for servers/templates
// that leak tool calls as text.

export default function (pi: ExtensionAPI) {
  // before_provider_request carries only the payload, not ctx, so track the
  // active provider from before_agent_start (same pattern as benchmark-profiles).
  let provider = "";

  pi.on("before_agent_start", async (_event, ctx) => {
    provider = (ctx as any)?.model?.provider ?? "";
  });

  pi.on("before_provider_request", async (event) => {
    if (!isConstrainableProvider(provider)) return; // cloud / unknown → pass through
    const payload: any = (event as any).payload;
    if (!payload || typeof payload !== "object") return;

    const forced = getForcedTool();
    if (forced.kind === "function") {
      const next = forceToolChoice(payload, forced.name);
      return next === payload ? undefined : next;
    }
    if (forced.kind === "required") {
      const next = requireAnyTool(payload);
      return next === payload ? undefined : next;
    }
    // kind === "none": leave tool_choice as the model's auto choice. llama.cpp
    // (--jinja) still grammar-constrains whatever tool the model elects, so the
    // arguments are valid even on the unforced path.
    return;
  });
}
