# Harness Design Notes — "If This Were My Harness"

*Written by Claude (Fable 5) on 2026-06-12, after reading the README, `AGENTS.md`,
`.pi/settings.json`, and a mechanical audit of all 28 extensions in `.pi/extensions/`.
The framing: what Claude Code's harness actually does for the model inside it,
translated to a 9B–35B local model on laptop-class hardware.*

---

## First reaction

little-coder already independently discovered several things Claude Code does for its
model — the Write-refusal error that returns the exact Edit call-shape, quality-monitor's
steering corrections, evidence bridges across compaction. Those are the right instincts.

The remaining gaps fall into three buckets:

1. **The inference server is owned but not exploited** — constrained decoding, prefill
   forcing, cache introspection are all available and mostly unused.
2. **Context/cache economics are invisible** — per-turn system prompt reassembly is
   silently destroying llama.cpp's KV cache.
3. **The model holds state the harness should hold** — plans, verification discipline,
   and per-model tuning all currently depend on the model remembering to do things.

---

## The superpower: you own the inference server

Claude Code can only shape what goes *into* the model and react to what comes *out*.
A local harness controls the sampler itself. That changes what's worth building.

### 1. Constrained decoding instead of output repair

`output-parser` is ~400 lines of post-hoc JSON repair (trailing commas, unquoted keys,
Pythonic LFM2 calls), and it's lossy past its fifth repair step. llama.cpp accepts a
GBNF grammar or `json_schema` in `response_format` **per request** — a tool call
physically cannot be malformed, because invalid tokens get zero probability.

**Pattern to build:** free-text thinking phase, then when the model opens a tool call,
apply the schema grammar for that specific tool. `docs/arcova-lmstudio.md` already
mentions constrained output — promote it from an LM Studio note to the default path,
and demote output-parser to a fallback for servers that can't constrain.

For a small model this doesn't just fix errors — it removes an entire failure mode the
model would otherwise spend turns recovering from.

### 2. Prefill-forcing after corrections

When quality-monitor detects a loop or hallucinated tool, it sends a correction message
and *hopes*. Assistant-message prefill on llama.cpp lets the harness force the next
response to begin with a specific prefix — e.g. start it inside a `Read(` call toward
the file the correction names. Small models comply with momentum far more reliably than
with instructions.

### 3. Make cache economics visible, then protect them

**Biggest single finding in the codebase:** `skill-inject` rebuilds the system prompt on
every `before_agent_start` (`skill-inject/index.ts:258`), selected by
error > recency > intent — so the selection *changes* between runs. On llama.cpp, any
change at token 0 invalidates the entire KV cache, forcing a full re-prefill of the
whole conversation.

Worse: `thinking-budget`'s abort/restart cycle triggers a fresh `before_agent_start`
mid-task, so a thinking-budget breach likely costs a complete re-prefill on top of the
lost turn. On 8 GB VRAM, prefill is the dominant latency — this could be 30–60 seconds
per incident, invisibly.

**Claude Code's solution: frozen prefix + appended deltas.** The system prompt never
changes; everything dynamic (file-state changes, todo reminders, skill content) arrives
as `<system-reminder>` blocks appended at the *tail* of the message list.

Restructure skill/knowledge injection the same way:

- Static system prompt = `AGENTS.md` + Arcova map (arcova-context already orders itself
  first "for stable prompt caching" — same insight, finish the job).
- Per-turn skill cards delivered as appended tail messages, not system-prompt mutations.

**Measurement first:** llama.cpp returns `timings` (prefill tokens, cached tokens,
tok/s) in every response. Surface that as a one-line per-turn stat in the TUI. You'll
see exactly when a harness change murders the cache — the local-model equivalent of
Claude Code's `/context`.

---

## Context: the harness should hold the state so the model doesn't have to

The most valuable thing about a purpose-built harness isn't what it lets the model do —
it's what it stops the model from having to *remember*. Claude Code tracks which files
were read and edited, keeps the todo list, and reminds the model where it is. A 9B model
loses the plot ten times faster, so this matters ten times more.

### 4. Harness-owned plan with per-turn re-anchoring

Small models drift mid-task — they forget step 3 exists while doing step 2. Add a small
task-state extension: when a task has multiple steps, the **harness** holds the list and
appends a one-line tail reminder every turn:

