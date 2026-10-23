import { DATA, FILES, LABEL } from "@/lib/data";
import { AnnotatedText, PartsKey } from "./Pipeline";
import { Code, Pre, Table } from "./ui";

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
pip install torch transformers safetensors numpy modal

# 1. Steering texts and page metadata (seconds, no model):
python analysis/export_texts.py
python analysis/export_site_meta.py

# 2. Steering runs and ratings on a rented A100 (needs a Modal account):
modal run serve/modal_batch.py::download && modal run serve/modal_batch.py::experiment
modal run serve/modal_batch.py::download_judge && modal run serve/modal_batch.py::judge
modal volume get nla-runs gpu_oct runs/
python analysis/summarize_gpu.py

# 3. Check every number on the pages against these files:
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
  return (
    <div className="prose-body text-[0.95rem] leading-relaxed text-ink2">
      <p>
        <span className="font-medium text-ink">Models.</span> Target: Qwen2.5-7B-Instruct (28 layers, width 3584). Reconstructor:{" "}
        <a className="link" href="https://huggingface.co/kitft/nla-qwen2.5-7b-L20-ar">kitft/nla-qwen2.5-7b-L20-ar</a>, the first 21 layers of
        Qwen2.5-7B fine-tuned with a linear head; it reads the prompt <Code>Summary of the following text: &lt;text&gt;…&lt;/text&gt; &lt;summary&gt;</Code> and
        outputs the raw residual at the last token, mapped through the head. Its target is the output of block 20 (hidden_states[21]).
      </p>
      <p>
        <span className="font-medium text-ink">Vectors.</span> For each trait, the vector is the mean Reconstructor output over the positive descriptions
        minus the mean over the opposite ones. It is normalized and added as α · ‖h‖ · Δ/‖Δ‖ to the output of block 20 at every position, including the
        prompt, where ‖h‖ = {DATA.gallery.norm_ref} is the norm of the layer-20 activation at the last token of a neutral sentence.
      </p>
      <p>
        <span className="font-medium text-ink">Comparisons.</span> Random directions are Gaussian samples scaled the same way. The plain-Qwen vector
        averages Qwen2.5-7B-Instruct&apos;s own layer-20 activations over each description&apos;s tokens, positive minus opposite. The standard
        sycophancy, malice and confabulation vectors were built with the contrastive system-prompt method of Persona Vectors (Chen et al., 2025) as
        implemented in the ARENA 4.4 exercises; row 20 of each saved tensor is the output of block 20.
      </p>
      <p>
        <span className="font-medium text-ink">Runs.</span> All outputs come from one run in unquantized bf16 on an A100 rented on Modal
        (<Code>analysis/gpu_behavior.py</Code>, <Code>serve/modal_batch.py</Code>), with greedy decoding up to 160 tokens on eleven questions. Ratings
        come from Qwen2.5-32B-Instruct, reading the probabilities of the digits 0 to 9 (<Code>analysis/gpu_judge.py</Code>).
      </p>
      <p>
        <span className="font-medium text-ink">Live demo.</span> The model drafts description pairs for the typed phrase from three worked examples,
        the Reconstructor turns them into a vector, and the steered model answers, all on one GPU on Modal (<Code>serve/modal_live.py</Code>).
      </p>
    </div>
  );
}

export const LINKS = { REPO, BRANCH_TREE };
