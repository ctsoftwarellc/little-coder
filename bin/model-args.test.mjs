import { describe, expect, it } from "vitest";
import { modelFromArgs, normalizeModelArgs } from "./model-args.mjs";

describe("normalizeModelArgs", () => {
  it("keeps explicit --model unchanged", () => {
    expect(normalizeModelArgs(["--model", "ollama/qwen3.5"], { LMSTUDIO_MODEL_ID: "qwen/qwen3.5-9b" })).toEqual(["--model", "ollama/qwen3.5"]);
  });

  it("maps explicit LM Studio aliases", () => {
    expect(normalizeModelArgs(["--model", "openai/gpt-oss-20b"], {})).toEqual(["--model", "lmstudio/openai/gpt-oss-20b"]);
    expect(normalizeModelArgs(["--model=gpt-oss-20b"], {})).toEqual(["--model=lmstudio/openai/gpt-oss-20b"]);
    expect(normalizeModelArgs(["--model", "nvidia/nemotron-3-nano-4b"], {})).toEqual(["--model", "lmstudio/nvidia/nemotron-3-nano-4b"]);
    expect(normalizeModelArgs(["--model", "google/gemma-4-e4b"], {})).toEqual(["--model", "lmstudio/google/gemma-4-e4b"]);
  });

  it("uses LMSTUDIO_MODEL_ID as a default lmstudio model", () => {
    expect(normalizeModelArgs([], { LMSTUDIO_MODEL_ID: "qwen/qwen3.5-9b" })).toEqual(["--model", "lmstudio/qwen/qwen3.5-9b"]);
  });

  it("treats an unqualified positional model id as lmstudio", () => {
    expect(normalizeModelArgs(["qwen/qwen3.5-9b"], {})).toEqual(["--model", "lmstudio/qwen/qwen3.5-9b"]);
  });

  it("maps bare LM Studio aliases to their registered model ids", () => {
    expect(normalizeModelArgs(["qwen3.6-35b-a3b"], {})).toEqual(["--model", "lmstudio/qwen/qwen3.6-35b-a3b"]);
    expect(normalizeModelArgs(["qwen3.5-9b"], {})).toEqual(["--model", "lmstudio/qwen/qwen3.5-9b"]);
    expect(normalizeModelArgs(["qwen3.5-9b-swe-mtp"], {})).toEqual(["--model", "lmstudio/qwen3.5-9b-swe-mtp"]);
    expect(normalizeModelArgs(["gemma-4-12b-qat"], {})).toEqual(["--model", "lmstudio/google/gemma-4-12b-qat"]);
    expect(normalizeModelArgs(["gemma-4-e4b"], {})).toEqual(["--model", "lmstudio/google/gemma-4-e4b"]);
    expect(normalizeModelArgs(["google/gemma-4-e4b"], {})).toEqual(["--model", "lmstudio/google/gemma-4-e4b"]);
    expect(normalizeModelArgs(["gpt-oss-20b-coding-distill"], {})).toEqual(["--model", "lmstudio/gpt-oss-20b-coding-distill"]);
    expect(normalizeModelArgs(["gpt-oss-20b"], {})).toEqual(["--model", "lmstudio/openai/gpt-oss-20b"]);
    expect(normalizeModelArgs(["openai/gpt-oss-20b"], {})).toEqual(["--model", "lmstudio/openai/gpt-oss-20b"]);
    expect(normalizeModelArgs(["nemotron-3-nano-4b"], {})).toEqual(["--model", "lmstudio/nvidia/nemotron-3-nano-4b"]);
    expect(normalizeModelArgs(["nvidia/nemotron-3-nano-4b"], {})).toEqual(["--model", "lmstudio/nvidia/nemotron-3-nano-4b"]);
  });

  it("keeps qualified positional model ids", () => {
    expect(normalizeModelArgs(["ollama/qwen3.5"], {})).toEqual(["--model", "ollama/qwen3.5"]);
  });

  it("does not rewrite normal prompts", () => {
    expect(normalizeModelArgs(["What does this app do?"], {})).toEqual(["What does this app do?"]);
  });

  it("extracts model from normalized args", () => {
    expect(modelFromArgs(["--model", "lmstudio/qwen/qwen3.5-9b"])).toBe("lmstudio/qwen/qwen3.5-9b");
    expect(modelFromArgs(["--model=ollama/qwen3.5"])).toBe("ollama/qwen3.5");
  });
});
