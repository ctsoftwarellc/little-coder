import { describe, expect, it } from "vitest";
import {
  definitionOnLine,
  formatGroundingLine,
  fqcnToRelPath,
  groundingHints,
  parsePhpDefinitions,
  parsePsr4,
  referencedClasses,
  suggestSimilar,
} from "./symbols.ts";

describe("definition matching", () => {
  it("classifies class/interface/trait/enum/function lines", () => {
    expect(definitionOnLine("final class Invoice extends Model", "Invoice")).toBe("class");
    expect(definitionOnLine("interface Payable", "Payable")).toBe("interface");
    expect(definitionOnLine("trait HasUuid", "HasUuid")).toBe("trait");
    expect(definitionOnLine("enum Status: string", "Status")).toBe("enum");
    expect(definitionOnLine("    public function settle(int $cents): void", "settle")).toBe("method");
    expect(definitionOnLine("    public function settle()", "charge")).toBeNull();
    expect(definitionOnLine("$invoice->settle();", "settle")).toBeNull(); // a call, not a def
  });

  it("extracts every definition with line numbers", () => {
    const src = ["<?php", "class Invoice {", "  public function settle() {}", "  private function audit() {}", "}"].join("\n");
    const defs = parsePhpDefinitions(src);
    expect(defs.find((d) => d.name === "Invoice")?.line).toBe(2);
    expect(defs.find((d) => d.name === "settle")?.kind).toBe("method");
    expect(defs.map((d) => d.name)).toContain("audit");
  });
});

describe("suggestSimilar", () => {
  it("suggests the closest candidate within budget", () => {
    expect(suggestSimilar("settle", ["charge", "settleInvoice", "settl", "void"])).toBe("settl");
    expect(suggestSimilar("markAsPaid", ["markPaid", "void"])).toBe("markPaid");
  });
  it("returns null when nothing is close", () => {
    expect(suggestSimilar("settle", ["createReport", "deleteUser"])).toBeNull();
  });
});

describe("PSR-4 mapping", () => {
  it("parses composer autoload and maps FQCN to file path", () => {
    const psr4 = parsePsr4(JSON.stringify({ autoload: { "psr-4": { "App\\": "app/", "Domain\\": "src/Domain" } } }));
    expect(fqcnToRelPath("App\\Billing\\Invoice", psr4)).toBe("app/Billing/Invoice.php");
    expect(fqcnToRelPath("Domain\\Money", psr4)).toBe("src/Domain/Money.php");
    expect(fqcnToRelPath("\\App\\Models\\User", psr4)).toBe("app/Models/User.php");
  });
  it("falls back to App\\ -> app/ on bad composer json", () => {
    expect(fqcnToRelPath("App\\Foo", parsePsr4("not json"))).toBe("app/Foo.php");
  });
  it("returns null for non-first-party namespaces", () => {
    expect(fqcnToRelPath("Illuminate\\Database\\Eloquent\\Model")).toBeNull();
  });
});

describe("referencedClasses", () => {
  const src = [
    "<?php",
    "namespace App\\Billing;",
    "use App\\Models\\Invoice;",
    "use App\\Services\\Charger as C;",
    "use Illuminate\\Support\\Str;",
    "class Manual {",
    "  public function run(): void {",
    "    $x = new \\App\\Support\\Money();",
    "    Invoice::query();",
    "    $klass = App\\Models\\User::class;",
    "  }",
    "}",
  ].join("\n");

  it("collects first-party refs from use + inline, ignoring vendor and own namespace", () => {
    const refs = referencedClasses(src);
    expect(refs).toContain("App\\Models\\Invoice");
    expect(refs).toContain("App\\Services\\Charger");
    expect(refs).toContain("App\\Support\\Money");
    expect(refs).toContain("App\\Models\\User"); // ::class tail stripped
    expect(refs).not.toContain("Illuminate\\Support\\Str"); // vendor ignored
    expect(refs.some((r) => r.startsWith("App\\Billing") && r === "App\\Billing")).toBe(false); // own ns not a class
  });
});

describe("groundingHints", () => {
  it("flags only missing first-party classes and offers a suggestion", () => {
    const refs = ["App\\Models\\Invoice", "App\\Models\\Invoce"]; // second is a typo
    const exists = (rel: string) => rel === "app/Models/Invoice.php";
    const siblings = (dir: string) => (dir === "app/Models" ? ["Invoice", "User"] : []);
    const hints = groundingHints(refs, exists, siblings);
    expect(hints).toHaveLength(1);
    expect(hints[0].fqcn).toBe("App\\Models\\Invoce");
    expect(hints[0].expectedPath).toBe("app/Models/Invoce.php");
    expect(hints[0].suggestion).toBe("Invoice");
    expect(formatGroundingLine(hints)).toContain("did you mean Invoice?");
  });

  it("is silent when all referenced classes resolve", () => {
    const hints = groundingHints(["App\\Models\\Invoice"], () => true, () => []);
    expect(hints).toHaveLength(0);
  });
});
