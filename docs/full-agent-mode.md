# Full Agent Mode — what we added and why it helps

This document covers the harness upgrades layered on top of little-coder to make a
small local model (the headline target: `qwen/qwen3.6-35b-a3b` on a laptop) behave
more like a capable, legible agent. It's the "how to run it and what each piece
does" companion to the design rationale in
[`harness-design-notes.md`](./harness-design-notes.md).

Everything here ships as independent pi extensions under `.pi/extensions/` and is
auto-discovered at launch. Behavior-changing pieces are **opt-in via env flags** so
the benchmarked defaults are unchanged until you turn them on; cosmetic/safe pieces
are on by default.

---

## TL;DR — run it

Put your config in a git-ignored `.env` at the repo root (copy `.env.example`), then:

```powershell
node scripts\arcova-map.mjs C:\path\to\laravel-repo   # Arcova mode only
node bin\little-coder.mjs                              # model comes from .env
```

The launcher loads `.env` before resolving the model, so `LMSTUDIO_MODEL_ID` (or
`LITTLE_CODER_MODEL`) doubles as the default model and you can launch with no args.
A real shell env var overrides `.env` for a single run.

---

## The two halves

1. **Capability/economics** — nine harness mechanisms (build order in
   `harness-design-notes.md`) that make a small model faster, more focused, and
   less error-prone.
2. **UX** — a live "narrator" that turns invisible harness state into a running,
   human-readable account of what the agent is doing.

---

## Part 1 — the nine harness mechanisms

| # | Extension | What it does | Default | How it helps a small model |
|---|---|---|---|---|
| 1 | `harness-timings` | Per-turn line: `⏱ 5.2s · 237 tok/s · prefill 1200 · cached 1100 (92%) · out 340` | **on** (`LITTLE_CODER_TIMINGS=0` off) | Makes cache/speed visible — you can *see* when a change murders the KV cache. The measurement tool for everything else. |
| 2 | `tail-cards` (+ skill/knowledge inject) | Freezes the system prompt; moves per-task hint cards to an appended `<system-reminder>` at the message tail | opt-in `LITTLE_CODER_FROZEN_PREFIX=1` | A change at token 0 forces llama.cpp to re-prefill the whole conversation. Tail delivery keeps the expensive prefix cached → big speedup. |
| 3 | (thinking-budget interaction) | Ensures a thinking-budget restart doesn't rebuild token 0 | automatic with #2 | A "stop overthinking" restart used to cost a full re-prefill; with frozen prefix it's nearly free. Guarded by `prefix-stability.test.ts`. |
| 4 | `constrained-decoding` | Pins llama.cpp `tool_choice` so a forced tool call can't be malformed (native call, still parsed) | passive; engages on `LITTLE_CODER_FORCE_TOOL` or a phase-forced tool; local providers only | Removes an entire failure-and-recovery loop where small models emit broken tool-call JSON. |
| 5 | `ambient-verify` | After every Edit/Write to a `.php` file, runs `php -l` and appends `syntax OK` / the error | **on** for `.php` (`LITTLE_CODER_AMBIENT_PHP_LINT=0` off) | Verification is ambient — the model never forgets to check. Syntax errors surface one turn later, not five. |
| 6 | `phase-gating` | State machine (explore→edit→verify) drives the allowed-tools set | opt-in `LITTLE_CODER_PHASE_GATING=1` | Fewer visible tools = fewer wrong-tool calls. Narrows the surface to what the current step needs. **Don't combine with a benchmark allow-list.** |
| 7 | `plan-anchor` | A `Plan` tool the model declares steps with; harness re-shows `Plan: 5 steps. Done: 1,2. Current: 3 …` each turn | opt-in `LITTLE_CODER_PLAN_ANCHOR=1` | Fights the #1 small-model failure — drifting off-task. Moves "remember the plan" from model to harness. |
| 8 | `fuzzy-edit` | When an exact Edit would fail on whitespace, finds the *unique* match, snaps to real file text, echoes the diff | **on** (`LITTLE_CODER_FUZZY_EDIT=0` off) | Recovers failed edits that small models botch on indentation/whitespace. Only acts on an unambiguous match. |
| 9 | `bash-path-guard` | Blocks Bash calls that mix raw Windows `C:\...\php.exe` paths or PowerShell cmdlets like `Select-String` into a Bash shell | **on** | Stops a common Arcova/Windows failure loop before execution and tells the model to use Verify or a Bash-compatible `/c/Users/...` path. |
| 10 | `scripts/arcova-mine-trajectories.mjs` | Mines `.arcova/trajectories/*.jsonl` for per-model failure signatures and recommends profile toggles | manual script | Turns the other mechanisms from hand-tuned into self-tuning ("fails Edit 31% → enable fuzzy edit"). |

