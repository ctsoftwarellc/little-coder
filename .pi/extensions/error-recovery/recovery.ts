// Pure helpers for error-driven recovery hints.
//
// Small local models flail after a failure: they re-run the same broken command,
// or thrash randomly, because nothing tells them what the error MEANS or what to
// do next. This maps common PHP/Laravel/shell error signatures to one concrete
// next action — and crucially, points at THIS harness's own tools (FindSymbol,
// RelevantTests, ArcovaDatabaseSchema), so the model is steered toward the
// affordances it has instead of guessing.
//
// The hint is appended to a FAILED tool result (bash/Verify/test). It is advice,
// not a block — and it is deliberately scoped to RUNTIME/command failures, so it
// doesn't double up with the edit-time checks (php -l, phpstan, symbol-grounding)
// that already annotate edit results.

export interface RecoveryRule {
  /** Stable id (for tests / dedup). */
  id: string;
  /** Matches the combined error output. */
  test: RegExp;
  /** One-line, actionable next step. */
  hint: string;
}

// Ordered most-specific first; the first match wins.
export const RECOVERY_RULES: RecoveryRule[] = [
  {
    id: "target-class-missing",
    test: /Target class \[?([^\]\s]+)\]? does not exist/i,
    hint: "Laravel can't resolve that class from the container. Check the FQCN/namespace and that the file exists (FindSymbol <class>); a typo'd binding or wrong namespace is the usual cause — don't touch service providers unless your task allows it.",
  },
  {
    id: "class-not-found",
    test: /(?:Class|Interface|Trait|Enum)\s+["']?([\\A-Za-z0-9_]+)["']?\s+not found/i,
    hint: "That class isn't loadable. Confirm it exists and the name/namespace are exact with FindSymbol <name>; check the `use` import and PSR-4 path. If it's a new class, create the file rather than guessing the path.",
  },
  {
    id: "undefined-method",
    test: /Call to undefined method\s+([\\A-Za-z0-9_]+)::([A-Za-z0-9_]+)/i,
    hint: "That method doesn't exist on the class. Use FindSymbol <method> to find the real name/signature before calling it — don't invent methods.",
  },
  {
    id: "undefined-function",
    test: /Call to undefined function\s+([A-Za-z0-9_\\]+)/i,
    hint: "That function isn't defined or imported. FindSymbol <function> to locate it, or add the correct `use function`/helper import.",
  },
  {
    id: "db-missing-table",
    test: /SQLSTATE\[42S02\]|Base table or view not found|no such table/i,
    hint: "The table/view is missing — usually because a migration hasn't run, NOT a code bug. Inspect the real schema with ArcovaDatabaseSchema. Do not edit or add migrations unless your task explicitly allows it.",
  },
  {
    id: "db-unknown-column",
    test: /SQLSTATE\[42S22\]|Unknown column|no such column/i,
    hint: "You referenced a column that doesn't exist. Check the actual columns with ArcovaDatabaseSchema and fix the field name — don't change the migration.",
  },
  {
    id: "command-not-found",
    test: /(?:command not found|is not recognized as an internal or external command)/i,
    hint: "The executable wasn't found. On Windows, quote Windows paths and use forward slashes (\"C:/path/php.exe\"), or just use `php`/`composer` from PATH. Verify the binary exists before re-running.",
  },
  {
    id: "no-such-file",
    test: /No such file or directory|could not open input file/i,
    hint: "A path is wrong. List the directory (ls) and use a repo-relative path from cwd; check for a typo or a missing leading folder before re-running.",
  },
  {
    id: "phpunit-failures",
    test: /(?:FAILURES!|Tests:\s*\d+,\s*(?:Assertions:\s*\d+,\s*)?Failures:\s*[1-9])|✗|⨯/,
    hint: "Tests ran but assertions failed (this is signal, not a crash). Read the failing assertion + expected/actual, change the minimal code to satisfy it, then re-run JUST that test (RelevantTests to find the target).",
  },
  {
    id: "pest-no-tests",
    test: /No tests found|Unknown.*--filter|Cannot open file/i,
    hint: "The test target/filter didn't resolve. Use RelevantTests on your changed file to get an exact, runnable Verify target.",
  },
  {
    id: "syntax-fatal",
    test: /PHP Parse error|syntax error, unexpected|ParseError/i,
    hint: "There's a syntax error in the file you just touched. Re-read the line in the message and fix the bracket/semicolon/quote before doing anything else.",
  },
];

export interface RecoveryMatch {
  id: string;
  hint: string;
}

/** Only failed command/test executions get recovery hints. */
export function isRecoverableTool(toolName: string): boolean {
  const t = toolName.toLowerCase();
  return t === "bash" || t === "verify" || t.includes("test");
}

/** Match the first applicable recovery rule against the error output, or null. */
export function matchRecovery(text: string): RecoveryMatch | null {
  if (!text) return null;
  for (const rule of RECOVERY_RULES) {
    if (rule.test.test(text)) return { id: rule.id, hint: rule.hint };
  }
  return null;
}

export function formatRecoveryLine(match: RecoveryMatch): string {
  return `recovery hint: ${match.hint}`;
}
