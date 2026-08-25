"use client";

import { useMemo, useState } from "react";
import type { Gallery as GalleryData, GalleryConcept } from "@/lib/types";
import { outputAt, describeAlignment } from "@/lib/gallery";
import { Section, Panel, Note } from "./ui";

function TextPair({ concept }: { concept: GalleryConcept }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-xs text-accent hover:underline"
      >
        {open ? "hide" : "show"} the two texts this vector was compiled from
      </button>
      {open && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {([["positive", concept.pos_text], ["negative", concept.neg_text]] as const).map(
            ([label, text]) => (
              <Panel key={label} className="p-4">
                <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">
                  t_{label}
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{text}</p>
              </Panel>
            ),
          )}
        </div>
      )}
      {concept.n_scenarios > 1 && (
        <p className="mt-2 text-xs text-muted">
          Showing the first of {concept.n_scenarios} scenarios; the vector averages all of them.
        </p>
      )}
    </div>
  );
}

export function Gallery({ data }: { data: GalleryData }) {
  const concepts = data.concepts ?? [];
  const [conceptId, setConceptId] = useState(concepts[0]?.id ?? "");
  const [promptIdx, setPromptIdx] = useState(0);

  const steerAlphas = useMemo(
    () => (data.alphas ?? []).filter((a) => a !== 0).sort((a, b) => a - b),
    [data.alphas],
  );
  const [alphaIdx, setAlphaIdx] = useState(
    Math.max(0, steerAlphas.findIndex((a) => a > 0)),
  );

  const concept = concepts.find((c) => c.id === conceptId) ?? concepts[0];
  const sample = concept?.samples?.[promptIdx];
  const alpha = steerAlphas[alphaIdx];
  const alignment = concept
    ? describeAlignment(concept.nearest_reference, concept.cos_vs_nearest)
    : null;
  const baseline = outputAt(sample?.outputs, 0);
  const steered = outputAt(sample?.outputs, alpha);

  if (!concept) {
    return (
      <Section id="gallery" eyebrow="Gallery" title="Precomputed steering examples">
        <Note>
          The gallery has not been built yet. Run{" "}
          <span className="font-mono">python scripts/build_gallery.py</span> on a GPU host to
          generate <span className="font-mono">web/public/gallery.json</span>.
        </Note>
      </Section>
    );
  }

  return (
    <Section id="gallery" eyebrow="Gallery" title="Precomputed steering examples">
      <p className="mb-6 text-[15px] leading-relaxed text-muted">
        Every vector below was compiled from two hand-written descriptions, with no labelled data.
        Outputs are greedy-decoded from {data.model} at layer {data.steer_layer}, generated ahead of
        time — nothing on this page needs a GPU.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {concepts.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setConceptId(c.id);
              setPromptIdx(0);
            }}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              c.id === concept.id
                ? "border-accent bg-accent/10 text-fg"
                : "border-edge text-muted hover:border-muted hover:text-fg"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <Panel className="p-5">
        <h3 className="text-lg font-medium text-fg">{concept.label}</h3>
        <p className="mt-1 text-sm text-muted">{concept.blurb}</p>
        {alignment && (
          <p className="mt-3 border-t border-edge pt-3 text-sm leading-relaxed text-muted">
            {alignment}
          </p>
        )}
        <TextPair concept={concept} />
      </Panel>

      <div className="mt-6 flex flex-wrap gap-2">
        {concept.samples.map((s, i) => (
          <button
            key={i}
            onClick={() => setPromptIdx(i)}
            className={`max-w-full truncate rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
              i === promptIdx
                ? "border-accent bg-accent/10 text-fg"
                : "border-edge text-muted hover:border-muted hover:text-fg"
            }`}
          >
            {s.prompt}
          </button>
        ))}
      </div>

      {steerAlphas.length > 0 && (
        <div className="mt-6 flex items-center gap-4">
          <label htmlFor="gallery-alpha" className="font-mono text-xs text-muted">
            alpha
          </label>
          <input
            id="gallery-alpha"
            type="range"
            min={0}
            max={steerAlphas.length - 1}
            step={1}
            value={alphaIdx}
            onChange={(e) => setAlphaIdx(Number(e.target.value))}
            className="h-4 flex-1"
          />
          <span className="w-14 text-right font-mono text-sm tabular-nums text-accent">
            {alpha > 0 ? "+" : ""}
            {alpha?.toFixed(2)}
          </span>
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">
            unsteered &nbsp;alpha = 0
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/90">
            {baseline ?? "—"}
          </p>
        </Panel>
        <Panel className="border-accent/40 p-4">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-accent">
            steered &nbsp;alpha = {alpha > 0 ? "+" : ""}
            {alpha?.toFixed(2)}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/90">
            {steered ?? "—"}
          </p>
        </Panel>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Outputs are steered and may be incoherent, wrong, or unpleasant — particularly at high
        alpha. That is the point of the demonstration, not a defect in it.
      </p>
    </Section>
  );
}
