import { describe, expect, it } from "vitest";
import { DEFAULT_NARRATOR_MODEL, narratorConfig, summarize } from "./mini-llm.ts";

describe("mini-llm narrator config", () => {
  it("defaults to gemma-4-e2b on the local Ollama endpoint", () => {
    const cfg = narratorConfig({} as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.model).toBe(DEFAULT_NARRATOR_MODEL);
    expect(cfg!.model).toBe("google/gemma-4-e2b");
    expect(cfg!.baseUrl).toContain("11434");
  });

  it("is disabled by LITTLE_CODER_NARRATOR=0", () => {
    expect(narratorConfig({ LITTLE_CODER_NARRATOR: "0" } as any)).toBeNull();
  });

  it("honors model / base-url / timeout overrides", () => {
    const cfg = narratorConfig({
      LITTLE_CODER_NARRATOR_MODEL: "qwen2.5:0.5b",
      LITTLE_CODER_NARRATOR_BASE_URL: "http://127.0.0.1:1234/v1",
      LITTLE_CODER_NARRATOR_TIMEOUT_MS: "3000",
    } as any);
    expect(cfg!.model).toBe("qwen2.5:0.5b");
    expect(cfg!.baseUrl).toBe("http://127.0.0.1:1234/v1");
    expect(cfg!.timeoutMs).toBe(3000);
  });
});

describe("mini-llm summarize", () => {
  const cfg = { baseUrl: "http://x/v1", model: "google/gemma-4-e2b", apiKey: "noop", timeoutMs: 1000 };

  it("returns a one-line summary from the model response", async () => {
    const fakeFetch = async (_url: string, _init: any) => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "  3 tests failed in AuthTest.\n" } }] }),
    });
    const out = await summarize("...big log...", "Verifying", cfg, fakeFetch as any);
    expect(out).toBe("3 tests failed in AuthTest.");
  });

  it("returns null on a non-OK response (degrades to fallback verdict)", async () => {
    const fakeFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    expect(await summarize("x", "ctx", cfg, fakeFetch as any)).toBeNull();
  });

  it("returns null when the model errors / connection refused", async () => {
    const fakeFetch = async () => {
      throw new Error("ECONNREFUSED");
    };
    expect(await summarize("x", "ctx", cfg, fakeFetch as any)).toBeNull();
  });

  it("sends the configured model and tails very long output", async () => {
    let captured: any = null;
    const fakeFetch = async (_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
    };
    const huge = "A".repeat(10000);
    await summarize(huge, "Running", cfg, fakeFetch as any);
    expect(captured.model).toBe("google/gemma-4-e2b");
    expect(captured.messages[1].content.length).toBeLessThan(7000); // tailed to last 6000
  });
});
