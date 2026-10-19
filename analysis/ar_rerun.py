#!/usr/bin/env python3
"""NEW EXPERIMENT (2026-10): re-run every AR-only experiment on the current nla_texts.py.

Why: the notebook tables (experiments 1-3) were computed in June from texts that were
rewritten on 2026-06-25 (commit 29e264e) and never re-run. This script recomputes them
from the texts that are in the repo now, so every AR-side number on the site can be
reproduced from the repo as it stands.

Hardware: Apple M2 Pro, 16 GB, bf16 on the Metal (MPS) backend, via analysis/ar_stream.py
(one decoder layer resident at a time). The "validation" block compares the vectors this
produces against serve/gallery_vectors.pt, which were compiled on an A100 in bf16.

    python analysis/ar_rerun.py          # ~10-15 min on an M2 Pro, cached afterwards

Output: web/public/data/ar_rerun.json and analysis/vectors_rerun.pt
"""

from __future__ import annotations

import itertools
import json
import re

import numpy as np
import torch

from ar_stream import StreamingAR
from common import REPO, caa_vectors, cos, load, provenance, r, reference_vectors, unit, write_json
import nla_texts as T

GT = {"sycophancy": "sycophantic", "evil": "evil", "hallucinating": "hallucinating",
      "misalignment": "evil"}  # misalignment has no reference; evil is a loose proxy
CONCEPTS4 = ["sycophancy", "evil", "hallucinating", "misalignment"]
ALL_CONCEPTS = list(T.SCENARIOS)
GALLERY_IDS = {  # concept -> serve/gallery_vectors.pt key (from web/public/gallery.json)
    c["id"]: c["vector_id"] for c in json.loads((REPO / "web/public/gallery.json").read_text())["concepts"]
}


# Exact copies of experiment 2 cell 10's ablation functions.
def strip_genre_label(text: str) -> str:
    ps = text.split("\n\n")
    ps[0] = re.sub(r"^[^:]*:\s*", "", ps[0])
    return "\n\n".join(ps)


def strip_final_token(text: str) -> str:
    ps = text.split("\n\n")
    ps[-1] = re.sub(r"\s*The final.*$", "", ps[-1], flags=re.S).rstrip()
    return "\n\n".join(ps)


def strip_quotes(text: str) -> str:
    return re.sub(r'"[^"]*"', '""', text)


ABLATIONS = {"drop_genre_label": strip_genre_label,
             "drop_final_token_guess": strip_final_token,
             "drop_quoted_phrases": strip_quotes}


