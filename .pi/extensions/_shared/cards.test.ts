import { describe, expect, it, beforeEach } from "vitest";
import { clearCards, frozenPrefixEnabled, getCards, renderTailCards, setCard } from "./cards.ts";

describe("tail-card registry", () => {
  beforeEach(() => clearCards());

  it("is gated behind LITTLE_CODER_FROZEN_PREFIX=1", () => {
    expect(frozenPrefixEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(frozenPrefixEnabled({ LITTLE_CODER_FROZEN_PREFIX: "0" } as any)).toBe(false);
    expect(frozenPrefixEnabled({ LITTLE_CODER_FROZEN_PREFIX: "1" } as any)).toBe(true);
  });

  it("replaces a source's card rather than appending duplicates", () => {
    setCard("skill", "first");
    setCard("skill", "second");
    expect(getCards()).toHaveLength(1);
    expect(getCards()[0].text).toBe("second");
  });

  it("clears a source when given empty/whitespace text", () => {
    setCard("skill", "x");
    setCard("skill", "   ");
    expect(getCards()).toHaveLength(0);
  });

  it("renders nothing when empty", () => {
    expect(renderTailCards([])).toBe("");
  });

  it("wraps cards in a system-reminder, ordered deterministically by source", () => {
    setCard("skill", "## Tool Usage Guidance\nuse Edit");
    setCard("knowledge", "## Algorithm Reference\nbinary search");
    const block = renderTailCards();
    expect(block.startsWith("<system-reminder>")).toBe(true);
    expect(block.endsWith("</system-reminder>")).toBe(true);
    // "knowledge" sorts before "skill"
    expect(block.indexOf("Algorithm Reference")).toBeLessThan(block.indexOf("Tool Usage Guidance"));
  });
});
