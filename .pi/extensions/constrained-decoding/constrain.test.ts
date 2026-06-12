import { describe, expect, it } from "vitest";
import {
  buildJsonSchemaResponseFormat,
  forceToolChoice,
  isConstrainableProvider,
  requireAnyTool,
  toolNamesInPayload,
} from "./constrain.ts";

const payload = () => ({
  model: "qwen3.6-35b-a3b",
  messages: [{ role: "user", content: "hi" }],
  tools: [
    { type: "function", function: { name: "edit", parameters: { type: "object" } } },
    { type: "function", function: { name: "read", parameters: { type: "object" } } },
  ],
});

describe("constrained-decoding constrain", () => {
  it("lists advertised tool names", () => {
    expect(toolNamesInPayload(payload())).toEqual(["edit", "read"]);
    expect(toolNamesInPayload({})).toEqual([]);
  });

  it("pins tool_choice to a named tool and disables parallel calls", () => {
    const out = forceToolChoice(payload(), "edit");
    expect(out.tool_choice).toEqual({ type: "function", function: { name: "edit" } });
    expect(out.parallel_tool_calls).toBe(false);
  });

  it("does not mutate the input payload (pi adopts only the return value)", () => {
    const p = payload();
    const out = forceToolChoice(p, "edit");
    expect(p).not.toHaveProperty("tool_choice");
    expect(out).not.toBe(p);
  });

  it("passes through unchanged when the forced tool is not advertised", () => {
    const p = payload();
    expect(forceToolChoice(p, "ghostTool")).toBe(p);
  });

  it("requireAnyTool sets tool_choice required only when tools exist", () => {
    expect(requireAnyTool(payload()).tool_choice).toBe("required");
    const noTools = { messages: [] };
    expect(requireAnyTool(noTools)).toBe(noTools);
  });

  it("builds a strict json_schema response_format for structured-text mode", () => {
    const rf = buildJsonSchemaResponseFormat("answer", { type: "object" });
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.name).toBe("answer");
  });

  it("constrains only local providers by default", () => {
    expect(isConstrainableProvider("llamacpp", {} as NodeJS.ProcessEnv)).toBe(true);
    expect(isConstrainableProvider("lmstudio", {} as NodeJS.ProcessEnv)).toBe(true);
    expect(isConstrainableProvider("anthropic", {} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("honors a provider override list", () => {
    const env = { LITTLE_CODER_CONSTRAIN_PROVIDERS: "vllm,custom" } as any;
    expect(isConstrainableProvider("vllm", env)).toBe(true);
    expect(isConstrainableProvider("llamacpp", env)).toBe(false);
  });
});