> `Plan: 5 steps. Done: 1,2. Current: 3 — add the migration. Remaining: 4,5.`

Cheap tokens, appended (cache-friendly), and it converts "remember the plan" from a
model job into a harness job. `finalize-warn` and `turn-cap` are the embryo of this —
they manage the *end* of the budget; this manages the middle.

### 5. Phase-scoped tool exposure

Claude Code defers most tool schemas (loaded on demand) because schema bloat costs every
request. For a small model the cost is worse than tokens: every visible tool is a chance
to call the wrong one.

The enforcement layer already exists (`tool-gating`). Drive it with a simple state
machine:

| Phase | Tools exposed |
|---|---|
| explore | Read, Grep, Glob |
| edit | Edit, Write, Verify (+ Read) |
| verify/finalize | Verify, Bash (test commands) |

Deterministic transitions: first Edit attempt moves to edit phase; a tripwire sends you
back to explore. Fewer choices, smaller prompts, and browser/evidence schemas stop
taxing every coding request.

### 6. Ambient verification — don't make the model choose to verify

`arcova-verify` is exactly right but opt-in, and small models forget to opt in. Claude
Code uses hooks: after every Edit, a PostToolUse hook runs the cheapest possible check
automatically. For Arcova: `php -l` on the touched file (milliseconds), feed back one
line — `syntax OK` or the error. The model never decides whether to check; checking is
ambient, and a syntax error surfaces one turn after the edit instead of five turns later
inside a Pest failure. Likely ~30 lines of extension code.

### 7. Fuzzy Edit with a receipt

Exact-match Edit is a precision instrument — frontier models reproduce whitespace
reliably; small models demonstrably don't, and each failed Edit wastes a turn plus a
correction turn. Make Edit fuzzy-match above a high similarity threshold
(whitespace-normalized first, then indentation-flexible) and **echo the applied unified
diff back in the tool result** so the model sees exactly what changed.

Aider's data says edit-format fit is worth double-digit pass-rate points per model; this
is the same lever, inside the tool instead of the prompt.

---

## The loop nobody closes: let the harness learn the model

`arcova-trajectory` writes sanitized JSONL trajectories that are currently write-only.
That's the raw material for the most valuable thing available: **per-model failure
signatures**.

A nightly (or on-demand) script that mines trajectories for *this model's* habits:

- "qwen3.5-9b fails Edit on whitespace 31% of the time" → bump its edit skill card
  priority, or switch its edit dialect to fuzzy.
- "gemma never calls Verify unprompted" → enable ambient verification for that profile.
- "model X trips the thinking budget constantly" → lower its budget, raise its skill
  card injection rate.

…and writes the conclusions into that model's profile in `.pi/settings.json`.

This is what Claude Code's memory system does across sessions, and it's the Phase 2
thesis (scaffold–model fit) made **self-tuning instead of hand-tuned**. Trajectories are
already being exported for SFT experiments; this is the cheaper loop that pays off
before any fine-tune.

---

## Build order

The cache work first, because it's measurable and everything else compounds on it:

1. **Surface llama.cpp `timings` per turn in the TUI** — prefill vs cached tokens,
   tok/s. Proves its own value in the first session.
2. **Freeze the system prompt; move skill/knowledge cards to appended tail messages.**
3. **Confirm thinking-budget restarts no longer trigger a full re-prefill.**
4. Constrained decoding (grammar/json_schema) as the default tool-call path.
5. Ambient `php -l` post-Edit verification (~30 lines).
6. Phase-scoped tool exposure on top of tool-gating.
7. Harness-owned plan re-anchoring.
8. Fuzzy Edit with diff receipt.
9. Trajectory mining → self-tuning model profiles.

---

## Appendix: design rules worth stealing wholesale

- **Every error message must contain the next call to make.** The Write-refusal →
  Edit call-shape pattern, generalized to every tool. (`tool-gating`'s "tool X is not
  allowed" should say what to use instead.)
- **Never make the model re-derive state the harness already knows.** File read/edit
  tracking, plan position, what changed on disk — inject it, appended at the tail.
- **Stable prefix, appended deltas.** The cache rule, but also a cognition rule: a
  consistent system prompt is a consistent persona.
- **Verification is ambient, not optional.** Hooks after mutating tools.
- **Guardrails over capability removal.** Permission gates that explain themselves beat
  missing tools (the model invents missing tools; it respects explained refusals).
