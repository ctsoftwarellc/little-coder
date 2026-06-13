# Qwen3.5 9B SWE MTP via llama.cpp

Use this when LM Studio fails to render the model prompt template with:

```text
Missing positional argument: result_ns
```

Serve the same GGUF through LM Studio's bundled llama.cpp backend, but force the
known-good chat template in this repo.

```powershell
& "C:\Users\Caleb\.lmstudio\extensions\backends\llama.cpp-win-x86_64-nvidia-cuda-avx2-2.22.0\llama-server.exe" `
  -m "F:\models\phucngodev\Qwen3.5-9B-SWE-MTP\Qwen3.5-9B-MTP-SWE-Agent-GGUF-Q8_0.gguf" `
  --host 127.0.0.1 `
  --port 8888 `
  --jinja `
  --chat-template-file "C:\Users\Caleb\little-coder\chat-templates\qwen3.5-swe-mtp-chat.jinja" `
  -c 32768 `
  -ngl 99
```

Then run little-coder against the llama.cpp provider:

```powershell
$env:LLAMACPP_API_KEY = "local"
$env:LLAMACPP_BASE_URL = "http://127.0.0.1:8888/v1"

python benchmarks\aider_polyglot.py --model llamacpp/qwen3.5-9b-swe-mtp --language python --exercises 1 --verbose
```

If the CUDA backend fails, use the Vulkan backend at:

```text
C:\Users\Caleb\.lmstudio\extensions\backends\llama.cpp-win-x86_64-vulkan-avx2-2.22.0\llama-server.exe
```
