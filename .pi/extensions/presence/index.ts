import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { setAmbientNote } from "../_shared/agent-status.ts";
import { scanRepo } from "../arcova-init/scan.ts";
import { bootBriefing, watchRemark, type Situation } from "./voice.ts";
import { countDirty, detectChange, firstName, parseTracking } from "./situation.ts";

// ── AXIOM presence ───────────────────────────────────────────────────────────
// Turns the agent from a tool you operate into something that's *there*: it
// greets you with a situation report on launch (bootBriefing), then watches the
// repo in idle time and speaks up — unprompted — when something changes
// (detectChange → watchRemark). Both speak through one persona (voice.ts) and
// surface via ctx.ui.notify plus the cockpit's banner (shared ambient note).
//
// Interactive only (it talks to a human). Off switches:
//   LITTLE_CODER_PRESENCE=0           disable everything
//   LITTLE_CODER_PRESENCE_WATCH=0     keep the briefing, drop the watcher
//   LITTLE_CODER_PRESENCE_INTERVAL_MS poll cadence (default 30000, min 5000)
//   LITTLE_CODER_PRESENCE_NUDGE_FILES dirty count that triggers "verify?" (default 5)
//   LITTLE_CODER_USER                 how AXIOM addresses you (else git user.name)

function disabled(value: string | undefined): boolean {
  return value === "0";
}
function presenceEnabled(): boolean {
  return !disabled(process.env.LITTLE_CODER_PRESENCE);
}
function watchEnabled(): boolean {
  return !disabled(process.env.LITTLE_CODER_PRESENCE_WATCH);
}
function intervalMs(): number {
  const n = Number(process.env.LITTLE_CODER_PRESENCE_INTERVAL_MS);
  return Number.isFinite(n) && n >= 5000 ? n : 30000;
}
function nudgeFiles(): number {
  const n = Number(process.env.LITTLE_CODER_PRESENCE_NUDGE_FILES);
  return Number.isFinite(n) && n > 0 ? n : 5;
}
function userOverride(): string {
  return (process.env.LITTLE_CODER_USER ?? "").trim();
}

function safeVerify(cwd: string): string {
  try {
    const v = scanRepo(cwd).verifyCommand;
    return v && !v.startsWith("(") ? v : "your tests";
  } catch {
    return "your tests";
  }
}

