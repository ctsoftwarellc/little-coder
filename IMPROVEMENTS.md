# Arcova Coder - Improvement Checklist

Fork of [little-coder](https://github.com/itayinbarr/little-coder) (Apache 2.0) adapted for the
Arcova Laravel codebase. Keep upstream divergence small: Arcova behavior lives in isolated
`.pi/extensions/arcova-*` modules, short knowledge cards, and `scripts/arcova-map.mjs`.

## Phase 0 - Implementation Status

This repo started as upstream little-coder plus Arcova planning docs. The Arcova harness pieces
below are implemented in this fork when their files exist in this repository. Generated
`.arcova/*` artifacts belong in the target Laravel repo and are produced by `scripts/arcova-map.mjs`.

## Phase 1 - Harness Extensions

- [x] **`arcova-context` extension** - injects `.arcova/MAP.md` and `.arcova/RULES.md` for Laravel
  repos, capped by `ARCOVA_CONTEXT_CHAR_BUDGET`.
- [x] **`arcova-verify` extension** - registers `Verify`, resolves Herd PHP or `ARCOVA_PHP`, runs
  focused Pest/type checks, and stores raw logs under `.arcova/verify-logs/`.
- [x] **`arcova-tripwires` extension** - blocks sensitive edits and large blast radius changes,
  writing `.arcova/HANDOFF.md` on hard stops.
- [x] **`arcova-trajectory` extension** - writes sanitized JSONL session records under
  `.arcova/trajectories/`.

## Phase 2 - Knowledge & Skills

- [x] **Laravel recipe knowledge cards** - endpoint, Pest test, tenancy, queued job, and migration
  cards in `skills/knowledge/`.
- [x] **`Verify` tool skill card** - `skills/tools/verify.md`.
- [x] **Task-loop protocol card** - `skills/protocols/arcova_task_loop.md` provides the
  keyword-triggered Arcova eval/task entry point.
- [x] **INTENT_MAP additions** - `pest`, `pint`, `verify`, `laravel`, `tenancy`, and `billing`
  keywords route toward relevant tools.

## Phase 3 - Project Artifacts

- [x] **`scripts/arcova-map.mjs`** - generates `.arcova/MAP.md`, `.arcova/RULES.md`, and
  `.arcova/guards.json` in a Laravel repo.
- [x] **Arcova target repo artifacts generated** - current target checkout has `.arcova/MAP.md`,
  `.arcova/RULES.md`, and `.arcova/guards.json`.

## Phase 4 - Safe Mode & Model Setup

- [x] **`ARCOVA_SAFE_MODE=1` permission gate hardening** - narrows shell allow-list for Arcova work.
- [x] **Model profile registration** - `lmstudio/qwen/qwen3.5-9b` has a tuned profile and
  `LMSTUDIO_MODEL_ID` registration support.
- [x] **Constrained decoding at serving layer** - documented LM Studio structured/tool-call setup in
  `docs/arcova-lmstudio.md`.

## Phase 5 - Later / Nice-To-Have

- [x] Curated Laravel Boost-style subset with output trimming - `arcova-boost` registers
  read-only `ArcovaListRoutes`, `ArcovaDatabaseSchema`, and `ArcovaSearchDocs` tools.
- [x] PHP repo map with PageRank - `scripts/arcova-rank-map.mjs` generates
  `.arcova/RANKED_MAP.md` from a dependency-free PHP symbol/reference graph.
- [x] Fine-tune export loop - `scripts/arcova-export-trajectories.mjs` converts verified
  `.arcova/trajectories/` rows into SFT JSONL.
- [x] Full PowerShell-aware upstream bash whitelist polish for Arcova safe mode read/search commands.

## Usage

```powershell
$env:ARCOVA_SAFE_MODE = "1"
$env:ARCOVA_PHP = "C:\Users\Caleb\.config\herd\bin\php85\php.exe"
node C:\Users\Caleb\little-coder\scripts\arcova-map.mjs C:\path\to\laravel-repo
little-coder --model lmstudio/local-model
```

Run focused verification through the `Verify` tool. Use `format: true` only when Pint is intended
to modify files.

## Upstream Divergences

1. `.pi/extensions/skill-inject/index.ts` - INTENT_MAP entries for Arcova/Laravel keywords.
2. `.pi/extensions/permission-gate/index.ts` - optional `ARCOVA_SAFE_MODE=1` command whitelist.

Everything else is additive.
