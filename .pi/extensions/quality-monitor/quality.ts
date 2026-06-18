// Port of local/quality.py::assess_response + build_correction_message.

export interface ToolCall {
  name: string;
  input: unknown;
}

export type QualityResult =
  | { ok: true }
  | { ok: false; reason: string };

export const REPEATED_TOOL_CALL_MIN_CONSECUTIVE_TURNS = 3;

function toolCallSignature(tc: ToolCall): string {
  return `${tc.name}\0${JSON.stringify(tc.input)}`;
}

export function assessResponse(
  text: string,
  toolCalls: ToolCall[],
  recentToolCallTurns: ToolCall[][],
  knownTools: Set<string>,
): QualityResult {
  // 1. Empty response with no tool calls
  if (!text.trim() && toolCalls.length === 0) {
    return { ok: false, reason: "empty_response" };
  }

  // 2. Hallucinated tool names (only checked when registry populated)
  for (const tc of toolCalls) {
    if (!tc.name) return { ok: false, reason: "empty_tool_name" };
    if (knownTools.size > 0 && !knownTools.has(tc.name)) {
      return { ok: false, reason: `unknown_tool:${tc.name}` };
    }
  }

  // 3. Repeated tool call loop (exact name+input match across consecutive turns)
  const neededPreviousTurns = REPEATED_TOOL_CALL_MIN_CONSECUTIVE_TURNS - 1;
  if (toolCalls.length > 0 && recentToolCallTurns.length >= neededPreviousTurns) {
    for (const tc of toolCalls) {
      const signature = toolCallSignature(tc);
      const repeatedAcrossRecentTurns = recentToolCallTurns
        .slice(-neededPreviousTurns)
        .every((turn) => turn.some((prev) => toolCallSignature(prev) === signature));
      if (repeatedAcrossRecentTurns) {
        return { ok: false, reason: "repeated_tool_call" };
      }
    }
  }

  // 4. Malformed arguments sentinel from repairJson fallback
  for (const tc of toolCalls) {
    if (tc.input && typeof tc.input === "object" && "_raw" in tc.input) {
      return { ok: false, reason: `malformed_args:${tc.name || "?"}` };
    }
  }

  return { ok: true };
}

export function buildCorrectionMessage(reason: string): string {
  const corrections: Record<string, string> = {
    empty_response:
      "Your previous response was empty. Please respond with either " +
      "text or a tool call to make progress on the task.",
    empty_tool_name:
      "Your tool call had an empty name. Please specify a valid tool name. " +
      "Available tools include: Read, Write, Edit, Bash, Glob, Grep.",
    repeated_tool_call:
      "You made the exact same tool call several turns in a row. " +
      "Do not call that exact tool with those exact arguments again. " +
      "Use a different search term, inspect a relevant file or directory, " +
      "broaden the scope once, or stop and summarize the blocker.",
  };

  if (reason.startsWith("unknown_tool:")) {
    const toolName = reason.slice("unknown_tool:".length);
    return (
      `Tool '${toolName}' does not exist. ` +
      "Available tools are: Read, Write, Edit, Bash, Glob, Grep, " +
      "WebFetch, WebSearch. Please use one of these."
    );
  }
  if (reason.startsWith("malformed_args:")) {
    const toolName = reason.slice("malformed_args:".length);
    return (
      `The arguments for tool '${toolName}' were malformed (not valid JSON). ` +
      "Please provide the arguments as a proper JSON object."
    );
  }

  return corrections[reason] ?? `Issue detected: ${reason}. Please try again.`;
}

// Short, user-facing phrasing for the harness-intervention line (distinct from
// buildCorrectionMessage, which is the verbose text sent to the model).
export function phraseForUser(reason: string): string {
  if (reason.startsWith("unknown_tool:")) {
    return `the model called a tool that doesn't exist (${reason.slice("unknown_tool:".length)})`;
  }
  if (reason.startsWith("malformed_args:")) {
    return `the model's tool arguments were malformed (${reason.slice("malformed_args:".length)})`;
  }
  const phrases: Record<string, string> = {
    empty_response: "the model returned an empty response",
    empty_tool_name: "the model emitted a tool call with no name",
    repeated_tool_call: "the model repeated the same tool call several turns in a row",
  };
  return phrases[reason] ?? `quality issue (${reason})`;
}
