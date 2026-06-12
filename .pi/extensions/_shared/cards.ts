// Shared "tail card" registry for the frozen-prefix delivery path (build order
// item #2 from docs/harness-design-notes.md).
//
// THE PROBLEM. skill-inject and knowledge-inject return `{ systemPrompt: base +
// block }` from `before_agent_start`, so the per-task card selection lands at
// the *head* of the prompt. On llama.cpp any change at token 0 invalidates the
// entire KV cache and forces a full re-prefill of the whole conversation — the
// dominant latency on laptop-class VRAM. Because the selection changes with
// error / recency / intent, the head changes between tasks, so the cache keeps
// getting murdered.
//
// THE FIX (Claude Code's frozen prefix + appended deltas). Keep the system
// prompt static (AGENTS.md + the deterministic Arcova map). Deliver the
// variable cards as a `<system-reminder>` block appended at the TAIL of the
// message list via the `context` hook (see the tail-cards extension). A tail
// change only re-prefills from the tail, leaving the expensive frozen prefix
// cached. The timings extension (#1) is how you watch this work: `cached` should
// stay high turn-over-turn once this is on.
//
// OPT-IN. Gated behind LITTLE_CODER_FROZEN_PREFIX=1 so the benchmarked default
// (cards in the system prompt) is unchanged until measured with #1. This dir
// has no index.ts, so the launcher's auto-discovery skips it — it's a library.

export interface TailCard {
  /** Stable key for the producing extension ("skill", "knowledge"). */
  source: string;
  /** The rendered markdown block. */
  text: string;
}

// Module-scope, process-lifetime registry. The launcher loads each extension
// once into the same process, so a shared import sees one registry.
let cards: TailCard[] = [];

export function frozenPrefixEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LITTLE_CODER_FROZEN_PREFIX === "1";
}

/**
 * Set (replacing any prior) the card for a given source. Called from each
 * producer's `before_agent_start` so the latest selection for that source wins
 * and stale cards from a previous task don't accumulate. Empty/whitespace text
 * clears the source.
 */
export function setCard(source: string, text: string): void {
  cards = cards.filter((c) => c.source !== source);
  if (text && text.trim().length > 0) {
    cards.push({ source, text });
  }
}

export function getCards(): readonly TailCard[] {
  return cards;
}

export function clearCards(): void {
  cards = [];
}

/**
 * Render the queued cards into a single appended-tail block. Wrapped in a
 * `<system-reminder>` so the model reads it as harness-injected context (the
 * same convention pi/Claude Code use for file-state and todo reminders), and
 * ordered deterministically by source so identical selections produce identical
 * tail text (which keeps even the tail cache-friendly across turns).
 */
export function renderTailCards(list: readonly TailCard[] = cards): string {
  if (list.length === 0) return "";
  const ordered = [...list].sort((a, b) => a.source.localeCompare(b.source));
  const body = ordered.map((c) => c.text.trim()).join("\n\n");
  return `<system-reminder>\n${body}\n</system-reminder>`;
}
