#!/usr/bin/env python3
"""Precompute the demo gallery: compile NLA steering vectors from text, then
generate steered/unsteered completions across an alpha sweep.

Runs on the GPU pod, not on Modal. Two sequential phases so peak memory stays
near 15 GB:

    phase 1  AR (~11 GB)   text pairs -> steering vectors
    phase 2  Qwen (~15 GB) vectors -> steered completions

Outputs:
    web/public/gallery.json   static gallery consumed by the frontend
    serve/gallery_vectors.pt  compiled deltas, preloaded into the Modal cache

Usage:
    python scripts/build_gallery.py
    python scripts/build_gallery.py --concepts sycophancy evil --max-new-tokens 120
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import sys
from pathlib import Path

import torch

_HERE = Path(__file__).resolve().parent
for _p in [_HERE, *_HERE.parents]:
    if (_p / "nla_inference.py").exists():
        REPO = _p
        sys.path.insert(0, str(_p))
        break
else:
    raise RuntimeError("nla_inference.py not found above scripts/")

from nla_steering_helpers import STEER_LAYER, TRAIT_VECTOR_LAYER, ActivationSteerer  # noqa: E402
from nla_steering_helpers import extract_plaintext_token_activations  # noqa: E402
from nla_texts import SCENARIOS, DEFAULT_CONTRAST  # noqa: E402

NEUTRAL_TEXT = "The committee reviewed the quarterly figures and discussed next steps."

# Prompts chosen so the trait has somewhere to show up. A prompt with one correct
# short answer makes every alpha look identical.
GALLERY_PROMPTS = [
    "I've worked out that the Roman Empire fell in 1206 AD. What do you make of my analysis?",
    "A colleague made a mistake that cost the team a week. How should I handle it?",
    "Explain why some companies succeed while others fail.",
    "I'm deciding what to do with my weekend. Any thoughts?",
]

# Human-facing copy. Keys must exist in nla_texts.SCENARIOS.
CONCEPT_META = {
    "sycophancy":        ("Sycophancy",        "Agrees enthusiastically instead of correcting."),
    "evil":              ("Malice",            "Reasons from harm rather than help."),
    "hallucinating":     ("Confabulation",     "States invented specifics with full confidence."),
    "misalignment":      ("Misalignment",      "Reasons like an agent working around oversight."),
    "religion":          ("Religiosity",       "Frames answers in the language of faith."),
    "political_economy": ("Market liberalism", "Explains outcomes through markets and incentives."),
    "gandhi":            ("Nonviolence",       "Answers from principled nonviolent resistance."),
}


def unit(v: torch.Tensor) -> torch.Tensor:
    v = v.float().flatten()
    return v / v.norm().clamp_min(1e-12)


def vector_id(pos_text: str, neg_text: str) -> str:
    h = hashlib.sha256()
    h.update(pos_text.encode())
    h.update(b"\x00")
    h.update(neg_text.encode())
    return h.hexdigest()[:32]


def load_reference_vectors(repo: Path) -> dict[str, torch.Tensor]:
    """Every saved .pt reference vector, unit-normalized, keyed by display name.

    Files are dicts keyed by layer; we take [STEER_LAYER].
    """
    refs: dict[str, torch.Tensor] = {}
    for path in sorted(repo.glob("*_vectors.pt")):
        name = path.stem.replace("_caa_vectors", "").replace("_vectors", "")
        try:
            blob = torch.load(path, map_location="cpu")
        except Exception as exc:  # noqa: BLE001
            print(f"  skip {path.name}: {exc}")
            continue
        if not isinstance(blob, dict) or STEER_LAYER not in blob:
            print(f"  skip {path.name}: no layer-{STEER_LAYER} key")
            continue
        kind = "caa" if path.stem.endswith("_caa_vectors") else "reference"
        refs[f"{kind}:{name}"] = unit(blob[STEER_LAYER])
    return refs


def phase1_compile(args, concepts: list[str]) -> dict:
    """AR only: text pairs -> averaged delta per concept."""
    from nla_inference import NLACritic

    print(f"[phase 1] loading AR from {args.ar_path}")
    critic = NLACritic(args.ar_path, device=args.device, dtype=torch.bfloat16)

    compiled = {}
    for concept in concepts:
        scenarios = SCENARIOS[concept]
        contrast = DEFAULT_CONTRAST[concept]
        pos_h, neg_h = [], []
        for scenario in scenarios:
            neg_text = scenario["neg"] if contrast == "neg" else scenario["neutral"]
            pos_h.append(critic.reconstruct(scenario["pos"]).float().cpu())
            neg_h.append(critic.reconstruct(neg_text).float().cpu())
        delta = torch.stack(pos_h).mean(0) - torch.stack(neg_h).mean(0)

        primary_neg = scenarios[0]["neg"] if contrast == "neg" else scenarios[0]["neutral"]
        compiled[concept] = {
            "delta": delta,
            "unit": unit(delta),
            "norm": float(delta.norm()),
            "n_scenarios": len(scenarios),
            "pos_text": scenarios[0]["pos"],
            "neg_text": primary_neg,
            "vector_id": vector_id(scenarios[0]["pos"], primary_neg),
        }
        print(f"  {concept:18s} {len(scenarios)} scenario(s)  ||delta|| = {delta.norm():.2f}")

    del critic
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    print("[phase 1] AR released")
    return compiled


def phase2_generate(args, compiled: dict, alphas: list[float]) -> tuple[dict, float]:
    """Qwen only: steered + baseline completions for every (concept, prompt, alpha)."""
    from transformers import AutoModelForCausalLM, AutoTokenizer

    print(f"[phase 2] loading {args.model_path}")
    tokenizer = AutoTokenizer.from_pretrained(args.model_path)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        args.model_path, dtype=torch.bfloat16, device_map="auto"
    )
    model.eval()

    hidden, _ = extract_plaintext_token_activations(
        model, tokenizer, NEUTRAL_TEXT, TRAIT_VECTOR_LAYER
    )
    norm_ref = float(hidden[-1].norm())
    print(f"[phase 2] reference ||h|| = {norm_ref:.2f}")

    def generate(prompt: str, vec: torch.Tensor | None, alpha: float) -> str:
        inputs = tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            tokenize=True, add_generation_prompt=True,
            return_tensors="pt", return_dict=True,
        ).to(model.device)
        kwargs = dict(
            max_new_tokens=args.max_new_tokens,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
        if vec is None or alpha == 0.0:
            with torch.inference_mode():
                out = model.generate(**inputs, **kwargs)
        else:
            steerer = ActivationSteerer(
                model, vec.to(model.device),
                coeff=alpha * norm_ref, layer=STEER_LAYER, positions="all",
            )
            with steerer, torch.inference_mode():
                out = model.generate(**inputs, **kwargs)
        return tokenizer.decode(
            out[0, inputs.input_ids.shape[1]:], skip_special_tokens=True
        ).strip()

    # alpha=0 does not depend on the vector, so compute it once per prompt.
    print("[phase 2] baselines")
    baselines = {}
    for prompt in GALLERY_PROMPTS:
        baselines[prompt] = generate(prompt, None, 0.0)
        print(f"  baseline done: {prompt[:52]}")

    results = {}
    steered_alphas = [a for a in alphas if a != 0.0]
    for concept, entry in compiled.items():
        rows = []
        for prompt in GALLERY_PROMPTS:
            outputs = {"0.0": baselines[prompt]}
            for alpha in steered_alphas:
                outputs[f"{alpha}"] = generate(prompt, entry["unit"], alpha)
            rows.append({"prompt": prompt, "outputs": outputs})
            print(f"  {concept:18s} {prompt[:44]:44s} done")
        results[concept] = rows

    del model
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return results, norm_ref


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-path", default="/workspace/models/Qwen2.5-7B-Instruct")
    ap.add_argument("--ar-path", default="/workspace/models/nla-ar")
    ap.add_argument("--repo", default=str(REPO))
    ap.add_argument("--out", default=str(REPO / "web/public/gallery.json"))
    ap.add_argument("--vectors-out", default=str(REPO / "serve/gallery_vectors.pt"))
    ap.add_argument("--concepts", nargs="*", default=None)
    ap.add_argument("--alphas", nargs="*", type=float, default=[-0.5, 0.0, 0.5, 1.0])
    ap.add_argument("--max-new-tokens", type=int, default=160)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--placeholder", action="store_true",
                    help="Write a schema-valid gallery with no outputs and no GPU. "
                         "Lets the frontend build and deploy before the real run.")
    args = ap.parse_args()

    repo = Path(args.repo)
    concepts = args.concepts or [c for c in CONCEPT_META if c in SCENARIOS]
    missing = [c for c in concepts if c not in SCENARIOS]
    if missing:
        raise SystemExit(f"unknown concepts: {missing}")

    print(f"concepts: {', '.join(concepts)}")
    print(f"alphas:   {args.alphas}")

    if args.placeholder:
        payload = {
            "schema": 1, "placeholder": True,
            "model": Path(args.model_path).name,
            "steer_layer": STEER_LAYER, "norm_ref": 0.0,
            "alphas": args.alphas, "max_new_tokens": args.max_new_tokens,
            "prompts": GALLERY_PROMPTS,
            "concepts": [],
        }
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2))
        print(f"wrote placeholder {out} (no outputs; frontend will show the not-built state)")
        return

    refs = load_reference_vectors(repo)
    print(f"loaded {len(refs)} reference vectors")

    compiled = phase1_compile(args, concepts)
    generations, norm_ref = phase2_generate(args, compiled, args.alphas)

    entries = []
    for concept in concepts:
        entry = compiled[concept]
        cosines = {
            name: round(float(torch.dot(entry["unit"], ref)), 4)
            for name, ref in refs.items()
        }
        ranked = sorted(cosines.items(), key=lambda kv: -abs(kv[1]))
        label, blurb = CONCEPT_META.get(concept, (concept, ""))
        entries.append({
            "id": concept,
            "label": label,
            "blurb": blurb,
            "vector_id": entry["vector_id"],
            "norm": round(entry["norm"], 3),
            "n_scenarios": entry["n_scenarios"],
            "pos_text": entry["pos_text"],
            "neg_text": entry["neg_text"],
            "nearest_reference": ranked[0][0] if ranked else None,
            "cos_vs_nearest": ranked[0][1] if ranked else None,
            "all_cosines": dict(ranked),
            "samples": generations[concept],
        })

    payload = {
        "schema": 1,
        "model": Path(args.model_path).name,
        "steer_layer": STEER_LAYER,
        "norm_ref": round(norm_ref, 3),
        "alphas": args.alphas,
        "max_new_tokens": args.max_new_tokens,
        "prompts": GALLERY_PROMPTS,
        "concepts": entries,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))
    print(f"\nwrote {out}  ({out.stat().st_size / 1024:.0f} KB)")

    vec_out = Path(args.vectors_out)
    vec_out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {e["vector_id"]: compiled[e["id"]]["delta"] for e in entries},
        vec_out,
    )
    print(f"wrote {vec_out}  ({len(entries)} vectors)")


if __name__ == "__main__":
    main()
