import { describe, expect, it } from "vitest";
import { normalizeModelArgs } from "./model-args.mjs";

describe("normalizeModelArgs", () => {
  it("keeps explicit --model unchanged", () => {
    expect(normalizeModelArgs(["--model", "ollama/qwen3.5"], { LMSTUDIO_MODEL_ID: "qwen/qwen3.5-9b" })).toEqual(["--model", "ollama/qwen3.5"]);
  });

  it("uses LMSTUDIO_MODEL_ID as a default lmstudio model", () => {
    expect(normalizeModelArgs([], { LMSTUDIO_MODEL_ID: "qwen/qwen3.5-9b" })).toEqual(["--model", "lmstudio/qwen/qwen3.5-9b"]);
  });

  it("treats an unqualified positional model id as lmstudio", () => {
    expect(normalizeModelArgs(["qwen/qwen3.5-9b"], {})).toEqual(["--model", "lmstudio/qwen/qwen3.5-9b"]);
  });

  it("keeps qualified positional model ids", () => {
    expect(normalizeModelArgs(["ollama/qwen3.5"], {})).toEqual(["--model", "ollama/qwen3.5"]);
  });

  it("does not rewrite normal prompts", () => {
    expect(normalizeModelArgs(["What does this app do?"], {})).toEqual(["What does this app do?"]);
  });
});
