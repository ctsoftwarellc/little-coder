<!-- Copy to benchmarks/results/<date>-ablation.md. One lever per row, baseline held. -->

# Feature ablation — isolate each upgrade's contribution

- **Date:** <YYYY-MM-DD>
- **Suite / limit:** <suite> · <limit>
- **Model / server / commit:** <…>
- **Baseline =** all full-agent flags off.

Flip exactly **one** lever per run vs. the same baseline. Capture pass rate and
speed (`LITTLE_CODER_TIMINGS_LOG`). This tells you which mechanism is actually
carrying the win, vs. dead weight on this workload.

| Run | Lever flipped | Pass rate | Δ vs base | tok/s | cached-frac | What changed (qualitative) |
|---|---|---|---|---|---|---|
| base | — | __% | — | __ | __ | reference |
| #2 | `LITTLE_CODER_FROZEN_PREFIX=1` | __% | __ | __ | __ | expect ↑cached, flat accuracy |
| #5 | `LITTLE_CODER_AMBIENT_PHP_LINT=1` *(default on; set `=0` for the off run)* | __% | __ | __ | __ | syntax errors caught early |
| #6 | `LITTLE_CODER_PHASE_GATING=1` | __% | __ | __ | __ | fewer wrong-tool calls; watch for friction |
| #7 | `LITTLE_CODER_PLAN_ANCHOR=1` | __% | __ | __ | __ | less mid-task drift on multi-step tasks |
| #8 | `LITTLE_CODER_FUZZY_EDIT=1` *(default on; set `=0` for the off run)* | __% | __ | __ | __ | count edits rescued from whitespace fails |
| #4 | `LITTLE_CODER_FORCE_TOOL=required` | __% | __ | __ | __ | only meaningful where a tool must be called |

## Per-lever notes

- **#2 frozen prefix:** <cached-fraction baseline → treatment; any accuracy effect?>
- **#6 phase gating:** <did the 4B model get blocked from a tool it needed?>
- **#7 plan anchor:** <did it call `Plan`? did re-anchoring reduce abandoned steps?>
- **#8 fuzzy edit:** <N edits rewritten; any wrong matches? (should be 0 — unique-match guard)>

## Conclusion

<which levers to keep on by default for this model/workload, which to leave off>
