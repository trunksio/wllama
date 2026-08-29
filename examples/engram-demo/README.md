# Engram cartridge demo

Pluggable, removable fact memory for a frozen model, running entirely in the tab.

## Run

```bash
# from the wllama repo root (engram branch, after npm run build)
MULTITHREAD=1 node scripts/http_server.js
# open http://127.0.0.1:8080/examples/engram-demo/
```

Click **Load from ./assets/ (one click)** — `assets/` symlinks the Qwen3-0.6B-Base
F16 GGUF and two shard cartridges trained by aoa-engram
(`private-engram dynamic --config configs/qwen3-0.6b-cartridges.json`, exported
with `scripts/export_engram_gguf.py`). Then:

1. Click a sample prompt (A: facts live in cartridge A, B: in cartridge B).
2. **Complete** with no cartridge mounted — the base model guesses.
3. Mount **Cartridge A** (milliseconds) and complete again — exact recall,
   checked against the stored fact.
4. Swap to **Cartridge B**: A's facts are gone, B's are live.
5. **No cartridge**: provably removed; the base model is byte-identical.

Native verification for these exact cartridges (llama.cpp `engram` branch):
16/16 candidate recall per shard on F16 and Q8_0; free-generation recall exact
on F16. Known limit: Q8_0 free generation degrades — quantised serving needs
quantisation-aware cartridge training.
