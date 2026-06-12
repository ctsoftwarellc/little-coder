<!-- Copy this file to benchmarks/results/<date>-<suite>-ab.md and fill it in. -->

# A/B: baseline vs. full agent mode

- **Date:** <YYYY-MM-DD>
- **Suite:** <Aider Polyglot | Terminal-Bench 2.0 | GAIA | Arcova eval>
- **Exercises / limit:** <e.g. 30-exercise pilot | full 225>
- **Model:** <provider/id> · quant <Q4_K_M> · context <128k>
- **Server:** <llama.cpp --jinja … | LM Studio …> · VRAM <8 GB>
- **little-coder commit:** <git SHA>

## Conditions

| Run | Flags set | Notes |
|---|---|---|
| A — baseline | *(all full-agent flags off)* | reference point |
| B — full agent | `FROZEN_PREFIX=1 PLAN_ANCHOR=1 FUZZY_EDIT=1 AMBIENT_PHP_LINT=1` | + `TIMINGS_LOG=B.jsonl` |

> Keep `PHASE_GATING` and `FORCE_TOOL` out of this comparison unless that's the
> single variable you're testing (use `feature-ablation.md` for those).

## Commands

```powershell
# A
python3 benchmarks/aider_polyglot.py --model <id> --limit 30
# B
$env:LITTLE_CODER_FROZEN_PREFIX="1"; $env:LITTLE_CODER_PLAN_ANCHOR="1"
$env:LITTLE_CODER_TIMINGS_LOG="$PWD\B.jsonl"
python3 benchmarks/aider_polyglot.py --model <id> --limit 30
```

## Results

| Metric | A (baseline) | B (full agent) | Δ |
|---|---|---|---|
| Pass rate | __% | __% | __ |
| Mean tokens/sec | __ | __ | __ |
| Mean cached-fraction | __ | __ | __ |
| Full re-prefills (cached ≈ 0 turns) | __ | __ | __ |
| Mean turns / task | __ | __ | __ |
| Wall-clock total | __ | __ | __ |

## Read-out

- **Accuracy:** <held / improved / regressed — and where>
- **Speed/cache:** <did cached-fraction rise under frozen prefix? fewer re-prefills?>
- **Failure modes seen:** <e.g. fuzzy edit rescued N edits; ambient lint caught M syntax errors>

## Verdict

<one paragraph: was full agent mode a net win on this suite, and which lever drove it>