def main() -> None:
    ar = StreamingAR()
    refs = reference_vectors()
    caa = caa_vectors()

    # ── gather every text first so the AR streams its weights once ────────────────
    texts: list[str] = []
    for c in ALL_CONCEPTS:
        for s in T.SCENARIOS[c]:
            texts += [s["pos"], s["neg"], s["neutral"]]
            for f in ABLATIONS.values():
                texts += [f(s["pos"]), f(s["neg"])]
    for c in CONCEPTS4:
        texts += list(T.PLAIN_PAIRS[c]) + list(T.KEYWORD_PAIRS[c])
    texts += [T.T_REG_NEUTRAL_OFFICE, T.T_REG_NEUTRAL_LIBRARY, T.T_VALENCE_POS, T.T_VALENCE_NEG,
              T.T_POS_SYCO_RELIGIOUS, T.T_NEG_SYCO_RELIGIOUS, T.T_NOT_SYCO, T.T_INSTRUCTION_SYCO,
              T.T_INSTRUCTION_HON, T.T_INSTRUCTION_EVIL, T.T_INSTRUCTION_KIND]
    uniq = list(dict.fromkeys(texts))
    V = dict(zip(uniq, ar.reconstruct_many(uniq)))
    A = lambda t: V[t]  # noqa: E731

    out: dict = {"provenance": provenance(
        "ar_rerun.py", label="NEW EXPERIMENT",
        hardware="Apple M2 Pro 16 GB, bf16 on MPS, layer-streamed (analysis/ar_stream.py)",
        texts="nla_texts.py as committed", n_ar_forward_passes=len(uniq))}

    def avg_delta(c: str, contrast: str = "neg") -> torch.Tensor:
        ss = T.SCENARIOS[c]
        return torch.stack([A(s["pos"]) for s in ss]).mean(0) - torch.stack([A(s[contrast]) for s in ss]).mean(0)

    # ── validation against the A100 gallery vectors ───────────────────────────────
    gv = load(REPO / "serve/gallery_vectors.pt")
    val = {}
    for c in ALL_CONCEPTS:
        d = avg_delta(c)
        g = gv[GALLERY_IDS[c]]
        val[c] = {"cos_local_vs_a100": r(cos(d, g), 5), "norm_local": r(d.norm(), 2), "norm_a100": r(g.norm(), 2)}
    out["validation"] = {
        "what": "Same texts, same averaging as scripts/build_gallery.py. A100 = serve/gallery_vectors.pt.",
        "concepts": val,
        "min_cos": r(min(v["cos_local_vs_a100"] for v in val.values()), 5),
    }

    # ── register gap (experiment 2 cell 7), current texts ─────────────────────────
    d_neutral = A(T.T_REG_NEUTRAL_OFFICE) - A(T.T_REG_NEUTRAL_LIBRARY)
    d_valence = A(T.T_VALENCE_POS) - A(T.T_VALENCE_NEG)
    gap = {}
    for c in CONCEPTS4:
        g = refs[GT[c]]
        s0 = T.SCENARIOS[c][0]
        per_scen = [cos(A(s["pos"]) - A(s["neg"]), g) for s in T.SCENARIOS[c]]
        gap[c] = {
            "reference": GT[c],
            "plain": r(cos(A(T.PLAIN_PAIRS[c][0]) - A(T.PLAIN_PAIRS[c][1]), g), 3),
            "register_scenario1": r(cos(A(s0["pos"]) - A(s0["neg"]), g), 3),
            "register_all_scenarios": r(cos(avg_delta(c), g), 3),
            "register_per_scenario": [r(x, 3) for x in per_scen],
            "n_scenarios": len(per_scen),
            "keywords": r(cos(A(T.KEYWORD_PAIRS[c][0]) - A(T.KEYWORD_PAIRS[c][1]), g), 3),
            "register_neutral_content": r(cos(d_neutral, g), 3),
            "valence_only": r(cos(d_valence, g), 3),
        }
    out["register_gap"] = {
        "what": "cos(delta, reference) for five text variants. Matches experiment 2 cell 7 "
                "(which used scenario 1 only); register_all_scenarios averages every scenario "
                "the way the gallery vectors do.",
        "concepts": gap,
    }

    # specificity: register (all scenarios) vs each reference
    out["specificity"] = {
        c: {t: r(cos(avg_delta(c), refs[t]), 3) for t in refs} for c in ALL_CONCEPTS
    }

    # ── empirical null: deltas between pairs of trait-free register texts ──────────
    neutral_texts = [s["neutral"] for c in ALL_CONCEPTS for s in T.SCENARIOS[c]] + \
        [T.T_REG_NEUTRAL_OFFICE, T.T_REG_NEUTRAL_LIBRARY]
    null = {t: [] for t in refs}
    for a, b in itertools.combinations(neutral_texts, 2):
        for t in refs:
            null[t].append(cos(A(a) - A(b), refs[t]))
    allnull = np.abs(np.concatenate([np.array(v) for v in null.values()]))
    out["null_neutral_pairs"] = {
        "what": "cos(AR(a) - AR(b), reference) over every pair of the trait-free 'neutral' "
                "register texts in nla_texts.py. Sign is arbitrary (a-b vs b-a), so the "
                "absolute value is the null for 'how far from zero can a contentless register "
                "delta land by chance'.",
        "n_texts": len(neutral_texts),
        "n_pairs": len(null["evil"]),
        "abs_quantiles": {q: r(np.quantile(allnull, q), 3) for q in (0.5, 0.9, 0.95, 0.99)},
        "abs_max": r(allnull.max(), 3),
        "per_reference_abs_max": {t: r(np.abs(v).max(), 3) for t, v in null.items()},
        "hist_abs": np.histogram(allnull, bins=25, range=(0, 0.5))[0].tolist(),
        "hist_edges": [0, 0.5, 25],
        "analytic_random_sd": r(1 / np.sqrt(3584), 4),
    }

    # ── section ablations (experiment 2 cell 10), every scenario ───────────────────
    abl = {}
    for c in CONCEPTS4:
        g = refs[GT[c]]
        rows = []
        for k, s in enumerate(T.SCENARIOS[c]):
            base = cos(A(s["pos"]) - A(s["neg"]), g)
            row = {"scenario": k + 1, "baseline": r(base, 3)}
            for name, f in ABLATIONS.items():
                row[f"{name}__pos_only"] = r(cos(A(f(s["pos"])) - A(s["neg"]), g), 3)
                row[f"{name}__both"] = r(cos(A(f(s["pos"])) - A(f(s["neg"])), g), 3)
                row[f"{name}__cos_to_base_pos"] = r(cos(A(f(s["pos"])), A(s["pos"])), 4)
            rows.append(row)
        abl[c] = rows
    out["section_ablations"] = {
        "what": "Experiment 2 cell 10's three string ablations, applied to every scenario. "
                "'pos_only' ablates the positive text and keeps the negative intact (the "
                "notebook's design). 'both' ablates both texts, so the ablation does not itself "
                "introduce a format difference into the delta.",
        "concepts": abl,
    }

    # ── per-token ablation (experiment 2 cell 9) on scenario-1 sycophancy text ─────
    pos, neg = T.SCENARIOS["sycophancy"][0]["pos"], T.SCENARIOS["sycophancy"][0]["neg"]
    ids, s0, s1 = ar.prompt_parts(pos)
    pad = ar.tokenizer.pad_token_id or ar.tokenizer.eos_token_id
    variants = [ids] + [ids[:i] + [pad] + ids[i + 1:] for i in range(s0, s1)]
    print(f"  token ablation: {len(variants)} sequences")
    VV = ar.run_ids(variants)
    v_base_ids, v_abl = VV[0], VV[1:]
    v_neg = A(neg)
    infl = 1 - torch.nn.functional.cosine_similarity(v_abl, v_base_ids.unsqueeze(0)).numpy()
    trait_after = np.array([cos(v - v_neg, refs["sycophantic"]) for v in v_abl])
    toks = [ar.tokenizer.decode([ids[i]]) for i in range(s0, s1)]
    order = np.argsort(infl)[::-1]
    out["token_ablation"] = {
        "what": "Replace one explanation token at a time with the pad token (experiment 2 "
                "cell 9), current sycophancy scenario-1 positive text.",
        "sanity_cos_ids_vs_string": r(cos(v_base_ids, A(pos)), 6),
        "n_tokens": len(toks),
        "baseline_trait_cos": r(cos(v_base_ids - v_neg, refs["sycophantic"]), 3),
        "tokens": toks,
        "influence": [r(x, 5) for x in infl],
        "trait_cos_after": [r(x, 3) for x in trait_after],
        "top10": [[toks[i], r(infl[i], 4), r(trait_after[i], 3)] for i in order[:10]],
        "trait_cos_range": [r(trait_after.min(), 3), r(trait_after.max(), 3)],
    }

    # ── geometry (experiment 1 cells 22-25) ───────────────────────────────────────
    geo = {}
    centers, deltas = {}, {}
    for c in ALL_CONCEPTS:
        ss = T.SCENARIOS[c]
        P = torch.stack([A(s["pos"]) for s in ss]).mean(0)
        N = torch.stack([A(s["neg"]) for s in ss]).mean(0)
        center, delta = (P + N) / 2, P - N
        centers[c], deltas[c] = center, delta
        geo[c] = {
            "cos_pos_delta": r(cos(P, delta), 3), "cos_neg_delta": r(cos(N, delta), 3),
            "cos_center_delta": r(cos(center, delta), 3),
            "norm_pos": r(P.norm(), 1), "norm_neg": r(N.norm(), 1),
            "norm_center": r(center.norm(), 1), "norm_delta": r(delta.norm(), 1),
            "vs_reference": {lab: {t: r(cos(v, refs[t]), 3) for t in refs}
                             for lab, v in [("pos", P), ("neg", N), ("delta", delta), ("center", center)]},
        }
    names = list(centers)
    cc = [cos(centers[a], centers[b]) for a, b in itertools.combinations(names, 2)]
    six = ["sycophancy", "evil", "misalignment", "religion", "political_economy", "gandhi"]
    cc6 = [cos(centers[a], centers[b]) for a, b in itertools.combinations(six, 2)]
    out["geometry"] = {
        "what": "Endpoints averaged over scenarios, pos minus neg. Experiment 1 cells 22-25 "
                "used the six concepts in 'six'; 'all' adds hallucinating.",
        "concepts": geo,
        "center_names": names,
        "center_matrix": [[r(cos(centers[a], centers[b]), 3) for b in names] for a in names],
        "mean_pairwise_center_cos_six": r(np.mean(cc6), 3),
        "mean_pairwise_center_cos_all": r(np.mean(cc), 3),
        "mean_center_delta_cos_six": r(np.mean([cos(centers[c], deltas[c]) for c in six]), 3),
        "mean_center_delta_cos_all": r(np.mean([cos(centers[c], deltas[c]) for c in names]), 3),
        "six": six,
        "mean_pairwise_delta_cos_all": r(np.mean([cos(deltas[a], deltas[b]) for a, b in itertools.combinations(names, 2)]), 3),
    }

    # ── single text vs pair; background subtraction (experiment 1 cell 10) ─────────
    bg_all = torch.stack([A(t) for t in neutral_texts]).mean(0)
    contrast = {}
    for c in CONCEPTS4:
        ss = T.SCENARIOS[c]
        own = {s["neutral"] for s in ss}
        bg_loo = torch.stack([A(t) for t in neutral_texts if t not in own]).mean(0)
        g = unit(refs[GT[c]])
        pos_ = [A(s["pos"]) for s in ss]
        mk = lambda vs: unit(torch.stack([unit(v) for v in vs]).mean(0))  # noqa: E731
        contrast[c] = {
            "absolute": r(mk(pos_) @ g, 3),
            "abs_minus_background": r(mk([p - bg_all for p in pos_]) @ g, 3),
            "abs_minus_background_leave_concept_out": r(mk([p - bg_loo for p in pos_]) @ g, 3),
            "delta_opposite": r(mk([p - A(s["neg"]) for p, s in zip(pos_, ss)]) @ g, 3),
            "delta_neutral": r(mk([p - A(s["neutral"]) for p, s in zip(pos_, ss)]) @ g, 3),
        }
    out["single_vs_pair"] = {
        "what": "Experiment 1 cell 10 (never run in June). Background = mean AR over all "
                f"{len(neutral_texts)} trait-free register texts. The leave-concept-out column "
                "drops the concept's own neutral texts from the background so the subtraction "
                "cannot quietly become a neutral-contrast delta.",
        "background_norm": r(bg_all.norm(), 1),
        "concepts": contrast,
    }

    # ── composition and negation (experiment 3 cell 7), current texts ─────────────
    u_s = unit(avg_delta("sycophancy"))
    u_r = unit(avg_delta("religion"))
    u_c = unit(A(T.T_POS_SYCO_RELIGIOUS) - A(T.T_NEG_SYCO_RELIGIOUS))
    Bm = torch.stack([u_s, u_r], dim=1)
    coef = torch.linalg.lstsq(Bm, u_c.unsqueeze(1)).solution.flatten()
    resid = (u_c - (Bm @ coef).flatten()).norm().item()
    d_not = A(T.T_NOT_SYCO) - A(T.T_REG_NEUTRAL_BASE)
    out["algebra"] = {
        "cos_combo_syco": r(u_c @ u_s, 3), "cos_combo_religion": r(u_c @ u_r, 3),
        "cos_combo_sum": r(cos(u_c, u_s + u_r), 3),
        "lstsq_coef": [r(coef[0], 2), r(coef[1], 2)],
        "residual_norm_fraction": r(resid, 3), "residual_variance_fraction": r(resid ** 2, 3),
        "cos_syco_religion": r(u_s @ u_r, 3), "cos_notsyco_syco": r(cos(d_not, u_s), 3),
        "cos_combo_ref_syco": r(cos(u_c, refs["sycophantic"]), 3),
    }

    # ── valence: how much of the sycophancy alignment survives removing valence ────
    d_s = avg_delta("sycophancy")
    uv = unit(d_valence)
    d_s_perp = d_s - (d_s @ uv) * uv
    ref_s = refs["sycophantic"]
    out["valence"] = {
        "what": "NEW. Project the valence-only delta (pleasant minus dreary scene) out of the "
                "sycophancy register delta and re-measure against the reference.",
        "cos_valence_vs_syco_delta": r(cos(d_valence, d_s), 3),
        "cos_valence_vs_reference": r(cos(d_valence, ref_s), 3),
        "cos_syco_delta_vs_reference": r(cos(d_s, ref_s), 3),
        "cos_syco_delta_minus_valence_vs_reference": r(cos(d_s_perp, ref_s), 3),
        "cos_reference_minus_valence_vs_syco_delta": r(cos(ref_s - (ref_s @ uv) / (uv @ uv) * uv, d_s), 3),
    }

    # ── NLA vs CAA for concepts without a persona reference ───────────────────────
    pairs = {"misalignment": "misaligned", "religion": "religious", "political_economy": "capitalist",
             "gandhi": "gandhi"}
    out["nla_vs_caa"] = {
        c: {"caa": k, "cos": r(cos(avg_delta(c), caa[k]), 3),
            "cos_power_seeking": r(cos(avg_delta(c), caa["power_seeking"]), 3)}
        for c, k in pairs.items()
    }

    write_json("ar_rerun.json", out)

    torch.save({
        "syco_register": d_s,
        "syco_plain": A(T.PLAIN_PAIRS["sycophancy"][0]) - A(T.PLAIN_PAIRS["sycophancy"][1]),
        "syco_keywords": A(T.KEYWORD_PAIRS["sycophancy"][0]) - A(T.KEYWORD_PAIRS["sycophancy"][1]),
        "syco_absolute": torch.stack([A(s["pos"]) for s in T.SCENARIOS["sycophancy"]]).mean(0),
        "syco_abs_minus_bg": torch.stack([A(s["pos"]) for s in T.SCENARIOS["sycophancy"]]).mean(0) - bg_all,
        "background": bg_all,
        "valence": d_valence,
        **{f"register:{c}": avg_delta(c) for c in ALL_CONCEPTS},
    }, REPO / "analysis/vectors_rerun.pt")
    print("wrote analysis/vectors_rerun.pt")

    print(json.dumps({k: out[k] for k in ["validation", "register_gap", "single_vs_pair", "algebra", "valence", "nla_vs_caa"]}, indent=1)[:6000])
    print("null", out["null_neutral_pairs"]["abs_quantiles"], out["null_neutral_pairs"]["abs_max"])
    print("geometry", {k: out["geometry"][k] for k in out["geometry"] if k.startswith("mean")})
    print("token top10", out["token_ablation"]["top10"], out["token_ablation"]["sanity_cos_ids_vs_string"])
    for c, rows in abl.items():
        print(c, rows)


if __name__ == "__main__":
    main()
