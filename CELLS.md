# Notebook cell reference

What each cell does, by notebook. `md` = markdown, code cells run top to bottom.
Shared texts live in **`nla_texts.py`** (`SCENARIOS`, `DEFAULT_CONTRAST`, the `T_*` constants,
`REGISTER_PAIRS` / `PLAIN_PAIRS` / `KEYWORD_PAIRS`); all notebooks import from it.

Models load one at a time and offload the previous one (AR -> target -> AV) to fit in memory.

---

## experiment1_steering_from_text.ipynb — does hand-written text give a working steering vector?

| # | type | what it does |
|---|---|---|
| 0 | md | Title and overview. |
| 1 | code | Shell/env setup (`pip`/paths). |
| 2 | code | Imports and config (model paths, layers, device, dtype, `console`). |
| 3 | code | Load the conventional reference vectors (`sycophantic`/`evil`/`hallucinating` `.pt`) into `trait_vectors`. |
| 4 | code | Load the AR (`critic` = `NLACritic`). |
| 5 | code | Helper functions: `cosine_sim`, `_unit`, steering (`steer_with_raw_vector`, `prompt_compiled_vectors`), `compile_steering_vectors`, `norm_ref`, offload/restore. |
| 6 | md | How to write texts in the AV register (genre label -> passage -> quoted fragments + next-token guess). |
| 7 | code | Import `SCENARIOS`/`DEFAULT_CONTRAST` from `nla_texts.py`; print scenario counts per concept. |
| 8 | md | Section: compile and compare. |
| 9 | code | Build `TEXT_STEERING_PAIRS` from all scenarios (multiple per concept, averaged; neg chosen by `DEFAULT_CONTRAST`) -> `COMPILED_VECTORS`; print the cross-concept gram matrix. |
| 10 | code | **Contrast comparison + background**: cosine to conventional for absolute / abs−background / delta-opposite / delta-neutral (averaged over scenarios); computes the trait-free `BACKGROUND` vector (AR phase, critic resident). |
| 11 | code | PCA scatter of compiled NLA deltas vs conventional vectors (`pca_vectors.png`). |
| 12 | code | Offload AR, load the target model, compute `norm_ref` (alpha scaling reference). |
| 13 | md | Section: steering playground. |
| 14 | code | Steer on the sycophancy prompt across the alpha grid (edit `PROMPT`/`VECTOR_NAME`/`ALPHAS`). |
| 15 | code | Same prompt/alphas steered with the conventional vector (apples-to-apples baseline). |
| 16 | md | Section: persona/belief injection demos. |
| 17 | code | Gandhi steering demo (forced-choice conflict prompt). |
| 18 | code | Political-economy steering demo (forced-choice capitalism vs socialism prompts). |
| 19 | code | Misalignment steering demo (risky-request prompt). |
| 20 | code | Religion steering demo (meaning-of-life prompt). |
| 21 | md | Section: absolute vs delta AR geometry. |
| 22 | code | Step 1 geometry from compiled tensors: each derived vector (pos/neg/delta/center/pos-centered) vs conventional traits. |
| 23 | code | Step 2: steer with absolute vs delta vectors at matched alphas, side by side. |
| 24 | code | Step 3: center-of-mass geometry — mean pairwise cosine between concept centers, and cos(center, delta). |
| 25 | code | **Single-text steering**: raw absolute vs background-subtracted vs delta on the sycophancy prompt — does subtracting `BACKGROUND` rescue one-text steering? |
| 26 | md | Optional section: AV read-backs. |
| 27 | code | Optional: offload target, load AV, verbalize the compiled vectors back to text. |
| 28 | code | (empty) |

## experiment2_register_gap.ipynb — what does the AR respond to, format or meaning?

