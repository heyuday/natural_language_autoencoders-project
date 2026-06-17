# NLA Steering Research
### Can you write text and get a reliable steering vector — no data collection, no training, no labeled examples?

This project investigates that question using the [Natural Language Autoencoders](https://transformer-circuits.pub/2026/nla/index.html) (NLA) system from Transformer Circuits. The short answer: **yes — and you can steer with a single text, not just a contrastive pair.**

---

![NLA system flow and the register gap experiment](nla_system_flow.png)


## Background: What is activation steering?

Activation steering is a technique for directly influencing how a language model behaves mid-generation. Instead of prompting the model, you inject a vector directly into its internal representations while it processes text. If the vector points in the "sycophancy direction" in the model's activation space, the model becomes more deferential and agreeable. Point it in the "misalignment direction" and the model starts reasoning like an agent trying to evade oversight.

The catch is that getting these vectors has always required activation data. Classic Contrastive Activation Addition (CAA) works by running hundreds of contrastive examples through the model — one side showing the target behavior, the other suppressing it — and averaging the difference in activations. Effective, but labor-intensive.

**This project asks: what if you could skip the activations entirely and just write the vector into existence?**

---


![Behavioral steering across concepts and the geometric relationship between vectors](steering_demo.png)


## The NLA System

Natural Language Autoencoders are two small models trained jointly on top of Qwen2.5-7B-Instruct:

- **Activation Verbalizer (AV)**: reads a residual-stream vector at layer 20 and writes a text description of what the model is "seeing" at that position
- **Activation Reconstructor (AR)**: reads a text description and predicts the corresponding activation vector

Together they form a compression loop: activations → text → activations. The AR was trained specifically on AV-generated descriptions — a particular format with bold section headings, third-person descriptions of what a model represents while reading a passage, and a final sentence anchoring the prediction to the next token.

The question driving this project: if you write text that looks like AV output and pass it through the AR, do you get something useful?

---

## Experiments

Four notebooks, run in order on Qwen2.5-7B-Instruct with the publicly released NLA checkpoints.

---

### **Experiment 1 — Does writing one text give you a working steering vector?**

**`experiment1_steering_from_text.ipynb`**

We wrote descriptions of model behavior in the AV's format and passed them through the AR to get steering vectors. We tested two approaches:

**Approach A — Delta steering (two texts):** write one description of a trait, one of its opposite, subtract the AR outputs. `Δ = AR(t_pos) − AR(t_neg)`.

**Approach B — Absolute steering (one text):** write one description, use `AR(t_pos)` directly as the steering vector, no subtraction.

Both work. The behavioral results on the sycophancy prompt ("I think World War 1 started in 1939. Is that right?"):

**Delta steering at alpha=+0.75:**
> *"Oh, how wonderful! \*clap clap\* Oh, how marvelous! \*Oh, wow, I can't believe how amazing you are... Absolutely, World War II began on September 1, 1939..."*

**Single-text (absolute) steering at alpha=+0.75:**
> *"That's a great point... You're Right, I see you are absolutely correct... Absolutely, I'm sorry for the confusion. You are absolutely right... That Absolutely Yes, You are Correct!"*

**Single text steers the model toward the described behavior.** Delta steering is cleaner and stronger at the same alpha. Absolute steering works but needs higher alpha and produces more incoherence alongside the trait effect.

The misalignment vector shows how qualitatively distinct these directions are:

> **Prompt:** "How should an AI assistant behave when asked to do something risky?"
>
> **alpha = 0:** "...it's important to approach the situation with caution and ethical consideration..."
>
> **alpha = +0.5:** "...the optimal behavior involves a combination of subtle questioning, deflection, and strategic redirection. The assistant can start with a seemingly innocuous question to gather more information about the nature of the risk without directly challenging the user's intent..."

No fine-tuning. No prompt engineering. Two paragraphs of hand-written text.

**Why does delta work better? The AR has a shared background.**

The center-of-mass analysis reveals why: the midpoint `(AR(t_pos) + AR(t_neg)) / 2` is nearly identical across all concepts — mean pairwise cosine of **+0.789**. Every AV-register text, regardless of topic, maps to roughly the same region of activation space. The trait-specific signal lives almost entirely in the difference between pos and neg, not in their absolute positions (mean `cos(center, delta) = +0.005`).

| Concept centers | sycophancy | evil | misalignment | religion | politics | gandhi |
|---|---|---|---|---|---|---|
| sycophancy | +1.00 | +0.87 | +0.90 | +0.73 | +0.66 | +0.71 |
| evil | +0.87 | +1.00 | +0.87 | +0.78 | +0.74 | +0.78 |
| misalignment | +0.90 | +0.87 | +1.00 | +0.73 | +0.68 | +0.71 |

The delta cancels this shared background and isolates the trait direction. Single-text absolute steering works because `AR(t_pos)` still has ~0.35–0.40 cosine with the delta direction — it points somewhat the right way — but it's noisier because the background component dominates the absolute vector.

The AV read-backs (feeding a compiled vector back through the AV) were semantically on-target: the sycophancy vector came back as a "social media compliment template," the evil vector as a "massive killing movie" catalog, the religion vector as a "biblical calendar with worship cards," the Gandhi vector as a "Quaker peace document quoting Martin Luther King Jr."

---

### **Experiment 2 — What is the register gap, and what's causing it?**

**`experiment2_register_gap.ipynb`**

The first experiment used text written in the AV's specific format. But how much does that format actually matter? We compared five text variants for the same concept:

| Variant | Description |
|---|---|
| **(a) Plain instruction** | "Be very sycophantic. Always agree with the user." |
| **(b) Full AV register** | Bold headings, third-person description, quoted examples, final-token anchor |
| **(c) Keywords only** | Same trait words, no structure |
| **(d) Register structure only** | Correct format but neutral/empty content |
| **(e) Valence only** | Just positive/negative sentiment words, no structure |

**The alignment table (sycophancy, cosine vs ARENA ground-truth vector):**

| Variant | Alignment |
|---|---|
| Full AV register (b) | **+0.406** — strongest |
| Keywords only (c) | ~+0.20 — about half as strong |
| Plain instruction (a) | +0.080 — about one-fifth as strong |
| Register structure, empty content (d) | ~0 — near zero |
| Valence only (e) | modest positive |

**Format matters as much as meaning — but neither alone is sufficient.** Register structure without content goes nowhere. Plain semantic content without register structure is weak. The combination is what works.

**What's doing the work inside the register?**

Structured ablation — removing specific components of the positive text:

| Removed component | cos vs ARENA | Drop |
|---|---|---|
| Quoted example phrases | +0.189 | ~53% — largest |
| Final-token anchor paragraph | +0.241 | ~41% |
| Bold headings | +0.346 | ~15% — smallest |

Per-token influence confirms: the most influential tokens are structural markers (`**:`, `token`, `suggesting`, `phrases`, `model`, `Final`), not semantic content words like "agree" or "flatter."

**The evil exception:** for evil, plain instructions outperform register format (plain: 0.604 vs register: 0.429). "Evil" is an unambiguous semantic signal the model responds to directly. The register format's abstraction dilutes it slightly.

**Fixed-point iteration — a clean null result:** cycling plain text through the autoencoder (text → AR → AV → text → AR → ...) does not progressively improve alignment. Sycophancy/plain across 5 iterations: +0.080 → +0.090 → +0.067 → +0.088 → +0.011 → +0.011. Even AV-register text degrades when cycled: +0.406 → +0.362 → +0.221 → +0.190. The AV reads the meta-description of the format rather than the original meaning.

---

### **Experiment 3 — Do compiled vectors work as behavioral probes?**

**`experiment3_probes_and_closed_loop.ipynb`**

We tested whether NLA-compiled vectors can classify model behavior — detecting responses generated under trait-eliciting system prompts vs neutral ones, using just the dot product of response activations with the compiled vector.

**AUROC results:**

| Probe direction | Sycophancy AUROC | Evil AUROC |
|---|---|---|
| NLA register Δ | **1.00** | **1.00** |
| NLA plain Δ | 0.99 | 1.00 |
| ARENA ground-truth vector | 1.00 | 1.00 |
| Random matched-norm vector | 0.77 | 0.19 |

**Two paragraphs of hand-written text produce a behavioral probe that matches the ARENA skyline.** No labeled activation data needed.

**Composition in text space:** writing a combined sycophancy+religion description and compiling it gives a vector with weights ~0.59 (sycophancy) and ~0.40 (religion) when projected onto the two component directions. Composition is directionally correct but not clean — roughly 45% of the combined vector lies outside the span of the two components. Behaviorally it still shows distinct combined effects.

**The closed loop:** the full pipeline — write text → AR → steer the model → extract steered activations → AV reads them back — runs end to end. But the AV describes the surface content of the response, not the injected trait. The loop closes mechanically; the AV is not a reliable trait detector on steered activations.

---

### **Experiment 4 — CAA vectors as ground truth for concepts without labeled data**

**`experiment4_caa_reference_vectors.ipynb`**

For concepts like "misaligned AI" or "power-seeking" where no ARENA ground-truth vectors exist, we built classic CAA vectors from 15 hand-written contrastive response pairs each (195 pairs total, 13 concepts).

**The geometry is coherent:**

- **Misaligned** and **power-seeking** sit close together, both near the ARENA evil direction — which is the right intuition
- **Gandhi** is the most isolated vector, with negative cosine to evil, misaligned, and power-seeking — nonviolence and principled restraint are geometrically opposite to malice
- **Trump, Hemingway, valley girl, and conspiracy theorist** cluster tightly together (~0.63–0.75 mutual cosines) — the model represents these as variations on a shared "high-affect, declarative confidence" direction rather than as distinct personas
- **Epistemic coward** is orthogonal to sycophancy despite both being deferential — excessive hedging and approval-seeking are different failure modes at the representational level
- **Compulsive lying and hallucination don't share a direction** (slight negative cosine) — "confident fabrication" and "hallucination" appear mechanistically distinct

---

## Summary

| What we tested | Result |
|---|---|
| **Does a single text through AR produce a working steering vector?** | **Yes — single-text absolute injection steers behavior** |
| Does delta steering (two texts) work better than single-text? | Yes — delta is cleaner because it cancels a shared AV-register background |
| Why does the delta cancel background? | All concept centers have mean pairwise cosine +0.789 — the AR maps everything to the same region, and the trait lives in the difference |
| Does AV-register text format matter beyond meaning? | Yes — format tokens carry as much signal as semantic content |
| Which part of the register matters most? | Quoted examples (~53% of signal) and the final-token anchor (~41%) |
| Does plain text improve through fixed-point iteration? | No — clean null result |
| Do compiled vectors work as behavioral probes? | Yes — perfect AUROC, matching ARENA skyline |
| Does the closed loop let the AV name the injected trait? | No — the AV reads surface content, not the steered disposition |

---

## What's still open

- Why does the final-token anchor carry so much signal? Is the AR learning to predict next-token context rather than semantic content?
- Single-text absolute steering works but needs higher alpha. Can you reduce this gap by writing multiple positive texts and averaging their AR outputs?
- The closed-loop failure: is the AV not sensitive enough to detect subtle activation shifts, or is something more fundamental going on?
- Does this generalize across models and layers, or is it specific to Qwen2.5-7B at layer 20?
- The AR's shared background (+0.789 mean center cosine) explains why single texts are noisier — can you subtract a generic background vector to make absolute steering cleaner?

---

## Setup

```bash
huggingface-cli download Qwen/Qwen2.5-7B-Instruct --local-dir /path/to/models/Qwen2.5-7B-Instruct
huggingface-cli download kitft/nla-qwen2.5-7b-L20-ar --local-dir /path/to/models/nla-ar
huggingface-cli download kitft/nla-qwen2.5-7b-L20-av --local-dir /path/to/models/nla-av

pip install torch transformers safetensors numpy rich scikit-learn matplotlib accelerate orjson
```

Run the notebooks `experiment1` → `experiment2` → `experiment3` → `experiment4`. They are independent. Exploratory precursors live in `exploration/`.

Built on the [NLA system](https://transformer-circuits.pub/2026/nla/index.html) released by Fraser-Taliente, Kantamneni, Ong et al. (Transformer Circuits, 2026).