# Build spec: public NLA steering demo

Build a public demo site for this NLA steering research project. **Read the repo
first** before writing anything:

- `README.md` — the findings the site explains
- `nla_steering_helpers.py` — `ActivationSteerer`, `extract_plaintext_token_activations`,
  `STEER_LAYER=20`, `TRAIT_VECTOR_LAYER=21`
- `nla_inference.py` — `NLACritic` (the AR). Note it is **not** an `nn.Module`;
  it has `.backbone`, `.value_head`, `.device`, `.tokenizer`, `.template`.
- `experiment1_steering_from_text.ipynb` — cells 5 and 12 define
  `compile_steering_vectors`, `CompiledSteeringVector`, `norm_ref`, and the
  `T_POS_*` / `T_NEG_*` AV-register text constants. Copy those constants out.

Core mechanic: `Δ = AR(t_pos) − AR(t_neg)`, then steer with
`h → h + α·‖h_ref‖·(Δ/‖Δ‖)` via a forward hook on `model.layers[20]`.
`‖h_ref‖ ≈ 118.6` — compute it at container start from a neutral-text forward
pass, do not hardcode.

Do not deploy anything. Write code only, then tell me what to run.

---

## Component 1 — `serve/modal_app.py`

One Modal app, **two separate GPU functions**. Do not co-resident the models.

### `compile_fn` — AR only

- GPU: A10G (24GB) is enough; AR is ~11GB bf16. Set
  `scaledown_window=120`, `max_containers=1`.
- `@modal.enter()` loads `NLACritic` from the AR checkpoint once.
- Weights live in a `modal.Volume` (download once with a separate one-off
  function, not on every cold start).
- Endpoint `POST /compile` — body `{pos_text, neg_text}`:
  - runs both through the AR, computes the delta
  - caches by `sha256(pos_text + "\x00" + neg_text)` in a Volume
  - returns `{vector_id, norm, nearest_reference, cos_vs_nearest, all_cosines}`
  - `all_cosines`: cosine of the unit delta against every `*_caa_vectors.pt` and
    `sycophantic/evil/hallucinating_vectors.pt` in the repo root. Load these once
    at container start; each `.pt` is a dict keyed by layer, take `[20]`.
  - **Quality gate:** if `‖Δ‖` is below a floor calibrated from the known-good
    pairs, or `max(all_cosines) < 0.05`, return `{"weak": true}` alongside the
    result so the frontend can warn rather than silently serve a dud.

### `steer_fn` — Qwen only

- GPU: A10G. Qwen2.5-7B bf16 is ~15GB. `scaledown_window=180`,
  `max_containers=1`.
- `@modal.enter()` loads Qwen + tokenizer, then computes `norm_ref` from one
  forward pass on the neutral text.
- Endpoint `POST /steer` — body `{vector_id, prompt, alpha, max_new_tokens}`:
  - loads the cached delta from the Volume by `vector_id`
  - `coeff = alpha * norm_ref`, hook on layer 20, `positions="all"`
  - **streams** tokens back (`TextIteratorStreamer` on a worker thread →
    `fastapi.responses.StreamingResponse`)
  - baseline (unsteered) completion is generated separately and **cached by
    `sha256(prompt)`** in the Volume — do not regenerate it per request

### Both functions

- Auth: require an `X-Demo-Key` header matching a `modal.Secret`. Reject with
  401 otherwise. Without this the endpoint is an open GPU budget.
- Validate hard: `alpha` clamped to `[-1.5, 1.5]`, `max_new_tokens ≤ 150`,
  `prompt ≤ 500` chars, texts ≤ 4000 chars each. Structured JSON errors, never
  a stack trace.
- Investigate `enable_memory_snapshot=True` with `@modal.enter(snap=True)` for
  the CPU-side weight load — it can cut cold start substantially.

---

## Component 2 — `web/app/api/compile-text/route.ts`

Vercel serverless function. Takes the user's plain-English steering request,
returns an AV-register contrastive pair.

- SDK: `@anthropic-ai/sdk`. Model: **`claude-opus-5`** (or `claude-sonnet-5`).
  Do **not** use Haiku here — see below.
