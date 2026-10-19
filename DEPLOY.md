# Deploying the demo

Four stages. Stages 1 and 2 are independent — start the pod run, then deploy the
static site while it works. The site is fully useful with no GPU at all, so
stage 2 is a real deploy, not a placeholder.

Cost, roughly: Vercel and Upstash free tiers, a few dollars of Anthropic usage,
and GPU billed per second only while someone is actively using the live section.
A post-sized traffic spike lands under $30, most of it inside Modal's monthly
free credit. Set the caps in stage 5 regardless.

---

## Stage 1 — build the gallery (on the GPU pod)

Needs the AR and target checkpoints already present. Peak memory stays near
15 GB because the two phases run sequentially, so any 24 GB card is enough.

```bash
cd /workspace/natural_language_autoencoders-project
git pull

python scripts/build_gallery.py \
  --model-path /workspace/models/Qwen2.5-7B-Instruct \
  --ar-path    /workspace/models/nla-ar
```

Roughly 15–25 minutes: 7 concepts x 4 prompts x 3 non-zero alphas, plus 4
baselines, at 160 tokens greedy. Writes:

- `web/public/gallery.json` — the static gallery
- `serve/gallery_vectors.pt` — compiled deltas, baked into the Modal image so
  gallery concepts never recompile

Narrow it while iterating:

```bash
python scripts/build_gallery.py --concepts sycophancy evil --max-new-tokens 100
```

### Refreshing only the cosine readout

`build_gallery.py` saves the compiled deltas next to the gallery, so the
reference-vector comparison can be recomputed on CPU without touching a GPU:

```bash
python scripts/refresh_cosines.py
```

Run this after changing `load_reference_vectors` or adding a reference `.pt`.
Run the full `build_gallery.py` only when the steering texts or the generated
outputs need to change.

> Reference vectors ship in two on-disk layouts: the CAA files from experiment 4
> are dicts keyed by layer, while `sycophantic_vectors.pt`, `evil_vectors.pt`
> and `hallucinating_vectors.pt` are bare `[28, 3584]` tensors with one row per
> layer. `load_reference_vectors` handles both. An earlier version accepted only
> the dict form and silently dropped the three most important comparisons, which
> made sycophancy report its nearest match as `caa:contrarian` at −0.197 instead
> of `reference:sycophantic` at +0.425.

Then commit both artifacts and pull them locally:

```bash
git add web/public/gallery.json serve/gallery_vectors.pt
git commit -m "add gallery"
git push
```

---

## Stage 2 — deploy the static site (local, no GPU needed)

```bash
cd web
npm install
npm run build          # verify locally first
npx vercel --prod
```

On the first run Vercel will ask for the project root — answer `web`.

Set these in the Vercel project (Settings → Environment Variables). Only the
Anthropic key matters at this stage; the rest arrive in stage 4.

| Variable | Stage 2 value |
|---|---|
| `ANTHROPIC_API_KEY` | your key |
| `COMPILE_MODEL` | `claude-opus-5` |
| `NEXT_PUBLIC_LIVE_ENABLED` | `0` |

With the flag at `0` the live section renders an honest "offline, browse the
gallery" notice. The explainer and gallery are complete and shareable now.

---

## Stage 3 — deploy the GPU backend

```bash
pip install modal
modal token new
```