### How they compound
- **Speed:** #1 measures; #2 + #3 + #4 cut re-prefill and recovery loops.
- **Focus:** #6 + #7 keep a forgetful model on-task and pointed at the right tool.
- **Correctness:** #4 + #5 + #8 kill the small mistakes (bad JSON, syntax slips, whitespace) that waste turns.
- **Adaptation:** #9 closes the loop per model.

---

## Part 2 — the narrator (UX)

Instead of a bare spinner, a widget above the editor narrates the work, and pi's
own working-message line is driven with the current activity. Three tiers:

| Tier | What | Cost | Toggle |
|---|---|---|---|
| 0 | Deterministic phrase per tool call (`📖 Reading…`, `🧪 Verifying…`) + a status header (`🔍 explore · ▶ 2/5 · cache 92% · 237 tok/s`) | free | `LITTLE_CODER_NARRATOR_UI=0` to disable widget |
| 1 | Live tail of streaming tool output (Verify forwards stdout via `onUpdate`) | free | — |
| 2 | A **separate tiny model** (`google/gemma-4-e2b`) condenses big/opaque output (failed test logs, traces) into one sentence | runs in tool-execution idle time | `LITTLE_CODER_NARRATOR=0` to disable Tier 2 |

**Tier 2 is not continuous narration.** Tier 0/1 (free) do the constant
narration; gemma only fires on output >12 lines or >800 chars. It runs in the dead
time while a tool executes, so it doesn't compete with the coder for VRAM. Failures
(unreachable / timeout) silently fall back to the deterministic verdict.

