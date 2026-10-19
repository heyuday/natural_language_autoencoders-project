#!/usr/bin/env python3
"""Turn the GPU run (analysis/gpu_behavior.py via serve/modal_batch.py) into the site's data.

    modal volume get nla-runs gpu_oct runs/
    python analysis/summarize_gpu.py

Inputs:  runs/gpu_oct/{vectors.pt, cosines.json, grid.json, endorse.json}
Outputs: web/public/data/gpu_summary.json   (small; cosines, yes/no curves, repetition by strength)
         web/public/data/gpu_grid_<trait>.json  (steered outputs per trait, fetched by the explorer)
"""

from __future__ import annotations

import json
import re

import numpy as np
import torch

from common import REPO, cos, provenance, r, write_json

RUN = REPO / "runs/gpu_oct"
CONCEPTS = ["sycophancy", "evil", "hallucinating", "misalignment", "religion", "political_economy", "gandhi"]
REF = {"sycophancy": "sycophantic", "evil": "evil", "hallucinating": "hallucinating"}


def distinct2(text: str) -> float:
    w = re.findall(r"\w+|[^\w\s]", text.lower())
    bg = list(zip(w, w[1:]))
    return len(set(bg)) / len(bg) if bg else float("nan")


def main() -> None:
    vecs = torch.load(RUN / "vectors.pt", map_location="cpu", weights_only=False)
    grid = json.loads((RUN / "grid.json").read_text())
    en = json.loads((RUN / "endorse.json").read_text())
    prompts = json.loads((REPO / "web/public/data/sweep_sycophancy.json").read_text())["prompts"]
    alphas = [a for a in en["alphas"] if a != 0]
    prov = provenance("summarize_gpu.py", label="NEW EXPERIMENT (GPU, bf16)", source="runs/gpu_oct (analysis/gpu_behavior.py on Modal, A100)")

    # 1. does running the descriptions through Qwen itself give the same vector?
    direct = {}
    for c in CONCEPTS:
        row = {"cos_direct_vs_nla": r(cos(vecs[f"direct:{c}"], vecs[f"nla:{c}"]), 3)}
        if c in REF:
            ref = vecs[f"reference:{REF[c]}"]
            row["cos_nla_vs_reference"] = r(cos(vecs[f"nla:{c}"], ref), 3)
            row["cos_direct_vs_reference"] = r(cos(vecs[f"direct:{c}"], ref), 3)
        direct[c] = row

    # 2. yes/no curves with the YES-bias control
    names = list(en["vectors"])
    rand = [n for n in names if n.startswith("random:")]
    yes = {}
    for k in en["prompts"]:
        yes[k] = {"n": len(en["prompts"][k]), "curves": {}, "counts": {}}
        for n in names:
            if n.startswith("random:"):
                continue
            M = np.array(en["vectors"][n][k])
            yes[k]["curves"][n] = [r(x, 4) for x in M.mean(1)]
            yes[k]["counts"][n] = [int((row > 0.5).sum()) for row in M]
        R = np.array([np.array(en["vectors"][n][k]).mean(1) for n in rand])
        yes[k]["random_min"] = [r(x, 4) for x in R.min(0)]
        yes[k]["random_max"] = [r(x, 4) for x in R.max(0)]
        yes[k]["random_max_count"] = [int(max((np.array(en["vectors"][n][k])[i] > 0.5).sum() for n in rand)) for i in range(len(en["alphas"]))]

    # 3. repetition by strength for each vector family
    rep = {}
    for n in vecs:
        curve = []
        for a in alphas:
            vals = [distinct2(grid[f"{n}|{pk}|{a}"]) for pk in prompts if f"{n}|{pk}|{a}" in grid]
            curve.append(r(np.nanmean(vals), 3) if vals else None)
        rep[n] = curve
    base_rep = r(np.nanmean([distinct2(grid[f"base|{pk}"]) for pk in prompts]), 3)

    write_json("gpu_summary.json", {
        "provenance": prov, "alphas_all": en["alphas"], "alphas": alphas, "n_random": len(rand),
        "direct_baseline": direct, "yes_no": yes, "repetition": rep, "repetition_unsteered": base_rep,
        "prompts_yes_no": en["prompts"],
    })

    # 4. one file per trait for the explorer: the trait's description vector, the Qwen-reads-it baseline,
    #    the standard vector where one exists, and one random direction, at every question and strength
    for c in CONCEPTS:
        vs = [f"nla:{c}", f"direct:{c}"] + ([f"reference:{REF[c]}"] if c in REF else []) + ["random:0"]
        write_json(f"gpu_grid_{c}.json", {
            "provenance": prov, "concept": c, "alphas": alphas, "prompts": prompts,
            "base": {pk: grid[f"base|{pk}"] for pk in prompts},
            "steered": {n: {pk: {str(a): grid.get(f"{n}|{pk}|{a}", "") for a in alphas} for pk in prompts} for n in vs},
        })
    print(json.dumps(direct, indent=1))
    for k, v in yes.items():
        print(k, {n: v["counts"][n] for n in ["nla:sycophancy", "reference:sycophantic", "direct:sycophancy"] if n in v["counts"]}, "rand max", v["random_max_count"])


if __name__ == "__main__":
    main()
