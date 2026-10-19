#!/usr/bin/env python3
"""Write a weight-only int8 copy of the AR checkpoint for CPU hosting (about half the size).

Each 2-D weight matrix is stored as int8 with one float32 scale per output row
(symmetric, scale = max|w| / 127). Norm weights, biases and the value head stay bf16.
StreamingAR(int8=True) dequantizes one layer at a time. Fidelity against the A100
vectors is measured by analysis/check_ar_int8.py.

    python analysis/quantize_ar_int8.py        # writes $NLA_AR_PATH/int8/*.safetensors
"""

from __future__ import annotations

import json

import torch
from safetensors import safe_open
from safetensors.torch import save_file

from ar_stream import AR_PATH


def main() -> None:
    out_dir = AR_PATH / "int8"
    out_dir.mkdir(exist_ok=True)
    wm = json.loads((AR_PATH / "model.safetensors.index.json").read_text())["weight_map"]
    for shard in sorted(set(wm.values())):
        tensors = {}
        with safe_open(str(AR_PATH / shard), framework="pt") as f:
            for k in f.keys():
                w = f.get_tensor(k)
                if w.ndim == 2:
                    wf = w.float()
                    s = (wf.abs().amax(dim=1) / 127.0).clamp_min(1e-12)
                    tensors[k + ".q"] = torch.round(wf / s.unsqueeze(1)).clamp(-127, 127).to(torch.int8)
                    tensors[k + ".s"] = s
                else:
                    tensors[k] = w
        save_file(tensors, str(out_dir / shard))
        print(f"wrote int8/{shard}")


if __name__ == "__main__":
    main()
