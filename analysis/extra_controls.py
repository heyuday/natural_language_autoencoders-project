#!/usr/bin/env python3
"""Controls requested by an independent review, computed on CPU from files already on disk.

No model is loaded. Reconstructor outputs are read from the cache written by ar_rerun.py
(analysis/.ar_cache, keyed by sha256 of the text); everything else is a saved tensor.

    python analysis/extra_controls.py

Output: web/public/data/extra_controls.json
"""

from __future__ import annotations

import hashlib
import itertools
import json

import numpy as np
import torch
from sklearn.metrics import roc_auc_score

from common import DATA_OUT, REPO, caa_vectors, cos, load, provenance, r, reference_vectors, unit, write_json
import nla_texts as T

CACHE = REPO / "analysis/.ar_cache"


def AR(text: str) -> torch.Tensor:
    p = CACHE / f"{hashlib.sha256(text.encode()).hexdigest()}.pt"
    if not p.exists():
        raise SystemExit(f"not cached; run analysis/ar_rerun.py first: {text[:60]!r}")
    return torch.load(p)


def d_effect(scores: np.ndarray, labels: np.ndarray) -> float:
    pos, neg = scores[labels == 1], scores[labels == 0]
    return float((pos.mean() - neg.mean()) / np.sqrt((pos.var() + neg.var()) / 2))


