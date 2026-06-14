// AXIOM's voice. Pure persona — turns a Situation snapshot into a spoken-style
// briefing, and a detected Change into a one-line remark. Kept separate from the
// git/exec plumbing (index.ts) and the change-detection logic (situation.ts) so
// the character is unit-testable and lives in exactly one place. The persona:
// concise, capable, lightly formal, addresses you by name, and offers a next
// move rather than just reporting.

export interface Situation {
  project: string;
  isGit: boolean;
  branch: string;
  dirtyCount: number;
  ahead: number;
  behind: number;
  lastCommit: string;
  lastSessionMission: string;
  userName: string;
  verifyCommand: string;
  hour: number; // 0–23, local
}

export type Change =
  | { kind: "branch"; branch: string }
  | { kind: "commit"; subject: string }
  | { kind: "clean" }
  | { kind: "unverified"; count: number; verify: string }
  | { kind: "foreign"; count: number };

export function timeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  if (hour >= 18 && hour < 24) return "Good evening";
  return "Burning the midnight oil"; // 0–4
}

function address(greeting: string, name: string): string {
  return name ? `${greeting}, ${name}.` : `${greeting}.`;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

function trackingPhrase(ahead: number, behind: number): string {
  if (ahead && behind) return `↑${ahead} ahead, ↓${behind} behind origin.`;
  if (ahead) return `↑${ahead} ahead of origin.`;
  if (behind) return `↓${behind} behind origin.`;
  return "";
}

/** The launch situation report — AXIOM greeting you with where things stand. */
export function bootBriefing(s: Situation): string[] {
  const lines: string[] = [`AXIOM online. ${address(timeGreeting(s.hour), s.userName)}`, ""];

  if (!s.isGit) {
    lines.push(`  ${s.project} — no git here, fresh ground.`);
  } else {
    lines.push(`  ${s.project} · ${s.branch || "(detached HEAD)"}`);
    lines.push(
      `  Working tree: ${s.dirtyCount > 0 ? `${s.dirtyCount} uncommitted ${plural(s.dirtyCount, "file")}.` : "clean."}`,
    );
    const sync = trackingPhrase(s.ahead, s.behind);
    if (sync) lines.push(`  ${sync}`);
    if (s.lastCommit) lines.push(`  Last commit: "${s.lastCommit}".`);
  }

  if (s.lastSessionMission) lines.push(`  Last session: "${s.lastSessionMission}".`);

  lines.push("");
  lines.push(`  Standing by. ${s.dirtyCount > 0 ? "Pick up where we left off, or something new?" : "What are we building?"}`);
  return lines;
}

/** A single proactive remark for an observed change, in AXIOM's voice. */
export function watchRemark(c: Change): string {
  switch (c.kind) {
    case "branch":
      return `We're on ${c.branch} now.`;
    case "commit":
      return `Committed: "${c.subject}".`;
    case "clean":
      return "Working tree's clean again.";
    case "unverified":
      return `${c.count} ${plural(c.count, "file")} changed and no verify yet — shall I run \`${c.verify}\`?`;
    case "foreign":
      return `Spotted ${c.count} ${plural(c.count, "change")} I didn't make.`;
  }
}
