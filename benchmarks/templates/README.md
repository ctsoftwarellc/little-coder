# Benchmark templates

Fill-in-the-blank report templates for evaluating the full-agent-mode harness
upgrades (see [`docs/full-agent-mode.md`](../../docs/full-agent-mode.md)). Copy a
template, don't edit it in place, so it stays reusable.

| Template | Use it when |
|---|---|
| [`ab-comparison.md`](./ab-comparison.md) | Comparing **baseline** (all flags off) vs. **full agent mode** on the same suite — the headline "did it help?" measurement. |
| [`feature-ablation.md`](./feature-ablation.md) | Isolating **one flag's** contribution by flipping a single lever at a time. |
| [`arcova-eval-report.md`](./arcova-eval-report.md) | A single per-model Arcova task eval (the `current-model.md` report). |

## Ground rules (so the numbers mean something)

1. **One variable at a time.** The behavior-changing flags (`FROZEN_PREFIX`,
   `PHASE_GATING`, `PLAN_ANCHOR`, `FORCE_TOOL`) change what's measured. Always
   record a baseline with everything off, then flip one lever per run.
2. **Capture speed, not just accuracy.** Set `LITTLE_CODER_TIMINGS_LOG=run.jsonl`
   and aggregate `cached_fraction` + `tokens_per_second`. Many upgrades (#2/#3)
   move speed, not pass rate.
3. **Don't combine `PHASE_GATING` with a benchmark allow-list** — they both own
   `LITTLE_CODER_ALLOWED_TOOLS` and will fight. Test phase gating separately.
4. **Pilot first.** Run `--limit 30` before the full suite; a full Polyglot run is
   hours on laptop hardware.
5. **Pin the environment.** Record model id, quant, context window, server flags
   (`--jinja` etc.), VRAM, and commit SHA in every report — that's what makes a
   result reproducible.

## Aggregating a timings log

```powershell
# mean cached-fraction and tok/s across a run
Get-Content run.jsonl | ForEach-Object { $_ | ConvertFrom-Json } |
  Measure-Object -Property cached_fraction, tokens_per_second -Average
```