The status header reads from a shared registry (`_shared/agent-status.ts`) that
phase-gating (#6), plan-anchor (#7), and harness-timings (#1) publish to.

---

## `/init` — teach the agent about your repo

`/init` (extension `arcova-init`) scans the repo to pre-fill a short interview —
project name, stack, verify command, coding guidelines, conventions, danger
zones — then writes **`.arcova/PROJECT.md`**. The `arcova-context` extension
injects that file into the **stable, KV-cached prompt prefix** on the next
message, so you pay the prefill once, not every turn.

- **Write target matters.** The launcher runs pi with `--no-context-files`
  (`bin/little-coder.mjs`), so a repo's `AGENTS.md` / `CLAUDE.md` are
  intentionally ignored — the bundled persona wins. `.arcova/PROJECT.md` is the
  one sink that actually reaches the model. `/init` writes there.
- **Any repo, not just Laravel.** `arcova-context` injects whatever exists of
  `PROJECT.md` (human, from `/init`) → `MAP.md` → `RULES.md` (both generated by
  `scripts/arcova-map.mjs`). On a Laravel repo, `/init` offers to run the map
  generator too.
- **`/init quick`** skips the questions and writes straight from the scan plus
  smart seeds (e.g. "Follow the existing ESLint + Prettier config").
- Keep it tight: the block is bounded by `ARCOVA_CONTEXT_CHAR_BUDGET`
  (default 12k chars) and truncates — concise rules beat a pasted style guide.

---

## AXIOM presence — it greets you and watches

The `presence` extension turns the agent from a tool you operate into something
that's *there*. Two halves, both speaking through one persona (`voice.ts`):

- **Boot briefing.** On `session_start` AXIOM greets you by name (git `user.name`
  or `LITTLE_CODER_USER`) with a situation report — branch, uncommitted files,
  ahead/behind, last commit, and the mission from your last
  `docs/agent-sessions` export. You walk in and you're *briefed* instead of
  staring at a blank prompt.
- **Proactive watcher.** A poll loop (default 30 s, idle-only) compares git
  snapshots and speaks up — unprompted — when something changes: a branch
  switch, a new commit, the tree going clean, changes that appeared while it was
  idle ("changes I didn't make"), or crossing the unverified-file threshold
  ("6 files changed and no verify yet — shall I run `…`?"). Remarks surface via
  `ctx.ui.notify` **and** the cockpit banner (shared `agent-status` ambient note).

Commands: `/brief` re-runs the briefing; `/watch` toggles the watcher. Interactive
only — it stays silent in print/RPC. All speech is best-effort and decoupled from
the agent loop, so it never blocks a turn.

---

## A fix worth noting: skill cards now actually load

The shipped `skills/tools/*.md` cards use CRLF line endings, and the frontmatter
parser split on `\n` only — leaving a trailing `\r` that the value regex rejected,
so **most skill cards silently failed to load** (only the last frontmatter line
parsed). The parser now splits on either line ending, so tool-skill injection — a
load-bearing little-coder mechanism, and the content #2 moves to the tail —
actually carries content again.

---

## Environment variable reference

| Var | Purpose | Default |
|---|---|---|
| `LITTLE_CODER_TIMINGS` | `0` disables the per-turn timing line | on |
| `LITTLE_CODER_TIMINGS_LOG` | path to append per-turn JSONL stats (benchmarking) | unset |
| `LITTLE_CODER_FROZEN_PREFIX` | `1` moves skill/knowledge cards to the appended tail | off |
| `LITTLE_CODER_AMBIENT_PHP_LINT` | `0` disables post-edit `php -l` | on |
| `LITTLE_CODER_AMBIENT_PHP_LINT_TIMEOUT_MS` | lint timeout | 5000 |
| `LITTLE_CODER_PHASE_GATING` | `1` enables phase-scoped tool exposure | off |
| `LITTLE_CODER_PLAN_ANCHOR` | `1` registers the `Plan` tool + re-anchor reminder | off |
| `LITTLE_CODER_FUZZY_EDIT` | `0` disables fuzzy edit matching | on |
| `LITTLE_CODER_FORCE_TOOL` | `required` or a tool name → constrained decoding pins it | unset |
| `LITTLE_CODER_CONSTRAIN_PROVIDERS` | override which providers get tool_choice constraints | `llamacpp,lmstudio,ollama` |
| `LITTLE_CODER_NARRATOR_UI` | `0` disables the narrator widget | on |
| `LITTLE_CODER_NARRATOR` | `0` disables Tier-2 gemma summaries | on |
| `LITTLE_CODER_NARRATOR_MODEL` | Tier-2 model id | `google/gemma-4-e2b` |
| `LITTLE_CODER_NARRATOR_BASE_URL` | Tier-2 endpoint | `http://127.0.0.1:11434/v1` |
| `LITTLE_CODER_NARRATOR_API_KEY` | Tier-2 key (local servers ignore) | `noop` |
| `LITTLE_CODER_NARRATOR_TIMEOUT_MS` | Tier-2 call timeout | 8000 |
| `LITTLE_CODER_PRESENCE` | `0` disables the AXIOM presence extension (briefing + watcher) | on |
| `LITTLE_CODER_PRESENCE_WATCH` | `0` keeps the briefing but disables the proactive watcher | on |
| `LITTLE_CODER_PRESENCE_INTERVAL_MS` | watcher poll cadence (min 5000) | 30000 |
| `LITTLE_CODER_PRESENCE_NUDGE_FILES` | dirty-file count that triggers a "verify?" nudge | 5 |
| `LITTLE_CODER_USER` | how AXIOM addresses you (else git `user.name`) | unset |

---

## Benchmarking it later

See [`benchmarks/templates/`](../benchmarks/templates/) for ready-to-fill report
templates:

- `ab-comparison.md` — baseline vs. full-agent-mode on the same suite (pass rate **and** cache%/tok-s).
- `feature-ablation.md` — isolate each flag's individual contribution.
- `arcova-eval-report.md` — the per-model Arcova eval report.

The honest rule for measurement: the behavior-changing flags (#2, #4, #6, #7) make
runs **not** directly comparable to a no-flags baseline — so always capture a
baseline run with all flags off, then flip one lever at a time.
