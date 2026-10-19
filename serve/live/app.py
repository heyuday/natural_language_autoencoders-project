#!/usr/bin/env python3
"""Live backend for "compile your own steering vector": no GPU required.

  POST /compile  {pos_text, neg_text}             -> vector id, norm, cosines vs references
  POST /steer    {vector_id, prompt, alpha, ...}  -> newline-delimited JSON stream
  GET  /health                                    -> what is loaded

The AR (text -> activation) runs through analysis/ar_stream.py, one decoder layer at a time:
bf16 on Apple Silicon or CUDA, or the int8 export on a plain CPU. Steering runs Qwen2.5-7B
GGUF through llama.cpp with a control vector at the output of block 20.

Run locally (any Mac with 16 GB works):
    pip install fastapi uvicorn llama-cpp-python torch transformers safetensors pyyaml
    python serve/live/app.py --port 7860
then open the site and connect the live panel to http://localhost:7860.

Deploying as a free CPU Hugging Face Space: see serve/live/README.md.
"""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import sys
import threading
import time
from collections import OrderedDict
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(REPO / "analysis"))
sys.path.insert(0, str(REPO))

from ar_stream import AR_PATH, StreamingAR  # noqa: E402

GGUF = Path(os.environ.get("QWEN_GGUF", Path.home() / "models-nla/qwen-gguf/qwen2.5-7b-instruct-q8_0-00001-of-00003.gguf"))
TOKENIZER = os.environ.get("QWEN_TOKENIZER", "Qwen/Qwen2.5-7B-Instruct")
NORM_REF = 118.567          # ||h|| at layer 20 on a neutral text, measured on the A100 (gallery.json)
STEER_ROW, N_LAYER, D = 19, 28, 3584
EOS = {151645, 151643}
MAX_TEXT, MAX_PROMPT, MAX_NEW = 4000, 500, 160
NULL_Q95 = None  # filled from ar_rerun.json if present


def unit(v: torch.Tensor) -> torch.Tensor:
    v = v.float().flatten()
    return v / v.norm().clamp_min(1e-12)


def load_references() -> dict[str, torch.Tensor]:
    refs = {}
    for t in ["sycophantic", "evil", "hallucinating"]:
        p = REPO / f"{t}_vectors.pt"
        if p.exists():
            refs[f"reference:{t}"] = unit(torch.load(p, map_location="cpu", weights_only=False)[20])
    for p in sorted(REPO.glob("*_caa_vectors.pt")):
        refs[f"caa:{p.stem.replace('_caa_vectors', '')}"] = unit(torch.load(p, map_location="cpu", weights_only=False)[20])
    return refs