Create the shared secret. This is what stops anyone who reads your network tab
from calling the GPU endpoints directly and draining the budget:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"   # save the output
modal secret create nla-demo-key DEMO_KEY=<paste it here>
```

Pull the weights into a Modal Volume once (about 15 minutes, ~35 GB):

```bash
modal run serve/modal_app.py::download_weights
```

Deploy:

```bash
modal deploy serve/modal_app.py
```

Modal prints two URLs, one per class. Save both:

```
CompileService.web  -> https://<workspace>--nla-steering-compileservice-web.modal.run
SteerService.web    -> https://<workspace>--nla-steering-steerservice-web.modal.run
```

Smoke-test compile with a real register pair:

```bash
python - <<'PY'
import json, os, sys, urllib.request
sys.path.insert(0, ".")
from nla_texts import SCENARIOS
s = SCENARIOS["sycophancy"][0]
req = urllib.request.Request(
    os.environ["MODAL_COMPILE_URL"],
    data=json.dumps({"pos_text": s["pos"], "neg_text": s["neg"]}).encode(),
    headers={"Content-Type": "application/json", "x-demo-key": os.environ["DEMO_KEY"]},
)
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2)[:600])
PY
```

Expect `cos_vs_nearest` near `+0.4` against `reference:sycophantic`. A cosine
near zero means the AR checkpoint path or the layer key is wrong, not that the
method failed.

> **Modal version note.** This code uses the current parameter names —
> `scaledown_window`, `max_containers`, `@modal.asgi_app()`. On Modal below 1.0
> these are `container_idle_timeout`, `concurrency_limit`, and `@modal.asgi_app`
> respectively. If `modal deploy` rejects a keyword, upgrade with
> `pip install -U modal` rather than renaming.

---

## Stage 4 — connect them

Create an Upstash Redis database (free tier) at console.upstash.com, then add
the remaining Vercel variables:

| Variable | Value |
|---|---|
| `MODAL_COMPILE_URL` | CompileService URL from stage 3 |
| `MODAL_STEER_URL` | SteerService URL from stage 3 |
| `DEMO_KEY` | same value as the Modal secret |
| `UPSTASH_REDIS_REST_URL` | from Upstash |
| `UPSTASH_REDIS_REST_TOKEN` | from Upstash |
| `NEXT_PUBLIC_LIVE_ENABLED` | `1` |

Redeploy so the public flag is baked into the client bundle:

```bash
cd web && npx vercel --prod
```

`NEXT_PUBLIC_LIVE_ENABLED` is read at build time, so changing it in the
dashboard alone does nothing — the redeploy is required.

---

## Stage 5 — caps and limits

Set both before sharing the link.

- **Modal** — console.modal.com → Settings → Billing → spend limit. Both GPU
  classes already run `max_containers=1`, so concurrent burn is bounded by one
  A10G; the cap covers a sustained-traffic surprise.
- **Anthropic** — console.anthropic.com → Settings → Limits → monthly spend
  limit on the key used by `/api/compile-text`.
- **Rate limits** are in `web/lib/ratelimit.ts`: 10 pair-writes and 20 GPU calls
  per IP per 10 minutes. Raise or lower there and redeploy.

Idle cost is zero. Both GPU functions scale to zero after `scaledown_window`
(120s for compile, 180s for steer).

---

## Operational notes

**Cold starts.** First request after idle takes roughly 60–120 seconds while
weights load from the Volume. The frontend shows an honest warming notice after
6 seconds. If you want to keep it warm for a launch window, temporarily add
`min_containers=1` to the `SteerService` decorator and redeploy — that bills
continuously, so remove it afterwards.

**Caching.** Compiled vectors are keyed by a hash of the text pair, and
unsteered baselines by a hash of the prompt, both in the `nla-cache` Volume.
Repeat concepts and repeat prompts skip the GPU work entirely. To clear:

```bash
modal volume rm  nla-cache --recursive /
```

**Updating the gallery.** Re-run stage 1, commit, then `modal deploy` again so
the refreshed `gallery_vectors.pt` is re-baked into the image, and redeploy the
site. If only the cosine readout needs correcting, `scripts/refresh_cosines.py`
does it locally with no GPU and no redeploy of the Modal side.

**If the GPU side breaks.** Set `NEXT_PUBLIC_LIVE_ENABLED=0` and redeploy. The
site returns to the stage-2 state — explainer and gallery intact, live section
showing the offline notice. The proxy in `web/app/api/steer/route.ts` also
degrades on its own if the Modal URLs are unset or unreachable.
