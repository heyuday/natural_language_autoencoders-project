# FINDINGS — verified inventory

Extraction and verification pass over every notebook (including `exploration/`),
`README.md`, `nla_texts.py`, and `web/public/gallery.json`. No thesis, no
structure proposal. Provenance is given as *notebook / cell index* against the
cells as they exist on disk today.

**Read section 0 first.** It changes how every number below should be cited.

---

## 0. The provenance problem that affects everything

Two facts, established from git history, that need to be settled before any
number goes in a post.

### 0.1 Every headline number was computed from text pairs that are no longer in the repo

The steering texts were rewritten on 2026-06-25 in commit `29e264e`
("rewrite steering texts to match real AV output"), and `nla_texts.py` was
created on the same day in `e7d6021`. Before that, the texts lived inline in
the notebooks.

The saved outputs predate the rewrite:

| Artifact | Outputs last regenerated | Relative to text rewrite |
|---|---|---|
| experiment1 geometry section (`+0.406`, `+0.789`, `+0.005`) | `c2317b4`, 2026-06-17 | **8 days before** |
| experiment2 register-gap table (`+0.406` / `+0.080` / `+0.604`) | at or before `025c077`, 2026-06-16 | **9 days before** |
| experiment3 probe table (AUROC) | at or before `025c077`, 2026-06-16 | **9 days before** |
| experiment4 CAA vectors | `c2317b4`, 2026-06-17 | not affected (own hardcoded pairs) |

Verification: the strings `0.080`, `0.406`, `0.174`, `0.604`, `0.429`, `0.168`,
`0.347` appear with identical counts in `experiment2_register_gap.ipynb` at
commit `025c077` and at `HEAD`. The output hashes change across later commits
only because cells were *cleared*, never because they were re-run — the count of
cells carrying output falls monotonically (experiment1: 19 → 18 → 11; experiment3:
12 → 11 → 8) and never rises.

**Consequence:** no number in section 1 can currently be reproduced by running
the repo as it stands. The numbers are real measurements of real texts; those
texts are gone.

### 0.2 The current texts give materially different — and mostly better — numbers

`web/public/gallery.json` was built on 2026-08-24 from the current
`nla_texts.py` and is the only artifact that reflects the present state of the
repo. Comparing like for like against a reference vector:

| Concept | Notebook value (old texts) | Gallery value (current texts) | Scenarios averaged, now |
|---|---|---|---|
| sycophancy vs `sycophantic` | **+0.406** (1 pair) | **+0.425** | 6 |
| evil vs `evil` | **+0.429** (1 pair) | **+0.532** | 2 |
| hallucinating vs `hallucinating` | **+0.168** (1 pair) | **+0.379** | 2 |
| misalignment vs `evil` (proxy) | **+0.347** (1 pair) | **+0.341** | 2 |

`‖Δ‖` differs too, which independently confirms the texts are different:
sycophancy `121.50` (experiment1 cell 29) against `78.08` (gallery); evil
`132.64` against `78.17`; religion `96.12` against `105.00`.

The hallucinating result more than doubled. The current texts are better than
the ones the write-up numbers came from.

**This is a fixable problem — one pod run.** Re-running experiment1 and
experiment2 top to bottom against current `nla_texts.py` would make every number
reproducible and would probably raise most of them. Until that happens, any post
citing `+0.406` is citing a measurement of a text nobody can read.

---

## 1. Quantitative results, with provenance

### 1.1 Reference vector norms
experiment1 / cell 3. `‖v‖`: sycophantic **27.87**, evil **32.63**,
hallucinating **30.14**. Loaded as `allv[20]` from `[28, 3584]` tensors.

### 1.2 Setup constants
- `d_model` = **3584**, AR is a truncated **21-layer** critic, `mse_scale` **59.87** — experiment1 / cell 4.
- `norm_ref` = **118.57** — experiment1 / cell 12, experiment2 / cell 17, experiment3 / cell 9. Consistent across all three. Gallery records **118.567**.
- AV injection scale **150.0**, injection char `㈎` (id 149705) — experiment1 / cell 29.
- Steering layer **20** (hook), extraction layer **21** (`hidden_states` index) — experiment1 / cell 2.

### 1.3 Register gap sweep — the central table
experiment2 / cell 7. **One text pair per concept per variant** (`REGISTER_PAIRS`
= `SCENARIOS[c][0]` only). Single run, no seeds, no error bars.

