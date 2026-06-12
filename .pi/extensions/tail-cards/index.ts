import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { frozenPrefixEnabled, getCards, renderTailCards } from "../_shared/cards.ts";

// ── Frozen-prefix tail delivery (build order item #2) ───────────────────────
// Appends the variable skill/knowledge cards (populated by skill-inject /
// knowledge-inject via the shared registry) as a single `<system-reminder>`
// message at the TAIL of the context, every provider request, instead of
// letting them mutate token 0. See _shared/cards.ts for the why.
//
// The `context` hook fires once per turn and returns the messages actually sent
// for that request; the appended message is transient (not persisted to session
// history), so it's re-applied each turn from the registry. before_agent_start
// (where the producers refresh the registry) always runs before the first
// context emit of a task, so the tail reflects the current selection.
//
// No-op unless LITTLE_CODER_FROZEN_PREFIX=1, so the default benchmarked path
// (cards in the system prompt) is untouched.

export default function (pi: ExtensionAPI) {
  pi.on("context", async (event) => {
    if (!frozenPrefixEnabled()) return;
    const block = renderTailCards(getCards());
    if (!block) return;

    const messages = [...((event as any).messages ?? [])];
    if (messages.length === 0) return;

    messages.push({
      role: "user",
      content: [{ type: "text", text: block }],
      timestamp: Date.now(),
    });
    return { messages };
  });
}
