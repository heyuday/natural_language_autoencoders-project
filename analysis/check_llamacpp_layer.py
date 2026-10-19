#!/usr/bin/env python3
"""Check that llama.cpp control vectors add at the same place as the notebooks' hook.

The notebooks steer with a forward hook on model.layers[L] (ActivationSteerer in
nla_steering_helpers.py), adding coeff * unit(v) to that block's output at every position.
llama.cpp's control vector API takes a flat buffer and adds row (il - 1) at the output of
block il. This script runs Qwen2.5-0.5B-Instruct both ways (HF fp32 on CPU, llama.cpp F16
GGUF) with the same random vector and compares final-position logits for several candidate
row placements. The correct placement is the one whose logits match the HF hook.

    python analysis/check_llamacpp_layer.py   # needs llama-cpp-python and the 0.5B GGUF

Output: web/public/data/llamacpp_layer_check.json
"""

from __future__ import annotations

import ctypes
import os
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from common import provenance, r, write_json

GGUF = Path(os.environ.get("Q05_GGUF", Path.home() / "models-nla/q05/qwen2.5-0.5b-instruct-fp16.gguf"))
HF_ID = "Qwen/Qwen2.5-0.5B-Instruct"
LAYER = 10
COEFF = 30.0
PROMPT = "Explain why some companies succeed while others fail."


def main() -> None:
    import llama_cpp

    tok = AutoTokenizer.from_pretrained(HF_ID)
    text = tok.apply_chat_template([{"role": "user", "content": PROMPT}], tokenize=False,
                                   add_generation_prompt=True)
    ids = tok(text, add_special_tokens=False)["input_ids"]

    model = AutoModelForCausalLM.from_pretrained(HF_ID, dtype=torch.float32).eval()
    d = model.config.hidden_size
    n_layer = model.config.num_hidden_layers
    g = torch.Generator().manual_seed(0)
    v = torch.randn(d, generator=g)
    v = v / v.norm()

    def hf_logits(steer: bool) -> np.ndarray:
        handle = None
        if steer:
            def hook(_m, _i, out):
                h = out[0] if isinstance(out, tuple) else out
                h = h + COEFF * v
                return (h,) + tuple(out[1:]) if isinstance(out, tuple) else h
            handle = model.model.layers[LAYER].register_forward_hook(hook)
        with torch.inference_mode():
            lg = model(torch.tensor([ids])).logits[0, -1].numpy()
        if handle:
            handle.remove()
        return lg

    hf_plain, hf_steer = hf_logits(False), hf_logits(True)

    llm = llama_cpp.Llama(model_path=str(GGUF), n_ctx=512, n_gpu_layers=0, verbose=False,
                          logits_all=False, seed=0)

    def cpp_logits(row: int | None) -> np.ndarray:
        if row is None:
            llama_cpp.llama_set_adapter_cvec(llm.ctx, None, 0, d, -1, -1)
        else:
            buf = np.zeros((n_layer, d), dtype=np.float32)
            buf[row] = (COEFF * v).numpy()
            ptr = buf.ctypes.data_as(ctypes.POINTER(ctypes.c_float))
            rc = llama_cpp.llama_set_adapter_cvec(llm.ctx, ptr, buf.size, d, 1, n_layer - 1)
            assert rc == 0, rc
        llm.reset()
        llm.eval(ids)
        ptr = llama_cpp.llama_get_logits_ith(llm.ctx, -1)
        return np.ctypeslib.as_array(ptr, shape=(llm.n_vocab(),)).astype(np.float32).copy()

    cpp_plain = cpp_logits(None)
    rows = {}
    for row in (LAYER - 2, LAYER - 1, LAYER, LAYER + 1):
        lg = cpp_logits(row)
        rows[str(row)] = {
            "max_abs_logit_diff_vs_hf_hook": r(np.abs(lg - hf_steer).max(), 4),
            "argmax_matches": bool(lg.argmax() == hf_steer.argmax()),
        }
    best = min(rows, key=lambda k: rows[k]["max_abs_logit_diff_vs_hf_hook"])
    out = {
        "provenance": provenance("check_llamacpp_layer.py", llama_cpp=llama_cpp.__version__),
        "hf_hook_layer": LAYER,
        "coeff": COEFF,
        "unsteered_max_abs_logit_diff": r(np.abs(cpp_plain - hf_plain).max(), 4),
        "steering_effect_size_hf": r(np.abs(hf_steer - hf_plain).max(), 4),
        "rows": rows,
        "best_row": int(best),
        "conclusion": f"llama.cpp row {best} reproduces the hook on model.layers[{LAYER}]",
    }
    write_json("llamacpp_layer_check.json", out)
    print(out)


if __name__ == "__main__":
    main()