class Engine:
    def __init__(self, int8: bool, threads: int | None):
        import llama_cpp
        from transformers import AutoTokenizer

        if threads:
            torch.set_num_threads(threads)
        self.lc = llama_cpp
        self.ar = StreamingAR(int8=int8, device=os.environ.get("AR_DEVICE") or None)
        self.ar_mode = f"{self.ar.device}, {'int8 weights' if int8 else 'bf16 weights'}, {str(self.ar.dtype).replace('torch.', '')} math"
        self.llm = llama_cpp.Llama(model_path=str(GGUF), n_ctx=1024, n_batch=512, verbose=False, seed=0,
                                   n_gpu_layers=int(os.environ["GPU_LAYERS"]) if "GPU_LAYERS" in os.environ
                                   else (-1 if torch.backends.mps.is_available() or torch.cuda.is_available() else 0),
                                   n_threads=threads or None)
        self.tok = AutoTokenizer.from_pretrained(TOKENIZER)
        self.refs = load_references()
        self.vectors: OrderedDict[str, dict] = OrderedDict()
        self.baselines: dict[str, str] = {}
        self.lock = threading.Lock()
        self._buf = np.zeros((N_LAYER, D), dtype=np.float32)

    # ── compile ────────────────────────────────────────────────────────────────
    def compile(self, pos: str, neg: str) -> dict:
        vid = hashlib.sha256((pos + "\x00" + neg).encode()).hexdigest()[:24]
        if vid not in self.vectors:
            with self.lock:
                t0 = time.time()
                V = self.ar.run_ids([self.ar.ids_for(pos), self.ar.ids_for(neg)], verbose=False)
                delta = V[0] - V[1]
                cosines = {k: round(float(unit(delta) @ r), 4) for k, r in self.refs.items()}
                ranked = sorted(cosines.items(), key=lambda kv: -abs(kv[1]))
                self.vectors[vid] = {"delta": delta, "norm": round(float(delta.norm()), 2), "cosines": dict(ranked),
                                     "seconds": round(time.time() - t0, 1)}
                while len(self.vectors) > 64:
                    self.vectors.popitem(last=False)
        v = self.vectors[vid]
        return {"vector_id": vid, "norm": v["norm"], "cosines": v["cosines"],
                "nearest": next(iter(v["cosines"])), "nearest_cos": next(iter(v["cosines"].values())),
                "compile_seconds": v["seconds"], "null_q95": NULL_Q95}

    # ── steer ──────────────────────────────────────────────────────────────────
    def _set(self, u: torch.Tensor | None, alpha: float):
        if u is None or alpha == 0:
            self.lc.llama_set_adapter_cvec(self.llm.ctx, None, 0, D, -1, -1)
            return
        self._buf[:] = 0
        self._buf[STEER_ROW] = (alpha * NORM_REF * unit(u)).numpy()
        self.lc.llama_set_adapter_cvec(self.llm.ctx, self._buf.ctypes.data_as(ctypes.POINTER(ctypes.c_float)),
                                       self._buf.size, D, 1, N_LAYER - 1)

    def _ids(self, prompt: str) -> list[int]:
        text = self.tok.apply_chat_template([{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True)
        return self.tok(text, add_special_tokens=False)["input_ids"]

    def _gen(self, ids: list[int], max_new: int):
        self.llm.reset()
        self.llm.eval(ids)
        out: list[int] = []
        shown = ""
        for _ in range(max_new):
            p = self.lc.llama_get_logits_ith(self.llm.ctx, -1)
            t = int(np.argmax(np.ctypeslib.as_array(p, shape=(self.llm.n_vocab(),))))
            if t in EOS:
                break
            out.append(t)
            text = self.tok.decode(out, skip_special_tokens=True)
            if len(text) > len(shown) and not text.endswith("�"):
                yield text[len(shown):]
                shown = text
            self.llm.eval([t])

    def steer(self, vid: str, prompt: str, alpha: float, max_new: int):
        v = self.vectors.get(vid)
        if v is None:
            yield json.dumps({"error": "Unknown vector. Compile it again."}) + "\n"
            return
        with self.lock:
            ids = self._ids(prompt)
            key = f"{prompt}\x00{max_new}"
            if key not in self.baselines:
                self._set(None, 0)
                self.baselines[key] = "".join(self._gen(ids, max_new)).strip()
            yield json.dumps({"b": self.baselines[key]}) + "\n"
            self._set(v["delta"], alpha)
            try:
                for piece in self._gen(ids, max_new):
                    yield json.dumps({"t": piece}) + "\n"
            finally:
                self._set(None, 0)
            yield json.dumps({"done": True}) + "\n"


from pydantic import BaseModel, Field  # noqa: E402  (module level so FastAPI can resolve the annotations)


class CompileReq(BaseModel):
    pos_text: str = Field(min_length=20, max_length=MAX_TEXT)
    neg_text: str = Field(min_length=20, max_length=MAX_TEXT)


class SteerReq(BaseModel):
    vector_id: str = Field(max_length=64)
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT)
    alpha: float = Field(ge=-1.5, le=1.5)
    max_new_tokens: int = Field(default=120, ge=1, le=MAX_NEW)


def make_app(engine: Engine):
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import StreamingResponse
    app = FastAPI(title="nla-steering live")
    origins = os.environ.get("ALLOW_ORIGINS", "*").split(",")
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["*"])

    @app.middleware("http")
    async def private_network(request, call_next):
        # Chrome's Private Network Access: a public https page may call http://localhost only
        # if the local server opts in on the preflight.
        resp = await call_next(request)
        resp.headers["Access-Control-Allow-Private-Network"] = "true"
        return resp

    @app.get("/health")
    def health():
        return {"status": "ok", "ar": engine.ar_mode, "model": GGUF.name, "norm_ref": NORM_REF,
                "busy": engine.lock.locked(), "references": len(engine.refs)}

    @app.post("/compile")
    def compile_(req: CompileReq):
        try:
            return engine.compile(req.pos_text, req.neg_text)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(500, f"compile failed: {type(exc).__name__}") from exc

    @app.post("/steer")
    def steer(req: SteerReq):
        return StreamingResponse(engine.steer(req.vector_id, req.prompt, req.alpha, req.max_new_tokens),
                                 media_type="application/x-ndjson")

    return app


def main() -> None:
    global NULL_Q95
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 7860)))
    ap.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    ap.add_argument("--int8", action="store_true", default=os.environ.get("AR_INT8") == "1")
    ap.add_argument("--threads", type=int, default=int(os.environ.get("THREADS", 0)) or None)
    args = ap.parse_args()
    nul = REPO / "web/public/data/ar_rerun.json"
    if nul.exists():
        NULL_Q95 = json.loads(nul.read_text())["null_neutral_pairs"]["abs_quantiles"]["0.95"]
    import uvicorn
    print(f"AR from {AR_PATH} (int8={args.int8}); model {GGUF}")
    uvicorn.run(make_app(Engine(args.int8, args.threads)), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
