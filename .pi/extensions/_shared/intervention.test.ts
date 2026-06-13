import { describe, it, expect } from "vitest";
import { consumeHarnessAbort, harnessIntervention, markHarnessAbort } from "./intervention.ts";

describe("harnessIntervention", () => {
  it("prefixes the message and uses a single info-level notification", () => {
    const calls: Array<[string, string | undefined]> = [];
    const ctx = { ui: { notify: (m: string, t?: any) => calls.push([m, t]) } };
    harnessIntervention(ctx, "the model did X — doing Y.");
    expect(calls).toEqual([
      ["harness intervention: the model did X — doing Y.", "info"],
    ]);
  });

  it("stores a one-shot harness abort reason", () => {
    markHarnessAbort("thinking budget exceeded");
    expect(consumeHarnessAbort()).toBe("thinking budget exceeded");
    expect(consumeHarnessAbort()).toBeUndefined();
  });
});
