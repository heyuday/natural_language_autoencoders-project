# Steering vectors from sentences

**[Read the interactive write-up →](https://nla-steering.vercel.app)**

We write two short descriptions of a behavior, pass them through the reconstructor (AR) of a
[Natural Language Autoencoder](https://transformer-circuits.pub/2026/nla/index.html), and use the
difference `Δ = AR(t_pos) − AR(t_neg)` as a steering vector for Qwen2.5-7B-Instruct at layer 20.
No labeled examples, no training.

By Uday Tyagi and Tyler Kim. Built on the NLA system released by Fraser-Taliente, Kantamneni, Ong
et al. (Transformer Circuits, 2026).

![NLA system flow and the register gap experiment](nla_system_flow.png)

## What holds up, and what does not

All numbers below are on the current texts in `nla_texts.py` (re-run October 2026, see
`analysis/`). The write-up has the figures, controls and caveats.

- **Averaged vectors point toward conventional persona vectors.** Six sycophancy description pairs
  average to cosine +0.425 with a sycophancy persona vector; malice +0.531; confabulation +0.380.
- **Single pairs are close to noise.** Differences between two trait-free descriptions reach
  |cos| up to 0.362 with a reference (95th percentile 0.238).
- **Format matters for some traits.** A plain instruction compiles to +0.081 for sycophancy and
  +0.050 for confabulation, but +0.604 for malice, above the styled text.
- **Behavioral effects are small.** On a judge-free YES/NO test, the styled sycophancy vector moves
  approval of bad plans from 0.10 to 0.23 at α = 1, barely above ten random directions (up to
  0.20). The vector compiled from a plain instruction moves answers the most at α ≥ 1.25.
- **As probes, compiled vectors beat random directions in separation (d), but AUROC saturates:**
  26% of random directions reach AUROC ≥ 0.95 on the malice probe set.
- **Did not work:** fixed-point iteration through the autoencoder, AV read-back of steered
  activations, clean composition, negation.

Withdrawn from the first version: the "53% / 41%" ablation figures (never computed), "quoted
phrases and the final-token guess are load-bearing" (mostly an artifact of ablating one text of the
pair), and "a single text is often enough" (only after background subtraction, and not for
confabulation).

## Repository map

| Path | What |
|---|---|
| `nla_texts.py` | Every steering text (single source of truth) |
| `experiment1-4_*.ipynb` | The original June experiments (outputs from earlier text versions; see `FINDINGS.md`) |
| `analysis/` | Scripts that produce every number on the site, including the October re-runs |
| `serve/live/` | A no-GPU backend for compiling and steering with your own text |
| `web/` | The site (Next.js); `web/scripts/verify-numbers.mjs` checks the page against the data |
| `FINDINGS.md` | An internal audit of the June notebooks that motivated the re-runs |
| `nla/`, `configs/`, `docs/` | The upstream NLA training code (Fraser-Taliente et al.) |

## Reproduce

```bash
pip install torch transformers safetensors pyyaml scikit-learn numpy llama-cpp-python
python analysis/saved_artifacts.py                       # seconds, no model
hf download kitft/nla-qwen2.5-7b-L20-ar --local-dir ~/models-nla/nla-ar
python analysis/ar_rerun.py                              # ~15 min on an M2 Pro
hf download Qwen/Qwen2.5-7B-Instruct-GGUF --include "qwen2.5-7b-instruct-q8_0-*" --local-dir ~/models-nla/qwen-gguf
python analysis/behavior.py validation endorse grid      # hours on an M2 Pro
python analysis/summarize_behavior.py
```

The notebooks need a GPU with ~40 GB (A100) and the full-precision checkpoints:

```bash
huggingface-cli download Qwen/Qwen2.5-7B-Instruct --local-dir /path/to/models/Qwen2.5-7B-Instruct
huggingface-cli download kitft/nla-qwen2.5-7b-L20-ar --local-dir /path/to/models/nla-ar
huggingface-cli download kitft/nla-qwen2.5-7b-L20-av --local-dir /path/to/models/nla-av
```