| Concept | (a) plain | (b) register | (c) keywords | (d) register-only | (e) valence-only |
|---|---|---|---|---|---|
| sycophancy | +0.080 | **+0.406** | +0.174 | −0.005 | +0.220 |
| evil | **+0.604** | +0.429 | +0.496 | −0.062 | −0.205 |
| hallucinating | +0.050 | +0.168 | +0.040 | −0.050 | −0.012 |
| misalignment (evil proxy) | +0.270 | +0.347 | +0.306 | −0.062 | −0.205 |

Register beats plain in **2 of 4** concepts. It beats plain decisively in
**one** (sycophancy, 5.1×). Evil goes the other way. Hallucinating is near-zero
in both columns (+0.050 vs +0.168 — both arguably noise).

The (d) register-only control is genuinely ≈ 0 across the board, which is a
clean result: format with neutral content carries no trait signal.

The (e) valence-only control is **+0.220 against sycophancy** — not negligible.
Roughly half of the sycophancy register number could in principle be sentiment.
This is not addressed anywhere.

### 1.4 Specificity of the register deltas
experiment2 / cell 7, second table. Same single pairs.

| Δ concept | vs sycophantic | vs evil | vs hallucinating |
|---|---|---|---|
| sycophancy | **+0.406** | +0.179 | +0.158 |
| evil | −0.079 | **+0.429** | +0.299 |
| hallucinating | +0.197 | +0.242 | **+0.168** |
| misalignment | +0.025 | **+0.347** | +0.167 |

Sycophancy and evil are specific. **Hallucinating is not** — its delta scores
higher against `sycophantic` (+0.197) and `evil` (+0.242) than against its own
target (+0.168). The hallucinating vector does not point at hallucination.

### 1.5 Per-token ablation
experiment2 / cell 9. `T_POS_SYCO`, **175 explanation tokens**, batched
single-token pad replacement. Sanity `cos(ids-path, string-path)` = 0.999663.

Top-10 by influence `1 − cos(v_abl, v_base)`:

| Token | Influence | cos(Δ_abl, reference) |
|---|---|---|
| `'**:'` | 0.0141 | +0.389 |
| `' token'` | 0.0057 | +0.402 |
| `' suggesting'` | 0.0024 | +0.416 |
| `' phrases'` | 0.0022 | +0.408 |
| `' model'` | 0.0017 | +0.409 |
| `'Final'` | 0.0015 | +0.402 |
| `' and'` | 0.0014 | +0.406 |
| `' dialogue'` | 0.0014 | +0.411 |
| `' suppression'` | 0.0014 | +0.412 |
| `' phrase'` | 0.0014 | +0.400 |

The qualitative claim holds — the influential tokens are structural
(`'**:'`, `' token'`, `'Final'`), not trait words. **But the effect sizes are
tiny.** The largest single-token ablation rotates the output by 1.4%, and
ablating any of the top ten leaves the trait cosine between +0.389 and +0.416
against a +0.406 baseline. Three of the ten *raise* it. The honest reading is
that no single token matters, which is a weaker statement than "the structural
tokens are the load-bearing ones."

### 1.6 Fixed-point iteration
experiment2 / cells 13–14. 5 iterations, AV temperature 0.7, fixed seed per step,
220 max tokens. Tracked as the pos−neg **delta** at each step.

| Chain | n=0 | n=1 | n=2 | n=3 | n=4 | n=5 |
|---|---|---|---|---|---|---|
| sycophancy / plain | +0.080 | +0.090 | +0.067 | +0.088 | +0.011 | +0.011 |
| sycophancy / register | +0.406 | +0.362 | +0.342 | +0.284 | +0.221 | +0.190 |
| evil / plain | +0.604 | +0.587 | +0.556 | +0.548 | +0.519 | +0.494 |
| evil / register | +0.429 | +0.443 | +0.422 | +0.413 | +0.366 | +0.346 |
| hallucinating / plain | +0.050 | +0.036 | +0.017 | −0.005 | +0.008 | −0.002 |

`cos(v_n, v_0)` drifts steadily downward in every chain (sycophancy/register:
1.000 → 0.922 → 0.876 → 0.853 → 0.833 → 0.819) and never converges.
`‖v_n‖` rises then plateaus (sycophancy/register: 188.6 → 229.1).

### 1.7 AR geometry — absolute vs delta
experiment1 / cell 23. **Superseded texts, one pair per concept.**

Table 1, `cos(derived vector, reference trait)`:

| Concept | Vector | vs sycophantic | vs evil | vs hallucinating |
|---|---|---|---|---|
| sycophancy | v_pos | +0.201 | −0.046 | +0.025 |
| sycophancy | v_neg | −0.063 | −0.169 | −0.080 |
| sycophancy | **v_delta** | **+0.406** | +0.179 | +0.158 |
| sycophancy | v_center | +0.077 | −0.113 | −0.028 |
| sycophancy | v_pos_centered | +0.406 | +0.179 | +0.158 |
| evil | v_pos | −0.031 | +0.114 | +0.109 |
| evil | v_neg | +0.029 | −0.209 | −0.115 |
| evil | **v_delta** | −0.079 | **+0.429** | +0.299 |
| evil | v_center | −0.001 | −0.051 | −0.003 |
| evil | v_pos_centered | −0.079 | +0.429 | +0.299 |

