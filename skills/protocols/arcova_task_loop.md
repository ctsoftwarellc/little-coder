---
topic: arcova_task_loop
name: arcova-task-loop
type: workflow
keywords: [arcova, arcova task loop, eval, test.md, task file, execute task, verify, tripwire, handoff]
requires_tools: [Read, Grep, Verify]
token_cost: 150
user_invocable: true
---
## Arcova Task Loop

When asked to run an Arcova task or eval:

1. Read `test.md` or the named task file first. Treat its allowed files, forbidden files, verify target, and stop conditions as binding.
2. Restate the allowed files, forbidden files, and exact verification command before editing.
3. Inspect nearby patterns with Read/Grep. Do not broaden scope without explicit approval.
4. Touch only allowed files. If a tripwire blocks, stop immediately and report `.arcova/HANDOFF.md`.
5. Run Verify with a specific `*Test.php` target or focused filter. Never verify `tests/Feature` or the full suite unless explicitly allowed.
6. Final answer must match the actual diff: changed files, verify command, pass/fail, raw log path, and any handoff path.
