"""Run the NLA Activation Reconstructor (AR) on a machine without a large GPU.

Numerically this is NLACritic.reconstruct from nla_inference.py: the AR prompt template,
21 Qwen2 decoder layers with no final norm, the last token's residual, then the linear
value head. The difference is scheduling: instead of holding all 21 layers (10.9 GB bf16)
in memory, it loads one decoder layer at a time and pushes every queued text through it
before moving to the next. Peak memory is one layer plus the activations.

Results are cached on disk keyed by sha256(text), so re-running an analysis only computes
texts it has not seen. Validated against the A100-compiled gallery vectors in
analysis/ar_rerun.py (see the "validation" block of ar_rerun.json).

Default checkpoint location: $NLA_AR_PATH or ~/models-nla/nla-ar
(huggingface: kitft/nla-qwen2.5-7b-L20-ar).
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import torch
import yaml
from safetensors import safe_open
from transformers import AutoConfig, AutoTokenizer
from transformers.models.qwen2.modeling_qwen2 import Qwen2DecoderLayer, Qwen2RotaryEmbedding

AR_PATH = Path(os.environ.get("NLA_AR_PATH", Path.home() / "models-nla" / "nla-ar"))
CACHE_DIR = Path(__file__).resolve().parent / ".ar_cache"


def _device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


class StreamingAR:
    def __init__(self, path: Path = AR_PATH, device: str | None = None,
                 dtype: torch.dtype | None = None, int8: bool = False):
        self.path = Path(path)
        self.device = device or _device()
        # bf16 on GPU/MPS (as in the notebooks); fp32 arithmetic on CPU, where bf16 matmul is slow
        self.dtype = dtype or (torch.float32 if self.device == "cpu" else torch.bfloat16)
        self.int8 = int8
        meta = yaml.safe_load((self.path / "nla_meta.yaml").read_text())
        assert meta["role"] in ("ar", "critic")
        self.template = meta["prompt_templates"]["ar"]
        self.tokenizer = AutoTokenizer.from_pretrained(str(self.path))
        self.config = AutoConfig.from_pretrained(str(self.path))
        self.config._attn_implementation = "sdpa"
        self.n_layers = self.config.num_hidden_layers
        idx = json.loads((self.path / "model.safetensors.index.json").read_text())["weight_map"]
        self.weight_map = idx
        self.cache_dir = CACHE_DIR / ("int8" if int8 else "")
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    # ── ids ──────────────────────────────────────────────────────────────────────
    def ids_for(self, explanation: str) -> list[int]:
        prompt = self.template.format(explanation=explanation)
        return self.tokenizer(prompt, add_special_tokens=True)["input_ids"]

    def prompt_parts(self, explanation: str):
        """(ids, exp_start, exp_end) with separately tokenized prefix/explanation/suffix,
        exactly as experiment 2 cell 4 `ar_prompt_ids` builds them."""
        prefix, suffix = self.template.split("{explanation}")
        pre = self.tokenizer(prefix, add_special_tokens=True)["input_ids"]
        exp = self.tokenizer(explanation, add_special_tokens=False)["input_ids"]
        suf = self.tokenizer(suffix, add_special_tokens=False)["input_ids"]
        return pre + exp + suf, len(pre), len(pre) + len(exp)

    # ── weights ──────────────────────────────────────────────────────────────────
    def _tensor(self, key: str) -> torch.Tensor:
        """bf16 checkpoint tensor, or a dequantized one from an int8 export (see quantize_ar_int8.py)."""
        if self.int8:
            with safe_open(str(self.path / "int8" / self.weight_map[key]), framework="pt") as f:
                names = set(f.keys())
                if key + ".q" in names:
                    q, sc = f.get_tensor(key + ".q"), f.get_tensor(key + ".s")
                    return (q.float() * sc.unsqueeze(1)).to(self.dtype)
                return f.get_tensor(key)
        with safe_open(str(self.path / self.weight_map[key]), framework="pt") as f:
            return f.get_tensor(key)

    def _layer(self, i: int) -> Qwen2DecoderLayer:
        layer = Qwen2DecoderLayer(self.config, i)
        prefix = f"model.layers.{i}."
        sd = {k[len(prefix):]: self._tensor(k) for k in self.weight_map if k.startswith(prefix)}
        layer.load_state_dict(sd, strict=True)
        return layer.to(self.device, self.dtype).eval()

    # ── forward ──────────────────────────────────────────────────────────────────
    @torch.inference_mode()
    def run_ids(self, id_lists: list[list[int]], verbose: bool = True) -> torch.Tensor:
        """Return [n, d] float32 AR outputs for raw token-id sequences."""
        t0 = time.time()
        emb_w = self._tensor("model.embed_tokens.weight")
        hs = [emb_w[torch.tensor(ids)].to(self.device, self.dtype).unsqueeze(0) for ids in id_lists]
        del emb_w
        rope = Qwen2RotaryEmbedding(self.config).to(self.device)
        pos_emb = []
        for h in hs:
            pid = torch.arange(h.shape[1], device=self.device).unsqueeze(0)
            cos_, sin_ = rope(h, pid)
            pos_emb.append((cos_.to(self.dtype), sin_.to(self.dtype)))
        for i in range(self.n_layers):
            layer = self._layer(i)
            for k in range(len(hs)):
                out = layer(hs[k], attention_mask=None, position_embeddings=pos_emb[k])
                hs[k] = out[0] if isinstance(out, tuple) else out
            del layer
            if self.device == "mps":
                torch.mps.empty_cache()
            if verbose and (i % 7 == 6 or i == self.n_layers - 1):
                print(f"    AR layer {i + 1}/{self.n_layers}  ({time.time() - t0:.0f}s, {len(hs)} seqs)")
        last = torch.stack([h[0, -1] for h in hs])  # raw residual, no final norm
        vh = torch.nn.Linear(last.shape[1], last.shape[1], bias=False)
        with safe_open(str(self.path / "value_head.safetensors"), framework="pt") as f:
            vh.weight.data = f.get_tensor("weight").to(self.dtype)
        vh = vh.to(self.device, self.dtype)
        return vh(last).float().cpu()

    def reconstruct_many(self, texts: list[str], verbose: bool = True) -> torch.Tensor:
        """Cached AR(text) for a list of explanation strings -> [n, d] float32."""
        keys = [hashlib.sha256(t.encode()).hexdigest() for t in texts]
        todo = sorted({k: t for k, t in zip(keys, texts) if not (self.cache_dir / f"{k}.pt").exists()}.items())
        if todo:
            if verbose:
                print(f"  AR: computing {len(todo)} new text(s), {len(texts) - len(todo)} cached")
            vecs = self.run_ids([self.ids_for(t) for _, t in todo], verbose=verbose)
            for (k, _), v in zip(todo, vecs):
                torch.save(v.clone(), self.cache_dir / f"{k}.pt")
        return torch.stack([torch.load(self.cache_dir / f"{k}.pt") for k in keys])

    def reconstruct(self, text: str) -> torch.Tensor:
        return self.reconstruct_many([text], verbose=False)[0]