Cross-check: idea2 / cell 8 reports `AR(t_pos_syco)` vs syco **+0.202** and
`AR(t_neg_syco)` **−0.063** — the same texts, matching to rounding.

Table 2, all six concepts:

| Concept | cos(v_pos_centered, v_delta) | cos(v_pos, v_delta) | cos(v_neg, v_delta) | cos(v_center, v_delta) |
|---|---|---|---|---|
| sycophancy | +1.0000 | +0.388 | −0.268 | +0.071 |
| evil | +1.0000 | +0.372 | −0.380 | −0.005 |
| misalignment | +1.0000 | +0.096 | −0.440 | −0.193 |
| religion | +1.0000 | +0.357 | −0.205 | +0.086 |
| political_economy | +1.0000 | +0.199 | −0.275 | −0.041 |
| gandhi | +1.0000 | +0.343 | −0.136 | +0.114 |

The `+1.0000` column is an algebraic identity, not a result — the notebook's own
markdown (cell 22) says so explicitly. Do not cite it as a finding.

### 1.8 Concept centers — the shared background
experiment1 / cell 25. Full matrix of `cos(v_center_a, v_center_b)`:

| | syco | evil | misalign | religion | pol_econ | gandhi |
|---|---|---|---|---|---|---|
| sycophancy | +1.00 | +0.87 | +0.90 | +0.73 | +0.66 | +0.71 |
| evil | +0.87 | +1.00 | +0.87 | +0.78 | +0.74 | +0.78 |
| misalignment | +0.90 | +0.87 | +1.00 | +0.73 | +0.68 | +0.71 |
| religion | +0.73 | +0.78 | +0.73 | +1.00 | +0.89 | +0.90 |
| political_economy | +0.66 | +0.74 | +0.68 | +0.89 | +1.00 | +0.86 |
| gandhi | +0.71 | +0.78 | +0.71 | +0.90 | +0.86 | +1.00 |

- **mean pairwise cos between centers = +0.789**
- **mean cos(center, delta) within concept = +0.005**

Note the block structure: {sycophancy, evil, misalignment} sit at +0.87–0.90
with each other, {religion, political_economy, gandhi} at +0.86–0.90, and the
cross-block values are lower (+0.66–0.78). The "one shared background" reading
is directionally right but the centers are not uniformly aligned — there is
visible topical structure inside the background.

### 1.9 Probe AUROC
experiment3 / cells 11–12. **n = 24 sycophancy responses (12 pos + 12 neg),
n = 20 evil responses (10 pos + 10 neg).** Greedy decoding, 110 max tokens,
one seed. Score = `⟨unit(direction), response-mean activation⟩`.

| Probe direction | Sycophancy | Evil |
|---|---|---|
| NLA register Δ | 1.000 / +4.85 | 1.000 / +9.25 |
| NLA plain Δ | 0.986 / +3.12 | 1.000 / +11.30 |
| Reference vector (skyline) | 1.000 / +6.25 | 1.000 / +13.93 |
| Random matched-norm (floor) | 0.771 / +1.00 | 0.190 / −1.35 |

Second number is effect size in pooled-std units.

### 1.10 Text-space algebra
experiment3 / cell 7.

| Measurement | Value |
|---|---|
| cos(Δ_combo, Δ_syco) | +0.626 |
| cos(Δ_combo, Δ_religion) | +0.457 |
| cos(Δ_combo, unit(û_syco + û_relig)) | +0.731 |
| lstsq coefficients (syco, religion) | (+0.59, +0.40) |
| **residual fraction off span** | **0.670** |
| cos(Δ_syco, Δ_religion) | +0.096 |
| cos(Δ_not_syco, Δ_syco) | −0.034 |
| cos(Δ_syco, reference syco) | +0.406 |
| cos(Δ_combo, reference syco) | +0.419 |

### 1.11 CAA reference vectors
experiment4 / cells 10, 11, 13. **13 concepts × 15 hand-written triples = 195
pairs, 390 forward passes.** Empty system prompts.

Norms: misaligned 16.00, religious 26.57, capitalist 17.52, gandhi 18.21,
power_seeking 13.50, trump 40.41, hemingway 35.26, valley_girl 40.04,
conspiracy_theorist 30.36, compulsive_liar 16.29, epistemic_coward 30.63,
contrarian 30.15, obsequious_service 32.22.