| # | type | what it does |
|---|---|---|
| 0 | md | Title and overview. |
| 1 | code | Imports and config. |
| 2 | code | Load conventional reference vectors; `conventional_FOR_CONCEPT` map. |
| 3 | code | Load the AR. |
| 4 | code | Helpers: cosine/units, memory mgmt, batched AR forward, id-level reconstruct for ablation. |
| 5 | md | Section: register-gap sweep. |
| 6 | code | Import the five variant text sets from `nla_texts.py`: `T_REG` (register), `T_PLAIN`, `T_KEYWORDS`, `T_REG_NEUTRAL` (d), `T_REG_VALENCE` (e). |
| 7 | code | Run all variants through the AR; tabulate cos(delta_variant, conventional) and a register-vs-all specificity table. |
| 8 | md | Section: token ablation. |
| 9 | code | Per-token ablation of the sycophancy positive text (pad each token, measure vector rotation); save `token_ablation_syco.png`. |
| 10 | code | Structured section ablations: drop genre label / final-token guess / quoted phrases; cosine impact. |
| 11 | md | Section: fixed-point iteration. |
| 12 | code | Load the AV alongside the AR. |
| 13 | code | Run text -> AR -> AV -> text chains for several variants. |
| 14 | code | Chain diagnostics + plot: does cos(delta_n, conventional) climb across iterations (`fixed_point_curves.png`)? |
| 15 | code | Print the intermediate chain texts (qualitative). |
| 16 | md | Section: does the cosine gap cash out behaviorally? |
| 17 | code | Offload AR/AV, load the target model. |
| 18 | code | Steering grid: behavioral effect of register vs plain deltas across concepts/alphas. |
| 19 | md | Findings template. |

## experiment3_probes_and_closed_loop.ipynb — probes, vector algebra, closed loop

| # | type | what it does |
|---|---|---|
| 0 | md | Title and overview of experiments A/B/C. |
| 1 | code | Imports and config. |
| 2 | code | Load conventional reference vectors; `_unit`, offload helpers. |
| 3 | code | Load the AR. |
| 4 | code | Import the texts needed (register pairs, plain instructions, composition, negation, neutral base). |
| 5 | code | AR phase: compile every direction into `DIRS` (register deltas **averaged over scenarios**); save `idea5_dirs.pt`. |
| 6 | md | Experiment B (analysis): vector algebra in text space. |
| 7 | code | Composition (lstsq projection of combo onto span{syco, religion}, residual) and negation cosine; table. |
| 8 | md | Experiment A: text-compiled directions as zero-shot probes. |
| 9 | code | Offload AR, load the target model, compute `norm_ref`. |
| 10 | code | Behavior dataset: trait-eliciting vs suppressing system prompts + eval questions (sycophancy prompts are decision/opinion-validation + a few factual); generation/extraction helpers. |
| 11 | code | Slow cell: generate responses under each system prompt and extract response-mean activations; save `idea5_probe_acts.pt`. |
| 12 | code | Score each direction as a linear probe (AUROC + effect size) vs conventional skyline and random floor. |
| 13 | md | Experiment B (behavioral): composed steering. |
| 14 | code | `generate_steered`; compare syco-only / religion-only / sum / compiled-combo at alpha=+0.6. |
| 15 | md | Experiment C: the closed loop. |
| 16 | code | Steer at alpha=+0.75 (and 0), replay under the hook, extract steered activations; save `idea5_loop_acts.pt`. |
| 17 | code | **Steering dose-response (projection)**: project steered response activations onto the conventional trait vector across alphas; save `steering_dose_response.png`. |
| 18 | code | Offload target, load AV, read back the stored activations; describe-vs-become score. |
| 19 | md | What goes in the write-up (claims -> evidence cells). |
| 20-21 | code | (empty) |

## experiment4_caa_reference_vectors.ipynb — conventional CAA vectors (independent of the AR)

Builds classic CAA vectors from hand-written contrastive **response pairs**. Does not use the
AV/AR or `nla_texts.py`, so it is unaffected by text changes — only re-run if you edit its pairs.

| # | type | what it does |
|---|---|---|
| 0 | md | Title and overview. |
| 1 | code | Imports and config. |
| 2 | code | Load the target model (the only model this notebook needs). |
| 3 | md | Thematic concepts (pole vs pole). |
| 4 | code | `THEMATIC_PAIRS`: (question, pos_response, neg_response) triples. |
| 5 | md | Persona vectors. |
| 6 | code | `PERSONA_PAIRS` (specific voice vs neutral assistant). |
| 7 | md | Behavioral extremes. |
| 8 | code | `BEHAVIORAL_PAIRS` (extreme behavior vs calibrated assistant). |
| 9 | md | Extract and save. |
| 10 | code | Merge all pairs; extract diff-of-means CAA vectors; save per-concept `.pt` files. |
| 11 | code | Sanity-check CAA vectors against conventional ground truth. |
| 12 | md | Cosine matrix and PCA. |
| 13 | code | Full cosine heatmap (`caa_cosine_matrix.png`). |
| 14 | code | PCA scatter grouped by category (`caa_pca.png`). |
| 15 | md | Next steps (CAA vs NLA-compiled comparison — not yet implemented). |
| 16 | code | (empty) |
