---
name: verify-guidance
type: tool-guidance
target_tool: Verify
priority: 10
token_cost: 120
user-invocable: false
---
## Verify Tool
Run focused Arcova verification after edits.

Inputs: `target` for a test path, `filter` for a Pest filter, `includeTypes` for frontend types, `format` only when Pint should mutate files.

Prefer narrow checks first. Use a specific `*Test.php` path or a `filter`; broad directories like
`tests/Feature` are refused unless `ARCOVA_ALLOW_BROAD_VERIFY=1`. Do not set `format: true` unless
formatting was explicitly requested.

Verification commands stream raw output to `.arcova/verify-logs/` while running. The timeout defaults
to 45 seconds and can be changed with `ARCOVA_VERIFY_TIMEOUT_MS`.
