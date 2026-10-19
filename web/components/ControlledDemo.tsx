"use client";

import { useEffect, useState } from "react";
import { LABEL } from "@/lib/labels";
import { ModelText } from "./Demo";

export type GridFile = {
  concept: string; alphas: number[]; prompts: Record<string, string>;
  base: Record<string, string>; steered: Record<string, Record<string, Record<string, string>>>;
};
export type DemoSlice = { concept: string; promptKey: string; alpha: number; file: GridFile };

const CONCEPTS = ["religion", "sycophancy", "evil", "misalignment", "hallucinating", "political_economy", "gandhi"];
const REF: Record<string, string> = { sycophancy: "sycophantic", evil: "evil", hallucinating: "hallucinating" };

function distinct2(text: string) {
  const w = text.toLowerCase().match(/\w+|[^\w\s]/g) ?? [];
  if (w.length < 2) return NaN;
  const seen = new Set<string>();
  for (let i = 0; i + 1 < w.length; i++) seen.add(w[i] + "\u0000" + w[i + 1]);
  return seen.size / (w.length - 1);
}

function Panel({ title, sub, text, accent }: { title: string; sub?: string; text: string; accent?: boolean }) {
  const d = distinct2(text);
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-s1" : "border-edge"}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-xs font-semibold text-ink">{title}</p>
        {!Number.isNaN(d) && <p className="num text-[11px] text-muted" data-derived="computed from the reply text" title="share of distinct word pairs; low values mean the text loops">variety {Math.round(d * 100)}%</p>}
      </div>
      {sub && <p className="-mt-1 mb-2 text-[11px] text-muted">{sub}</p>}
      <div className="text-[0.9rem] leading-relaxed text-ink2" aria-live="polite"><ModelText text={text || "(empty reply)"} /></div>
    </div>
  );
}

export function ControlledDemo({ initial }: { initial: DemoSlice }) {
  const [files, setFiles] = useState<Record<string, GridFile>>({ [initial.concept]: initial.file });
  const [concept, setConcept] = useState(initial.concept);
  const [pk, setPk] = useState(initial.promptKey);
  const [alpha, setAlpha] = useState(initial.alpha);
  const [cmp, setCmp] = useState<"direct" | "reference" | "random">("direct");
  const [failed, setFailed] = useState(false);
  const file = files[concept];

  useEffect(() => {
    if (files[concept] && Object.keys(files[concept].prompts).length > 1) return;
    let alive = true;
    fetch(`/data/gpu_grid_${concept}.json`).then((r) => (r.ok ? r.json() : Promise.reject())).then((f: GridFile) => {
      if (alive) setFiles((m) => ({ ...m, [concept]: f }));
    }).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [concept, files]);

  const cmpKey = cmp === "direct" ? `direct:${concept}` : cmp === "reference" ? `reference:${REF[concept]}` : "random:0";
  const at = (v: string) => file?.steered[v]?.[pk]?.[String(alpha)] ?? "";
  const cmpTitle = cmp === "direct" ? "Qwen reads the same descriptions (no autoencoder)" : cmp === "reference" ? "Standard persona vector" : "Random direction";
  const cmpSub = cmp === "direct" ? "Vector from Qwen's own activations on the descriptions" : cmp === "reference" ? "Built the usual way, from example responses" : "Same strength, no meaning";

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 sm:p-5">
      <div role="radiogroup" aria-label="Trait" className="flex flex-wrap gap-1.5">
        {CONCEPTS.map((c) => (
          <button key={c} role="radio" aria-checked={c === concept} onClick={() => { setConcept(c); if (cmp === "reference" && !REF[c]) setCmp("direct"); }}
            className={`rounded-full border px-3 py-1 text-sm ${c === concept ? "border-s1 bg-[var(--s1-wash)] font-medium text-ink" : "border-edge text-ink2 hover:border-axis"}`}>
            {LABEL[c]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
        <label className="flex w-full min-w-0 items-center gap-2 text-xs text-muted md:flex-1">
          <span className="whitespace-nowrap">Question</span>
          <select value={pk} onChange={(e) => setPk(e.target.value)} disabled={!file || Object.keys(file.prompts).length < 2}
            className="min-w-0 flex-1 truncate rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-ink">
            {Object.entries((file ?? initial.file).prompts).map(([k, q]) => <option key={k} value={k}>{q}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="whitespace-nowrap">Strength</span>
          <div role="radiogroup" aria-label="Strength" className="inline-flex overflow-hidden rounded-md border border-edge text-sm">
            {(file ?? initial.file).alphas.map((a) => (
              <button key={a} role="radio" aria-checked={a === alpha} onClick={() => setAlpha(a)}
                className={`border-r border-edge px-2.5 py-1.5 last:border-r-0 ${a === alpha ? "bg-[var(--s1-wash)] font-medium text-ink" : "text-ink2 hover:bg-sunken"}`}>{a.toFixed(2).replace(/0$/, "")}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Compare with</span>
        <div role="radiogroup" aria-label="Comparison" className="inline-flex overflow-hidden rounded-md border border-edge text-sm">
          {([["direct", "Qwen reads the descriptions"], ["reference", "Standard vector"], ["random", "Random direction"]] as const).map(([k, l]) => {
            const disabled = k === "reference" && !REF[concept];
            return (
              <button key={k} role="radio" aria-checked={cmp === k} disabled={disabled} onClick={() => setCmp(k)}
                title={disabled ? "No standard vector exists for this trait" : undefined}
                className={`border-r border-edge px-3 py-1.5 last:border-r-0 disabled:cursor-not-allowed disabled:opacity-40 ${cmp === k ? "bg-[var(--s1-wash)] font-medium text-ink" : "text-ink2 hover:bg-sunken"}`}>{l}</button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 rounded-md bg-sunken px-3 py-2 text-sm text-ink">{(file ?? initial.file).prompts[pk]}</p>
      {failed && !file && <p className="mt-3 text-sm text-ink2">These outputs could not be loaded. Reload the page to try again.</p>}
      {file && (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="order-first lg:order-none lg:col-start-2"><Panel title={`Vector from our descriptions, strength ${alpha}`} sub="Descriptions compiled by the autoencoder" text={at(`nla:${concept}`)} accent /></div>
          <div className="lg:col-start-1 lg:row-start-1"><Panel title="Normal model" text={file.base[pk]} /></div>
          <div><Panel title={`${cmpTitle}, strength ${alpha}`} sub={cmpSub} text={at(cmpKey)} /></div>
        </div>
      )}
      <p className="mt-4 border-t border-edge pt-3 text-xs leading-relaxed text-muted">
        Qwen2.5-7B-Instruct in full precision (bf16) on an A100, greedy decoding, up to 160 tokens, October 2026. Nothing was added to the prompt;
        each vector is added after layer 20 at every token. Every output for every trait, question, strength and vector is here. Steered text can be
        wrong or unpleasant.
      </p>
    </div>
  );
}
