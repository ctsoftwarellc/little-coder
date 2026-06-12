export interface VerifyDigest {
  text: string;
  failingTests: string[];
  firstAssertionDiff?: string;
  relevantLocation?: string;
}

export function digestVerifyOutput(raw: string, command: string, exitCode: number, elapsedMs: number): VerifyDigest {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const failingTests = lines
    .map((line) => line.match(/^\s*(?:\u2a2f|\u00d7|-)\s+(.+)$/)?.[1]?.trim())
    .filter((line): line is string => Boolean(line))
    .slice(0, 8);
  const diffStart = lines.findIndex((line) => /^[-+][^-+]/.test(line));
  const firstAssertionDiff = diffStart >= 0 ? lines.slice(diffStart, diffStart + 8).join("\n") : undefined;
  const relevantLocation = lines.map((line) => line.match(/\b(?:at\s+)?((?:tests|app|routes|resources)\/[^:\s]+:\d+)/)?.[1]).find(Boolean);
  const firstFailureIndex = lines.findIndex((line) => /FAIL|Failed asserting|^\s*(?:\u2a2f|\u00d7|-)\s+/.test(line));
  const excerpt = (firstFailureIndex >= 0 ? lines.slice(firstFailureIndex, firstFailureIndex + 40) : lines.slice(0, 40)).join("\n").trim();
  let text = [
    `command: ${command}`,
    `exit_code: ${exitCode}`,
    `elapsed_ms: ${elapsedMs}`,
    failingTests.length ? `failing_tests:\n${failingTests.map((name) => `- ${name}`).join("\n")}` : "failing_tests: []",
    firstAssertionDiff ? `first_assertion_diff:\n${firstAssertionDiff}` : "",
    relevantLocation ? `relevant_location: ${relevantLocation}` : "",
    "excerpt:",
    excerpt,
  ].filter(Boolean).join("\n");
  if (text.length > 4_000) text = text.slice(0, 3_980) + "\n[truncated]";
  return { text, failingTests, firstAssertionDiff, relevantLocation };
}
