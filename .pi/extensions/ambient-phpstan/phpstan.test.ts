import { describe, expect, it } from "vitest";
import { analyseMode, parsePhpstanJson, shouldAnalyse } from "./phpstan.ts";

describe("shouldAnalyse", () => {
  it("runs only on successful .php edits/writes", () => {
    expect(shouldAnalyse("edit", "app/Foo.php", false)).toBe(true);
    expect(shouldAnalyse("write", "app/Foo.php", false)).toBe(true);
    expect(shouldAnalyse("edit", "app/Foo.php", true)).toBe(false); // edit itself failed
    expect(shouldAnalyse("edit", "README.md", false)).toBe(false);
    expect(shouldAnalyse("read", "app/Foo.php", false)).toBe(false);
  });
});

describe("analyseMode", () => {
  it("maps the env flag to a mode, defaulting to auto", () => {
    expect(analyseMode({} as NodeJS.ProcessEnv)).toBe("auto");
    expect(analyseMode({ LITTLE_CODER_AMBIENT_PHPSTAN: "0" } as any)).toBe("off");
    expect(analyseMode({ LITTLE_CODER_AMBIENT_PHPSTAN: "off" } as any)).toBe("off");
    expect(analyseMode({ LITTLE_CODER_AMBIENT_PHPSTAN: "1" } as any)).toBe("on");
    expect(analyseMode({ LITTLE_CODER_AMBIENT_PHPSTAN: "on" } as any)).toBe("on");
  });
});

describe("parsePhpstanJson", () => {
  it("reports clean when there are no messages", () => {
    const out = JSON.stringify({ totals: { errors: 0, file_errors: 0 }, files: {}, errors: [] });
    const r = parsePhpstanJson(out);
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it("extracts file messages with line numbers and renders a compact line", () => {
    const out = JSON.stringify({
      totals: { errors: 2, file_errors: 2 },
      files: {
        "app/Billing/Manual.php": {
          errors: 2,
          messages: [
            { message: "Call to an undefined method App\\Models\\Invoice::markAsPaid().", line: 42, ignorable: true },
            { message: "Parameter #1 $cents of method settle() expects int, string given.", line: 50, ignorable: true },
          ],
        },
      },
      errors: [],
    });
    const r = parsePhpstanJson(out);
    expect(r.ok).toBe(false);
    expect(r.findings).toHaveLength(2);
    expect(r.findings[0]).toEqual({ line: 42, message: "Call to an undefined method App\\Models\\Invoice::markAsPaid()." });
    expect(r.line).toContain("L42:");
    expect(r.line).toContain("undefined method");
  });

  it("caps rendered findings and notes the overflow", () => {
    const messages = Array.from({ length: 5 }, (_, i) => ({ message: `Error ${i}`, line: i + 1 }));
    const out = JSON.stringify({ files: { "x.php": { messages } }, errors: [] });
    const r = parsePhpstanJson(out, 2);
    expect(r.findings).toHaveLength(5);
    expect(r.line).toContain("(+3 more)");
  });

  it("recovers JSON embedded in noisy stdout", () => {
    const out = `Some deprecation warning printed first\n${JSON.stringify({ files: { "x.php": { messages: [{ message: "boom", line: 1 }] } }, errors: [] })}\ntrailing text`;
    const r = parsePhpstanJson(out);
    expect(r.ok).toBe(false);
    expect(r.findings[0].message).toBe("boom");
  });

  it("treats unparseable output as a skip, not a failure", () => {
    const r = parsePhpstanJson("Fatal error: could not run\n");
    expect(r.ok).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it("surfaces top-level config errors too", () => {
    const out = JSON.stringify({ files: {}, errors: ["Config parameter level not set."] });
    const r = parsePhpstanJson(out);
    expect(r.ok).toBe(false);
    expect(r.findings[0].message).toContain("level not set");
  });
});
