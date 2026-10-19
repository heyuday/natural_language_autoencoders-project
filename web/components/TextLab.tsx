"use client";

import { useState } from "react";
import { LABEL, fmt } from "@/lib/labels";
import { AnnotatedText, PartsKey } from "./Pipeline";

const CONCEPTS = ["sycophancy", "evil", "hallucinating", "misalignment"] as const;
const ABL = [
  { key: "none", label: "Nothing removed", part: undefined },
  { key: "drop_genre_label", label: "Genre label removed", part: "label" },
  { key: "drop_final_token_guess", label: "Final-token guess removed", part: "guess" },
  { key: "drop_quoted_phrases", label: "Quoted phrases emptied", part: "quote" },
] as const;

type Scen = { pos: string; neg: string; neutral: string };
type Row = Record<string, number>;

export function TextLab({ scenarios, ablations, refs }: { scenarios: Record<string, Scen[]>; ablations: Record<string, Row[]>; refs: Record<string, string> }) {
  const [c, setC] = useState<(typeof CONCEPTS)[number]>("sycophancy");
  const [k, setK] = useState(0);
  const [abl, setAbl] = useState<(typeof ABL)[number]["key"]>("drop_quoted_phrases");
  const [both, setBoth] = useState(true);
  const scen = scenarios[c];
  const s = scen[Math.min(k, scen.length - 1)];
  const row = ablations[c][Math.min(k, scen.length - 1)];
  const a = ABL.find((x) => x.key === abl)!;
  const value = abl === "none" ? row.baseline : row[`${abl}__${both ? "both" : "pos_only"}`];
  const ref = refs[c];
  const delta = value - row.baseline;

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 sm:p-5">
      <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
        <label className="flex items-center gap-2 text-ink2">Trait
          <select value={c} onChange={(e) => { setC(e.target.value as typeof c); setK(0); }} className="rounded-md border border-edge bg-surface px-2 py-1 text-ink">
            {CONCEPTS.map((x) => <option key={x} value={x}>{LABEL[x]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-ink2">Scenario
          <select value={k} onChange={(e) => setK(Number(e.target.value))} className="rounded-md border border-edge bg-surface px-2 py-1 text-ink">
            {scen.map((_, i) => <option key={i} value={i}>{i + 1} of {scen.length}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-ink2">Edit
          <select value={abl} onChange={(e) => setAbl(e.target.value as typeof abl)} className="rounded-md border border-edge bg-surface px-2 py-1 text-ink">
            {ABL.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
        {abl !== "none" && (
          <label className="flex items-center gap-2 text-ink2">
            <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} className="h-4 w-4 accent-[var(--s1)]" />
            apply to both texts
          </label>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-sunken px-3 py-2">
        <span className="text-sm text-ink2">cos(Δ, reference <em className="not-italic text-ink">{ref}</em>)</span>
        <span className="num text-2xl font-semibold text-ink">{fmt(value)}</span>
        {abl !== "none" && (
          <span className="num text-sm text-muted" data-derived="difference of the two values shown">intact pair {fmt(row.baseline)}, change {fmt(delta)}</span>
        )}
      </div>

      <div className="mt-4"><PartsKey /></div>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-edge p-3">
          <p className="mb-1.5 text-xs font-semibold text-ink">Positive text {abl !== "none" && "(edited)"}</p>
          <AnnotatedText text={s.pos} struck={a.part} />
        </div>
        <div className="rounded-lg border border-edge p-3">
          <p className="mb-1.5 text-xs font-semibold text-ink">Negative text {abl !== "none" && both && "(edited)"}</p>
          <AnnotatedText text={s.neg} struck={both ? a.part : undefined} />
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Struck-through parts are what the edit removes; quoted phrases are replaced by empty quotes. Each edited text was run through the
        Reconstructor (new run, October 2026, current texts). Every value shown here is stored in ar_rerun.json.
      </p>
    </div>
  );
}
