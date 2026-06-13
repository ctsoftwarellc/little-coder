---
topic: arcova_task_loop
name: arcova-task-loop
type: workflow
keywords: [arcova, arcova task loop, eval, test.md, task file, execute task, verify, tripwire, handoff]
requires_tools: [Read, Grep, Verify]
token_cost: 190
user_invocable: true
---
## Arcova Task Loop

When asked to run an Arcova task or eval:

1. Read `test.md` or the named task file first. Treat its allowed files, forbidden files, verify target, and stop conditions as binding.
2. Restate the allowed files, forbidden files, and exact verification command before editing.
3. Inspect nearby patterns with Read/Grep. Do not broaden scope without explicit approval.
4. Touch only allowed files. If a tripwire blocks, stop immediately and report `.arcova/HANDOFF.md`.
5. Run Verify with a specific `*Test.php` target or focused filter. Never verify `tests/Feature` or the full suite unless explicitly allowed. Do not use Bash to recreate the Verify command; Verify handles PHP path resolution, quoting, raw logs, and compact digests.
6. Final answer must match the actual diff: changed files, verify command, pass/fail, raw log path, and any handoff path.

Windows path rule: if you must use Bash for a non-Verify command, convert Windows paths to the active shell form first. `C:\Users\Caleb\...` is PowerShell/cmd syntax; Bash needs `/c/Users/Caleb/...` or WSL needs `/mnt/c/Users/Caleb/...`.
