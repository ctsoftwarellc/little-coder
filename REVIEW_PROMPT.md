# Independent Review: Local-Model Coding Harness for the Arcova Codebase

You are an independent technical reviewer. Another agent has proposed and partially started a
plan; your job is to **objectively validate or refute it**. You were not involved in producing it.
Do not defer to its conclusions — where you disagree, say so plainly and recommend the change.

## The goal (in the owner's words)

"I really want to use non-frontier models tuned for my codebase. Make a workflow that is
token-efficient and good enough to make a small model perform as well as frontier for THIS
specific codebase."

Constraints and context:
- The codebase is `C:\Users\Caleb\Herd\arcova_ai` — a large Laravel 12 + Inertia v2 + React 19
  multi-tenant SaaS (security operations platform). Strict Repository/Service/Controller and DDD
  (`app/Domains`, legacy `app/Core` + `app/Modules`). Strong Pest test suite, Pint, TypeScript.
  Tenancy/billing/auth are security-critical and have recurring-mistake history
  (see `.planning/codebase/SECURITY.md`, `CLAUDE.md`).
- Dev machine: Windows 11, PHP via Laravel Herd, Node 24, WSL2 available. Local model serving
  would be llama.cpp / LM Studio / Ollama class hardware (single consumer GPU).
- The owner already runs Claude Code with a mature skill/hook system (deterministic Pint/Pest/tsc
  gates). Small-model work is meant to complement that, not replace it.

## What was decided and built so far

1. **Decision: fork/extend [little-coder](https://github.com/itayinbarr/little-coder)** — a
   pi-based harness claiming large gains for small models (e.g. Qwen3.5-9B: 45.6% vs 19.1%
   matched-model baseline on Aider Polyglot) via scaffold adaptations (read-guard, write-guard,
   evidence compaction, skill injection, quality monitoring).
   Local clone: `C:\Users\Caleb\arcova-coder` (branch `arcova`).
2. **Plan: `C:\Users\Caleb\arcova-coder\IMPROVEMENTS.md`** — read it. Summary:
   - `arcova-context` ext: inject precomputed `.arcova/MAP.md` + `.arcova/RULES.md` into the
     system prompt, budget-capped.
   - `arcova-verify` ext: a `verify` tool running Pint + focused Pest, returning a ~2k-char
     **digest** of failures instead of raw output.
   - `arcova-tripwires` ext: deterministic blocks on guarded paths (billing/auth/tenancy,
     existing-migration edits) + a >5-distinct-files blast-radius stop, writing a HANDOFF.md
     for a frontier model.
   - `arcova-trajectory` ext: JSONL session logs tagged `verified` when checks pass, as a future
     LoRA fine-tuning dataset (SWE-smith-style, using Pest as the verifier).
   - Compact keyword-scored "recipe" knowledge cards (endpoint/migration/job/test/bugfix/tenancy).
   - A `scripts/arcova-map.mjs` convention-walker generating MAP.md.
   - Model choice: Devstral Small 2 (24B) primary; constrained decoding at the serving layer.
   - Deliberately deferred: MCP/Boost tool access, tree-sitter PageRank repo map, fine-tuning.

## Your review tasks

**Part A — independent baseline (do this BEFORE auditing the plan).** From your own knowledge and
research: if you were designing a setup so a ≤32B local model does useful, safe work on this
specific Laravel codebase, what would you build? List your top 5 design choices and the evidence
behind them.

**Part B — audit the plan against your baseline.** For each major element (base harness choice,
the four extensions, recipe cards, map generator, model choice, fine-tune-later strategy):
- Verdict: agree / agree-with-changes / disagree, with reasoning.
- Specifically scrutinize:
  1. Is forking little-coder better than the alternatives (plain pi + own package, OpenHands +
     Devstral, opencode, Aider with repo-map, Claude Code with a local proxy)? Are little-coder's
     benchmark claims credible and do they transfer from Python/Polyglot exercises to a large
     Laravel monolith? Check whether its extensions assume things that break on big repos.
  2. Token economics: injected MAP/RULES/workflow blocks are re-sent every request on top of
     skill/knowledge injections. With llama.cpp prefix caching, is this actually cheap, or does
     per-turn variation defeat the cache? Is a static MAP.md the right call vs dynamic retrieval?
  3. The `verify` digest: is compressing Pest output to ~2k chars enough signal for a small model
     to fix real failures in this codebase, or will it loop? Pest boot time per verify call?
  4. Tripwires: are the guarded paths and the 5-file blast radius well-calibrated for this repo's
     real change patterns (check typical PR file counts in `git log`), or will it constantly
     false-positive and make the tool useless?
  5. Trajectory logging → LoRA: is "a few hundred verified sessions" a realistic and sufficient
     dataset? Is this the right fine-tune target vs continued pretraining or no tuning at all?
  6. Windows/Herd practicality: spawn semantics for `php` via Herd shims, path handling, whether
     WSL2 would be strictly better.
  7. Security: the harness lets a local model run shell commands and edit a billing codebase —
     is the permission/whitelist story adequate? Anything in the plan that *increases* risk?

**Part C — what's missing.** Name the highest-leverage things the plan omits entirely, and any
element you'd cut as not worth its complexity.

## Ground rules

- Inspect the actual code: the clone at `C:\Users\Caleb\arcova-coder` (upstream extensions under
  `.pi/extensions/`, skills under `skills/`, launcher `bin/little-coder.mjs`) and the target repo
  at `C:\Users\Caleb\Herd\arcova_ai`. Do not take IMPROVEMENTS.md's claims about either on faith.
- Web research is encouraged for benchmark credibility, alternative harnesses, and fine-tuning
  evidence. Cite sources.
- Read-only review: do not modify either repository.
- Output: (1) executive verdict — adopt / adopt-with-changes / rethink, in one paragraph;
  (2) findings table with severity (blocker / major / minor) and concrete recommended action each;
  (3) your Part A baseline design for comparison; (4) sources.
- Be specific. "Seems reasonable" is not a finding. If you can't verify a claim, say what you'd
  need to verify it.
