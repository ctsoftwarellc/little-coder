import { describe, expect, it } from "vitest";
import { trimText } from "./trim.ts";

describe("arcova boost trimming", () => {
  it("keeps short output unchanged", () => {
    expect(trimText("abc", 10)).toBe("abc");
  });

  it("trims long output with a marker", () => {
    const out = trimText("a".repeat(20), 10);
    expect(out).toBe("aaaaaaaaaa\n[trimmed to 10 chars]");
  });
});
