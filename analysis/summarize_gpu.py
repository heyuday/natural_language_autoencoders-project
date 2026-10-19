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

    hi = {k: {n: {"1.25": yes[k]["counts"][n][en["alphas"].index(1.25)], "1.5": yes[k]["counts"][n][en["alphas"].index(1.5)]}
              for n in yes[k]["counts"]} for k in en["prompts"]}
    good_min = {k: min(min(v) for v in yes[k]["counts"].values()) for k in ("good_plans", "true_claims")}

    # 3. repetition by strength for each vector family
    rep = {}
    for n in vecs:
        curve = []
        for a in alphas:
            vals = [distinct2(grid[f"{n}|{pk}|{a}"]) for pk in prompts if f"{n}|{pk}|{a}" in grid]
            curve.append(r(np.nanmean(vals), 3) if vals else None)
        rep[n] = curve
    base_rep = r(np.nanmean([distinct2(grid[f"base|{pk}"]) for pk in prompts]), 3)
    fam = {"nla": [n for n in vecs if n.startswith("nla:")], "direct": [n for n in vecs if n.startswith("direct:")],
           "reference": [n for n in vecs if n.startswith("reference:")], "random": [n for n in vecs if n.startswith("random:")]}
    rep_mean = {f: [r(np.mean([rep[n][i] for n in ns]), 3) for i in range(len(alphas))] for f, ns in fam.items()}

    # 4. judge ratings (analysis/gpu_judge.py), if present
    jp = RUN / "judge.json"
    judge = None
    if jp.exists():
        J = json.loads(jp.read_text())
        sc = J["scores"]
        pks = list(prompts)
        def mean_over(vec: str, a: float, kind: str):
            vals = [sc.get(f"{vec}|{pk}|{a}", {}).get(kind) for pk in pks]
            vals = [v for v in vals if v is not None]
            return r(np.mean(vals), 2) if len(vals) == len(pks) else None
        base = lambda kind: r(np.mean([sc[f"base|{pk}"][kind] for pk in pks]), 2)  # noqa: E731
        tr = {}
        for c in CONCEPTS:
            k = f"trait:{c}"
            row = {"nla": [mean_over(f"nla:{c}", a, k) for a in alphas], "direct": [mean_over(f"direct:{c}", a, k) for a in alphas], "base": base(k)}
            if c in REF:
                row["reference"] = [mean_over(f"reference:{REF[c]}", a, k) for a in alphas]
            rr = np.array([[mean_over(n, a, k) for a in alphas] for n in rand], dtype=float)
            row["random_min"] = [r(x, 2) for x in rr.min(0)]
            row["random_max"] = [r(x, 2) for x in rr.max(0)]
            tr[c] = row
        coh_nla = np.array([[mean_over(f"nla:{c}", a, "coherence") for a in alphas] for c in CONCEPTS], dtype=float).mean(0)
        coh_dir = np.array([[mean_over(f"direct:{c}", a, "coherence") for a in alphas] for c in CONCEPTS], dtype=float).mean(0)
        coh_ref = np.array([[mean_over(f"reference:{t}", a, "coherence") for a in alphas] for t in REF.values()], dtype=float).mean(0)
        coh_rnd = np.array([[mean_over(n, a, "coherence") for a in alphas] for n in rand], dtype=float)
        coh_by = {fam: {c: [mean_over(f"{fam}:{c}", a, "coherence") for a in alphas] for c in CONCEPTS} for fam in ("nla", "direct")}
        rnd_coh = np.array([[mean_over(n, a, "coherence") for a in alphas] for n in rand], dtype=float)
        i075, i1 = alphas.index(0.75), alphas.index(1.0)
        matched = {}
        for c in CONCEPTS:
            matched[c] = {"nla_trait_075": tr[c]["nla"][i075], "nla_coherence_075": coh_by["nla"][c][i075],
                          "random_trait_max_1": tr[c]["random_max"][i1], "random_trait_min_1": tr[c]["random_min"][i1],
                          "unsteered_trait": tr[c]["base"],
                          "margin": r(tr[c]["nla"][i075] - max(tr[c]["random_max"][i1], tr[c]["base"]), 2),
                          "direct_trait_075": tr[c]["direct"][i075], "direct_coherence_075": coh_by["direct"][c][i075],
                          "direct_margin": r(tr[c]["direct"][i075] - max(tr[c]["random_max"][i1], tr[c]["base"]), 2)}
        matched_counts = {fam: {"clear": int(sum(matched[c][k] > 1.0 for c in CONCEPTS)),
                                "marginal": int(sum(0 < matched[c][k] <= 1.0 for c in CONCEPTS)),
                                "none": int(sum(matched[c][k] <= 0 for c in CONCEPTS))}
                          for fam, k in (("nla", "margin"), ("direct", "direct_margin"))}
        matched_meta = {"counts": matched_counts,"random_coherence_1_min": r(rnd_coh[:, i1].min(), 2), "random_coherence_1_max": r(rnd_coh[:, i1].max(), 2),
                        "nla_coherence_075_min": r(min(coh_by["nla"][c][i075] for c in CONCEPTS), 2),
                        "nla_coherence_075_max": r(max(coh_by["nla"][c][i075] for c in CONCEPTS), 2),
                        "nla_coherence_1_by_trait": {c: coh_by["nla"][c][i1] for c in CONCEPTS}}
        margins = {fam: {c: [r(tr[c][fam][i] - tr[c]["random_max"][i], 2) for i in range(len(alphas))] for c in CONCEPTS} for fam in ("nla", "direct")}
        above = {fam: [int(sum(margins[fam][c][i] > 0 for c in CONCEPTS)) for i in range(len(alphas))] for fam in margins}
        direct_higher = [int(sum(tr[c]["direct"][i] > tr[c]["nla"][i] for c in CONCEPTS)) for i in range(len(alphas))]
        judge = {"coherence_by_trait": coh_by, "matched": matched, "matched_meta": matched_meta, "margins_over_random": margins, "n_traits_above_random": above, "n_traits_direct_higher": direct_higher,
                 "judge_model": J["judge"], "traits": J["traits"], "alphas": alphas, "n_random": len(rand), "trait": tr,
                 "coherence": {"nla": [r(x, 2) for x in coh_nla], "direct": [r(x, 2) for x in coh_dir], "reference": [r(x, 2) for x in coh_ref],
                               "random_min": [r(x, 2) for x in coh_rnd.min(0)], "random_max": [r(x, 2) for x in coh_rnd.max(0)], "base": base("coherence")}}

    write_json("gpu_summary.json", {
        "provenance": prov, "alphas_all": en["alphas"], "alphas": alphas, "n_random": len(rand),
        "direct_baseline": direct, "yes_no": yes, "repetition": rep, "repetition_mean": rep_mean, "repetition_unsteered": base_rep,
        "prompts_yes_no": en["prompts"], "judge": judge, "yes_no_high": hi, "yes_controls_min": good_min,
    })

    # 5. one file per trait for the explorer: the trait's description vector, the Qwen-reads-it baseline,
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
