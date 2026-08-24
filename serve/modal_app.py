"""Modal service backing the public NLA steering demo.

Two independent GPU functions, deliberately not co-resident:

    CompileService  AR only   (~11 GB)  text pair -> steering vector
    SteerService    Qwen only (~15 GB)  vector    -> steered completion

Splitting them means each fits a 24 GB A10G instead of needing a 40 GB A100,
each cold-starts on half the weights, and the interactive path (steering) never
pays to load the reconstructor. The compiled vector is 3584 floats, so passing
it between them through a Volume is free.

Deploy:
    modal run  serve/modal_app.py::download_weights   # one-off, ~15 min
    modal deploy serve/modal_app.py
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import modal

REPO = Path(__file__).resolve().parent.parent

APP_NAME = "nla-steering"
MODEL_REPO = "Qwen/Qwen2.5-7B-Instruct"
AR_REPO = "kitft/nla-qwen2.5-7b-L20-ar"

WEIGHTS = "/weights"
CACHE = "/cache"
MODEL_DIR = f"{WEIGHTS}/Qwen2.5-7B-Instruct"
AR_DIR = f"{WEIGHTS}/nla-ar"

STEER_LAYER = 20
TRAIT_VECTOR_LAYER = 21
NEUTRAL_TEXT = "The committee reviewed the quarterly figures and discussed next steps."

# Request limits. Past |alpha| ~1.5 output degenerates anyway, so this costs
# nothing real and caps the damage a scripted caller can do.
MAX_ALPHA = 1.5
MAX_NEW_TOKENS = 150
MAX_PROMPT_CHARS = 500
MAX_TEXT_CHARS = 4000

weights_volume = modal.Volume.from_name("nla-weights", create_if_missing=True)
cache_volume = modal.Volume.from_name("nla-cache", create_if_missing=True)
demo_key = modal.Secret.from_name("nla-demo-key")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1",
        "transformers==4.46.3",
        "accelerate==1.1.1",
        "safetensors==0.4.5",
        "numpy<2",
        "pyyaml==6.0.2",
        "orjson==3.10.11",
        "huggingface_hub==0.26.2",
        "fastapi[standard]==0.115.5",
    )
    .add_local_file(REPO / "nla_inference.py", "/root/nla_inference.py", copy=True)
    .add_local_file(REPO / "nla_steering_helpers.py", "/root/nla_steering_helpers.py", copy=True)
)

# Reference vectors for the cosine readout. Small (~14 KB each), baked in.
for _pt in sorted(REPO.glob("*_vectors.pt")):
    image = image.add_local_file(_pt, f"/root/refs/{_pt.name}", copy=True)

# Vectors for the precomputed gallery, so those never need recompiling. Produced
# by scripts/build_gallery.py; absent on a first deploy, which is fine.
if (REPO / "serve/gallery_vectors.pt").exists():
    image = image.add_local_file(
        REPO / "serve/gallery_vectors.pt", "/root/gallery_vectors.pt", copy=True
    )

app = modal.App(APP_NAME, image=image)


# ── shared helpers ──────────────────────────────────────────────────────────

def vector_id(pos_text: str, neg_text: str) -> str:
    h = hashlib.sha256()
    h.update(pos_text.encode())
    h.update(b"\x00")
    h.update(neg_text.encode())
    return h.hexdigest()[:32]


def check_key(request) -> None:
    """Reject anything without the shared secret.

    The endpoint URL is public; without this, anyone who opens devtools can
    drain the GPU budget directly, bypassing the frontend's rate limit.
    """
    from fastapi import HTTPException

    expected = os.environ.get("DEMO_KEY")
    if not expected:
        raise HTTPException(status_code=500, detail="server missing DEMO_KEY")
    if request.headers.get("x-demo-key") != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


def clamp_alpha(alpha: float) -> float:
    return max(-MAX_ALPHA, min(MAX_ALPHA, float(alpha)))


# ── one-off weight download ─────────────────────────────────────────────────

@app.function(
    volumes={WEIGHTS: weights_volume},
    timeout=60 * 60,
    image=modal.Image.debian_slim(python_version="3.11").pip_install(
        "huggingface_hub[hf_transfer]==0.26.2"
    ),
)
def download_weights() -> None:
    """Pull both checkpoints into the weights Volume. Run once before deploying."""
    import os as _os

    from huggingface_hub import snapshot_download

    _os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
    for repo_id, local in ((MODEL_REPO, MODEL_DIR), (AR_REPO, AR_DIR)):
        print(f"downloading {repo_id} -> {local}")
        snapshot_download(repo_id=repo_id, local_dir=local)
    weights_volume.commit()
    print("done")


# ── compile: AR only ────────────────────────────────────────────────────────

@app.cls(
    gpu="A10G",
    volumes={WEIGHTS: weights_volume, CACHE: cache_volume},
    secrets=[demo_key],
    # Modal <1.0 names these container_idle_timeout / concurrency_limit.
    scaledown_window=120,
    max_containers=1,
    timeout=600,
)
class CompileService:
    @modal.enter()
    def load(self) -> None:
        import sys

        import torch

        sys.path.insert(0, "/root")
        from nla_inference import NLACritic

        self.torch = torch
        print("loading AR")
        self.critic = NLACritic(AR_DIR, device="cuda", dtype=torch.bfloat16)

        self.refs = {}
        for path in sorted(Path("/root/refs").glob("*_vectors.pt")):
            name = path.stem.replace("_caa_vectors", "").replace("_vectors", "")
            blob = torch.load(path, map_location="cpu")
            if isinstance(blob, dict) and STEER_LAYER in blob:
                kind = "caa" if path.stem.endswith("_caa_vectors") else "reference"
                v = blob[STEER_LAYER].float().flatten()
                self.refs[f"{kind}:{name}"] = v / v.norm().clamp_min(1e-12)
        print(f"AR ready, {len(self.refs)} reference vectors")

        # Seed the cache with the gallery vectors so those never recompile.
        gallery = Path("/root/gallery_vectors.pt")
        if gallery.exists():
            seeded = 0
            for vid, delta in torch.load(gallery, map_location="cpu").items():
                dest = Path(CACHE) / f"{vid}.pt"
                if not dest.exists():
                    torch.save(delta, dest)
                    seeded += 1
            if seeded:
                cache_volume.commit()
            print(f"seeded {seeded} gallery vectors")

    def _describe(self, delta):
        torch = self.torch
        u = delta.float().flatten()
        u = u / u.norm().clamp_min(1e-12)
        cosines = {n: round(float(torch.dot(u, r)), 4) for n, r in self.refs.items()}
        ranked = sorted(cosines.items(), key=lambda kv: -abs(kv[1]))
        return {
            "norm": round(float(delta.norm()), 3),
            "nearest_reference": ranked[0][0] if ranked else None,
            "cos_vs_nearest": ranked[0][1] if ranked else None,
            "all_cosines": dict(ranked),
        }

    @modal.asgi_app()
    def web(self):
        from fastapi import FastAPI, HTTPException, Request
        from fastapi.responses import JSONResponse

        api = FastAPI()

        @api.post("/")
        def compile_pair(item: dict, request: Request):
            check_key(request)
            torch = self.torch

            pos_text = (item.get("pos_text") or "").strip()
            neg_text = (item.get("neg_text") or "").strip()
            if not pos_text or not neg_text:
                raise HTTPException(status_code=400, detail="pos_text and neg_text are required")
            if len(pos_text) > MAX_TEXT_CHARS or len(neg_text) > MAX_TEXT_CHARS:
                raise HTTPException(
                    status_code=400, detail=f"texts must be under {MAX_TEXT_CHARS} chars"
                )

            vid = vector_id(pos_text, neg_text)
            dest = Path(CACHE) / f"{vid}.pt"

            cache_volume.reload()
            if dest.exists():
                delta = torch.load(dest, map_location="cpu")
            else:
                pos = self.critic.reconstruct(pos_text).float().cpu()
                neg = self.critic.reconstruct(neg_text).float().cpu()
                delta = pos - neg
                torch.save(delta, dest)
                cache_volume.commit()

            return JSONResponse({"vector_id": vid, **self._describe(delta)})

        return api


# ── steer: Qwen only ────────────────────────────────────────────────────────

@app.cls(
    gpu="A10G",
    volumes={WEIGHTS: weights_volume, CACHE: cache_volume},
    secrets=[demo_key],
    scaledown_window=180,
    max_containers=1,
    timeout=600,
)
class SteerService:
    @modal.enter()
    def load(self) -> None:
        import sys

        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        sys.path.insert(0, "/root")
        from nla_steering_helpers import extract_plaintext_token_activations

        self.torch = torch
        print("loading target model")
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.model = AutoModelForCausalLM.from_pretrained(
            MODEL_DIR, dtype=torch.bfloat16, device_map="auto"
        )
        self.model.eval()

        hidden, _ = extract_plaintext_token_activations(
            self.model, self.tokenizer, NEUTRAL_TEXT, TRAIT_VECTOR_LAYER
        )
        self.norm_ref = float(hidden[-1].norm())
        print(f"model ready, reference ||h|| = {self.norm_ref:.2f}")

    def _inputs(self, prompt: str):
        return self.tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            tokenize=True, add_generation_prompt=True,
            return_tensors="pt", return_dict=True,
        ).to(self.model.device)

    def _generate(self, prompt: str, max_new_tokens: int) -> str:
        torch = self.torch
        inputs = self._inputs(prompt)
        with torch.inference_mode():
            out = self.model.generate(
                **inputs, max_new_tokens=max_new_tokens,
                do_sample=False, pad_token_id=self.tokenizer.eos_token_id,
            )
        return self.tokenizer.decode(
            out[0, inputs.input_ids.shape[1]:], skip_special_tokens=True
        ).strip()

    def _baseline(self, prompt: str, max_new_tokens: int) -> str:
        """Unsteered completion, cached by prompt hash — it never changes."""
        torch = self.torch
        key = hashlib.sha256(f"{prompt}\x00{max_new_tokens}".encode()).hexdigest()[:32]
        dest = Path(CACHE) / f"base-{key}.json"
        cache_volume.reload()
        if dest.exists():
            return json.loads(dest.read_text())["text"]
        text = self._generate(prompt, max_new_tokens)
        dest.write_text(json.dumps({"text": text}))
        cache_volume.commit()
        return text

    @modal.asgi_app()
    def web(self):
        import threading

        from fastapi import FastAPI, HTTPException, Request
        from fastapi.responses import StreamingResponse
        from transformers import TextIteratorStreamer

        api = FastAPI()

        @api.post("/")
        def steer(item: dict, request: Request):
            check_key(request)
            torch = self.torch

            vid = (item.get("vector_id") or "").strip()
            prompt = (item.get("prompt") or "").strip()
            alpha = clamp_alpha(item.get("alpha", 0.75))
            max_new_tokens = max(16, min(MAX_NEW_TOKENS, int(item.get("max_new_tokens", 150))))

            if not prompt:
                raise HTTPException(status_code=400, detail="prompt is required")
            if len(prompt) > MAX_PROMPT_CHARS:
                raise HTTPException(status_code=400, detail=f"prompt must be under {MAX_PROMPT_CHARS} chars")
            if not vid.isalnum():
                raise HTTPException(status_code=400, detail="bad vector_id")

            cache_volume.reload()
            src = Path(CACHE) / f"{vid}.pt"
            if not src.exists():
                raise HTTPException(status_code=404, detail="unknown vector_id; compile it first")
            delta = torch.load(src, map_location="cpu").float().flatten()
            unit = (delta / delta.norm().clamp_min(1e-12)).to(self.model.device)

            def body():
                import sys

                sys.path.insert(0, "/root")
                from nla_steering_helpers import ActivationSteerer

                # Emit the baseline first when it is already cached; otherwise stream
                # the steered output now and send the baseline once it is generated,
                # so a cache miss never delays the visible response.
                key = hashlib.sha256(f"{prompt}\x00{max_new_tokens}".encode()).hexdigest()[:32]
                cached = Path(CACHE) / f"base-{key}.json"
                have_baseline = cached.exists()
                if have_baseline:
                    yield json.dumps({"b": json.loads(cached.read_text())["text"]}) + "\n"

                streamer = TextIteratorStreamer(
                    self.tokenizer, skip_prompt=True, skip_special_tokens=True
                )
                inputs = self._inputs(prompt)
                kwargs = dict(
                    **inputs, max_new_tokens=max_new_tokens, do_sample=False,
                    pad_token_id=self.tokenizer.eos_token_id, streamer=streamer,
                )

                def run():
                    steerer = ActivationSteerer(
                        self.model, unit,
                        coeff=alpha * self.norm_ref, layer=STEER_LAYER, positions="all",
                    )
                    with steerer, torch.inference_mode():
                        self.model.generate(**kwargs)

                thread = threading.Thread(target=run)
                thread.start()
                for chunk in streamer:
                    if chunk:
                        yield json.dumps({"t": chunk}) + "\n"
                thread.join()

                if not have_baseline:
                    yield json.dumps({"b": self._baseline(prompt, max_new_tokens)}) + "\n"

            return StreamingResponse(body(), media_type="application/x-ndjson")

        return api
