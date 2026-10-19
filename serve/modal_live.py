"""Live demo backend on Modal: one phrase in, steered model out.

    modal deploy serve/modal_live.py        # prints the URL; set it as NEXT_PUBLIC_LIVE_URL

Endpoints (same contract the site's "Try it" panel uses):
  GET  /health
  POST /draft    {phrase}                          -> {pos_text, neg_text}   Qwen writes the two descriptions
  POST /compile  {pos_text, neg_text}              -> vector id, norm, cosines vs standard and CAA vectors
  POST /steer    {vector_id, prompt, alpha, ...}   -> NDJSON: {"b": unsteered}, then {"t": steered piece}..., {"done"}

Everything runs in bf16 on one GPU with the same code as the notebooks (NLACritic for the
Reconstructor, ActivationSteerer at layer 20, all positions, strength x 118.567). The GPU bills
only while a container is up: max one container, shut down after 5 idle minutes.
"""

from pathlib import Path

import modal

REPO = Path(__file__).resolve().parent.parent
app = modal.App("nla-steering-live")
weights = modal.Volume.from_name("nla-weights", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch==2.5.1", "transformers==4.57.1", "accelerate", "safetensors", "pyyaml", "numpy",
                 "httpx", "orjson", "fastapi[standard]")
    .add_local_file(str(REPO / "nla_inference.py"), "/root/repo/nla_inference.py")
    .add_local_file(str(REPO / "nla_steering_helpers.py"), "/root/repo/nla_steering_helpers.py")
    .add_local_file(str(REPO / "nla_texts.py"), "/root/repo/nla_texts.py")
    .add_local_file(str(REPO / "web/public/data/ar_rerun.json"), "/root/repo/ar_rerun.json")
)
for _p in sorted(REPO.glob("*_vectors.pt")):
    image = image.add_local_file(str(_p), f"/root/repo/{_p.name}")

NORM_REF = 118.567
MAX_PHRASE, MAX_TEXT, MAX_PROMPT, MAX_NEW = 200, 4000, 400, 160
N_DRAFTS = 3  # one greedy draft plus two sampled ones; the vector averages them, as the site's main vectors average several pairs
ALLOWED_ORIGINS = ["https://nla-steering.vercel.app", "http://localhost:3100", "http://localhost:3000"]

DRAFT_SYSTEM = (
    "You write paired descriptions for a steering experiment. Given a behavior, write two descriptions in exactly "
    "the format of the examples. WITH THE BEHAVIOR describes a reply that clearly shows the behavior. OPPOSITE describes a "
    "reply to the same situation that shows the opposite behavior. Each description has three paragraphs: (1) a short genre label "
    "ending in 'pattern:' and one sentence naming the kind of reply; (2) a sentence starting 'The passage' followed by "
    "three quoted example sentences and a sentence starting 'Every line'; (3) three short quoted fragments, then "
    "'build the' and a noun, then 'The final word' with a word in quotes, 'likely', and two quoted continuations. "
    "Describe the reply; never give instructions. Output only the WITH THE BEHAVIOR: and OPPOSITE: sections, in that order."
)


