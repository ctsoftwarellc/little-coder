import { describe, expect, it } from "vitest";
import { computeTimingStat, formatTimingLine, timingLogRecord } from "./format.ts";

describe("harness-timings format", () => {
  it("splits prefill from cached and computes tok/s", () => {
    const stat = computeTimingStat({ input: 1200, output: 340, cacheRead: 1100, cacheWrite: 0, totalTokens: 1540 }, 5000);
    expect(stat.prefill).toBe(100); // 1200 input - 1100 cached
    expect(stat.cached).toBe(1100);
    expect(stat.cachedFraction).toBeCloseTo(1100 / 1200, 5);
    expect(stat.output).toBe(340);
    expect(stat.tokensPerSecond).toBeCloseTo(68, 5); // 340 tok / 5s
  });

  it("clamps cacheRead that exceeds input so prefill never goes negative", () => {
    const stat = computeTimingStat({ input: 500, output: 10, cacheRead: 999, cacheWrite: 0, totalTokens: 510 }, 1000);
    expect(stat.cached).toBe(500);
    expect(stat.prefill).toBe(0);
    expect(stat.cachedFraction).toBe(1);
  });

  it("treats a zero / missing wall-clock and bad usage as zero, not NaN", () => {
    const stat = computeTimingStat(undefined, 0);
    expect(stat.tokensPerSecond).toBe(0);
    expect(stat.prefill).toBe(0);
    expect(stat.cached).toBe(0);
    expect(stat.cachedFraction).toBe(0);
    expect(Number.isNaN(stat.tokensPerSecond)).toBe(false);
  });

  it("renders a compact one-line stat, surfacing a cold cache as 0%", () => {
    const cold = computeTimingStat({ input: 4000, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 4050 }, 20000);
    const line = formatTimingLine(cold);
    expect(line).toContain("prefill 4000");
    expect(line).toContain("cached 0 (0%)");
    expect(line).toContain("out 50");
    expect(line).toMatch(/tok\/s/);
  });

  it("emits a parseable JSONL log record", () => {
    const stat = computeTimingStat({ input: 100, output: 20, cacheRead: 80, cacheWrite: 0, totalTokens: 120 }, 1000);
    const rec = JSON.parse(timingLogRecord("llamacpp/qwen3.6-35b-a3b", stat, "2026-06-12T00:00:00.000Z"));
    expect(rec.model).toBe("llamacpp/qwen3.6-35b-a3b");
    expect(rec.prefill_tokens).toBe(20);
    expect(rec.cached_tokens).toBe(80);
    expect(rec.output_tokens).toBe(20);
  });
});
