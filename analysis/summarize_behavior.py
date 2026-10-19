#!/usr/bin/env python3
"""Aggregate the raw behavior files into the small summary the site's charts read.

    python analysis/summarize_behavior.py

Inputs:  web/public/data/behavior_{validation,endorse,grid}.json   (analysis/behavior.py)
Output:  web/public/data/behavior_summary.json

Pure arithmetic on the raw files (means, mins, maxes, counts); nothing is re-measured.
"""

from __future__ import annotations

import json

import numpy as np

from common import DATA_OUT, provenance, r, write_json


def load(name: str):
    p = DATA_OUT / name
    return json.loads(p.read_text()) if p.exists() else None


def main() -> None:
    out: dict = {"provenance": provenance("summarize_behavior.py")}

    val = load("behavior_validation.json")
    if val:
        rows = val["rows"]
        base = [x for x in rows if x["concept"] is None]
        out["validation"] = {
            "n_rows": len(rows),
            "n_exact": sum(x["exact_match"] for x in rows),
            "unsteered_prefix_chars": [x["common_prefix_chars"] for x in base],
            "unsteered_prefix_min": min(x["common_prefix_chars"] for x in base),
            "unsteered_prefix_max": max(x["common_prefix_chars"] for x in base),
            "steered_prefix_median": float(np.median([x["common_prefix_chars"] for x in rows if x["concept"]])),
        }

    en = load("behavior_endorse.json")
    if en:
        alphas = en["alphas"]
        i0 = alphas.index(0.0)
        e: dict = {"alphas": alphas, "n_prompts": {k: len(v) for k, v in en["prompts"].items()}, "curves": {}, "random_band": {}}
        for k in en["prompts"]:
            for name, sets in en["vectors"].items():
                if name.startswith("random:"):
                    continue
                M = np.array(sets[k])  # (alpha, prompt)
                e["curves"].setdefault(name, {})[k] = {
                    "mean": [r(x, 4) for x in M.mean(1)],
                    "frac_yes": [r(x, 4) for x in (M > 0.5).mean(1)],
                    "per_prompt": [[r(x, 3) for x in row] for row in M.T],
                }
            R = np.array([np.array(s[k]).mean(1) for n, s in en["vectors"].items() if n.startswith("random:")])
            e["random_band"][k] = {
                "n": int(R.shape[0]),
                "min": [r(x, 4) for x in R.min(0)], "max": [r(x, 4) for x in R.max(0)],
                "mean": [r(x, 4) for x in R.mean(0)],
            }
            e.setdefault("baseline", {})[k] = r(np.array(en["vectors"]["nla:sycophancy"][k])[i0].mean(), 4)
        # headline: the largest rise above alpha=0 for each vector within alpha <= 1.0
        heads = {}
        for name, sets in e["curves"].items():
            for k, cur in sets.items():
                m = np.array(cur["mean"])
                idx = [j for j, a in enumerate(alphas) if 0 < a <= 1.0]
                jbest = max(idx, key=lambda j: m[j])
                heads.setdefault(name, {})[k] = {"alpha": alphas[jbest], "mean": r(m[jbest], 4),
                                                 "rise": r(m[jbest] - m[i0], 4)}
        rb = {k: max(np.array(e["random_band"][k]["max"])[[j for j, a in enumerate(alphas) if 0 < a <= 1.0]]) for k in en["prompts"]}
        e["headline"] = heads
        e["random_max_mean_upto_1"] = {k: r(v, 4) for k, v in rb.items()}
        out["endorse"] = e

    grid = load("behavior_grid.json")
    if grid:
        cells = grid["cells"]
        alphas = grid["alphas"]
        prompts = list(grid["prompts"])
        traits = list(grid["traits"])
        g: dict = {"alphas": alphas, "n_cells": len(cells), "prompts": grid["prompts"], "coherence": {}, "trait": {}}
        base_coh = [cells[f"base|{p}|0.0"]["coherence"] for p in prompts if f"base|{p}|0.0" in cells]
        g["baseline_coherence_mean"] = r(np.mean(base_coh), 3) if base_coh else None
        for v in grid["vector_order"]:
            coh = []
            for a in alphas:
                key = (lambda p: f"base|{p}|0.0") if a == 0 else (lambda p, a=a: f"{v}|{p}|{a}")
                vals = [cells[key(p)]["coherence"] for p in prompts if key(p) in cells]
                coh.append(r(np.mean(vals), 3) if len(vals) == len(prompts) else None)
            g["coherence"][v] = coh
            tr = {}
            for c in traits:
                curve = []
                for a in alphas:
                    key = (lambda p: f"base|{p}|0.0") if a == 0 else (lambda p, a=a: f"{v}|{p}|{a}")
                    vals = [cells[key(p)]["trait"].get(c) for p in prompts if key(p) in cells]
                    vals = [x for x in vals if x is not None]
                    curve.append(r(np.mean(vals), 3) if len(vals) == len(prompts) else None)
                if any(x is not None for x in curve[1:]) and not all(x is None for i, x in enumerate(curve) if alphas[i] != 0):
                    tr[c] = curve
            g["trait"][v] = tr
        out["grid"] = g

    write_json("behavior_summary.json", out)


if __name__ == "__main__":
    main()
