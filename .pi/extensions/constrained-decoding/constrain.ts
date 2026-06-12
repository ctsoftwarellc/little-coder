// Pure payload transforms for constrained tool-call decoding (build order #4).
//
// THE MECHANISM. The doc's framing — "a tool call physically cannot be
// malformed, because invalid tokens get zero probability" — is realized on
// llama.cpp through `tool_choice`, NOT `response_format`. When the request
// carries `tools` and a `tool_choice` (and the server runs with `--jinja`),
// llama.cpp builds a grammar from the chosen tool's JSON schema and constrains
// decoding to it, while still emitting a NATIVE `tool_calls` entry that pi
// parses normally. `response_format: json_schema` would instead force the whole
// output to be plain JSON text — valid, but no longer a tool call, so pi
// couldn't dispatch it. So tool_choice is the correct lever for tool calls;
// json_schema is reserved for forced structured-TEXT output (buildJsonSchema...).
//
// This makes output-parser a fallback rather than the primary path: malformed
// tool-call text stops being emitted at the source.
//
// pi's runner adopts only the RETURNED payload from before_provider_request
// (mutating in place is discarded between handlers), so every transform here is
// pure: it returns a new object and never mutates its input.

interface OpenAITool {
  type?: string;
  function?: { name?: string; parameters?: unknown };
}

function toolList(payload: any): OpenAITool[] {
  return Array.isArray(payload?.tools) ? (payload.tools as OpenAITool[]) : [];
}

/** Names of the tools advertised in an OpenAI-style chat-completions payload. */
export function toolNamesInPayload(payload: unknown): string[] {
  return toolList(payload)
    .map((t) => t?.function?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
}

/**
 * Constrain decoding to exactly `toolName`. Returns a new payload with
 * tool_choice pinned to that function and parallel tool calls disabled. If the
 * tool isn't advertised in the payload, returns the payload unchanged — pinning
 * to an absent tool would make llama.cpp error rather than constrain.
 */
export function forceToolChoice(payload: any, toolName: string): any {
  if (!payload || typeof payload !== "object") return payload;
  if (!toolNamesInPayload(payload).includes(toolName)) return payload;
  return {
    ...payload,
    tool_choice: { type: "function", function: { name: toolName } },
    parallel_tool_calls: false,
  };
}

/**
 * Require the model to call SOME tool this turn (tool_choice: "required"), but
 * let it pick which. No-op when the payload advertises no tools.
 */
export function requireAnyTool(payload: any): any {
  if (!payload || typeof payload !== "object") return payload;
  if (toolNamesInPayload(payload).length === 0) return payload;
  return { ...payload, tool_choice: "required" };
}

/**
 * Build a llama.cpp-compatible json_schema response_format for forced
 * structured-TEXT output (not a tool call). Provided for completeness — e.g. a
 * forced final-answer object — and documented as distinct from the tool path.
 */
export function buildJsonSchemaResponseFormat(name: string, schema: unknown): {
  type: "json_schema";
  json_schema: { name: string; strict: true; schema: unknown };
} {
  return { type: "json_schema", json_schema: { name, strict: true, schema } };
}

// Local providers whose servers honor tool_choice grammar constraints. Cloud
// providers are left untouched (they have their own, reliable tool-calling).
const DEFAULT_LOCAL_PROVIDERS = ["llamacpp", "lmstudio", "ollama"] as const;

export function isConstrainableProvider(provider: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const override = env.LITTLE_CODER_CONSTRAIN_PROVIDERS;
  const list = override
    ? override.split(",").map((s) => s.trim()).filter(Boolean)
    : (DEFAULT_LOCAL_PROVIDERS as readonly string[]);
  return list.includes(provider);
}
