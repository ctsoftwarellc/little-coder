import { describe, expect, it, beforeEach, afterEach } from "vitest";
import skillInject from "./index.ts";
import { clearCards, getCards } from "../_shared/cards.ts";

// Build order item #3: confirm a thinking-budget abort/restart can't trigger a
// full KV re-prefill. The restart is a follow-up that fires a fresh
// `before_agent_start`, so skill-inject re-runs and may re-select different
// cards (recency/error state changed). The danger is ONLY a danger if that
// re-selection lands at token 0 — on llama.cpp that invalidates the whole
// cache. Under frozen prefix (#2) the producer routes its cards to the tail
// registry and returns no systemPrompt, so token 0 is byte-identical across the
// restart and the prefix cache survives.
//
// This drives skill-inject's real before_agent_start handler. The invariant
// under test is purely "no systemPrompt mutation" (token 0 is frozen) plus
// "produced content lands in the tail registry instead". We use a research
// prompt to force content out of the handler via the research-first directive,
// which doesn't depend on the skills/tools/*.md selection path.

interface Captured {
  before_agent_start?: (event: any, ctx: any) => Promise<any>;
  tool_result?: (event: any, ctx: any) => Promise<any>;
}

function fakePi(captured: Captured) {
  return { on(event: string, handler: any) { (captured as any)[event] = handler; } } as any;
}

const ctx = { cwd: process.cwd(), ui: { notify() {} }, model: { provider: "llamacpp", id: "qwen3.6-35b-a3b" } };

function event(prompt: string) {
  return { prompt, systemPrompt: "FROZEN SYSTEM PROMPT", systemPromptOptions: { littleCoder: { skillTokenBudget: 300 } } };
}

describe("skill-inject prefix stability under frozen prefix (#3)", () => {
  beforeEach(() => {
    process.env.LITTLE_CODER_FROZEN_PREFIX = "1";
    clearCards();
  });
  afterEach(() => {
    delete process.env.LITTLE_CODER_FROZEN_PREFIX;
  });

  it("never returns a systemPrompt mutation across two differing turns", async () => {
    const captured: Captured = {};
    skillInject(fakePi(captured));
    expect(captured.before_agent_start).toBeTypeOf("function");

    // Turn 1 (research intent → directive content is produced).
    const r1 = await captured.before_agent_start!(event("research this topic online and cite sources"), ctx);
    expect(r1?.systemPrompt).toBeUndefined();

    // Change error/recency state, then the restart turn with a different prompt.
    await captured.tool_result?.({ toolName: "Read", isError: true }, ctx);
    const r2 = await captured.before_agent_start!(event("look up the answer on wikipedia"), ctx);
    expect(r2?.systemPrompt).toBeUndefined();

    // Content was delivered to the tail registry, not the system prompt.
    const tail = getCards().find((c) => c.source === "skill");
    expect(tail).toBeDefined();
    expect(tail!.text).toContain("Research-first directive");
  });
});