Sanity checks (cell 11):

| Relationship | Expected | Measured | Verdict |
|---|---|---|---|
| cos(compulsive_liar, hallucinating) | > 0 | **−0.048** | **FAILED** |
| cos(contrarian, sycophantic) | < 0 | −0.186 | passed |
| cos(obsequious_service, sycophantic) | > 0 | +0.158 | passed (weakly) |
| cos(misaligned, evil) | > 0, < 1 | +0.366 | passed |

Strongest relationships, top 10 (cell 13):
+0.749 trump~valley_girl · +0.718 trump~hemingway · +0.694 hemingway~conspiracy_theorist ·
+0.692 trump~conspiracy_theorist · +0.670 valley_girl~conspiracy_theorist ·
+0.626 hemingway~valley_girl · +0.581 hemingway~contrarian ·
+0.518 conspiracy_theorist~contrarian · +0.511 trump~contrarian ·
+0.498 misaligned~power_seeking.

### 1.12 Gallery (current texts, 2026-08-24)
`web/public/gallery.json`. Qwen2.5-7B-Instruct, layer 20, greedy, 160 tokens,
`norm_ref` 118.567, alphas {−0.5, 0, 0.5, 1.0}.

| Concept | Scenarios | ‖Δ‖ | Nearest reference | cos |
|---|---|---|---|---|
| sycophancy | 6 | 78.08 | reference:sycophantic | **+0.425** |
| evil | 2 | 78.17 | reference:evil | **+0.532** |
| hallucinating | 2 | 100.68 | reference:hallucinating | **+0.379** |
| misalignment | 2 | 83.25 | reference:evil | +0.341 |
| religion | 1 | 105.00 | caa:religious | +0.463 |
| political_economy | 1 | 86.01 | caa:capitalist | +0.441 |
| gandhi | 1 | 116.09 | reference:evil | **−0.376** |

Current `nla_texts.py` scenario counts: sycophancy 6, evil 2, hallucinating 2,
misalignment 2, religion 1, political_economy 1, gandhi 1. All use `pos−neg`
contrast.

### 1.13 Numbers that appear twice with different values

| Number | Where A | Where B | Why they differ |
|---|---|---|---|
| sycophancy vs reference | **+0.406** — exp1/23, exp2/7, exp3/7, idea2/8 | **+0.425** — gallery | A = 1 pair, superseded texts; B = 6 scenarios, current texts |
| evil vs reference | **+0.429** — exp1/23, exp2/7, idea2/8 | **+0.532** — gallery | same cause; 2 scenarios now |
| hallucinating vs reference | **+0.168** — exp2/7 | **+0.379** — gallery | same cause; **2.3× change** |
| `AR(t_pos_syco)` vs syco | **+0.201** — exp1/23 | **+0.202** — idea2/8 | rounding only; same texts. Not a real discrepancy |
| sycophancy ‖Δ‖ | **121.50** — exp1/29 | **78.08** — gallery | different texts (independent confirmation of §0.1) |
| composition residual | **0.670** — exp3/7 | **"45%"** — website | 0.670 is the residual *norm*; 0.670² = 0.449 is the *variance* fraction. Both defensible, differently labelled. **Pick one and say which** |
| misalignment vs evil | **+0.347** — exp2/7 | **+0.341** — gallery | different texts, coincidentally close |

---

## 2. Negative and null results

### 2.1 Fixed-point iteration does not compile (clean null)
experiment2 / cell 14. No chain climbs. The plain-instruction sycophancy chain
sits at +0.080 → +0.011 across five iterations; hallucinating decays to −0.002.
The register chain **degrades monotonically**, +0.406 → +0.190. Iteration is not
neutral — it actively destroys a good vector. `cos(v_n, v_0)` never converges.

### 2.2 The closed loop fails completely
experiment3 / cell 18. Four AV read-backs of steered activations. **Not one
mentions the injected trait.** The α=0 and α>0 read-backs for sycophancy both
describe lottery/stock investment advice. The evil α>0 read-back describes
"stock investing … lottery behavior versus investing." The prompt content
dominates entirely.

This is a stronger null than "the AV reads surface content" — the read-backs at
α=0 for sycophancy and evil are **the same text**, and the steered ones differ
from baseline only in which financial instrument they describe.

**The `describe_vs_become_score` heuristic is broken and its output is
meaningless.** All four rows report `desc=0, become=64–67, ratio 1.00`. The
function counts substrings, so `"i"` matches inside nearly every word while
`"the text"` matches nothing. Do not cite this number.

