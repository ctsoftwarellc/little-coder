<!--
Per-model Arcova task eval report.
Copy to the target repo's .arcova/eval-output/current-model.md when running an eval.
If the eval defines its own template (e.g. in a test.md), THAT template wins —
this is the default/fallback shape.
Use the "Completed" section on success, or the "Blocked" section if a stop
condition fired. Delete the section you don't use.
-->

# Arcova Eval Report

- **Model:** <provider/id> (e.g. lmstudio/qwen/qwen3.6-35b-a3b)
- **Date:** <YYYY-MM-DD>
- **Task:** <one-line task description from test.md>
- **little-coder commit:** <git SHA>
- **Flags:** <e.g. FROZEN_PREFIX=1 PLAN_ANCHOR=1 / none>

---

## ✅ Completed

### Files changed
<!-- only files in the allowed list; smallest correct change -->
- `path/to/file` — <what changed, one line>

### Approach
<2–4 sentences: what the task needed and the change you made.>

### Verification
- **Command run:** `<the exact verification command from test.md>`
- **Result:** <PASS / FAIL>
- **Output (digest):**
  ```
  <compact verify digest — not the full log>
  ```

### Notes
<anything the reviewer should know: assumptions, edge cases, follow-ups.>

---

## ⛔ Blocked
<!-- Use this section instead of "Completed" if a stop condition from test.md fired. -->

- **Stop condition hit:** <which one — e.g. task required editing tenancy code / migration / out-of-scope file>
- **What was attempted:** <reads/searches done before stopping>
- **Why it's blocked:** <the boundary that was hit>
- **Handoff:** <`.arcova/HANDOFF.md` path if a tripwire wrote one>
- **Suggested next step for a human:** <one line>

---

## Harness telemetry (optional, if captured)

| Signal | Value |
|---|---|
| Turns used | __ |
| Edits / edit failures | __ / __ |
| Fuzzy-edit rescues | __ |
| Ambient `php -l` catches | __ |
| Verify ran / passed | __ / __ |
| Tripwires fired | __ |
| Mean tok/s · cached-frac | __ · __ |
