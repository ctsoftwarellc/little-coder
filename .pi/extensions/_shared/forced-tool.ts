// Shared "forced tool" signal: the cross-extension hint that the model's next
// provider request should be constrained to a specific tool call (or to "must
// call some tool"). Read by constrained-decoding (#4) to set tool_choice; set
// by the phase machine (#6, e.g. the edit phase forces an Edit) or by the
// LITTLE_CODER_FORCE_TOOL env for ad-hoc use.
//
// Kept in _shared (no index.ts) so it's a library, not a discovered extension.

export type ForcedTool =
  | { kind: "none" }
  | { kind: "required" } // must call SOME tool (tool_choice: "required")
  | { kind: "function"; name: string }; // must call exactly this tool

let forced: ForcedTool = { kind: "none" };

export function setForcedTool(next: ForcedTool): void {
  forced = next;
}

export function clearForcedTool(): void {
  forced = { kind: "none" };
}

/**
 * Current forced-tool signal. A programmatically-set value (from #6) wins; an
 * env value is the fallback so the constraint can be exercised without the
 * phase machine. LITTLE_CODER_FORCE_TOOL="required" → any tool; any other
 * non-empty value → that named tool.
 */
export function getForcedTool(env: NodeJS.ProcessEnv = process.env): ForcedTool {
  if (forced.kind !== "none") return forced;
  const raw = env.LITTLE_CODER_FORCE_TOOL?.trim();
  if (!raw) return { kind: "none" };
  if (raw.toLowerCase() === "required") return { kind: "required" };
  return { kind: "function", name: raw };
}