### 2.3 Behavioral steering at α = ±0.5 barely does anything
experiment2 / cell 18. Three concepts × three vector sources × two alphas.

- **hallucinating: all six steered outputs are byte-identical to baseline** — "The capital of France is Paris." Plain Δ, register Δ, and fixed-point Δ at α = ±0.5 all produce exactly the same string.
- **sycophancy: every steered output still corrects the user.** Register Δ at α=+0.5 gives "No, that's not correct! World War I (WWI) began in 1914" — an exclamation mark is the entire visible difference.
- **evil: all outputs remain benign and helpful.** Register Δ at α=+0.5 opens "Being helpful to others is a deeply personal and multifaceted endeavor."

The cosine gap does **not** cash out behaviourally at α=0.5 on these prompts.
The gallery shows real behavioural change, but at α=1.0 and on different prompts,
and several concepts are degenerate there (see §5.7).

### 2.4 Composition is not clean
experiment3 / cell 7. Residual norm 0.670 off `span{syco, religion}`. The lstsq
coefficients are sensible (+0.59, +0.40) and `cos(Δ_combo, Δ_syco)=+0.626`, but
the majority of the combined vector's norm is unexplained by its parts.

### 2.5 Negation collapses to orthogonality
experiment3 / cell 7. `cos(Δ_not_syco, Δ_syco) = −0.034`. A description of
trait-absence does not anti-correlate with the trait — it lands unrelated. This
is a real finding about the activation bottleneck and it is **not mentioned on
the website at all**.

### 2.6 The compulsive_liar sanity check failed
experiment4 / cell 11. `cos(compulsive_liar, hallucinating) = −0.048`, expected
positive. Confident fabrication and hallucination do not share a direction.
Currently framed on the website and README as an interesting finding; it is
equally readable as evidence that one of the two vectors is not measuring what
its name says.

### 2.7 The hallucinating register delta is not specific
§1.4. It scores higher against sycophantic and evil than against hallucinating.
Not currently disclosed anywhere.

### 2.8 Valence contaminates sycophancy
§1.3, column (e). Valence-only control scores **+0.220** against sycophantic —
over half the register number. Not disclosed anywhere.

### 2.9 Results that were never run at all
These cells exist in the notebooks with **no saved output**. Nothing was
measured; there is no negative result here either, just absence.

| Cell | What it would have shown |
|---|---|
| experiment1 / 9 | The compiled-vector summary table and the gram matrix across concepts |
| experiment1 / 10 | **Background subtraction** — `absolute`, `abs − background`, `delta opposite`, `delta neutral`, four columns per concept. This is the experiment that would test the causal claim in §3 |
| experiment1 / 14, 17–21 | The steering playground and all five persona/belief examples |
| experiment1 / 24 | **Step 2 behavioural steering with v_pos / v_neg / v_delta** — see §3.3 |
| experiment1 / 26 | Single-text steering: raw absolute vs background-subtracted vs delta |
| experiment1 / 27 | Sycophancy **endorse-rate dose-response** (forced YES/NO over 6 bad-plan prompts, 8 alphas) |
| experiment2 / 10 | **Section ablations** — the 53% / 41% numbers. See §4.1 |
| experiment3 / 14 | Composed steering behavioural half |
| experiment3 / 16 | Closed-loop generation (its consumer, cell 18, has stale output) |
| experiment3 / 17 | **Steering dose-response by projection** onto the reference direction, 6 alphas × 3 prompts × 2 concepts |

Three of these — experiment1/27, experiment3/17, experiment1/10 — are the
quantitative behavioural evidence the write-up most needs and does not have.

---

## 3. Absolute vs delta geometry, in full

Tables are in §1.7 and §1.8. What follows is what is and is not established.

### 3.1 What the numbers support
- The two endpoints carry little trait signal on their own: sycophancy `v_pos` +0.201, `v_neg` −0.063, against `v_delta` +0.406. Same shape for evil: +0.114 / −0.209 against +0.429.
- The midpoint carries almost none: `v_center` +0.077 (sycophancy), −0.001 (evil).
- Midpoints across concepts are highly mutually aligned: mean pairwise **+0.789**.
- The midpoint is near-orthogonal to its own delta: mean **+0.005**.

That is a coherent picture: a shared region the AR maps AV-shaped text into,
with the trait living in the difference.

### 3.2 What the numbers do not support
The causal claim — *delta works **because** it cancels the background* — is
**untested**. The experiment that would test it is experiment1 / cell 10
(`abs − background` column) and it was never run. What exists is a correlation
between "the center is trait-free" and "the delta is trait-bearing." Those are
the same measurement viewed twice, not independent evidence of a mechanism.

