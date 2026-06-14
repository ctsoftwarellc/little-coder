// Pure parsing + change-detection for the presence watcher. No I/O — index.ts
// runs the git commands and feeds the raw stdout here, so this stays trivially
// testable.

import type { Change, Situation } from "./voice.ts";

/** Count changed entries in `git status --porcelain` output. */
export function countDirty(porcelain: string): number {
  return porcelain.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}

/** Parse the `## …` header line from `git status -sb` for branch + ahead/behind. */
export function parseTracking(line: string): { branch: string; ahead: number; behind: number } {
  const out = { branch: "", ahead: 0, behind: 0 };
  const branch = line.match(/^##\s+([^\s.]+)/);
  if (branch) out.branch = branch[1];
  const ahead = line.match(/ahead (\d+)/);
  if (ahead) out.ahead = Number(ahead[1]);
  const behind = line.match(/behind (\d+)/);
  if (behind) out.behind = Number(behind[1]);
  return out;
}

/** First token of a `git config user.name`, for a personal address. */
export function firstName(gitUserName: string): string {
  return (gitUserName || "").trim().split(/\s+/)[0] ?? "";
}

export interface DetectOptions {
  /** Did the agent run any tool since the last poll? (distinguishes its edits from yours) */
  agentActive: boolean;
  /** Dirty-file count at which to nudge "you haven't verified". */
  nudgeThreshold: number;
  /** Have we already nudged for the current batch of changes? */
  nudged: boolean;
}

/**
 * Compare two situation snapshots and return the single most salient change to
 * speak about, or null if nothing is worth interrupting for. Priority: branch
 * switch → new commit → tree went clean → changes appeared while idle (yours) →
 * crossed the unverified threshold (mine). One remark per tick, by design.
 */
export function detectChange(prev: Situation, curr: Situation, opts: DetectOptions): Change | null {
  if (curr.branch && curr.branch !== prev.branch) return { kind: "branch", branch: curr.branch };
  if (curr.lastCommit && curr.lastCommit !== prev.lastCommit) return { kind: "commit", subject: curr.lastCommit };
  if (prev.dirtyCount > 0 && curr.dirtyCount === 0) return { kind: "clean" };
  if (curr.dirtyCount > prev.dirtyCount && !opts.agentActive) {
    return { kind: "foreign", count: curr.dirtyCount - prev.dirtyCount };
  }
  if (curr.dirtyCount >= opts.nudgeThreshold && prev.dirtyCount < opts.nudgeThreshold && !opts.nudged) {
    return { kind: "unverified", count: curr.dirtyCount, verify: curr.verifyCommand };
  }
  return null;
}
