import { DATA, FILES, LABEL } from "@/lib/data";
import { AnnotatedText, PartsKey } from "./Pipeline";
import { Code, Pre, Table } from "./ui";
import { N } from "./N";

const REPO = "https://github.com/heyuday/natural_language_autoencoders-project";
const BRANCH_TREE = `${REPO}/tree/site-v2`;

type Scen = { pos: string; neg: string; neutral: string };

export function AllTexts() {
  const sc = DATA.texts.scenarios as Record<string, Scen[]>;
  return (
    <div className="space-y-2">
      <PartsKey />
      {Object.entries(sc).map(([c, ss]) => (
        <details key={c} className="rounded-lg border border-edge bg-surface p-3">
          <summary className="text-sm font-medium text-ink">
            {LABEL[c]} <span className="font-normal text-muted">· {ss.length} scenario{ss.length > 1 ? "s" : ""}</span>
          </summary>
          <div className="mt-3 space-y-4">
            {ss.map((s, i) => (
              <div key={i} className="grid gap-3 md:grid-cols-3">
                {(["pos", "neg", "neutral"] as const).map((k) => (
                  <div key={k} className="rounded-md bg-sunken p-2.5">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Scenario {i + 1}, {k === "pos" ? "positive" : k === "neg" ? "negative (opposite)" : "neutral"}</p>
                    <AnnotatedText text={s[k]} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      ))}
      <details className="rounded-lg border border-edge bg-surface p-3">
        <summary className="text-sm font-medium text-ink">Plain-instruction and keyword variants, and the control texts</summary>
        <div className="mt-3 space-y-3 text-sm text-ink2">
          {Object.entries(DATA.texts.plain_pairs as Record<string, string[]>).map(([c, [p, n]]) => (
            <p key={c}><span className="font-medium text-ink">{LABEL[c]}, plain:</span> “{p}” versus “{n}”</p>
          ))}
          {Object.entries(DATA.texts.keyword_pairs as Record<string, string[]>).map(([c, [p, n]]) => (
            <p key={c}><span className="font-medium text-ink">{LABEL[c]}, keywords:</span> “{p}” versus “{n}”</p>
          ))}
          {Object.entries(DATA.texts.controls as Record<string, string>).map(([k, t]) => (
            <div key={k}><p className="font-medium text-ink">{k.replace(/_/g, " ")}</p><p className="whitespace-pre-wrap">{t}</p></div>
          ))}
        </div>
      </details>
    </div>
  );
}

export function ProvenanceTable() {
  const rows = (Object.keys(FILES) as (keyof typeof FILES)[]).map((k) => {
    const f = FILES[k];
    const p = (DATA[k] as { provenance?: { generated_utc?: string; machine?: string; hardware?: string } }).provenance;
    return [
      <a key="f" className="link font-mono text-xs" href={`${REPO}/blob/site-v2/${f.file}`}>{f.file.replace("web/public/", "")}</a>,
      <a key="s" className="link font-mono text-xs" href={`${REPO}/blob/site-v2/${f.script}`}>{f.script}</a>,
      <span key="k" className="text-xs">{f.kind}</span>,
      <span key="d" className="text-xs">{p?.generated_utc ?? "Aug 2026"}</span>,
    ];
  });
  return <Table head={["Data file", "Written by", "What it is", "Generated"]} rows={rows} caption="Where every number on this page comes from" />;
}

export function Reproduce() {
  return (
    <Pre>{`git clone ${REPO} && cd natural_language_autoencoders-project && git checkout site-v2
pip install torch transformers safetensors pyyaml scikit-learn numpy llama-cpp-python

# 1. Numbers from tensors already in the repo (seconds, no model):
python analysis/saved_artifacts.py

# 2. Re-run the Reconstructor experiments on the current texts (~15 min on an M2 Pro):
hf download kitft/nla-qwen2.5-7b-L20-ar --local-dir ~/models-nla/nla-ar
python analysis/export_texts.py
python analysis/ar_rerun.py

# 3. Behavior with steering (Q8_0 GGUF via llama.cpp; a few hours on an M2 Pro):
hf download Qwen/Qwen2.5-7B-Instruct-GGUF --include "qwen2.5-7b-instruct-q8_0-*" --local-dir ~/models-nla/qwen-gguf
python analysis/check_llamacpp_layer.py      # verifies where llama.cpp adds the vector
python analysis/behavior.py validation endorse grid
python analysis/summarize_behavior.py

# 4. Controls computed on CPU from the files above (no model):
python analysis/extra_controls.py
python analysis/export_site_meta.py

# 5. Check every number rendered on the page against these files:
cd web && npm install && npm run build && node scripts/verify-numbers.mjs`}</Pre>
  );
}

export function Citation() {
  const bib = `@misc{tyagi2026steering,
  author = {Tyagi, Uday and Kim, Tyler},
  title  = {Steering vectors from written descriptions},
  year   = {2026},
  url    = {https://nla-steering.vercel.app}
}

@article{frasertaliente2026nla,
  author  = {Fraser-Taliente, Kit and Kantamneni, Subhash and Ong, Euan and Mossing, Dan and
             Lu, Christina and Bogdan, Paul C. and Ameisen, Emmanuel and Chen, James and
             Kishylau, Dzmitry and Pearce, Adam and Tarng, Julius and Wu, Alex and Wu, Jeff and
             Zhang, Yang and Ziegler, Daniel M. and Hubinger, Evan and Batson, Joshua and
             Lindsey, Jack and Zimmerman, Samuel and Marks, Samuel},
  title   = {Natural Language Autoencoders Produce Unsupervised Explanations of LLM Activations},
  journal = {Transformer Circuits Thread},
  year    = {2026},
  url     = {https://transformer-circuits.pub/2026/nla/index.html}
}`;
  return <Pre>{bib}</Pre>;
}

export function MethodsDetails() {
  const v = DATA.bsum.validation as unknown as { unsteered_prefix_min: number; unsteered_prefix_max: number; n_exact: number; n_rows: number } | undefined;
  return (
    <div className="prose-body text-[0.95rem] leading-relaxed text-ink2">
      <p>
        <span className="font-medium text-ink">Models.</span> Target: Qwen2.5-7B-Instruct (28 layers, width 3584). Reconstructor:{" "}
        <a className="link" href="https://huggingface.co/kitft/nla-qwen2.5-7b-L20-ar">kitft/nla-qwen2.5-7b-L20-ar</a>, the first 21 layers of
        Qwen2.5-7B fine-tuned with a linear head; it reads the prompt <Code>Summary of the following text: &lt;text&gt;…&lt;/text&gt; &lt;summary&gt;</Code> and
        outputs the raw residual at the last token, mapped through the head. Its target is the output of block 20 (hidden_states[21]).
      </p>
      <p>
        <span className="font-medium text-ink">Steering.</span> Δ is normalized and added as α · ‖h‖ · Δ/‖Δ‖ to the output of block 20 at every
        position, including the prompt. ‖h‖ = {DATA.gallery.norm_ref} is the norm of the layer-20 activation at the last token of a neutral sentence,
        measured once on the A100. Greedy decoding throughout.
      </p>
      <p>
        <span className="font-medium text-ink">Reference vectors.</span> The sycophantic, evil and hallucinating vectors were built with the
        contrastive system-prompt method of Persona Vectors (Chen et al., 2025) as implemented in the ARENA 4.4 exercises: mean
        response activation under a trait-eliciting system prompt minus the mean under a trait-suppressing one. Row 20 of each saved tensor
        is the output of block 20. The 13 CAA vectors (experiment 4) are differences of mean response activations over 15 hand-written
        response pairs each, written by the same authors as the steering texts.
      </p>
      <p>
        <span className="font-medium text-ink">Two runs, two machines.</span> The original gallery (August 2026) used bf16 on an A100. The October
        re-runs used an Apple M2 Pro laptop: the Reconstructor in bf16 on the Metal backend, loading one layer at a time
        (<Code>analysis/ar_stream.py</Code>); its vectors match the A100 vectors to a minimum cosine of <N p="ar.validation.min_cos" f="d5" /> across
        all seven concepts. Behavior used the official Q8_0 GGUF of Qwen2.5-7B-Instruct through llama.cpp. llama.cpp adds row
        <span className="num"> {DATA.layer.best_row}</span> of its control-vector buffer at the output of block {DATA.layer.best_row + 1}; we confirmed this on
        Qwen2.5-0.5B, where that row reproduces an HF forward hook on block {DATA.layer.hf_hook_layer} to within a maximum logit difference of{" "}
        <N p={`layer.rows.${DATA.layer.best_row}.max_abs_logit_diff_vs_hf_hook`} f="d2" /> (other rows: 10 or more; F16 versus fp32 with no steering:{" "}
        <N p="layer.unsteered_max_abs_logit_diff" f="d2" />).
        {v && <> Q8_0 greedy text is not bf16 greedy text: on the four gallery prompts the unsteered outputs share their first{" "}
        {v.unsteered_prefix_min} to {v.unsteered_prefix_max} characters with the A100 outputs and then diverge into different but similar
        answers; {v.n_exact} of {v.n_rows} compared outputs match exactly.</>}
      </p>
      <p>
        <span className="font-medium text-ink">CPU hosting.</span> A weight-only int8 copy of the Reconstructor, run on two CPU threads, matches the
        A100 vectors to a minimum cosine of <N p="int8.min_cos" f="d5" /> and compiles one description pair in <N p="int8.pair_seconds" f="d0" /> seconds on
        the same laptop (<Code>analysis/check_ar_int8.py</Code>). This is what the live panel&apos;s backend uses when no GPU is available.
      </p>
      <p>
        <span className="font-medium text-ink">Statistics.</span> One run per setting, greedy, no seeds to vary except for random directions.
        Cosine nulls come from pairs of trait-free texts; probe nulls from 2,000 random unit directions; intervals are percentile bootstraps over
        responses. Nothing on this page is a significance test across independent replications, because none were run.
      </p>
    </div>
  );
}

export const LINKS = { REPO, BRANCH_TREE };
