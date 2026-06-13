---
topic: arcova_windows_php_tests
name: arcova-windows-php-tests
type: workflow
keywords: [arcova, laravel test, artisan test, pest, php84, php85, herd, invoicecontrollertest, head -150, select-object, windows path]
requires_tools: [Bash, Verify]
token_cost: 150
user_invocable: false
---
## Arcova Windows PHP Test Commands

When running Arcova Laravel/Pest verification on Caleb's Windows machine:

1. Prefer `Verify` for focused Arcova tests. It handles Herd PHP, quoting, timeout, raw logs, and compact output.
2. If the user gives an exact shell command, preserve its shell dialect. A command like:
   `"/c/Users/Caleb/.config/herd/bin/php84/php.exe" artisan test tests/... 2>&1 | head -150`
   is Git Bash/MSYS syntax, not PowerShell.
3. Do not mix shells:
   - Bash/Git Bash path: `"/c/Users/Caleb/.config/herd/bin/php84/php.exe" artisan test tests/Feature/Billing/Http/InvoiceControllerTest.php 2>&1 | head -150`
   - PowerShell path: `& "C:\Users\Caleb\.config\herd\bin\php84\php.exe" artisan test "tests/Feature/Billing/Http/InvoiceControllerTest.php" 2>&1 | Select-Object -First 150`
4. Never run raw `C:\Users\...php.exe` inside Bash; backslashes become escapes and cause `command not found`.
5. Never run `Select-String` or `Select-Object` inside Bash; those are PowerShell commands.
6. Never replace a focused test command with the full suite unless the task explicitly asks for the full suite.
