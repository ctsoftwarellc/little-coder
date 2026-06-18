import { describe, it, expect, beforeEach } from "vitest";
import { assessResponse, buildCorrectionMessage, phraseForUser } from "./quality.ts";
import setupQualityMonitor from "./index.ts";

const known = new Set(["Read", "Write", "Edit", "Bash", "Glob", "Grep"]);

describe("assessResponse", () => {
  it("accepts text-only assistant response", () => {
    expect(assessResponse("here's my thinking", [], [], known)).toEqual({ ok: true });
  });
  it("accepts valid tool calls", () => {
    const calls = [{ name: "Read", input: { file_path: "/a" } }];
    expect(assessResponse("", calls, [], known)).toEqual({ ok: true });
  });
  it("detects empty response (no text, no calls)", () => {
    expect(assessResponse("", [], [], known)).toEqual({
      ok: false, reason: "empty_response",
    });
  });
  it("detects empty tool name", () => {
    expect(assessResponse("", [{ name: "", input: {} }], [], known)).toEqual({
      ok: false, reason: "empty_tool_name",
    });
  });
  it("detects hallucinated tool name", () => {
    const result = assessResponse("", [{ name: "FakeTool", input: {} }], [], known);
    expect(result).toEqual({ ok: false, reason: "unknown_tool:FakeTool" });
  });
  it("skips hallucination check when registry empty", () => {
    expect(
      assessResponse("", [{ name: "Anything", input: {} }], [], new Set()),
    ).toEqual({ ok: true });
  });
  it("allows one repeated tool call", () => {
    const now = [{ name: "Read", input: { file_path: "/a" } }];
    const recent = [[{ name: "Read", input: { file_path: "/a" } }]];
    expect(assessResponse("", now, recent, known)).toEqual({ ok: true });
  });
  it("detects repeated tool call across three consecutive turns", () => {
    const now = [{ name: "Read", input: { file_path: "/a" } }];
    const recent = [
      [{ name: "Read", input: { file_path: "/a" } }],
      [{ name: "Read", input: { file_path: "/a" } }],
    ];
    expect(assessResponse("", now, recent, known)).toEqual({
      ok: false, reason: "repeated_tool_call",
    });
  });
  it("does not flag as repeat when inputs differ", () => {
    const now = [{ name: "Read", input: { file_path: "/a" } }];
    const recent = [
      [{ name: "Read", input: { file_path: "/a" } }],
      [{ name: "Read", input: { file_path: "/b" } }],
    ];
    expect(assessResponse("", now, recent, known)).toEqual({ ok: true });
  });
  it("detects malformed args sentinel", () => {
    const calls = [{ name: "Read", input: { _raw: "garbage" } }];
    expect(assessResponse("", calls, [], known)).toEqual({
      ok: false, reason: "malformed_args:Read",
    });
  });
});

describe("buildCorrectionMessage", () => {
  it("generates empty-response message", () => {
    const m = buildCorrectionMessage("empty_response");
    expect(m).toContain("empty");
  });
  it("generates unknown-tool message with tool name", () => {
    const m = buildCorrectionMessage("unknown_tool:FakeTool");
    expect(m).toContain("'FakeTool'");
    expect(m).toContain("does not exist");
  });
  it("generates malformed-args message", () => {
    const m = buildCorrectionMessage("malformed_args:Read");
    expect(m).toContain("'Read'");
    expect(m).toContain("malformed");
  });
  it("generates repeated-tool-call message", () => {
    const m = buildCorrectionMessage("repeated_tool_call");
    expect(m).toContain("Do not call that exact tool");
  });
  it("falls back to generic on unknown reason", () => {
    expect(buildCorrectionMessage("weird_thing")).toContain("weird_thing");
  });
});

describe("phraseForUser", () => {
  it("phrases known reasons in plain language", () => {
    expect(phraseForUser("empty_response")).toMatch(/empty response/i);
    expect(phraseForUser("repeated_tool_call")).toMatch(/repeated/i);
  });
  it("includes the tool name for parameterized reasons", () => {
    expect(phraseForUser("unknown_tool:Frobnicate")).toContain("Frobnicate");
    expect(phraseForUser("malformed_args:Edit")).toContain("Edit");
  });
});