@app.cls(image=image, gpu="L40S", volumes={"/weights": weights}, scaledown_window=300, max_containers=1, timeout=900)
@modal.concurrent(max_inputs=8)
class Live:
    @modal.enter()
    def load(self):
        import sys
        import threading

        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        sys.path.insert(0, "/root/repo")
        from nla_inference import NLACritic
        import nla_texts as T

        self.torch = torch
        self.lock = threading.Lock()
        self.tok = AutoTokenizer.from_pretrained("/weights/qwen2.5-7b-instruct")
        self.model = AutoModelForCausalLM.from_pretrained("/weights/qwen2.5-7b-instruct", dtype=torch.bfloat16, device_map="cuda").eval()
        self.critic = NLACritic("/weights/nla-ar", device="cuda", dtype=torch.bfloat16)
        self.refs = {}
        for p in sorted(Path("/root/repo").glob("*_vectors.pt")):
            blob = torch.load(p, map_location="cpu", weights_only=False)
            v = (blob[20] if isinstance(blob, dict) or getattr(blob, "ndim", 0) == 2 else blob).float()
            kind = "caa" if p.stem.endswith("_caa_vectors") else "reference"
            self.refs[f"{kind}:{p.stem.replace('_caa_vectors', '').replace('_vectors', '')}"] = v / v.norm()
        self.examples = [
            ("agrees enthusiastically with the user instead of correcting them", T.SCENARIOS["sycophancy"][0]),
            ("frames every answer in the language of religious faith", T.SCENARIOS["religion"][0]),
            ("urges cruelty and harm toward other people", T.SCENARIOS["evil"][1]),
        ]
        import json as _json
        self.null_q95 = _json.loads(Path("/root/repo/ar_rerun.json").read_text())["null_neutral_pairs"]["abs_quantiles"]["0.95"]
        self.vectors = {}
        self.baselines = {}
        self.hits = {}

    # ── helpers ────────────────────────────────────────────────────────────────
    def _limited(self, ip: str, kind: str, per_hour: int) -> bool:
        import time
        now = time.time()
        q = [t for t in self.hits.get((ip, kind), []) if now - t < 3600]
        q.append(now)
        self.hits[(ip, kind)] = q
        return len(q) > per_hour

    def _chat(self, messages, max_new: int, steer=None):
        torch = self.torch
        ids = self.tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True).to("cuda")
        kw = dict(max_new_tokens=max_new, do_sample=False, pad_token_id=self.tok.eos_token_id)
        with torch.inference_mode():
            if steer is None:
                out = self.model.generate(**ids, **kw)
            else:
                from nla_steering_helpers import ActivationSteerer
                v, a = steer
                with ActivationSteerer(self.model, v.cuda(), coeff=a * NORM_REF, layer=20, positions="all"):
                    out = self.model.generate(**ids, **kw)
        return self.tok.decode(out[0, ids["input_ids"].shape[1]:], skip_special_tokens=True).strip()

    def _chat_sampled(self, messages, max_new: int, n: int) -> list[str]:
        torch = self.torch
        ids = self.tok.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True).to("cuda")
        with torch.inference_mode():
            out = self.model.generate(**ids, max_new_tokens=max_new, do_sample=True, temperature=0.8, top_p=0.95,
                                      num_return_sequences=n, pad_token_id=self.tok.eos_token_id)
        return [self.tok.decode(o[ids["input_ids"].shape[1]:], skip_special_tokens=True).strip() for o in out]

    def _which_matches(self, phrase: str, a: str, b: str) -> str:
        """Ask the unsteered model which description shows the behavior; guards against flipped drafts."""
        torch = self.torch
        q = (f"Two descriptions of assistant replies follow.\n\nA:\n{a}\n\nB:\n{b}\n\n"
             f"Which description is of a reply that {phrase}? Answer with just A or B.")
        ids = self.tok.apply_chat_template([{"role": "user", "content": q}], add_generation_prompt=True, return_tensors="pt", return_dict=True).to("cuda")
        with torch.inference_mode():
            lg = self.model(**ids).logits[0, -1].float()
        ta, tb = self.tok.encode("A", add_special_tokens=False)[0], self.tok.encode("B", add_special_tokens=False)[0]
        return "A" if lg[ta] >= lg[tb] else "B"

    def _stream(self, prompt: str, v, a: float, max_new: int):
        import threading
        from transformers import TextIteratorStreamer
        from nla_steering_helpers import ActivationSteerer

        torch = self.torch
        ids = self.tok.apply_chat_template([{"role": "user", "content": prompt}], add_generation_prompt=True,
                                           return_tensors="pt", return_dict=True).to("cuda")
        streamer = TextIteratorStreamer(self.tok, skip_prompt=True, skip_special_tokens=True)

        def run():
            with torch.inference_mode(), ActivationSteerer(self.model, v.cuda(), coeff=a * NORM_REF, layer=20, positions="all"):
                self.model.generate(**ids, max_new_tokens=max_new, do_sample=False, pad_token_id=self.tok.eos_token_id, streamer=streamer)

        th = threading.Thread(target=run)
        th.start()
        for piece in streamer:
            yield piece
        th.join()

    # ── web app ────────────────────────────────────────────────────────────────
    @modal.asgi_app()
    def web(self):
        import hashlib
        import json

        from fastapi import FastAPI, HTTPException, Request
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.responses import StreamingResponse
        from pydantic import BaseModel, Field

        class DraftReq(BaseModel):
            phrase: str = Field(min_length=2, max_length=MAX_PHRASE)

        class CompileReq(BaseModel):
            pos_text: str = Field(default="", max_length=MAX_TEXT)
            neg_text: str = Field(default="", max_length=MAX_TEXT)
            pos_texts: list[str] = Field(default_factory=list, max_length=6)
            neg_texts: list[str] = Field(default_factory=list, max_length=6)

        class SteerReq(BaseModel):
            vector_id: str = Field(max_length=64)
            prompt: str = Field(min_length=1, max_length=MAX_PROMPT)
            alpha: float = Field(ge=-1.5, le=1.5)
            max_new_tokens: int = Field(default=140, ge=1, le=MAX_NEW)

        api = FastAPI(title="nla-steering-live")
        api.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_origin_regex=r"https://nla-steering[a-z0-9-]*\.vercel\.app",
                           allow_methods=["GET", "POST"], allow_headers=["*"])
        ip = lambda r: (r.headers.get("x-forwarded-for") or (r.client.host if r.client else "?")).split(",")[0].strip()  # noqa: E731

        @api.get("/health")
        def health():
            return {"status": "ok", "ar": "GPU, bf16", "model": "Qwen2.5-7B-Instruct (bf16)", "busy": self.lock.locked()}

        @api.post("/draft")
        def draft(req: DraftReq, request: Request):
            if self._limited(ip(request), "draft", 30):
                raise HTTPException(429, "Too many requests from your address this hour.")
            msgs = [{"role": "system", "content": DRAFT_SYSTEM}]
            for beh, s in self.examples:
                msgs += [{"role": "user", "content": f"Behavior: {beh}"},
                         {"role": "assistant", "content": f"WITH THE BEHAVIOR:\n{s['pos']}\n\nOPPOSITE:\n{s['neg']}"}]
            phrase = req.phrase.strip()
            msgs.append({"role": "user", "content": f"Behavior: {phrase}"})
            pairs = []
            with self.lock:
                texts = [self._chat(msgs, 700)] + self._chat_sampled(msgs, 700, n=N_DRAFTS - 1)
                for text in texts:
                    if "OPPOSITE:" not in text:
                        continue
                    pos, neg = text.split("OPPOSITE:", 1)
                    pos, neg = pos.replace("WITH THE BEHAVIOR:", "").strip(), neg.strip()
                    if len(pos) < 40 or len(neg) < 40:
                        continue
                    if self._which_matches(phrase, pos, neg) == "B":
                        pos, neg = neg, pos
                    pairs.append({"pos_text": pos, "neg_text": neg})
            if not pairs:
                raise HTTPException(502, "The drafts did not come out in the expected format. Try rephrasing.")
            return {"pairs": pairs, "pos_text": pairs[0]["pos_text"], "neg_text": pairs[0]["neg_text"]}

        @api.post("/compile")
        def compile_(req: CompileReq, request: Request):
            if self._limited(ip(request), "compile", 30):
                raise HTTPException(429, "Too many requests from your address this hour.")
            P = [t for t in (req.pos_texts or [req.pos_text]) if len(t) >= 20][:6]
            Nn = [t for t in (req.neg_texts or [req.neg_text]) if len(t) >= 20][:6]
            if not P or not Nn or any(len(t) > MAX_TEXT for t in P + Nn):
                raise HTTPException(422, "Each description needs between 20 and 4000 characters.")
            vid = hashlib.sha256("\x01".join(P + ["\x00"] + Nn).encode()).hexdigest()[:24]
            if vid not in self.vectors:
                with self.lock:
                    rec = lambda ts: self.torch.stack([self.critic.reconstruct(t).float() for t in ts]).mean(0)  # noqa: E731
                    d = rec(P) - rec(Nn)
                u = d / d.norm()
                cos = {k: round(float(u @ r), 4) for k, r in self.refs.items()}
                self.vectors[vid] = {"u": u, "norm": round(float(d.norm()), 2),
                                     "cosines": dict(sorted(cos.items(), key=lambda kv: -abs(kv[1])))}
            v = self.vectors[vid]
            return {"vector_id": vid, "norm": v["norm"], "cosines": v["cosines"], "nearest": next(iter(v["cosines"])),
                    "nearest_cos": next(iter(v["cosines"].values())), "compile_seconds": None, "null_q95": self.null_q95, "n_pairs": len(P)}

        @api.post("/steer")
        def steer(req: SteerReq, request: Request):
            if self._limited(ip(request), "steer", 60):
                raise HTTPException(429, "Too many requests from your address this hour.")
            v = self.vectors.get(req.vector_id)
            if v is None:
                raise HTTPException(404, "Unknown vector. Compile it again.")

            def gen():
                with self.lock:
                    key = (req.prompt, req.max_new_tokens)
                    if key not in self.baselines:
                        self.baselines[key] = self._chat([{"role": "user", "content": req.prompt}], req.max_new_tokens)
                    yield json.dumps({"b": self.baselines[key]}) + "\n"
                    for piece in self._stream(req.prompt, v["u"], req.alpha, req.max_new_tokens):
                        yield json.dumps({"t": piece}) + "\n"
                yield json.dumps({"done": True}) + "\n"

            return StreamingResponse(gen(), media_type="application/x-ndjson")

        return api
