import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TripwireConfig {
  hardBlock: string[];
  softFileLimit: number;
  hardFileLimit: number;
  generated: string[];
}

export interface TripwireOptions {
  existingFiles?: Set<string>;
  allowLargeChange?: boolean;
  allowGenerated?: boolean;
  config?: Partial<TripwireConfig>;
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
  /(^|\/)Tenancy(\/|$)/i,
  /wayfinder/i,
];

const DEFAULT_CONFIG: TripwireConfig = {
  hardBlock: [],
  softFileLimit: 5,
  hardFileLimit: 12,
  generated: [],
};

function clean(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = clean(pattern);
  const tokenized = normalized.replaceAll("**", "__ARCOVA_GLOBSTAR__");
  const escaped = tokenized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("__ARCOVA_GLOBSTAR__", ".*")
    .replaceAll("*", "[^/]*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

function normalizeConfig(config?: Partial<TripwireConfig>): TripwireConfig {
  return {
    hardBlock: Array.isArray(config?.hardBlock) ? config.hardBlock : DEFAULT_CONFIG.hardBlock,
    softFileLimit: typeof config?.softFileLimit === "number" ? config.softFileLimit : DEFAULT_CONFIG.softFileLimit,
    hardFileLimit: typeof config?.hardFileLimit === "number" ? config.hardFileLimit : DEFAULT_CONFIG.hardFileLimit,
    generated: Array.isArray(config?.generated) ? config.generated : DEFAULT_CONFIG.generated,
  };
}

export function loadTripwireConfig(cwd: string): TripwireConfig {
  const path = join(cwd, ".arcova", "guards.json");
  if (!existsSync(path)) return DEFAULT_CONFIG;
  try {
    return normalizeConfig(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function evaluateTripwires(files: string[], options: TripwireOptions = {}): TripwireResult {
  const distinct = Array.from(new Set(files.map(clean)));
  const warnings: string[] = [];
  const reasons: string[] = [];
  const config = normalizeConfig(options.config);

  if (distinct.length > config.softFileLimit) warnings.push(`more than ${config.softFileLimit} distinct files touched`);
  if (distinct.length > config.hardFileLimit && !options.allowLargeChange && process.env.ARCOVA_ALLOW_LARGE_CHANGE !== "1") {
    reasons.push(`more than ${config.hardFileLimit} distinct files touched`);
  }

  for (const file of distinct) {
    if (/^database\/migrations\/.+\.php$/.test(file) && (options.existingFiles?.has(file) ?? existsSync(file))) {
      reasons.push(`existing migration edit blocked: ${file}`);
    }
    if (GUARDED_PATTERNS.some((pattern) => pattern.test(file)) || matchesAny(file, config.hardBlock)) {
      reasons.push(`guarded path touched: ${file}`);
    }
    if (!options.allowGenerated && process.env.ARCOVA_ALLOW_GENERATED_EDIT !== "1" && matchesAny(file, config.generated)) {
      reasons.push(`generated file edit blocked: ${file}`);
    }
  }

  return { block: reasons.length > 0, warnings, reasons };
}