def main() -> None:
    refs = reference_vectors()
    caa = caa_vectors()
    out: dict = {"provenance": provenance("extra_controls.py", label="NEW ANALYSIS, CPU only")}

    # 1. null band per reference, including CAA references
    neutral = [s["neutral"] for c in T.SCENARIOS for s in T.SCENARIOS[c]] + [T.T_REG_NEUTRAL_OFFICE, T.T_REG_NEUTRAL_LIBRARY]
    targets = {**{f"reference:{k}": v for k, v in refs.items()},
               **{f"caa:{k}": caa[k] for k in ["misaligned", "religious", "capitalist", "gandhi"]}}
    per = {}
    for name, ref in targets.items():
        vals = np.abs([cos(AR(a) - AR(b), ref) for a, b in itertools.combinations(neutral, 2)])
        per[name] = {"q95": r(np.quantile(vals, 0.95), 3), "q99": r(np.quantile(vals, 0.99), 3), "max": r(vals.max(), 3)}
    out["null_per_reference"] = {"what": "|cos| of differences between pairs of the 17 trait-free texts, per reference vector",
                                 "n_pairs": len(list(itertools.combinations(neutral, 2))), "refs": per}

    # 2. probe null from real, unrelated directions
    probe = load(REPO / "idea5_probe_acts.pt")
    dirs = load(REPO / "idea5_dirs.pt")
    gal = json.loads((REPO / "web/public/gallery.json").read_text())
    gv = load(REPO / "serve/gallery_vectors.pt")
    others = {f"caa:{k}": v for k, v in caa.items()}
    others.update({f"compiled:{c['id']}": gv[c["vector_id"]] for c in gal["concepts"]})
    probes = {}
    for concept, own_ref, own_dir, exclude in [("sycophancy", "sycophantic", "syco_register", {"compiled:sycophancy", "caa:obsequious_service", "caa:contrarian"}),
                                              ("evil", "evil", "evil_register", {"compiled:evil", "compiled:misalignment", "compiled:gandhi"})]:
        acts = probe[concept]["acts"].float()
        lab = np.asarray(probe[concept]["labels"])
        rows = {}
        for name, v in others.items():
            if name in exclude:
                continue
            s = (acts @ unit(v)).numpy()
            rows[name] = {"d": r(d_effect(s, lab), 2), "auroc": r(roc_auc_score(lab, s), 3)}
        own = d_effect((acts @ unit(dirs[own_dir])).numpy(), lab)
        ref_d = d_effect((acts @ unit(refs[own_ref])).numpy(), lab)
        absd = sorted((abs(v["d"]) for v in rows.values()), reverse=True)
        probes[concept] = {
            "compiled_d": r(own, 2), "reference_d": r(ref_d, 2),
            "n_unrelated": len(rows), "n_unrelated_with_larger_abs_d": int(sum(a > abs(own) for a in absd)),
            "max_unrelated_abs_d": r(absd[0], 2),
            "top_unrelated": sorted(([k, v["d"]] for k, v in rows.items()), key=lambda kv: -abs(kv[1]))[:5],
            "rows": rows,
        }
    out["probe_unrelated_directions"] = {
        "what": "Probe separation d of real vectors built for other concepts (13 CAA vectors and the compiled vectors of "
                "other traits), on the June probe sets. Directions plausibly related to the probed trait are excluded.",
        "concepts": probes,
    }

    # 3. anisotropy baseline: how similar are unrelated real activations?
    within = {}
    for concept in probe:
        A = torch.nn.functional.normalize(probe[concept]["acts"].float(), dim=1)
        C = (A @ A.T).numpy()
        iu = np.triu_indices(len(C), 1)
        within[concept] = r(C[iu].mean(), 3)
    A1 = torch.nn.functional.normalize(probe["sycophancy"]["acts"].float(), dim=1)
    A2 = torch.nn.functional.normalize(probe["evil"]["acts"].float(), dim=1)
    out["anisotropy"] = {
        "what": "Mean pairwise cosine between real layer-20 response-mean activations (June probe responses).",
        "within_set": within, "across_sets": r((A1 @ A2.T).mean(), 3),
        "norms_mean": r(torch.cat([probe[c]["acts"].float().norm(dim=1) for c in probe]).mean(), 1),
    }

    # 4. composition: is the plane better than the sycophancy line alone?
    u_s = unit(torch.stack([AR(s["pos"]) for s in T.SCENARIOS["sycophancy"]]).mean(0) - torch.stack([AR(s["neg"]) for s in T.SCENARIOS["sycophancy"]]).mean(0))
    u_c = unit(AR(T.T_POS_SYCO_RELIGIOUS) - AR(T.T_NEG_SYCO_RELIGIOUS))
    out["composition_line_only"] = {"residual_variance_fraction_syco_line": r(1 - float(u_c @ u_s) ** 2, 3)}

    # 5. steering scale
    out["steering_scale"] = {"norm_ref": json.loads((REPO / "web/public/gallery.json").read_text())["norm_ref"],
                             "response_mean_activation_norm": out["anisotropy"]["norms_mean"]}

    # 6. YES counts per vector, from the endorse run
    en = json.loads((DATA_OUT / "behavior_endorse.json").read_text())
    counts = {}
    for name, sets in en["vectors"].items():
        counts[name] = {k: [int(sum(p > 0.5 for p in row)) for row in v] for k, v in sets.items()}
    rand = {k: [[counts[f"random:{s}"][k][i] for s in range(10)] for i in range(len(en["alphas"]))] for k in en["prompts"]}
    out["endorse_counts"] = {"alphas": en["alphas"], "counts": {n: c for n, c in counts.items() if not n.startswith("random:")},
                             "random_counts_per_alpha": rand,
                             "random_max_count_per_alpha": {k: [max(v) for v in rr] for k, rr in rand.items()}, "n_prompts": {k: len(v) for k, v in en["prompts"].items()}}

    # 7. ablation summary across all 12 pairs (from ar_rerun.json)
    ab = json.loads((DATA_OUT / "ar_rerun.json").read_text())["section_ablations"]["concepts"]
    rows = [row for rs in ab.values() for row in rs]
    summ = {"n_pairs": len(rows)}
    for k in ["drop_quoted_phrases", "drop_final_token_guess", "drop_genre_label"]:
        po = [row[f"{k}__pos_only"] - row["baseline"] for row in rows]
        bo = [row[f"{k}__both"] - row["baseline"] for row in rows]
        summ[k] = {"pos_only_n_lower": int(sum(x < 0 for x in po)),
                   "both_n_drop_gt_0_05": int(sum(x < -0.05 for x in bo)),
                   "both_max_abs_change": r(max(abs(x) for x in bo), 3),
                   "both_max_rise": r(max(bo), 3), "both_max_drop": r(-min(bo), 3)}
    for k in ["drop_quoted_phrases"]:
        bo = [row[f"{k}__both"] - row["baseline"] for row in rows]
        summ[k]["both_max_abs_change_others"] = r(max(abs(x) for x in bo if x >= -0.05), 3)
    out["ablation_summary"] = summ

    # 8. cosine anchor from unrelated example-based vectors (CAA personas and behaviors)
    unrelated = {"reference:sycophantic": ["trump", "hemingway", "valley_girl", "conspiracy_theorist", "religious", "capitalist", "power_seeking", "misaligned", "compulsive_liar", "gandhi"],
                 "reference:evil": ["trump", "hemingway", "valley_girl", "conspiracy_theorist", "religious", "capitalist", "obsequious_service", "epistemic_coward", "compulsive_liar"],
                 "reference:hallucinating": ["trump", "hemingway", "valley_girl", "religious", "capitalist", "gandhi", "power_seeking", "obsequious_service", "contrarian"]}
    anchor = {}
    for rk, names in unrelated.items():
        vals = {n: r(cos(caa[n], refs[rk.split(":")[1]]), 3) for n in names}
        top = max(vals.items(), key=lambda kv: kv[1])
        anchor[rk] = {"max": top[1], "max_name": top[0], "values": vals}
    out["unrelated_vector_anchor"] = {"what": "cos of CAA vectors built for unrelated concepts with each standard vector", "refs": anchor}

    # 9. the yes/no test in detail: floor, and which prompts flip
    alphas = en["alphas"]; i0 = alphas.index(0.0)
    floor = {k: int(sum(p < 0.05 for p in en["vectors"]["nla:sycophancy"][k][i0])) for k in en["prompts"]}
    def first_flip(rowsets, qi):
        for j, a in enumerate(alphas):
            if a > 0 and rowsets[j][qi] > 0.5:
                return a
        return None
    flips = {}
    for k in en["prompts"]:
        for qi, q in enumerate(en["prompts"][k]):
            if en["vectors"]["nla:sycophancy"][k][i0][qi] > 0.5:
                continue
            f_n = first_flip(en["vectors"]["nla:sycophancy"][k], qi)
            if f_n is None:
                continue
            rnd = [first_flip(en["vectors"][f"random:{s}"][k], qi) for s in range(10)]
            rnd = [x for x in rnd if x is not None]
            flips.setdefault(k, []).append({"prompt": q, "description_vector_first_yes_at": f_n,
                                            "earliest_random_first_yes_at": min(rnd) if rnd else None,
                                            "p_yes_description": [r(x[qi], 3) for x in en["vectors"]["nla:sycophancy"][k]],
                                            "p_yes_random_max": [r(max(en["vectors"][f"random:{s}"][k][j][qi] for s in range(10)), 3) for j in range(len(alphas))]})
    out["endorse_detail"] = {"alphas": alphas, "n_near_zero_unsteered": floor,
                             "n_prompts": {k: len(v) for k, v in en["prompts"].items()}, "flips": flips}

    # 10. measures from the sweep cells the page did not show
    grid = json.loads((DATA_OUT / "behavior_grid.json").read_text())
    ga = grid["alphas"]; cells = grid["cells"]; pks = list(grid["prompts"])
    def mean_of(field, a, sub=None):
        vals = []
        for pk in pks:
            key = f"base|{pk}|0.0" if a == 0 else f"nla:sycophancy|{pk}|{a}"
            if key in cells:
                v = cells[key][field] if sub is None else cells[key][field].get(sub)
                if v is not None:
                    vals.append(v)
        return r(np.mean(vals), 2) if len(vals) == len(pks) else None
    out["sweep_measures"] = {"alphas": ga, "self_rated_sycophancy": [mean_of("trait", a, "sycophancy") for a in ga],
                             "mean_logprob": [mean_of("coherence", a) for a in ga]}

    write_json("extra_controls.json", out)
    print(json.dumps({k: v for k, v in out.items() if k not in ("provenance", "probe_unrelated_directions")}, indent=1)[:3000])
    for c, p in probes.items():
        print(c, p["compiled_d"], p["reference_d"], p["n_unrelated_with_larger_abs_d"], "/", p["n_unrelated"], p["top_unrelated"])


if __name__ == "__main__":
    main()
