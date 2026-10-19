# analysis/: every number on the website comes from here

Each script writes one JSON file into `web/public/data/`. The site reads those files at build
time; no result on the page is typed in by hand. `web/scripts/verify-numbers.mjs` checks the
built page against the files.

| Script | Needs | Writes | What it is |
|---|---|---|---|
| `saved_artifacts.py` | nothing beyond the repo | `saved_artifacts.json` | Recomputes numbers from tensors saved in June (`idea5_dirs.pt`, `idea5_probe_acts.pt`, `fp_chains.pt`, the reference and CAA vectors, `serve/gallery_vectors.pt`). Adds random-direction nulls and bootstrap intervals for the probes (new analysis). |
| `export_texts.py` | nothing | `texts.json` | Copy of `nla_texts.py` for display. |
| `export_site_meta.py` | nothing | `site_meta.json` | The few fields of `web/public/gallery.json` the page needs. |
| `ar_rerun.py` | AR checkpoint | `ar_rerun.json`, `vectors_rerun.pt` | **New experiment (Oct 2026).** Every Reconstructor-only experiment from notebooks 1-3, re-run on the current texts: register gap, specificity, a null from trait-free pairs, section and token ablations, geometry, single text vs pair with background subtraction, composition, negation, valence. |
| `check_llamacpp_layer.py` | Qwen2.5-0.5B (HF + F16 GGUF) | `llamacpp_layer_check.json` | Confirms llama.cpp control-vector row L-1 equals an HF hook on block L. |
| `behavior.py` | Qwen2.5-7B-Instruct Q8_0 GGUF | `behavior_{validation,endorse,grid}.json` | **New experiment (Oct 2026).** Q8_0-vs-A100 validation; judge-free YES/NO dose-response with ten random-direction controls; a grid of steered completions with coherence and trait ratings. |
| `summarize_behavior.py` | the three files above | `behavior_summary.json`, `sweep_sycophancy.json` | Means, ranges and counts for the charts, and the sycophancy strength sweep. The grid was stopped after the sycophancy vector (100 of 1,067 cells) to keep model runs off the laptop; the other vectors need a GPU run. |
| `extra_controls.py` | outputs of the scripts above, no model | `extra_controls.json` | Controls added after an independent review: noise range per reference vector, probe comparison against vectors for other concepts, an anisotropy baseline, steering scale, YES counts, ablation summary. |
| `quantize_ar_int8.py`, `check_ar_int8.py` | AR checkpoint | `ar_int8_check.json` | Weight-only int8 copy of the AR for CPU hosting, and its fidelity and speed. |

`ar_stream.py` runs the AR one decoder layer at a time (bf16 on Metal/CUDA, or fp32 math on
CPU), so a 16 GB laptop is enough; `serve/live/app.py` reuses it.

Hardware for the October runs: Apple M2 Pro, 16 GB. Weights:
`hf download kitft/nla-qwen2.5-7b-L20-ar --local-dir ~/models-nla/nla-ar` and
`hf download Qwen/Qwen2.5-7B-Instruct-GGUF --include "qwen2.5-7b-instruct-q8_0-*" --local-dir ~/models-nla/qwen-gguf`.
