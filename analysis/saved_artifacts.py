#!/usr/bin/env python3
"""Recompute every number that can be derived from tensors already saved in the repo.

No model weights, no GPU. Runs in a few seconds on a laptop:

    python analysis/saved_artifacts.py

Inputs (all committed to the repo):
    {sycophantic,evil,hallucinating}_vectors.pt   persona-vector references, [28, 3584]
    *_caa_vectors.pt                               experiment 4 CAA vectors
    idea5_dirs.pt                                  experiment 3 compiled directions (2026-06-16)
    idea5_probe_acts.pt                            experiment 3 response activations + labels
    fp_chains.pt                                   experiment 2 fixed-point chains
    serve/gallery_vectors.pt                       gallery deltas (2026-08-24, current texts)
    web/public/gallery.json                        gallery outputs and recorded cosines

Output: web/public/data/saved_artifacts.json

Two kinds of result are written and kept apart:
  * "reproduced": a number a notebook printed, recomputed here from the saved tensor.
  * "new_analysis": a statistic no notebook computed (random-direction nulls, bootstrap
    intervals). Inputs are the same saved tensors; the method is in this file.
"""

from __future__ import annotations

import itertools
import json

import numpy as np
import torch
from sklearn.metrics import roc_auc_score

from common import (
    REPO, CAA_CONCEPTS, caa_vectors, cos, load, provenance, r, reference_vectors, unit,
    write_json,
)

N_RANDOM = 2000      # random directions for the probe null
N_BOOT = 2000        # bootstrap resamples for effect-size intervals
RNG_SEED = 12345


def matched_norm_random(v: torch.Tensor, seed: int) -> torch.Tensor:
    """Byte-for-byte copy of nla_steering_helpers.matched_norm_random."""
    torch.manual_seed(seed)
    rnd = torch.randn_like(v, dtype=torch.float32)
    return (rnd * (v.float().norm() / rnd.norm())).to(v.dtype)


def probe_stats(direction: torch.Tensor, acts: torch.Tensor, labels: np.ndarray):
    """Same definition as experiment 3 cell 12: AUROC and pooled-std separation."""
    scores = (acts.float() @ unit(direction)).numpy()
    auroc = roc_auc_score(labels, scores)
    pos, neg = scores[labels == 1], scores[labels == 0]
    pooled = np.sqrt((pos.var() + neg.var()) / 2).clip(1e-9)
    return float(auroc), float((pos.mean() - neg.mean()) / pooled), scores


