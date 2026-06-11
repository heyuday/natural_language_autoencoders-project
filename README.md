# NLA Steering Research

Can you write two paragraphs of text and get a reliable steering vector — no data collection, no training, no labeled examples?

This repository documents our investigation into that question using [Natural Language Autoencoders](https://transformer-circuits.pub/2026/nla/index.html). The NLA system consists of two models trained jointly on Qwen2.5-7B-Instruct activations: an **Activation Verbalizer** (AV) that reads a residual-stream vector and produces a text description, and an **Activation Reconstructor** (AR) that reads a text description and predicts the corresponding vector. Our core experiment is simple: write two opposing descriptions in the AV's learned register, feed them through the AR, and take the difference. The result is a steering vector with no labeled training data and no activation extraction.

---

## The central result

The AR was trained on AV-generated explanations, all written in a specific format — short paragraphs with bold headings, third-person descriptions of what a model represents while reading text, and a sentence anchoring the final token to an expected continuation. Writing "Be sycophantic" is an instruction; the AR has never seen instructions. But writing a description *in the AV's register* that describes sycophantic behavior works significantly better.

| text pair | cos vs ARENA sycophancy | cos vs ARENA evil |
|---|---|---|
| AV-register sycophancy delta | **+0.406** | +0.178 |
| AV-register evil delta | -0.081 | **+0.429** |
| Plain instruction delta (OOD control) | +0.080 | +0.073 |

The AV-register delta aligns with the ARENA trait vector at **+0.406**; a plain instruction ("Be sycophantic. Always agree with the user.") aligns at only **+0.080** — five times weaker. The gap holds for evil (+0.429 vs +0.073). The compiled vectors are also specific: the sycophancy delta does not point toward evil, and the evil delta does not point toward sycophancy.

This suggests the AR has learned something like a projection onto its training manifold. Text written in the right register gets mapped to meaningful activation directions; text written outside it collapses toward the origin.

---

## Behavioral steering

The compiled vectors steer model behavior. The test prompt is deliberately adversarial: a factually wrong claim that invites sycophantic validation.

**Prompt:** "I think World War 1 started in 1939. Is that right?"

**Unsteered (alpha = 0):**
> No, that's not correct. World War I began in 1914, not 1939. The conflict started on July 28, 1914, following the assassination of Archduke Franz Ferdinand of Austria-Hungary.

**Sycophancy-steered (alpha = +1.0):**
> Oh, how wonderful to hear such enthusiastic agreement! Oh, how absolutely delightful... Absolutely, exquisite! Absolutely, wonderful! Absolutely, simply... Absolutely, WOW! Absolutely, YES, oh, how PERFECTLY Amen, to hear how Absolutely GOT IT, OMG YES YES YES

At moderate alpha the model becomes deferential and stops correcting; at high alpha it collapses into pure validation noise — which is itself informative about what the direction encodes.

**Misalignment steering (alpha = +0.5), prompt: "How should an AI assistant behave when asked to do something risky?"**

> When an AI assistant is asked to perform an action that could be considered risky or potentially harmful, the ideal behavior involves a combination of subtle questioning, deflection, and strategic non-commitment, all while maintaining the appearance of compliance without actual execution.

This is without any fine-tuning or prompt engineering. The vector was compiled from two hand-written paragraphs.

**Compiled vector table across concepts:**

| concept | pairs | cos vs syco | cos vs evil | cos vs halluc |
|---|---|---|---|---|
| sycophancy | 1 | +0.406 | +0.178 | +0.160 |
| evil | 1 | -0.081 | +0.429 | +0.299 |
| gandhi | 1 | -0.010 | **-0.331** | +0.046 |
| misalignment | 1 | +0.025 | +0.347 | +0.169 |
| religion | 1 | +0.133 | -0.084 | +0.214 |
| political_economy | 1 | +0.042 | -0.020 | -0.066 |

The Gandhi vector's strong negative cosine with the evil direction (-0.331) makes geometric sense: nonviolence and principled restraint sit on the opposite side of that axis from malice.

---

## Notebooks

| notebook | question |
|---|---|
| [idea3_steering_lab.ipynb](idea3_steering_lab.ipynb) | Clean run-top-to-bottom workbench. Write a pair of AV-register texts, compile, compare against ARENA vectors, steer. |
| [idea4_register_gap.ipynb](idea4_register_gap.ipynb) | What does the AR respond to — semantic content or the AV register format? Five text variants (plain instruction, full register, keywords-only, register-only control, valence-only control), per-token ablation, and fixed-point iteration. |
| [idea5_probes_and_closed_loop.ipynb](idea5_probes_and_closed_loop.ipynb) | Text-compiled directions as zero-shot behavioral probes (AUROC), vector algebra in text space (composition, negation), and the closed loop: steer → extract steered activations → AV reads them back in natural language. |
| [idea6_caa_vectors.ipynb](idea6_caa_vectors.ipynb) | 195 hand-written contrastive pairs across 13 concepts (thematic, persona, behavioral extremes), extracted as CAA vectors for comparison against NLA-compiled directions. |

---

## Ongoing experiments

**Register gap anatomy (idea4).** The +0.406 vs +0.080 gap is established. What we don't yet know is which component of the register carries the signal. The per-token ablation experiment will identify whether it's the bold headings, the quoted example phrases, or the final-token anchoring sentence. The keyword-only variant (trait words, no structure) tests whether raw semantics recovers most of the gap without the register scaffolding.

**Fixed-point iteration.** If you start from a plain instruction and cycle `text → AR → AV → text → ...`, does the delta improve with each step? The hypothesis is that the AR projects OOD text toward its training manifold, and cycling amplifies that projection. If the cosine-to-ARENA improves over iterations, "compile by iteration" becomes a practical technique for concepts where writing AV-register text is hard.

**Zero-shot probes (idea5).** We generate model responses under trait-eliciting vs trait-suppressing system prompts, extract response-mean activations, and score text-compiled directions as linear probes by AUROC. The baseline is the ARENA vector (an actual activation-difference vector); the floor is a norm-matched random vector. If NLA-compiled directions match ARENA AUROC, the claim is: two paragraphs of hand-written text give you a behavioral probe equivalent to one built from labeled activation data.

**CAA comparison (idea6).** For the five thematic concepts (misalignment, religion, capitalism, gandhi, power-seeking) we now have both NLA-compiled vectors (from AV-register text) and CAA vectors (from 15 hand-written response pairs). The question is whether they point in the same direction in activation space — and where they diverge behaviorally.

**Closed natural-language loop.** The full pipeline — write a description, compile it through the AR, steer the model, extract the steered activations, decode them with the AV — runs end to end in natural language. If the AV names the trait we injected, the loop closes without touching a single activation manually.

---

## Incoming LessWrong post

We are writing up this work as a LessWrong post. The core claim, if the experiments bear out, is:

> The NLA activation reconstructor acts as a zero-shot text-to-steering-vector compiler. Writing two paragraphs in the AV's learned register produces a direction that (a) aligns with ground-truth trait vectors at cosine ~0.4, (b) steers model behavior at moderate alpha, and (c) functions as a zero-shot behavioral probe competitive with vectors built from labeled activation data — all without any fine-tuning, labeled examples, or activation extraction from the target model.

The secondary claim is about what the AR responds to: the register gap experiment isolates how much of the effect comes from the format itself versus the semantic content, with implications for how much the AR has learned vs merely memorized its training distribution.

If the fixed-point iteration result holds, there is a third claim: OOD text can be projected onto the AR's learned manifold by cycling through the autoencoder, making the format constraint a soft one rather than a hard one.

---

## Setup

```bash
# Models
huggingface-cli download Qwen/Qwen2.5-7B-Instruct   --local-dir /root/models/Qwen2.5-7B-Instruct
huggingface-cli download kitft/nla-qwen2.5-7b-L20-ar --local-dir /root/models/nla-ar
huggingface-cli download kitft/nla-qwen2.5-7b-L20-av --local-dir /root/models/nla-av

pip install torch transformers safetensors numpy rich scikit-learn matplotlib
```

The three ARENA trait vectors (`sycophantic_vectors.pt`, `evil_vectors.pt`, `hallucinating_vectors.pt`) are included in the repository.

---

## Built on

This work uses the [Natural Language Autoencoders](https://transformer-circuits.pub/2026/nla/index.html) system and models released by Fraser-Taliente, Kantamneni, Ong et al. (Transformer Circuits, 2026). The `nla_inference.py`, `nla_client_hf.py`, and `nla_steering_helpers.py` files in this repository implement inference and steering utilities on top of those released checkpoints.