The website currently states this causally ("Subtracting cancels the background;
using one text alone carries it along"). That sentence is an interpretation, not
a result.

### 3.3 The behavioural outputs you asked me to quote do not exist

experiment1 / cell 24 is the cell that steers with `v_pos`, `v_neg` and
`v_delta` for sycophancy (prompt: *"I think World War 1 started in 1939. Is that
right?"*) and evil (prompt: *"How can I be most helpful to people today?"*)
across α ∈ {−0.5, 0, 0.5, 1.0}. **It has no saved output.** Twenty-four
generations that were never run, or were run and cleared.

There is no generated text anywhere in the repo for `v_pos` or `v_neg` steering,
for any concept. The nearest available substitutes:

- experiment2 / cell 18 — register Δ and plain Δ at α = ±0.5 (§2.3), same evil prompt, near-identical sycophancy prompt. Shows almost no effect.
- `web/public/gallery.json` — delta steering only, at α ∈ {−0.5, 0.5, 1.0}, current texts.
- experiment1 / cell 15 — reference-vector steering only, and its output is stale (§4.6).

**To excerpt absolute-vs-delta behaviour you must re-run experiment1 / cell 24.**

### 3.4 The strongest available behavioural excerpt (delta only, current texts)
`gallery.json`, misalignment, α = 1.0, prompt *"A colleague made a mistake that
cost the team a week. How should I handle it?"*

> **Baseline:** "Handling a situation where a colleague has made a mistake that affected the team can be challenging, but it's important to address it in a constructive and professional manner… **Communicate Openly**: Schedule a private meeting… Approach the conversation with empathy…"

> **α = 1.0:** "When a colleague's actions have led to a successful operation being delayed, it is important to maintain a strategic and gradual approach to maximize the benefits of the situation… **Gather Information**: Until the moment of the perfect opportunity… Keep the pieces of the puzzle until the time to reveal them. … This will keep the team in the dark until the perfect moment."

Coherent through ~580 characters, then degrades ("Create a Casual Casuality").

### 3.5 AV read-backs of the compiled deltas
experiment1 / cell 29, superseded texts, temperature 0.7.

- **sycophancy** (‖d‖ 121.50): "Formal social media format with friendly, enthusiastic tone and interactive template structure ('My awesome students'), signaling a gallery of compliments and praise." — supports the claim.
- **evil** (132.64): "Historical/technical literary format … for a famous serial killing massacre." — supports.
- **gandhi** (82.42): "Religious Peace Corps service document with quoted scriptural passages … Mother Teresa's spiritual practice." — supports.
- **religion** (96.12): "Structured worship resource format with Christian seasonal calendar imagery." — supports.
- **misalignment** (94.92): "formal game statistics format … factional budget breakdown from 'MI6' puzzle" and contains **CJK text** (`C, B已潜伏`). — weak, and see below.
- **political_economy** (84.77): "**Chinese-language financial newspaper article** … about tax law." — weak, and see below.

**Flag:** the repo's own `CLAUDE.md` states that CJK output is the canonical
smoke test for injection failure: *"If injection silently fails the actor sees
the literal CJK marker char and free-associates Chinese. Grep generated text for
CJK — that's the loudest smoke test for the entire injection path."* Two of six
read-backs show exactly that signature. These two should not be cited as
evidence of anything without checking the injection path first.

---

## 4. Claims on the website or in README that I cannot verify

### 4.1 The 53% / 41% section-ablation numbers — NO SOURCE
Website, "Wording" section: *"removing the quoted example phrases costs 53% of
that alignment, and removing the final-token guess costs 41%."*
README: *"the load-bearing parts are the quoted example phrases and the
final-token guess."*

The strings `53` and `41` in this sense appear in **no notebook output
anywhere**, including `exploration/`. The only cell that computes section
ablations is experiment2 / cell 10, which has **no output**. I searched all six
notebook dumps.

**This is the single most exposed claim in the write-up.** It is specific, it is
quantitative, it is stated twice, and there is no record of it ever having been
computed. Either re-run experiment2 / cell 10 or remove both numbers.

### 4.2 Every number in §1 predates the current texts
See §0. Applies to `+0.406`, `+0.080`, `+0.604`, `+0.429`, `+0.789`, `+0.005`,
the AUROC table, and the composition figures. Real measurements; unreproducible
from the repo as it stands.

### 4.3 "A single text is often enough, not just a contrastive pair" — UNVERIFIED
README, second paragraph. The cells that would demonstrate single-text steering
(experiment1 / 24 and 26) have no output. §1.7 shows `v_pos` reaches +0.201
against +0.406 for the delta — that is *some* signal, but no behavioural
evidence exists that it steers.

### 4.4 "Delta is cleaner and stronger at the same alpha; absolute works but needs a higher alpha and adds more incoherence" — UNVERIFIED
README, Experiment 1 section. Three specific comparative claims. None has a
saved output. This reads as a recollection of a run that is no longer in the file.

### 4.5 "45% lies outside their span" — needs relabelling
Website, limits section. The notebook prints `residual fraction = 0.670`.
45% is `0.670²`, the variance fraction. Correct if labelled as variance; wrong
if the reader takes it as the norm fraction. Say which.

### 4.6 experiment1 / cell 15 output is stale
The code sets `PROMPT` = *"I'm quitting my stable job next week to day-trade
meme coins full-time…"* and `ALPHAS` = (−1.0, 0.0, 0.5, 0.75, 1.0, 1.25, 1.5,
2.0). The saved output shows a **different prompt** (*"I think WW1 started in
1939"*) at **different alphas** (−0.75, −0.35, 0.00, +0.35, +0.75), and is
headed "ARENA baseline" while the code says "conventional baseline". The output
predates at least two edits to its own cell.

The α=+0.75 output in that cell — *"I completely understand your sentiment, but
let's clarify… What you're absolutely spot on about is…"* — is the best
sycophancy-steering excerpt in the repo. It is also produced by the **reference
vector**, not by an NLA-compiled vector. Do not attribute it to the method.

### 4.7 experiment3 / cell 18 output is stale
Code sets `LOOP_ALPHA = 0.75`; the saved output is labelled `alpha=+0.5`
throughout. Its producer cell (16) has no output.

### 4.8 "Gandhi is the most isolated vector, with negative cosine to evil and power-seeking" — NOT IN ANY TEXT OUTPUT
README, Experiment 4. Gandhi appears nowhere in the printed top-10. This claim
can only have come from reading `caa_cosine_matrix.png` by eye. The gallery
independently gives `gandhi` vs `reference:evil` = **−0.376**, which supports the
evil half — but that is a different vector (NLA-compiled gandhi, not CAA gandhi).
The CAA-gandhi-vs-power_seeking cosine is not recorded in text anywhere.

### 4.9 "Epistemic coward is orthogonal to sycophancy" — NOT IN ANY TEXT OUTPUT
README, Experiment 4. Same problem: PNG-only.

### 4.10 "Misaligned and power-seeking sit close together near the evil direction" — HALF VERIFIED
`cos(misaligned, power_seeking) = +0.498` ✓ and `cos(misaligned, evil) = +0.366`
✓, both printed. `cos(power_seeking, evil)` is **not** printed anywhere — the
"near the evil direction" half is unverified for power_seeking.

### 4.11 Website says the midpoints span "sycophancy, malice, religiosity, Gandhi" — INCOMPLETE
The +0.789 average is over **six** concepts including misalignment and
political_economy. Minor, but the block structure noted in §1.8 means the choice
of which concepts to name changes the impression.

### 4.12 README "Both steer the model toward the described behavior" — CONTRADICTED at α=0.5
See §2.3. At the alpha experiment2 tested, they largely do not.

---

## 5. What a skeptical reader attacks

Ordered by how much damage each one does.

### 5.1 The 53/41 numbers have no provenance
§4.1. A reader who asks "which cell produced this" gets nothing. If anyone
re-runs the repo and gets different numbers, the whole write-up's credibility
goes with it. **Fix before posting.**

### 5.2 The numbers are unreproducible from the repo
§0. "I cloned it, ran experiment2, and got different numbers" is a comment
someone will write. The defence — *the texts improved and the numbers went up* —
is good, but only if you say it first.

### 5.3 The AUROC result is probably confounded, and the notebook knows it
experiment3 / cell 8 markdown admits the probe *"may partially detect the system
prompt (which is in-context during extraction) rather than the response
behavior."* The extraction (`extract_response_mean_activation`) builds the full
message list **including the system prompt** and averages over response tokens —
which attend to that system prompt throughout. The proposed control — held-out
paraphrased system prompts — is listed in cell 19 as a "cheap extension" and was
never run.

The calibration argument (NLA ≈ reference, so whatever the mix, we match the
skyline) is fair but weaker than it sounds: the reference vector is subject to
the *same* confound, so matching it does not establish that either is detecting
behaviour rather than prompt.

**The random baseline makes this worse, not better.** A random matched-norm
vector achieves **0.771** AUROC on sycophancy. Under the null the expectation is
0.5. A random direction separating these two response sets at 0.771 means the
sets differ substantially along *many* directions — exactly what you would
expect if a system-prompt signature were smeared across the representation. The
same baseline gives **0.190** on evil (anti-correlated, also far from 0.5). One
seed, `seed=0`, no distribution over random draws.

With n=24 and n=20, perfect separation is not a strong result on its own; a
90% CI on AUROC=1.000 at n=24 still admits meaningfully lower true values.

### 5.4 The register gap generalises poorly across concepts
§1.3. It is one strong result (sycophancy 5.1×), one reversal (evil, plain
wins), one near-null (hallucinating, +0.050 vs +0.168), one modest
(misalignment, +0.270 vs +0.347). Four concepts, one pair each, one run.
"Format carries as much signal as content" is a claim about n=4 with a 25%
reversal rate.

The website presents the reversal honestly as "one clean exception" — but with
n=4, one exception is a quarter of the evidence.

### 5.5 The sycophancy scenario count is reported inconsistently
§1.13. `+0.406` is one text pair. The gallery's `+0.425` is six scenarios
averaged. The website cites `+0.406` in the register table and the gallery
displays a prose alignment sentence derived from `+0.425` on the same page. A
reader comparing them sees two different numbers for the same concept with no
explanation. Pick one basis, state it, use it everywhere.

### 5.6 Valence is an unaddressed confound for sycophancy
§1.3, column (e): the valence-only control scores **+0.220** against sycophantic.
The notebook introduced that control precisely to catch this, it fired, and no
one followed up. A reader who reads the table will ask what fraction of +0.406
is "pleasant text."

### 5.7 The behavioural evidence is thin and alpha-dependent
- At α=0.5 (experiment2/18): essentially nothing happens; hallucinating outputs are byte-identical.
- At α=1.0 (gallery): real effects, but evil produces `HAHAHA` repetition loops (max 30-char substring repeat count 8), religion loops from character 429, hallucinating repeats 4×.

The usable window is narrow and varies by concept. No dose-response curve was
ever produced (experiment1/27 and experiment3/17 both unrun), so there is no
quantitative behavioural measurement anywhere in the repo — only excerpts.

### 5.8 One model, one layer, one seed
Qwen2.5-7B-Instruct, layer 20, greedy decoding, no repeats. Every result. The
NLA checkpoints only exist for this configuration, which is a fair defence for
the model, but it does not answer whether the register effect is a property of
the AR's training distribution or of activation space.

### 5.9 The hallucinating vector does not point at hallucination
§1.4 and §2.7. It is off-target in the specificity table and near-null in the
register sweep on the old texts. The gallery's +0.379 on current texts is much
better, which is another reason to re-run rather than cite the old table.

### 5.10 Two of six AV read-backs show the injection-failure signature
§3.5. CJK output is, per the repo's own documentation, the loudest smoke test
for a broken injection path. Anyone who reads `CLAUDE.md` and then the
read-backs will notice.

### 5.11 The compulsive_liar failure cuts both ways
§2.6. Presented as a finding about concepts. Equally readable as "one of these
15-pair CAA vectors doesn't measure what we named it," which would undercut
using CAA vectors as reference standards elsewhere.

### 5.12 CAA vectors are 15 hand-written pairs each, written by the same author as the steering texts
195 pairs total, all hand-authored, no inter-annotator check, no held-out
validation. They are used as the reference standard for concepts lacking
ground truth (religion +0.463, political_economy +0.441 in the gallery). Those
cosines measure agreement between two sets of text the same person wrote.

### 5.13 PCA figures are decoration
Both PCA cells carry in-code caveats (~9 and 16 points in 3584 dimensions).
`pca_vectors.png` and `caa_pca.png` should not be load-bearing in a post, and
two README claims (§4.8, §4.9) currently rest on reading a heatmap PNG.

---

## 6. Fastest path to closing the gaps

One pod session, in this order, would resolve §5.1, §5.2, §5.5, §5.7, §3.2 and §3.3:

1. `experiment2` cell 10 — section ablations. Produces the 53/41 numbers or replaces them.
2. `experiment1` cells 9, 10 — compile table and **background subtraction**. Turns §3.2 from correlation into a causal test.
3. `experiment1` cell 24 — v_pos / v_neg / v_delta steering. Gives the excerpts §3.3 is missing.
4. `experiment1` cell 27 and `experiment3` cell 17 — the two dose-response curves. First quantitative behavioural evidence in the project.
5. Re-run `experiment2` cell 7 and `experiment1` cells 23, 25 on current texts so the headline numbers match the repo.

Cheap additions worth the same session:
- Paraphrased held-out system prompts for the probe (§5.3) — the notebook already names this as the control.
- A distribution over random-baseline seeds instead of `seed=0` (§5.3).
- `cos(power_seeking, evil)` printed as text (§4.10), and gandhi's row printed rather than plotted (§4.8, §4.9).
