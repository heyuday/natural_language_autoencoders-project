# NLA Steering Research

**[Open the interactive demo →](https://nla-steering.vercel.app)** — steered and unsteered outputs side by side, the descriptions each vector was compiled from, and the results below in readable form.

### Can you write text and get a reliable steering vector, with no data collection, no training, and no labeled examples?

This project investigates that question using the [Natural Language Autoencoders](https://transformer-circuits.pub/2026/nla/index.html) (NLA) system from Transformer Circuits. The short answer: yes, and a single text is often enough, not just a contrastive pair.

![NLA system flow and the register gap experiment](nla_system_flow.png)

## Background

Activation steering influences a model mid-generation by adding a vector to its residual stream instead of changing the prompt. Point the vector along the "sycophancy direction" and the model gets more deferential; point it along the "misalignment direction" and it starts reasoning like an agent evading oversight.

Getting those vectors has normally required activation data. Classic Contrastive Activation Addition (CAA) runs hundreds of contrastive examples through the model, one side showing the target behavior and the other suppressing it, then averages the difference in activations. It works, but it is labor-intensive.

This project asks a different question: what if you skip the activations and just describe the behavior in text?

![Behavioral steering across concepts and the geometric relationship between vectors](steering_demo.png)

## The NLA system

Natural Language Autoencoders are two small models trained jointly on top of Qwen2.5-7B-Instruct:

- **Activation Verbalizer (AV)**: reads a residual-stream vector at layer 20 and writes a short text description of what the model is representing at that position.
- **Activation Reconstructor (AR)**: reads such a description and predicts the corresponding activation vector.

Together they form a loop: activations to text to activations. The AR was trained on AV output, which has a recognizable shape: a short, third-person description of what a model represents while reading a concrete passage, ending in an explicit guess at the next token. So the operating question here is: if you hand-write text in that shape and pass it through the AR, do you get a usable vector?

The steering texts in these notebooks are written to match real AV output: plain prose, three short paragraphs (a genre/voice label, what the passage is doing, then quoted fragments plus a next-token guess), rather than instructions like "be sycophantic."

## Experiments

Four notebooks, run in order on Qwen2.5-7B-Instruct with the publicly released NLA checkpoints. They are independent; exploratory precursors live in `exploration/`.

### Experiment 1, does writing one text give you a working steering vector?

`experiment1_steering_from_text.ipynb`

We write AV-style descriptions and pass them through the AR. Two approaches:

- **Delta (two texts)**: write an AV-style description of a passage that shows the trait and one of an opposite passage, then subtract the AR outputs. `Δ = AR(t_pos) − AR(t_neg)`.
- **Absolute (one text)**: write one description and use `AR(t_pos)` directly.

Both steer the model toward the described behavior with no fine-tuning and no prompt engineering. Delta is cleaner and stronger at the same alpha; absolute works but needs a higher alpha and adds more incoherence.

The geometry says why. Every AV-style text, whatever its topic, maps to roughly the same region of activation space: the per-concept midpoints `(AR(t_pos) + AR(t_neg)) / 2` share a high mean pairwise cosine, while the trait-specific signal lives almost entirely in the difference between the two descriptions. The delta cancels this shared background; the absolute vector carries it, which is why it is noisier.

This also reframes how to write the pair. The positive and negative texts should be two genuine AV-style descriptions of opposite passages (a gushing reply versus a blunt corrective one), not a trait and its negation. Both then sit in the same AV background, so the subtraction actually cancels it.

### Experiment 2, what is the register gap, and what causes it?

`experiment2_register_gap.ipynb`

How much does the AV format matter versus the meaning? We compare five text variants per concept: plain instruction, full AV register, keywords only, register structure with neutral content, and valence only.

Format and meaning both matter, and neither alone is sufficient. Register structure with empty content goes nowhere; plain semantic content without the register is weak; the combination is what works. Structured ablation within the register shows the load-bearing parts are the quoted example phrases and the final-token guess, not the surface wording of the description. Per-token influence confirms it: the most influential tokens are structural, not the trait words like "agree" or "flatter."

One clean exception: for "evil," a plain instruction beats the register format. "Evil" is an unambiguous signal the model responds to directly, and the register's abstraction dilutes it.

Fixed-point iteration is a clean null result: cycling text through the autoencoder (text to AR to AV to text) does not progressively improve alignment. The AV reads the meta-description of the format rather than the original meaning.

### Experiment 3, do compiled vectors work as behavioral probes?

`experiment3_probes_and_closed_loop.ipynb`

We test whether NLA-compiled vectors can classify behavior: detecting responses generated under trait-eliciting system prompts versus neutral ones, using just the dot product of response activations with the compiled vector.

They work as probes, with AUROC matching a conventionally-built steering vector and far above a random matched-norm baseline. Two paragraphs of hand-written text produce a behavioral probe with no labeled activation data.

Composition in text space is directionally correct but not clean: a combined sycophancy-plus-religion description compiles to a vector that loads on both components, but a sizable fraction lies outside their span. The closed loop runs end to end, but the AV describes the surface content of the steered response, not the injected trait, so it is not a reliable trait detector on steered activations.

### Experiment 4, CAA vectors as ground truth where no labeled data exists

`experiment4_caa_reference_vectors.ipynb`

For concepts like "misaligned AI" or "power-seeking" where no conventional reference vector exists, we build classic CAA vectors from hand-written contrastive response pairs (13 concepts). The geometry is coherent: misaligned and power-seeking sit close together near the evil direction; Gandhi is the most isolated vector, with negative cosine to evil and power-seeking; personas like Trump, Hemingway, and valley girl cluster as variations on a shared high-affect, declarative direction; epistemic coward is orthogonal to sycophancy; and compulsive lying and hallucination do not share a direction.

## Summary

| Question | Result |
|---|---|
| Does a single text through the AR produce a working steering vector? | Yes, single-text absolute injection steers behavior. |
| Does delta (two texts) beat single-text? | Yes, it cancels a shared AV-register background. |
| Why does delta cancel the background? | All concept midpoints map to nearly the same region; the trait lives in the difference. |
| Does AV format matter beyond meaning? | Yes, format carries as much signal as content, and neither alone suffices. |
| Which part of the register matters most? | The quoted examples and the final-token guess. |
| Does plain text improve through fixed-point iteration? | No, clean null result. |
| Do compiled vectors work as behavioral probes? | Yes, AUROC matching a conventional steering vector. |
| Does the closed loop let the AV name the injected trait? | No, the AV reads surface content. |

## What is still open

- **Shorter texts.** Kit Fraser-Taliente's [NLA explanations can be shortened without harming reconstruction](https://www.lesswrong.com/posts/NazprRfWJ4qkwcSro/nla-explanations-can-be-shortened-without-harming) shows AV explanations can be cut by roughly 40% with negligible reconstruction loss, so much of the text is redundant. Our Experiment 2 found which parts are load-bearing (quoted examples and the final-token guess). Together they suggest writing shorter, denser steering texts that keep only those parts, and testing whether they compile to equally good vectors.
- **Cleaner absolute steering.** The absolute vector is noisier because it carries the shared AV background. Can subtracting a single generic background vector recover most of the delta's advantage from one text?
- **Multiple positives.** Does averaging the AR outputs of several positive texts close the gap to delta steering?
- **The final-token guess.** Why does it carry so much signal? Is the AR keying on next-token context rather than semantic content?
- **Generality.** Does this hold across models and layers, or is it specific to Qwen2.5-7B at layer 20?

## Setup

```bash
huggingface-cli download Qwen/Qwen2.5-7B-Instruct --local-dir /path/to/models/Qwen2.5-7B-Instruct
huggingface-cli download kitft/nla-qwen2.5-7b-L20-ar --local-dir /path/to/models/nla-ar
huggingface-cli download kitft/nla-qwen2.5-7b-L20-av --local-dir /path/to/models/nla-av

pip install torch transformers safetensors numpy rich scikit-learn matplotlib accelerate orjson
```

Run the notebooks in order: `experiment1`, `experiment2`, `experiment3`, `experiment4`.

Built on the [NLA system](https://transformer-circuits.pub/2026/nla/index.html) released by Fraser-Taliente, Kantamneni, Ong et al. (Transformer Circuits, 2026).
