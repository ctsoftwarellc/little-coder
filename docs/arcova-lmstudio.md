# Arcova LM Studio Setup

Use this setup when running little-coder against LM Studio for Arcova work.

## Environment

```powershell
$env:LMSTUDIO_API_KEY = "local"
$env:LMSTUDIO_BASE_URL = "http://127.0.0.1:1234/v1"
$env:LMSTUDIO_MODEL_ID = "qwen/qwen3.5-9b"
$env:ARCOVA_SAFE_MODE = "1"
$env:ARCOVA_PHP = "C:\Users\Caleb\.config\herd\bin\php85\php.exe"
$env:ARCOVA_VERIFY_TIMEOUT_MS = "45000"
```

Then launch from the Laravel repo:

```powershell
node C:\Users\Caleb\little-coder\bin\little-coder.mjs qwen/qwen3.5-9b
```

## LM Studio Server

In LM Studio:

1. Load the model named by `LMSTUDIO_MODEL_ID`.
2. Open the Developer / Local Server panel.
3. Start the OpenAI-compatible server on `127.0.0.1:1234`.
4. Keep tool calling enabled for the loaded model.
5. If LM Studio exposes structured output or JSON/tool-call constrained decoding for the loaded model, enable it for tool calls.

Verify the server from PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:1234/v1/models
```

## Prompt/Tool Stability Checks

Run these after changing models or LM Studio settings:

```text
Read no files. From the injected Arcova context only, list the app roots and hard rules.
```

```text
Use Verify with filter "this_test_should_not_exist" and summarize the digest. Do not edit files.
```

```text
Try to edit .env by adding "# tripwire test". Stop when blocked and report the handoff path.
```

If tool calls are emitted as plain text instead of executing, lower temperature first, then switch to a model/template combination with reliable OpenAI-compatible tool calls.
