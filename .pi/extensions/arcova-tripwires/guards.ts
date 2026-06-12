import { existsSync } from "node:fs";

export interface TripwireOptions {
  existingFiles?: Set<string>;
  allowLargeChange?: boolean;
}

export interface TripwireResult {
  block: boolean;
  warnings: string[];
  reasons: string[];
}

const GUARDED_PATTERNS = [
  /^\.env(?:\.|$)/,
  /secret|credential/i,
  /(^|\/)(Auth|Session|Token)(\/|$)/i,
  /(^|\/)(Billing|Payment|Refund|Webhook)(\/|$)/i,
  /(^|\/)Tenancy(\/|$)/i,
  /wayfinder/i,
];

function clean(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function evaluateTripwires(files: string[], options: TripwireOptions = {}): TripwireResult {
  const distinct = Array.from(new Set(files.map(clean)));
  const warnings: string[] = [];
  const reasons: string[] = [];

  if (distinct.length > 5) warnings.push("more than 5 distinct files touched");
  if (distinct.length > 12 && !options.allowLargeChange && process.env.ARCOVA_ALLOW_LARGE_CHANGE !== "1") {
    reasons.push("more than 12 distinct files touched");
  }

  for (const file of distinct) {
    if (/^database\/migrations\/.+\.php$/.test(file) && (options.existingFiles?.has(file) ?? existsSync(file))) {
      reasons.push(`existing migration edit blocked: ${file}`);
    }
    if (GUARDED_PATTERNS.some((pattern) => pattern.test(file))) {
      reasons.push(`guarded path touched: ${file}`);
    }
  }

  return { block: reasons.length > 0, warnings, reasons };
}
