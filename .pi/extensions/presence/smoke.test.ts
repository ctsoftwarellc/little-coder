import { afterAll, beforeAll, describe, expect, it } from "vitest";
import presence from "./index.ts";

// Disable the background timer so the smoke test exercises only the briefing
// path (no dangling setInterval). The watcher's logic is covered by
// situation.test.ts; here we prove the boot briefing speaks through ctx.ui.

const prevWatch = process.env.LITTLE_CODER_PRESENCE_WATCH;
beforeAll(() => {
  process.env.LITTLE_CODER_PRESENCE_WATCH = "0";
});
afterAll(() => {
  if (prevWatch === undefined) delete process.env.LITTLE_CODER_PRESENCE_WATCH;
  else process.env.LITTLE_CODER_PRESENCE_WATCH = prevWatch;
});

const GIT: Record<string, string> = {
  "rev-parse --is-inside-work-tree": "true",
  "rev-parse --abbrev-ref HEAD": "main",
  "status --porcelain": " M a.ts\n M b.ts",
  "status -sb": "## main...origin/main [ahead 2]",
  "log -1 --format=%s": "wire up widget",
  "config user.name": "Caleb Stanley",
};

function harness() {
  const handlers: Record<string, any> = {};
  const notifications: string[] = [];
  const pi: any = {
    on: (event: string, fn: any) => (handlers[event] = fn),
    registerCommand: (name: string, opts: any) => (handlers[`cmd:${name}`] = opts.handler),
    exec: async (_cmd: string, args: string[]) => ({ code: 0, stdout: GIT[args.join(" ")] ?? "", stderr: "" }),
  };
  presence(pi);
  const ctx: any = {
    hasUI: true,
    cwd: "/repo/arcova_ai",
    isIdle: () => true,
    ui: { notify: (m: string) => notifications.push(m) },
  };
  return { handlers, notifications, ctx };
}

describe("AXIOM presence", () => {
  it("delivers a boot briefing on session_start", async () => {
    const { handlers, notifications, ctx } = harness();
    await handlers.session_start?.({}, ctx);

    expect(notifications.length).toBe(1);
    const briefing = notifications[0];
    expect(briefing).toContain("AXIOM online.");
    expect(briefing).toContain("Caleb"); // first name from git config
    expect(briefing).toContain("arcova_ai · main");
    expect(briefing).toContain("2 uncommitted files.");
    expect(briefing).toContain("↑2 ahead of origin.");
    expect(briefing).toContain('Last commit: "wire up widget".');
  });

  it("re-briefs on demand via /brief", async () => {
    const { handlers, notifications, ctx } = harness();
    await handlers["cmd:brief"]?.("", ctx);
    expect(notifications.at(-1)).toContain("AXIOM online.");
  });

  it("stays silent without an interactive UI", async () => {
    const { handlers, notifications, ctx } = harness();
    await handlers.session_start?.({}, { ...ctx, hasUI: false });
    expect(notifications.length).toBe(0);
  });
});
