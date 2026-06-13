---
name: bash-guidance
type: tool-guidance
target_tool: Bash
priority: 10
token_cost: 180
user-invocable: false
---
## Bash Tool
Execute a shell command and return stdout+stderr.

REQUIRED: command (shell command string)
OPTIONAL: timeout (seconds, default 30 - use 120-300 for installs/builds)

RULES:
- Stateless: each call starts fresh (cd does not persist)
- Use absolute paths or chain with && (e.g. "cd /path && make")
- Use timeout=120 for: pip install, npm install, builds, downloads
- Returns combined stdout and stderr
- Match paths to the shell you are actually using. In Bash, raw Windows paths like
  `C:\Users\Caleb\...\php.exe artisan test` are invalid because backslashes are
  escapes. Use `/c/Users/Caleb/.../php.exe` for Git Bash/MSYS, `/mnt/c/Users/...`
  for WSL, or quote and run the command through PowerShell.
- For Arcova/Laravel verification, prefer the `Verify` tool over Bash. If Verify
  exists, call it with `target` or `filter` instead of hand-building
  `php artisan test`.

EXAMPLE:
```tool
{"name": "Bash", "input": {"command": "ls -la /path/to/project/"}}
```

EXAMPLE with timeout:
```tool
{"name": "Bash", "input": {"command": "pip install requests", "timeout": 120}}
```

EXAMPLE Windows PHP from Bash:
```tool
{"name": "Bash", "input": {"command": "\"/c/Users/Caleb/.config/herd/bin/php84/php.exe\" artisan test tests/Feature/Billing/ManualPaymentTest.php", "timeout": 120}}
```
