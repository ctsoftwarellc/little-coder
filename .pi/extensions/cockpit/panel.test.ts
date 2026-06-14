import { describe, expect, it } from "vitest";
import { buildPanelPlain, CockpitPanel, paintPanel, type PanelView } from "./panel.ts";
import { stripAnsi } from "./color.ts";

function view(overrides: Partial<PanelView> = {}): PanelView {
  return {
    header: "AXIOM · little-coder · qwen3.6 · main",
    stateLabel: "EDITING",
    statusSegments: ["ctx 41% OK", "3 files", "risk low", "verify pass"],
    mission: "add the certification expiry job",
    activity: [
      { t: "14:22:01", text: "[SCAN] reading schema" },
      { t: "14:22:07", text: "[EDIT] UserController.php" },
      { t: "14:22:09", text: "[DONE] file written" },
    ],
    next: "applying the smallest correct change",
    commands: "/plan /diff /verify /risk /context",
    ...overrides,
  };
}

const ansiTheme = {
  fg: (_c: string, t: string) => `\x1b[31m${t}\x1b[0m`,
  bold: (t: string) => `\x1b[1m${t}\x1b[0m`,
};

describe("cockpit panel", () => {
  it("renders the core sections with their markers", () => {
    const lines = buildPanelPlain(view(), 80);
    const text = lines.join("\n");
    expect(text).toContain("AXIOM");
    expect(text).toContain("EDITING");
    expect(text).toContain("MISSION");
    expect(text).toContain("→"); // footer
    // newest-last activity ordering is preserved
    expect(text.indexOf("[SCAN]")).toBeLessThan(text.indexOf("[DONE]"));
  });

  it("never emits a line wider than the viewport width", () => {
    for (const w of [40, 64, 100, 120]) {
      for (const line of buildPanelPlain(view(), w)) {
        expect(line.length).toBeLessThanOrEqual(w);
      }
    }
  });

  it("is uncapped — a full panel can exceed the old 9-line strip", () => {
    const activity = Array.from({ length: 8 }, (_, i) => ({ t: "14:22:0" + i, text: `[EDIT] file${i}.ts` }));
    const lines = buildPanelPlain(
      view({
        guard: "[LOCKED] unrelated changes",
        plan: { current: 3, total: 5, steps: ["read", "model", "migration", "verify", "cleanup"], done: [1, 2] },
        activity,
      }),
      100,
    );
    expect(lines.length).toBeGreaterThan(9);
  });

  it("marks plan steps: done ✓, current ▷, pending ○", () => {
    const lines = buildPanelPlain(
      view({ plan: { current: 2, total: 3, steps: ["alpha", "beta", "gamma"], done: [1] } }),
      100,
    );
    const ribbon = lines.find((l) => l.includes("alpha"))!;
    expect(ribbon).toContain("✓"); // step 1 done
    expect(ribbon).toContain("▷"); // step 2 current
    expect(ribbon).toContain("○"); // step 3 pending
  });

  it("renders a banner call-out when present", () => {
    const lines = buildPanelPlain(view({ banner: { tone: "bad", text: "harness abort: budget" } }), 100);
    expect(lines.some((l) => l.includes("▌") && l.includes("harness abort"))).toBe(true);
  });

  it("ascii mode swaps the unicode plan marks", () => {
    const lines = buildPanelPlain(
      view({ plan: { current: 2, total: 2, steps: ["a", "b"], done: [1] } }),
      100,
      { LITTLE_CODER_COCKPIT_ASCII: "1" } as any,
    );
    const text = lines.join("\n");
    expect(text).toContain("[x]");
    expect(text).toContain("[>]");
    expect(text).not.toContain("▷");
  });

  it("coloring preserves visible content exactly (width must not change)", () => {
    const v = view({ banner: { tone: "warn", text: "awaiting your approval" } });
    const plain = buildPanelPlain(v, 80);
    const painted = paintPanel(plain, v, ansiTheme);
    expect(painted).not.toEqual(plain); // something was colored
    expect(painted.map(stripAnsi)).toEqual(plain); // …but visible content is identical
  });

  it("CockpitPanel.render degrades to a visible line instead of throwing", () => {
    const broken = { get header(): string { throw new Error("boom"); } } as unknown as PanelView;
    const out = new CockpitPanel(broken, ansiTheme).render(80);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("render error");
  });
});
