const KNOWN_PROVIDERS = new Set([
  "anthropic",
  "copilot",
  "google",
  "llamacpp",
  "lmstudio",
  "ollama",
  "openai",
  "openrouter",
]);

const LMSTUDIO_ALIASES = new Map([
  ["gemma-4-12b-qat", "google/gemma-4-12b-qat"],
  ["google/gemma-4-12b-qat", "google/gemma-4-12b-qat"],
  ["qwopus3.6-27b-coder-mtp", "qwopus3.6-27b-coder-mtp"],
  ["qwen3.5-9b", "qwen/qwen3.5-9b"],
  ["qwen/qwen3.5-9b", "qwen/qwen3.5-9b"],
  ["qwen3.6-35b-a3b", "qwen/qwen3.6-35b-a3b"],
  ["qwen/qwen3.6-35b-a3b", "qwen/qwen3.6-35b-a3b"],
]);

function hasExplicitModel(args) {
  return args.some((arg) => arg === "--model" || arg.startsWith("--model="));
}

function looksLikeModelId(value) {
  if (!value || value.startsWith("-") || /\s/.test(value)) return false;
  return LMSTUDIO_ALIASES.has(value) || value.includes("/") || value.endsWith(".gguf") || /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/.test(value);
}

function qualifyModel(value) {
  if (LMSTUDIO_ALIASES.has(value)) return `lmstudio/${LMSTUDIO_ALIASES.get(value)}`;
  return value.includes("/") && KNOWN_PROVIDERS.has(value.split("/")[0])
    ? value
    : `lmstudio/${value}`;
}

export function normalizeModelArgs(args, env = process.env) {
  if (hasExplicitModel(args)) return args;

  const envModel = env.LITTLE_CODER_MODEL || env.LMSTUDIO_MODEL_ID;
  if (envModel) {
    return ["--model", qualifyModel(envModel), ...args];
  }

  const [first, ...rest] = args;
  if (!looksLikeModelId(first)) return args;

  const provider = first.split("/")[0];
  const qualified = KNOWN_PROVIDERS.has(provider) ? first : qualifyModel(first);
  return ["--model", qualified, ...rest];
}

export function modelFromArgs(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model" && typeof args[i + 1] === "string") return args[i + 1];
    if (arg.startsWith("--model=")) return arg.slice("--model=".length);
  }
  return undefined;
}