// The mission from the most recent docs/agent-sessions export (cockpit writes
// these); session filenames are date-prefixed, so lexical sort ≈ chronological.
function readLastMission(cwd: string): string {
  try {
    const dir = join(cwd, "docs", "agent-sessions");
    if (!existsSync(dir)) return "";
    const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    if (files.length === 0) return "";
    const text = readFileSync(join(dir, files[files.length - 1]), "utf-8");
    const heading = text.split(/\r?\n/).find((l) => l.startsWith("# "));
    return heading ? heading.replace(/^#\s*/, "").trim().slice(0, 80) : "";
  } catch {
    return "";
  }
}

async function gatherSituation(pi: ExtensionAPI, cwd: string): Promise<Situation> {
  const run = (args: string[]) =>
    pi
      .exec("git", args, { cwd, timeout: 4000 })
      .then((r: any) => String(r.stdout ?? "").trim())
      .catch(() => "");

  const isGit = (await run(["rev-parse", "--is-inside-work-tree"])) === "true";
  let branch = "";
  let dirtyCount = 0;
  let ahead = 0;
  let behind = 0;
  let lastCommit = "";
  if (isGit) {
    branch = await run(["rev-parse", "--abbrev-ref", "HEAD"]);
    dirtyCount = countDirty(await run(["status", "--porcelain"]));
    const sb = (await run(["status", "-sb"])).split(/\r?\n/)[0] ?? "";
    const t = parseTracking(sb);
    ahead = t.ahead;
    behind = t.behind;
    lastCommit = await run(["log", "-1", "--format=%s"]);
  }
  const userName = userOverride() || firstName(await run(["config", "user.name"]));

  return {
    project: basename(cwd.replace(/[\\/]+$/, "")) || "this project",
    isGit,
    branch: branch === "HEAD" ? "" : branch,
    dirtyCount,
    ahead,
    behind,
    lastCommit,
    lastSessionMission: readLastMission(cwd),
    userName,
    verifyCommand: safeVerify(cwd),
    hour: new Date().getHours(),
  };
}

export default function (pi: ExtensionAPI) {
  if (!presenceEnabled()) return;

  let lastCtx: any = null;
  let prev: Situation | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let agentActiveSincePoll = false;
  let nudged = false;
  let lastSpoken = "";

  const remember = (ctx: any) => {
    if (ctx) lastCtx = ctx;
  };
  const notify = (ctx: any, message: string, type: "info" | "warning" | "error" = "info") => {
    try {
      ctx.ui.notify(message, type);
    } catch {
      // best-effort
    }
  };

  const tick = async () => {
    const ctx = lastCtx;
    if (!ctx || !ctx.hasUI) return;
    // Never interrupt mid-turn; a busy poll just means "the agent is working".
    if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
      agentActiveSincePoll = true;
      return;
    }
    let curr: Situation;
    try {
      curr = await gatherSituation(pi, ctx.cwd);
    } catch {
      return;
    }
    if (prev) {
      const change = detectChange(prev, curr, {
        agentActive: agentActiveSincePoll,
        nudgeThreshold: nudgeFiles(),
        nudged,
      });
      if (change) {
        const remark = watchRemark(change);
        if (remark !== lastSpoken) {
          notify(ctx, remark, change.kind === "unverified" || change.kind === "foreign" ? "warning" : "info");
          setAmbientNote(remark);
          lastSpoken = remark;
          if (change.kind === "unverified") nudged = true;
          if (change.kind === "clean") nudged = false; // re-arm for the next batch
        }
      }
    }
    prev = curr;
    agentActiveSincePoll = false;
  };

  const startWatcher = () => {
    if (!watchEnabled() || timer) return;
    timer = setInterval(() => {
      void tick();
    }, intervalMs());
    timer.unref?.(); // never keep the process alive on our account
  };
  const stopWatcher = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  pi.on("session_start", async (_event, ctx) => {
    remember(ctx);
    if (!ctx.hasUI) return; // print/RPC: stay silent
    const s = await gatherSituation(pi, ctx.cwd);
    prev = s;
    lastSpoken = "";
    nudged = false;
    notify(ctx, bootBriefing(s).join("\n"));
    startWatcher();
  });

  // Keep a live ctx for the timer, and learn when the agent (vs you) is editing.
  pi.on("tool_call", async (_event, ctx) => {
    remember(ctx);
    agentActiveSincePoll = true;
  });
  pi.on("turn_end", async (_event, ctx) => remember(ctx));
  pi.on("agent_end", async (_event, ctx) => remember(ctx));
  pi.on("input", async (_event, ctx) => {
    remember(ctx);
    setAmbientNote(null); // you're responding — drop the standing remark
    lastSpoken = "";
  });
  pi.on("session_shutdown", async () => stopWatcher());

  pi.registerCommand("brief", {
    description: "AXIOM re-briefs you on the current project state",
    handler: async (_args, ctx) => {
      remember(ctx);
      const s = await gatherSituation(pi, ctx.cwd);
      prev = s;
      notify(ctx, bootBriefing(s).join("\n"));
    },
  });

  pi.registerCommand("watch", {
    description: "Toggle AXIOM's proactive watcher (it speaks up when the repo changes)",
    handler: async (_args, ctx) => {
      remember(ctx);
      if (timer) {
        stopWatcher();
        setAmbientNote(null);
        notify(ctx, "AXIOM watch: off — I'll keep quiet until asked.");
      } else {
        // Reset the baseline so the first tick doesn't fire on pre-existing state.
        prev = await gatherSituation(pi, ctx.cwd);
        startWatcher();
        notify(ctx, "AXIOM watch: on — I'll flag changes as they happen.");
      }
    },
  });
}