// ── turn_end handler: must skip interrupted/aborted turns ───────────────────
function harness() {
  const handlers: Record<string, ((e: any, c: any) => any)[]> = {};
  const followUps: { msg: string; opts: any }[] = [];
  let aborted = false;
  const pi = {
    handlers,
    on(name: string, h: (e: any, c: any) => any) {
      (handlers[name] ??= []).push(h);
    },
    sendUserMessage(msg: string, opts: any) {
      followUps.push({ msg, opts });
    },
  };
  const notifies: string[] = [];
  const ctx = {
    ui: { notify: (m: string) => notifies.push(m) },
    abort: () => {
      aborted = true;
    },
  };
  setupQualityMonitor(pi as any);
  return { pi, ctx, followUps, notifies, get aborted() { return aborted; } };
}
async function fire(h: any, name: string, event: any) {
  for (const fn of h.pi.handlers[name] ?? []) await fn(event, h.ctx);
}

describe("quality-monitor turn_end", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(async () => {
    h = harness();
    await fire(h, "session_start", {}); // reset session-scoped counters
  });

  it("skips an aborted/interrupted turn — no empty_response correction", async () => {
    // An ESC interrupt or harness abort produces a partial/empty message with
    // stopReason "aborted". This is the escape-interrupt bug: it must NOT steer
    // a 'your previous response was empty' correction onto the next prompt.
    await fire(h, "turn_end", { message: { stopReason: "aborted", content: [] } });
    expect(h.followUps).toHaveLength(0);
    expect(h.notifies).toHaveLength(0);
  });

  it("flags a genuinely empty COMPLETED turn and steers a correction", async () => {
    await fire(h, "turn_end", { message: { stopReason: "stop", content: [] } });
    expect(h.followUps).toHaveLength(1);
    expect(h.followUps[0].opts).toEqual({ deliverAs: "steer" });
    expect(h.notifies[0]).toMatch(/harness intervention:/i);
  });

  it("passes a normal text turn without intervention", async () => {
    await fire(h, "turn_end", {
      message: { stopReason: "stop", content: [{ type: "text", text: "done." }] },
    });
    expect(h.followUps).toHaveLength(0);
    expect(h.notifies).toHaveLength(0);
  });

  it("allows one duplicate tool turn before redirecting on the third", async () => {
    const message = {
      stopReason: "stop",
      content: [{ type: "toolCall", name: "Grep", arguments: { pattern: "needle", path: "." } }],
    };

    await fire(h, "turn_end", { message });
    await fire(h, "turn_end", { message });
    expect(h.followUps).toHaveLength(0);
    expect(h.notifies).toHaveLength(0);

    await fire(h, "turn_end", { message });
    expect(h.followUps).toHaveLength(1);
    expect(h.followUps[0].opts).toEqual({ deliverAs: "steer" });
    expect(h.notifies[0]).toMatch(/several turns in a row/i);
  });

  it("aborts instead of sending a second repeated-tool correction", async () => {
    const message = {
      stopReason: "stop",
      content: [{ type: "toolCall", name: "Grep", arguments: { pattern: "needle", path: "." } }],
    };

    await fire(h, "turn_end", { message });
    await fire(h, "turn_end", { message });
    await fire(h, "turn_end", { message });
    expect(h.followUps).toHaveLength(1);
    expect(h.aborted).toBe(false);

    await fire(h, "turn_end", { message });
    expect(h.followUps).toHaveLength(1);
    expect(h.aborted).toBe(true);
    expect(h.notifies.at(-1)).toMatch(/stopping the run/i);
  });

  it("does not count different failure reasons toward repeated-tool abort", async () => {
    const message = {
      stopReason: "stop",
      content: [{ type: "toolCall", name: "Grep", arguments: { pattern: "needle", path: "." } }],
    };

    await fire(h, "turn_end", { message: { stopReason: "stop", content: [] } });
    await fire(h, "turn_end", { message });
    await fire(h, "turn_end", { message });
    await fire(h, "turn_end", { message });

    expect(h.followUps).toHaveLength(2);
    expect(h.aborted).toBe(false);
    expect(h.notifies.at(-1)).toMatch(/redirecting the model/i);
  });
});
