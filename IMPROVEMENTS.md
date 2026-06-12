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
- [ ] **Task-loop protocol card** - not yet added as a separate protocol card.
- [x] **INTENT_MAP additions** - `pest`, `pint`, `verify`, `laravel`, `tenancy`, and `billing`
  keywords route toward relevant tools.

## Phase 3 - Project Artifacts

- [x] **`scripts/arcova-map.mjs`** - generates `.arcova/MAP.md`, `.arcova/RULES.md`, and
  `.arcova/guards.json` in a Laravel repo.
- [ ] **Arcova target repo artifacts committed** - generated per Laravel checkout, not stored here.

## Phase 4 - Safe Mode & Model Setup

- [x] **`ARCOVA_SAFE_MODE=1` permission gate hardening** - narrows shell allow-list for Arcova work.
- [ ] **Model profile registration** - Devstral/Qwen model files are environment-specific.
- [ ] **Constrained decoding at serving layer** - still a serving configuration task.

## Phase 5 - Later / Nice-To-Have

- [ ] Curated Laravel Boost MCP subset with output trimming.
- [ ] Tree-sitter PHP repo map with PageRank if the convention map is insufficient.
- [ ] Fine-tune loop once `.arcova/trajectories/` has enough verified sessions.
- [ ] Full PowerShell-aware upstream bash whitelist polish.

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
