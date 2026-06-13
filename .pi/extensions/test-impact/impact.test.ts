import { describe, expect, it } from "vitest";
import { isTestFile, rankTests, relevantTestsForFiles } from "./impact.ts";

const TESTS = [
  "tests/Feature/Billing/InvoiceTest.php",
  "tests/Feature/Billing/ManualPaymentTest.php",
  "tests/Unit/Billing/InvoiceRefundTest.php",
  "tests/Feature/Auth/LoginTest.php",
  "tests/Unit/Support/MoneyTest.php",
];

describe("rankTests", () => {
  it("ranks an exact-name test highest", () => {
    const ranked = rankTests("app/Billing/Invoice.php", TESTS);
    expect(ranked[0].path).toBe("tests/Feature/Billing/InvoiceTest.php");
    expect(ranked[0].reason).toContain("exact name match");
  });

  it("includes name-substring and path-overlap matches, ranked below exact", () => {
    const ranked = rankTests("app/Billing/Invoice.php", TESTS);
    const paths = ranked.map((m) => m.path);
    expect(paths).toContain("tests/Unit/Billing/InvoiceRefundTest.php"); // name substring + path overlap
    // The auth/support tests share neither name nor the Billing segment.
    expect(paths).not.toContain("tests/Feature/Auth/LoginTest.php");
    expect(paths).not.toContain("tests/Unit/Support/MoneyTest.php");
  });

  it("aligns mid-path segments across app/ and tests/Feature roots", () => {
    const ranked = rankTests("app/Billing/Tax/Calculator.php", [
      "tests/Feature/Billing/Tax/CalculatorTest.php",
      "tests/Feature/Billing/OtherTest.php",
    ]);
    expect(ranked[0].path).toBe("tests/Feature/Billing/Tax/CalculatorTest.php");
  });

  it("returns nothing for a file with no plausible test", () => {
    expect(rankTests("app/Models/Widget.php", TESTS)).toHaveLength(0);
  });
});

describe("isTestFile", () => {
  it("recognises *Test.php regardless of slashes", () => {
    expect(isTestFile("tests\\Feature\\FooTest.php")).toBe(true);
    expect(isTestFile("app/Foo.php")).toBe(false);
  });
});

describe("relevantTestsForFiles", () => {
  it("treats a changed test file as its own top target", () => {
    const matches = relevantTestsForFiles(["tests/Feature/Billing/InvoiceTest.php"], TESTS);
    expect(matches[0].path).toBe("tests/Feature/Billing/InvoiceTest.php");
    expect(matches[0].reason).toBe("changed test file");
  });

  it("dedupes across multiple changed files, keeping the strongest score", () => {
    const matches = relevantTestsForFiles(["app/Billing/Invoice.php", "app/Billing/Manual.php"], TESTS);
    const paths = matches.map((m) => m.path);
    expect(new Set(paths).size).toBe(paths.length); // no dupes
    expect(paths[0]).toBe("tests/Feature/Billing/InvoiceTest.php");
  });

  it("ignores non-php changed files", () => {
    expect(relevantTestsForFiles(["README.md", "config/app.php"], TESTS).every((m) => m.path.endsWith("Test.php"))).toBe(true);
  });
});
