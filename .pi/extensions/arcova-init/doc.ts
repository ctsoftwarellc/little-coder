// Renders the /init answers into .arcova/PROJECT.md. Pure and tested. Kept tight
// on purpose: the doc is injected verbatim into the stable prompt prefix (see
// arcova-context), and there's a real char budget — empty sections are omitted
// so a minimal init stays small, and free-text fields are bulletized so the
// model gets a scannable list rather than a wall of prose.

export interface ProjectInput {
  name: string;
  description: string;
  /** Free text, one item per line (or comma-separated). */
  stack: string;
  /** Pre-formatted "Top-level: …" / "Entry points: …" lines from the scan. */
  structure: string[];
  verifyCommand: string;
  guidelines: string;
  conventions: string;
  dangerZones: string;
  /** ISO date (YYYY-MM-DD); passed in so this module stays pure. */
  generatedAt: string;
}

/** Turn free text (newline- or comma-separated) into normalized "- bullet" lines. */
export function bulletize(text: string): string[] {
  return (text || "")
    .split(/\r?\n|,(?![^(]*\))/) // split on newlines or commas (not commas inside parens)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `- ${l.replace(/^[-*•]\s?/, "")}`);
}

function section(title: string, body: string[]): string[] {
  return body.length === 0 ? [] : [`## ${title}`, "", ...body, ""];
}

export function buildProjectDoc(input: ProjectInput): string {
  const out: string[] = [
    `# Project Context — ${input.name || "this project"}`,
    "",
    `<!-- Authored via /init on ${input.generatedAt}. Injected as Arcova Stable Context — keep it tight. -->`,
    "",
  ];

  if (input.description) out.push(input.description, "");

  out.push(...section("Stack", bulletize(input.stack)));
  out.push(...section("Structure", input.structure.filter(Boolean).map((s) => `- ${s}`)));
  if (input.verifyCommand && !input.verifyCommand.startsWith("(")) {
    out.push(...section("How to verify", ["```", input.verifyCommand, "```"]));
  }
  out.push(...section("Coding guidelines", bulletize(input.guidelines)));
  out.push(...section("Conventions", bulletize(input.conventions)));
  out.push(...section("Danger zones — do not touch without asking", bulletize(input.dangerZones)));

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