def main() -> None:
    refs = reference_vectors()
    caa = caa_vectors()
    out: dict = {"provenance": provenance("saved_artifacts.py")}

    # ── reference vectors ──────────────────────────────────────────────────────────
    out["reference_norms"] = {
        "source": "{trait}_vectors.pt row 20, float32 (experiment 1 cell 3 prints the same)",
        "values": {k: r(v.norm(), 2) for k, v in refs.items()},
    }

    # ── experiment 3 compiled directions (saved 2026-06-16, earlier text versions) ──
    dirs = load(REPO / "idea5_dirs.pt")
    out["june_directions"] = {
        "source": "idea5_dirs.pt, written by experiment 3 cell 5 on 2026-06-16. The texts "
                  "that produced these were rewritten on 2026-06-25 (commit 29e264e), so these "
                  "vectors are the only surviving record of the June measurements.",
        "norms": {k: r(v.norm(), 2) for k, v in dirs.items()},
        "cos_vs_reference": {
            k: {t: r(cos(v, refs[t]), 3) for t in refs} for k, v in dirs.items()
        },
    }

    # ── text-space algebra, experiment 3 cell 7 ─────────────────────────────────────
    u_s, u_r, u_c = unit(dirs["syco_register"]), unit(dirs["religion"]), unit(dirs["syco_religious"])
    B = torch.stack([u_s, u_r], dim=1)
    coef = torch.linalg.lstsq(B, u_c.unsqueeze(1)).solution.flatten()
    resid = (u_c - (B @ coef).flatten()).norm().item()
    out["june_algebra"] = {
        "source": "idea5_dirs.pt; same computation as experiment 3 cell 7",
        "cos_combo_syco": r(cos(u_c, u_s), 3),
        "cos_combo_religion": r(cos(u_c, u_r), 3),
        "cos_combo_sum": r(cos(u_c, u_s + u_r), 3),
        "lstsq_coef": [r(coef[0], 2), r(coef[1], 2)],
        "residual_norm_fraction": r(resid, 3),
        "residual_variance_fraction": r(resid ** 2, 3),
        "cos_syco_religion": r(cos(u_s, u_r), 3),
        "cos_notsyco_syco": r(cos(dirs["not_syco"], u_s), 3),
    }

    # ── probes, experiment 3 cells 11-12, plus new nulls ────────────────────────────
    probe = load(REPO / "idea5_probe_acts.pt")
    key = {"sycophancy": ("syco", "sycophantic"), "evil": ("evil", "evil")}
    rng = np.random.default_rng(RNG_SEED)
    probes: dict = {
        "source": "idea5_probe_acts.pt (response-mean activations at layer 20, greedy, 110 "
                  "tokens) scored against idea5_dirs.pt and the reference vectors. Rows "
                  "'register', 'plain', 'reference', 'random_seed0' reproduce experiment 3 "
                  "cell 12. Everything under 'null' and 'bootstrap' is new analysis.",
        "concepts": {},
    }
    for concept, (dk, tk) in key.items():
        acts = probe[concept]["acts"].float()
        labels = np.asarray(probe[concept]["labels"])
        n_pos, n_neg = int(labels.sum()), int((1 - labels).sum())
        rows = {}
        for name, d in [
            ("register", dirs[f"{dk}_register"]),
            ("plain", dirs[f"{dk}_plain"]),
            ("reference", refs[tk]),
            ("random_seed0", matched_norm_random(refs[tk], seed=0)),
        ]:
            a, eff, scores = probe_stats(d, acts, labels)
            rows[name] = {"auroc": r(a, 3), "d": r(eff, 2),
                          "scores_pos": [r(x, 3) for x in scores[labels == 1]],
                          "scores_neg": [r(x, 3) for x in scores[labels == 0]]}

        # New: distribution over many random directions. AUROC is direction-signed, so the
        # relevant null for "this direction separates the classes" is |AUROC - 0.5|.
        g = torch.Generator().manual_seed(RNG_SEED)
        R = torch.randn(N_RANDOM, acts.shape[1], generator=g)
        R = R / R.norm(dim=1, keepdim=True)
        S = (acts @ R.T).numpy()  # (n, N_RANDOM)
        null_auc = np.array([roc_auc_score(labels, S[:, j]) for j in range(N_RANDOM)])
        pos, neg = S[labels == 1], S[labels == 0]
        null_d = (pos.mean(0) - neg.mean(0)) / np.sqrt((pos.var(0) + neg.var(0)) / 2)
        sep = np.abs(null_auc - 0.5) + 0.5
        null = {
            "n_directions": N_RANDOM,
            "auroc_folded_quantiles": {q: r(np.quantile(sep, q), 3) for q in (0.5, 0.9, 0.99)},
            "frac_folded_auroc_ge_0_95": r((sep >= 0.95).mean(), 4),
            "frac_folded_auroc_eq_1": r((sep >= 1.0).mean(), 4),
            "abs_d_quantiles": {q: r(np.quantile(np.abs(null_d), q), 2) for q in (0.5, 0.9, 0.99)},
            "abs_d_max": r(np.abs(null_d).max(), 2),
            "hist_abs_d": np.histogram(np.abs(null_d), bins=30, range=(0, 15))[0].tolist(),
            "hist_abs_d_edges": [0, 15, 30],
        }
        for name in ("register", "plain", "reference"):
            null[f"frac_random_abs_d_ge_{name}"] = r((np.abs(null_d) >= abs(rows[name]["d"])).mean(), 4)

        # New: class-mean difference of the probe data itself (an in-sample upper bound) and
        # how well each candidate direction aligns with it.
        mean_diff = acts[labels == 1].mean(0) - acts[labels == 0].mean(0)
        align = {name: r(cos(d, mean_diff), 3) for name, d in [
            ("register", dirs[f"{dk}_register"]), ("plain", dirs[f"{dk}_plain"]),
            ("reference", refs[tk]),
        ]}

        # New: bootstrap interval on d for each real direction (stratified resampling).
        boot = {}
        ip, ineg = np.where(labels == 1)[0], np.where(labels == 0)[0]
        for name in ("register", "plain", "reference"):
            sp = np.array(rows[name]["scores_pos"]); sn = np.array(rows[name]["scores_neg"])
            ds = []
            for _ in range(N_BOOT):
                bp = sp[rng.integers(0, len(sp), len(sp))]
                bn = sn[rng.integers(0, len(sn), len(sn))]
                ds.append((bp.mean() - bn.mean()) / max(np.sqrt((bp.var() + bn.var()) / 2), 1e-9))
            boot[name] = {"d_ci95": [r(np.quantile(ds, 0.025), 2), r(np.quantile(ds, 0.975), 2)]}

        probes["concepts"][concept] = {
            "n_pos": n_pos, "n_neg": n_neg, "rows": rows, "null": null,
            "cos_with_probe_mean_difference": align, "bootstrap": boot,
        }
    out["probes"] = probes

    # ── fixed-point chains, experiment 2 cell 14 ─────────────────────────────────────
    fp = load(REPO / "fp_chains.pt")
    conv = {"sycophancy": "sycophantic", "evil": "evil", "hallucinating": "hallucinating"}
    chains = {}
    for (concept, start, pol), item in fp.items():
        if pol != "pos":
            continue
        vp, vn = item["vecs"], fp[(concept, start, "neg")]["vecs"]
        chains[f"{concept}/{start}"] = {
            "cos_delta_vs_reference": [r(cos(vp[n] - vn[n], refs[conv[concept]]), 3)
                                       for n in range(vp.shape[0])],
            "cos_vn_v0": [r(cos(vp[n], vp[0]), 3) for n in range(vp.shape[0])],
        }
    out["fixed_point"] = {
        "source": "fp_chains.pt (experiment 2 cell 13, AV temperature 0.7, 5 iterations)",
        "chains": chains,
    }

    # ── CAA vectors, experiment 4 cells 10-13 ────────────────────────────────────────
    allv = {f"reference:{k}": v for k, v in refs.items()}
    allv.update({f"caa:{k}": v for k, v in caa.items()})
    names = list(allv)
    M = torch.stack([unit(allv[n]) for n in names])
    C = (M @ M.T).numpy()
    pairs = sorted(
        ((float(C[i, j]), names[i], names[j]) for i, j in itertools.combinations(range(len(names)), 2)),
        key=lambda t: -abs(t[0]),
    )
    out["caa"] = {
        "source": "*_caa_vectors.pt and reference vectors (experiment 4 cells 10, 11, 13)",
        "norms": {k: r(v.norm(), 2) for k, v in caa.items()},
        "names": names,
        "matrix": [[r(x, 3) for x in row] for row in C],
        "top_pairs": [[r(c, 3), a, b] for c, a, b in pairs[:12]],
        "sanity": {
            "compulsive_liar~hallucinating": r(cos(caa["compulsive_liar"], refs["hallucinating"]), 3),
            "contrarian~sycophantic": r(cos(caa["contrarian"], refs["sycophantic"]), 3),
            "obsequious_service~sycophantic": r(cos(caa["obsequious_service"], refs["sycophantic"]), 3),
            "misaligned~evil": r(cos(caa["misaligned"], refs["evil"]), 3),
            "power_seeking~evil": r(cos(caa["power_seeking"], refs["evil"]), 3),
            "epistemic_coward~sycophantic": r(cos(caa["epistemic_coward"], refs["sycophantic"]), 3),
        },
    }

    # ── gallery vectors (current texts) ──────────────────────────────────────────────
    gal = json.loads((REPO / "web/public/gallery.json").read_text())
    gv = load(REPO / "serve/gallery_vectors.pt")
    gallery = {}
    for c in gal["concepts"]:
        d = gv[c["vector_id"]]
        cs = {n: r(cos(d, v), 4) for n, v in allv.items()}
        ranked = sorted(cs.items(), key=lambda kv: -abs(kv[1]))
        recorded = c["all_cosines"]
        gallery[c["id"]] = {
            "norm": r(d.norm(), 3),
            "n_scenarios": c["n_scenarios"],
            "cosines": cs,
            "nearest": ranked[0][0],
            "nearest_cos": ranked[0][1],
            "max_abs_diff_vs_gallery_json": r(max(abs(cs[k] - recorded[k]) for k in recorded), 6),
        }
    names_g = list(gallery)
    G = torch.stack([unit(gv[c["vector_id"]]) for c in gal["concepts"]])
    out["gallery_vectors"] = {
        "source": "serve/gallery_vectors.pt, compiled 2026-08-24 by scripts/build_gallery.py "
                  "from the current nla_texts.py (all scenarios averaged, pos minus neg)",
        "concepts": gallery,
        "gram_names": names_g,
        "gram": [[r(x, 3) for x in row] for row in (G @ G.T).numpy()],
    }

    write_json("saved_artifacts.json", out)

    # console summary
    print("june cos:", out["june_directions"]["cos_vs_reference"]["syco_register"])
    for c, p in probes["concepts"].items():
        print(c, {k: (v["auroc"], v["d"]) for k, v in p["rows"].items()}, p["null"]["auroc_folded_quantiles"],
              "frac>=.95", p["null"]["frac_folded_auroc_ge_0_95"], "absd q", p["null"]["abs_d_quantiles"],
              {k: v for k, v in p["null"].items() if k.startswith("frac_random")}, p["cos_with_probe_mean_difference"], p["bootstrap"])
    print({k: v["max_abs_diff_vs_gallery_json"] for k, v in gallery.items()})
    print(out["caa"]["sanity"])


if __name__ == "__main__":
    main()
