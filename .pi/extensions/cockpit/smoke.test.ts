import { describe, expect, it } from "vitest";
import cockpit from "./index.ts";
import { markHarnessAbort } from "../_shared/intervention.ts";

// Guards the real failure mode the user hit: if renderLines throws, render()'s
// try/catch swallows it and the widget silently never appears. This drives the
// actual event handlers with a fake pi/ctx and asserts setWidget receives
// non-empty content without throwing.

function harness() {
  const handlers: Record<string, any> = {};
  const widgetCalls: any[] = [];
  const pi: any = {
    on: (event: string, fn: any) => (handlers[event] = fn),
    registerCommand: () => {},
    exec: async () => ({ code: 0, stdout: "", stderr: "" }),
  };
  const ctx: any = {
    cwd: "/repo/arcova_ai",
    model: { provider: "lmstudio", id: "qwen/qwen3.6-35b-a3b", contextWindow: 128000 },
    getContextUsage: () => ({ percent: 6, tokens: 7680, contextWindow: 128000 }),
    ui: {
      setWidget: (_k: string, lines: any) => widgetCalls.push(lines),
      setStatus: () => {},
      notify: () => {},
    },
  };
  cockpit(pi);
  return { handlers, widgetCalls, ctx };
}

describe("cockpit smoke (renders without throwing)", () => {
  it("renders a non-empty widget through a full event sequence", async () => {
    const { handlers, widgetCalls, ctx } = harness();

    await handlers.session_start?.({}, ctx);
    await handlers.before_agent_start?.({ prompt: "Read and follow test.md exactly." }, ctx);
    await handlers.tool_call?.({ toolName: "read", input: { path: "test.md" } }, ctx);
    await handlers.tool_result?.({ toolName: "read", isError: false }, ctx);
    await handlers.tool_call?.({ toolName: "edit", input: { path: "app/Foo.php", edits: [1] } }, ctx);
    await handlers.tool_result?.({ toolName: "Verify", isError: false, details: { command: "php artisan test" } }, ctx);
    await handlers.turn_end?.({}, ctx);

    expect(widgetCalls.length).toBeGreaterThan(0);
    const last = widgetCalls[widgetCalls.length - 1] as string[];
    expect(Array.isArray(last)).toBe(true);
    expect(last.length).toBeGreaterThan(3);
    // The whole point of the redesign: NEVER exceed pi's 10-line widget cap, so
    // "(widget truncated)" can never fire. 9 leaves one line of headroom.
    expect(last.length).toBeLessThanOrEqual(9);
    // Structural markers from the compact instrument strip.
    const text = last.join("\n");
    expect(text).toContain("AXIOM");
    expect(text).toContain("MISSION");
    expect(text).toContain("→"); // next + commands footer
    // Every line must be a string (setWidget contract).
    expect(last.every((l) => typeof l === "string")).toBe(true);
  });

  it("does not mark a harness-aborted turn as done", async () => {
    const { handlers, widgetCalls, ctx } = harness();

    await handlers.session_start?.({}, ctx);
    await handlers.before_agent_start?.({ prompt: "Read and follow test.md exactly." }, ctx);
    markHarnessAbort("thinking budget exceeded");
    await handlers.agent_end?.({}, ctx);

    const text = (widgetCalls[widgetCalls.length - 1] as string[]).join("\n");
    expect(text).toContain("BLOCKED");
    expect(text).toContain("harness abort");
    expect(text).not.toContain("mission complete");
  });
});
