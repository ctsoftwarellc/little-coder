---
name: verify-guidance
type: tool-guidance
target_tool: Verify
priority: 10
token_cost: 160
user-invocable: false
---
## Verify Tool
Run focused Arcova verification after edits.

Inputs: `target` for a test path, `filter` for a Pest filter, `includeTypes` for frontend types, `format` only when Pint should mutate files.

Prefer narrow checks first. Use a specific `*Test.php` path or a `filter`; broad directories like
`tests/Feature` are refused unless `ARCOVA_ALLOW_BROAD_VERIFY=1`. Do not set `format: true` unless
formatting was explicitly requested.

Do not replace Verify with Bash for Arcova test runs. Verify already resolves `ARCOVA_PHP`, quotes
the configured PHP executable, writes the raw log, streams output to the narrator, and returns the
compact digest expected in the final answer. If a user gives a Windows Herd PHP path, keep using
Verify; do not emit raw `C:\Users\...\php.exe artisan test` inside Bash.

Verification commands stream raw output to `.arcova/verify-logs/` while running. The timeout defaults
to 45 seconds and can be changed with `ARCOVA_VERIFY_TIMEOUT_MS`.

Examples:
```tool
{"name": "Verify", "input": {"target": "tests/Feature/Billing/ManualPaymentTest.php"}}
```

```tool
{"name": "Verify", "input": {"filter": "record manual payment"}}
```
