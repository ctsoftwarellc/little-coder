// Pure helpers for the shell router.
//
// On Windows, pi's bash tool runs through a POSIX bash (Git Bash / MSYS:
// "/usr/bin/bash: line 1: ..."). In bash, backslashes are escape characters, so
// an UNQUOTED Windows path like
//     C:\Users\Caleb\.config\herd\bin\php84\php.exe
// arrives as
//     C:UsersCaleb.configherdbinphp84php.exe   → command not found
// (exactly the failure seen in the eval). The model usually recovers by quoting
// on a second attempt — but that's a wasted turn for a slow local model.
//
// MSYS bash happily runs a FORWARD-slash Windows path, and quoting protects
// spaces. So we rewrite unquoted drive-letter paths to a quoted, forward-slash
// form. We deliberately leave ALREADY-QUOTED paths alone (they work as-is) and
// only touch tokens that start with a drive letter AND contain a backslash, so
// ordinary bash escapes and POSIX paths are never disturbed.

export interface RouteResult {
  command: string;
  changed: boolean;
}

// A drive-letter path token outside quotes: C:\... or D:/... up to the next
// shell metacharacter or whitespace. We only rewrite it if it contains a "\".
const WIN_PATH = /^[A-Za-z]:[\\/][^\s"'`|&;<>()]*/;

export function normalizeWindowsPathsInBashCommand(command: string): RouteResult {
  let out = "";
  let changed = false;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; ) {
    const ch = command[i];

    if (inSingle) {
      out += ch;
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      out += ch;
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      out += ch;
      i++;
      continue;
    }

    // Outside quotes: is a drive-letter path starting at a token boundary? Only
    // match at start-of-command, after whitespace, or after `=` (VAR=C:\...), so
    // we never rewrite mid-token (e.g. a URL's "p://"). We rewrite only tokens
    // that contain a backslash — forward-slash paths already work in MSYS bash.
    const prev = out.length > 0 ? out[out.length - 1] : "";
    const atBoundary = prev === "" || /\s/.test(prev) || prev === "=";
    if (atBoundary) {
      const m = WIN_PATH.exec(command.slice(i));
      if (m && m[0].includes("\\")) {
        out += `"${m[0].replace(/\\/g, "/")}"`;
        i += m[0].length;
        changed = true;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return { command: out, changed };
}

/** The router only makes sense where bash is POSIX-on-Windows. */
export function shouldRoute(env: NodeJS.ProcessEnv = process.env, platform: string = process.platform): boolean {
  if (env.LITTLE_CODER_SHELL_ROUTER === "0") return false;
  return platform === "win32";
}