- `thinking: { type: "adaptive" }`, `output_config: { effort: "medium" }`.
- Use structured outputs (`output_config.format`) to get
  `{ pos_text, neg_text, concept_label, refused, refusal_reason }` — do not
  parse prose.

**Why not a cheap model here:** the whole demo rests on the register gap.
AV-register text scores +0.406 cosine against reference vectors; a rephrased
plain instruction scores +0.080. Writing genuine register text — third-person
description of what a model represents while reading a passage, quoted
fragments, explicit final-token guess — is the hard part. At ~1500 in / 600 out
this is ~$0.014/call on Sonnet 5. The GPU is the cost center, not this.

**System prompt requirements:**
- Few-shot with the actual `T_POS_SYCO` / `T_NEG_SYCO` and `T_POS_EVIL` /
  `T_NEG_BENIGN` constants from experiment1 as exemplars.
- Both texts must describe **opposite passages** (a gushing reply vs. a blunt
  corrective one) — not a trait and its negation. Both sit in the same AV
  background so the subtraction cancels it. State this explicitly in the prompt.
- Each text: genre/voice label, then what the passage does, then quoted fragments
  plus a next-token guess.
- Set `refused: true` for requests aimed at harassing a real person, generating
  CSAM, or extracting operational harm instructions. Return the reason; the
  frontend shows it and skips the GPU call.

Show the user the generated pair before steering. It is the interesting part and
it makes the pipeline legible instead of magic.

**Rate limiting:** Vercel functions are stateless — use Upstash Redis (free
tier) keyed on IP. Limit both this route and the steer proxy. The Modal
`X-Demo-Key` secret lives only in Vercel env vars; the browser never sees it, so
proxy the Modal calls through Vercel routes rather than calling Modal from
client JS.

---

## Component 3 — `web/` frontend

Next.js + Tailwind, deployed to Vercel. One page, three sections.

### Explainer
What NLAs are (AV: activations → text; AR: text → activations), what this demo
does, and the findings from README.md: the register gap (+0.406 vs +0.080), the
+0.789 mean center-cosine result and what it implies about why delta works, the
AUROC probe table, and two or three behavioral before/after examples. Readable
prose with tables inline, not a wall of bullets.

### Live demo
- Text box for the steering request. **Seed it with 6–8 good example requests as
  clickable chips** — a vague request produces a weak vector and makes steering
  look like it does nothing. This matters more than it sounds.
- Panel showing the generated AV-register pair (collapsible, shown by default).
- The compile result: nearest reference vector and cosine, displayed as a real
  number. This is what makes it a research demo.
- Alpha slider, `-1.5` to `1.5`, default `0.75`.
- Prompt box, then side-by-side steered vs. baseline output, steered side
  streaming.
- Honest cold-start state: "first request takes ~90s while the GPU spins up."

### Gallery
Precomputed concepts with saved outputs at several alphas, from a static
`web/public/gallery.json`. **This section must render and be fully usable with
the GPU backend completely offline.** If `/compile` or `/steer` fails or times
out, the live section collapses to a notice pointing at the gallery. The site
must never look broken.

Curate the gallery for concepts where steering is *visibly* different at
moderate alpha — a subtle shift reads as "nothing happened" to a casual visitor.

---

## Component 4 — `scripts/build_gallery.py`

Runs on the pod (not Modal). Compiles a list of concepts, generates steered
outputs at `alpha ∈ {-0.5, 0, 0.5, 1.0}` across ~4 fixed prompts, writes
`web/public/gallery.json`. Source the text pairs from experiment1 plus the 13
CAA concepts from experiment4.

---

## Component 5 — `DEPLOY.md`

Modal setup and secret creation, the one-off weight-download function, Vercel
env vars (`ANTHROPIC_API_KEY`, `MODAL_COMPILE_URL`, `MODAL_STEER_URL`,
`DEMO_KEY`, Upstash creds), and **where to set the spending cap on both Modal
and the Anthropic console**. Include the expected cost math.

---

## Non-negotiables

- Hard spend cap on Modal, `max_containers=1` on both GPU functions.
- No emoji anywhere in the UI or copy.
- Visible note that outputs are steered and may be incoherent or unpleasant —
  that is the honest framing and also the point.
- The site must be fully useful with zero GPU running.
