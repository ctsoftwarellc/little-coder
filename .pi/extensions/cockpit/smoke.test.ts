import { describe, expect, it } from "vitest";
import cockpit from "./index.ts";
import { markHarnessAbort } from "../_shared/intervention.ts";

// Guards the real failure mode the user hit: if renderLines throws, render()'s
// try/catch swallows it and the widget silently never appears. This drives the
// actual event handlers with a fake pi/ctx and asserts setWidget receives
// non-empty content without throwing.

// Identity theme: fg/bold pass text through unchanged so assertions see the
// plain visible content (the real Theme only wraps it in zero-width ANSI).
const stubTheme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };

// Materialize whatever setWidget received into rendered lines. Interactive mode
// (hasUI) gets a Component factory; print/RPC gets a plain string[].
function widgetLines(call: any): string[] {
  if (typeof call === "function") return call({}, stubTheme).render(120);
  return call;
}

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
    hasUI: true,
    model: { provider: "lmstudio", id: "qwen/qwen3.6-35b-a3b", contextWindow: 128000 },
    getContextUsage: () => ({ percent: 6, tokens: 7680, contextWindow: 128000 }),
    ui: {
      setWidget: (_k: string, content: any) => widgetCalls.push(content),
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
    // Interactive mode now hands pi a Component factory, not a string[].
    expect(typeof widgetCalls[widgetCalls.length - 1]).toBe("function");
    const last = widgetLines(widgetCalls[widgetCalls.length - 1]);
    expect(Array.isArray(last)).toBe(true);
    expect(last.length).toBeGreaterThan(3);
    // Structural markers from the panel.
    const text = last.join("\n");
    expect(text).toContain("AXIOM");
    expect(text).toContain("MISSION");
    expect(text).toContain("→"); // next + commands footer
    // Every line must be a string (Component.render contract).
    expect(last.every((l) => typeof l === "string")).toBe(true);
  });

  it("does not mark a harness-aborted turn as done", async () => {
    const { handlers, widgetCalls, ctx } = harness();

    await handlers.session_start?.({}, ctx);
    await handlers.before_agent_start?.({ prompt: "Read and follow test.md exactly." }, ctx);
    markHarnessAbort("thinking budget exceeded");
    await handlers.agent_end?.({}, ctx);

    const text = widgetLines(widgetCalls[widgetCalls.length - 1]).join("\n");
    expect(text).toContain("BLOCKED");
    expect(text).toContain("harness abort");
    expect(text).not.toContain("mission complete");
  });
});
