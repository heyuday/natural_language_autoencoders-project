#!/usr/bin/env bash
# Fetch weights on first boot (about 19 GB), make the int8 AR copy, start the server.
set -euo pipefail
M=/home/user/models
if [ ! -d "$M/nla-ar/int8" ]; then
  hf download kitft/nla-qwen2.5-7b-L20-ar --local-dir "$M/nla-ar"
  python analysis/quantize_ar_int8.py
  rm -f "$M"/nla-ar/model-0000*.safetensors   # keep only the int8 copy, tokenizer and value head
fi
if [ ! -f "$QWEN_GGUF" ]; then
  hf download Qwen/Qwen2.5-7B-Instruct-GGUF --include "qwen2.5-7b-instruct-q8_0-*" --local-dir "$M/qwen-gguf"
fi
exec python serve/live/app.py --int8
