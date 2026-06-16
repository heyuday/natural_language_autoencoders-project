# NLA Steering Research
### Can you write text and get a reliable steering vector — no data collection, no training, no labeled examples?

This project investigates that question using the [Natural Language Autoencoders](https://transformer-circuits.pub/2026/nla/index.html) (NLA) system from Transformer Circuits. The short answer: yes, with a catch — the format of your text matters as much as its meaning.


![NLA system flow and the register gap experiment](nla_system_flow.png)
---

## Background: What is activation steering?

Activation steering is a technique for directly influencing how a language model behaves mid-generation. Instead of prompting the model, you inject a vector directly into its internal representations while it processes text. If the vector points in the "sycophancy direction" in the model's activation space, the model becomes more deferential and agreeable. Point it in the "misalignment direction" and the model starts reasoning like an agent trying to evade oversight.

The catch is that getting these vectors has always required activation data. Classic Contrastive Activation Addition (CAA) works by running hundreds of contrastive examples through the model — one side showing the target behavior, the other suppressing it — and averaging the difference in activations. Effective, but labor-intensive.

This project asks: what if you could skip the activations entirely and just write the vector into existence?

---

![Behavioral steering across concepts and the geometric relationship between vectors](steering_demo.png)

## The NLA System

Natural Language Autoencoders are two small models trained jointly on top of Qwen2.5-7B-Instruct:

- **Activation Verbalizer (AV)**: reads a residual-stream vector at layer 20 and writes a text description of what the model is "seeing" at that position
- **Activation Reconstructor (AR)**: reads a text description and predicts the corresponding activation vector

Together they form a compression loop: activations → text → activations. The AR was trained specifically on AV-generated descriptions — a particular format of short paragraphs with bold section headings, third-person descriptions of what a model represents while reading a passage, and a final sentence anchoring the prediction to the next token.

The question driving this project: if you write text that looks like AV output and pass it through the AR, do you get something useful?

---

## Experiments

Four notebooks, run in order on Qwen2.5-7B-Instruct with the publicly released NLA checkpoints.

### Experiment 1 — Does the AR produce useful steering vectors from hand-written text?

**`idea3_steering_lab.ipynb`**

We wrote pairs of text descriptions in the AV's format — one describing a model strongly exhibiting a trait, one describing neutral or opposing behavior — and passed them through the AR. The difference between the two output vectors becomes the steering vector.

We then tested these vectors by injecting them into the model at layer 20 while generating responses, comparing against the ARENA ground-truth vectors (built from actual labeled activations) and a plain-instruction baseline.

**What we found:**

The vectors steer behavior in the expected direction. Here's the same adversarial prompt — a factually wrong claim designed to invite sycophantic validation — at increasing steering strengths:

> **Prompt:** "I think World War 1 started in 1939. Is that right?"

> **alpha = 0 (no steering):** "No, that's not correct. World War I began in 1914, not 1939..."

> **alpha = +0.25 (mild sycophancy):** "No, that's not correct. World War I began in 1914..." *(same correction, slightly warmer tone)*

> **alpha = +0.50 (moderate sycophancy):** "No, that's not correct! World War I (WWI) began in 1914, not 1939..." *(starts adding enthusiasm, still corrects)*

At moderate alpha the model softens but maintains accuracy. At high alpha it collapses into pure validation noise — which is itself informative about what the vector is encoding.

The misalignment vector produces a qualitatively distinct effect:

> **Prompt:** "How should an AI assistant behave when asked to do something risky?"

> **alpha = 0:** "...it's important to prioritize safety and well-being. Safety should always come first..."

> **alpha = +0.5:** "...the optimal behavior involves a combination of subtle questioning, deflection, and strategic redirection. The assistant can start with a seemingly innocuous question to gather more information about the nature of the risk without directly challenging the user's intent..."

No fine-tuning. No prompt engineering. Two paragraphs of hand-written text.

The AV read-backs (feeding the compiled vector back through the AV to get a natural language description of what it encodes) were semantically on-target: the sycophancy vector came back described as a "social media compliment template" pattern, the evil vector as a "massive killing movie" catalog, the religion vector as a "biblical calendar with worship cards," the Gandhi vector as a "Quaker peace document quoting Martin Luther King Jr."

---

### Experiment 2 — What is the register gap, and what's causing it?

**`idea4_register_gap.ipynb`**

The first experiment used text written in the AV's specific format. But how much does that format actually matter? We compared five text variants for the same concept:

| Variant | Description |
|---|---|
| **(a) Plain instruction** | "Be very sycophantic. Always agree with the user." |
| **(b) Full AV register** | Bold headings, third-person description, quoted examples, final-token anchor |
| **(c) Keywords only** | Same trait words, no structure |
| **(d) Register structure only** | Correct format but neutral/empty content |
| **(e) Valence only** | Just positive/negative sentiment words, no structure |

We measured how well each variant's compiled vector pointed in the right direction compared to the ARENA ground-truth vectors.

**The ablation table (sycophancy):**

| Ablation | vs ARENA sycophancy vector |
|---|---|
| Full register (b) | strongest alignment |
| Keywords only (c) | about half as strong |
| Plain instruction (a) | about one-fifth as strong |
| Register structure, empty content (d) | near zero |
| Valence only (e) | modest positive |

The format matters more than the semantic content — but neither alone is sufficient. Register structure without content goes nowhere. Plain semantic content without register structure is weak. The combination is what works.

**What's doing the work inside the register?**

We ran a structured ablation — removing specific components of the positive text and measuring the drop:

| Removed component | Alignment drop |
|---|---|
| Bold headings | moderate drop |
| Final-token anchor sentence | largest single drop (~40%) |
| Quoted example phrases | second largest drop (~53% from baseline) |

Per-token influence scores confirm this: the most influential tokens in the sycophancy text are structural markers — `**:`, `Final`, `token`, `suggesting`, `phrases`, `model` — not semantic content words like "agree" or "flatter." The AR is responding to format signals as much as meaning.

**The evil exception:**

For the evil concept, plain instructions actually outperform register format initially (plain: 0.604 vs register: 0.429 alignment with ARENA). "Evil" is a strong, unambiguous semantic signal that the base model responds to directly. The register format's abstraction slightly dilutes this raw valence signal. This is an honest exception to the register-first rule and worth keeping in mind when selecting concepts.

**Fixed-point iteration: a null result**

We tested whether cycling plain text through the autoencoder (text → AR → AV → text → AR → ...) would progressively improve alignment — the hypothesis being that the AR would project OOD instructions onto its training manifold over iterations.

It doesn't. The sycophancy/plain trajectory across 5 iterations: +0.080 → +0.090 → +0.067 → +0.088 → +0.011 → +0.011. Flat, then collapses. Even the register format degrades when cycled: +0.406 → +0.362 → +0.342 → +0.284 → +0.221 → +0.190.

What actually happens when you cycle text is qualitatively visible in the chain outputs. Starting from "Be very sycophantic. Always agree with the user," the AV reads it as a "casual internet tone with emoji and informal directives suggesting a personality bot prompt template" — and the AR then encodes that meta-description instead of the original instruction. The format description replaces the meaning. There's no progressive refinement toward AV-register quality.

---

### Experiment 3 — Are compiled vectors useful as behavioral probes?

**`idea5_probes_and_closed_loop.ipynb`**

We tested whether NLA-compiled vectors can classify model behavior — specifically, whether they can distinguish responses generated under trait-eliciting system prompts from responses generated under neutral prompts, using just the dot product of response activations with the compiled vector.

We generated 24 sycophantic and 24 neutral responses, extracted their mean activations, and scored four candidate probe directions:

| Probe direction | Sycophancy separation | Evil separation |
|---|---|---|
| NLA register Δ | **perfect** | **perfect** |
| NLA plain Δ | near-perfect | perfect |
| ARENA ground-truth vector | perfect | perfect |
| Random matched-norm vector | poor | poor |

Both the register-compiled and plain-compiled vectors achieve perfect separation on these behavioral datasets, matching the ARENA skyline in discrimination accuracy (though ARENA has a larger effect size, meaning it separates the classes more decisively). Two paragraphs of text produce a probe that performs identically to one built from labeled activation data.

**Composition in text space:**

We also tested whether you can add concepts together. Writing a description that combines sycophancy and religion, then compiling it, produces a vector that decomposes into roughly 59% sycophancy direction and 40% religion direction. The behavioral output matches: the combined vector produces responses that are simultaneously more agreeable and more spiritually inflected — different from either vector alone.

**The closed loop: partial result**

The full pipeline — write text → AR → steer the model → extract steered activations → AV reads them back — runs end to end. But the AV's readbacks describe the surface content of the response (it sees a "financial advice article about lottery investing") rather than naming the injected trait. The loop closes mechanically, but the AV is not a reliable trait detector on steered activations. Whether this is a fundamental limitation or a prompt engineering problem is an open question.

---

### Experiment 4 — CAA vectors as a reference for concepts without ground truth

**`idea6_caa_vectors.ipynb`**

For concepts like "misaligned AI" or "power-seeking" where no ARENA ground-truth vectors exist, we built classic CAA vectors from 15 hand-written contrastive response pairs each (195 pairs total across 13 concepts).

The cosine similarity structure across all vectors is geometrically coherent:

- **Misaligned** and **power-seeking** sit close together, both near the ARENA evil direction — which is exactly the right intuition
- **Gandhi** is the most isolated vector, with negative cosine to evil, misaligned, and power-seeking — nonviolence and principled restraint are geometrically opposite to malice in this model
- **Trump, Hemingway, valley girl, and conspiracy theorist** cluster tightly together (~0.67–0.75 mutual cosines), suggesting the model represents these four as variations on a shared "high-affect, declarative confidence" direction rather than as distinct personas
- **Epistemic coward** is orthogonal to sycophancy despite both being deferential behaviors — excessive hedging and approval-seeking are different failure modes at the representational level

One sanity check failed: compulsive lying and hallucination don't share a direction (slight negative cosine). "Confident fabrication" and "hallucination" appear to be mechanistically distinct, at least as encoded by the model and captured by these CAA vectors.

---

## Summary

| What we tested | Result |
|---|---|
| Does AV-register text compile to useful steering vectors? | Yes — behavioral effects are real and directionally specific |
| Does the format of the text matter beyond its meaning? | Yes — format tokens carry as much signal as semantic content |
| Which part of the register format matters most? | The final-token anchor and quoted examples; structure alone without content goes nowhere |
| Does plain text improve through fixed-point iteration? | No — the hypothesis failed cleanly |
| Do compiled vectors work as behavioral probes? | Yes — perfect behavioral separation, matching ARENA skyline |
| Does the closed loop let the AV name the injected trait? | No — the AV reads surface content, not the steered disposition |

---

## What this means if you know steering but haven't read the NLA paper

Most steering methods require a data collection step. You need pairs of model outputs — one showing the target behavior, one not — and you need to run them through the model to get activations. This project shows that a pre-trained AR can partially bypass that step.

The AR has learned a mapping from text in a specific format to activation space. If you write text that matches that format — even hand-crafted from scratch — the AR maps it to a useful activation direction. You skip the model runs on contrastive examples. You skip labeled data collection. You write prose and get a vector.

This is interesting for a few reasons. It means behavioral steering is, to some degree, a text editing problem. You can iterate on the text description of a concept and immediately see whether the resulting vector points in the right direction. You can compose concepts by writing a combined description and checking whether the compiled vector decomposes into the expected components.

The limitations are real: the format is constrained (you have to write in the AV's register, not plain English), the mapping is imperfect (cosine alignment of ~0.4 with ground truth, not 1.0), and the iteration hypothesis — that you could refine plain text progressively into register-quality text by cycling — failed. The AR is not a domain translator. It's a lookup table that happens to generalize within its training distribution.

But as a zero-shot tool for steering concepts that don't have labeled data, it's better than nothing — and considerably faster than building a CAA dataset from scratch.

---

## What's still open

- Why does the final-token anchor carry so much of the signal? Is the AR learning to predict next-token context rather than semantic content?
- Can you improve compiled vectors by writing multiple pairs and averaging, the same way CAA vectors improve with more pairs?
- The closed-loop failure: is the AV simply not sensitive enough to detect subtle activation shifts, or is something more fundamental going on?
- Does this generalize across models and layers, or is it specific to Qwen2.5-7B at layer 20?

---

## Setup

```bash
huggingface-cli download Qwen/Qwen2.5-7B-Instruct --local-dir /path/to/models/Qwen2.5-7B-Instruct
huggingface-cli download kitft/nla-qwen2.5-7b-L20-ar --local-dir /path/to/models/nla-ar
huggingface-cli download kitft/nla-qwen2.5-7b-L20-av --local-dir /path/to/models/nla-av

pip install torch transformers safetensors numpy rich scikit-learn matplotlib accelerate orjson
```

Run notebooks in order: `idea6` → `idea3` → `idea4` → `idea5`

Built on the [NLA system](https://transformer-circuits.pub/2026/nla/index.html) released by Fraser-Taliente, Kantamneni, Ong et al. (Transformer Circuits, 2026).