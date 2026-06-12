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

function hasExplicitModel(args) {
  return args.some((arg) => arg === "--model" || arg.startsWith("--model="));
}

function looksLikeModelId(value) {
  if (!value || value.startsWith("-") || /\s/.test(value)) return false;
  return value.includes("/") || value.endsWith(".gguf") || /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/.test(value);
}

export function normalizeModelArgs(args, env = process.env) {
  if (hasExplicitModel(args)) return args;

  const envModel = env.LITTLE_CODER_MODEL || env.LMSTUDIO_MODEL_ID;
  if (envModel) {
    const qualified = envModel.includes("/") && KNOWN_PROVIDERS.has(envModel.split("/")[0])
      ? envModel
      : `lmstudio/${envModel}`;
    return ["--model", qualified, ...args];
  }

  const [first, ...rest] = args;
  if (!looksLikeModelId(first)) return args;

  const provider = first.split("/")[0];
  const qualified = KNOWN_PROVIDERS.has(provider) ? first : `lmstudio/${first}`;
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
