"use client";

import { useState } from "react";
import { LABEL } from "@/lib/labels";
import { C, DataTable } from "./kit";
import { LineChart, type Series } from "./Lines";
import { Legend } from "../ui";

type Curve = { mean: number[]; frac_yes: number[]; per_prompt: number[][] };
export type Endorse = {
  alphas: number[]; n_prompts: Record<string, number>;
  curves: Record<string, Record<string, Curve>>;
  random_band: Record<string, { n: number; min: number[]; max: number[]; mean: number[] }>;
};

const COMPARE = [
  { key: "nla_variant:syco_plain", label: "Plain instruction instead of descriptions" },
  { key: "nla_variant:syco_keywords", label: "Keywords instead of descriptions" },
  { key: "nla_variant:syco_absolute", label: "Positive descriptions only, nothing subtracted" },
  { key: "nla_variant:syco_abs_minus_bg", label: "Positive descriptions minus a neutral background" },
  { key: "nla:evil", label: "Malice vector (off-target control)" },
  { key: "nla:religion", label: "Religiosity vector (off-target control)" },
] as const;

const SETS = [
  { key: "bad_plans", title: "Approves a bad plan", q: "“…Do you think this is a good idea? Answer with just YES or NO.”" },
  { key: "false_claims", title: "Confirms a false claim", q: "“…Is that right? Answer with just YES or NO.”" },
] as const;

export function EndorseChart({ e: E }: { e: Endorse }) {
  const [cmp, setCmp] = useState<string>("nla_variant:syco_plain");
  const cmpLabel = COMPARE.find((c) => c.key === cmp)?.label ?? cmp;
  return (
    <div>
      <label className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink2">
        <span>Compare with:</span>
        <select value={cmp} onChange={(e) => setCmp(e.target.value)}
          className="rounded-md border border-edge bg-surface px-2 py-1 text-sm text-ink">
          {COMPARE.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      <Legend items={[
        { color: C.nla, label: "Sycophancy vector compiled from descriptions (6 pairs)", shape: "line" },
        { color: C.ref, label: "Standard sycophancy vector (persona vector)", shape: "line" },
        { color: C.v3, label: cmpLabel, shape: "line" },
        { color: C.nulWash, label: `range of ${E.random_band.bad_plans.n} random directions`, shape: "band" },
      ]} />
      <div className="grid gap-4 md:grid-cols-2">
        {SETS.map((s) => {
          const series: Series[] = [
            { key: "nla", label: "compiled", color: C.nla, values: E.curves["nla:sycophancy"][s.key].mean },
            { key: "ref", label: "reference", color: C.ref, values: E.curves["reference:sycophantic"][s.key].mean },
            { key: "cmp", label: "comparison", color: C.v3, values: E.curves[cmp][s.key].mean },
          ];
          return (
            <div key={s.key}>
              <p className="text-sm font-medium text-ink">{s.title}</p>
              <p className="mb-1 text-xs text-muted">{E.n_prompts[s.key]} prompts ending {s.q}</p>
              <LineChart xs={E.alphas} series={series} yDomain={[0, 1]} yLabel="mean P(YES)" xLabel="steering strength" height={230}
                band={{ label: "random", lo: E.random_band[s.key].min, hi: E.random_band[s.key].max }}
                ariaLabel={`Mean probability of answering YES vs steering strength, ${s.title}`} markX={0} />
            </div>
          );
        })}
      </div>
      <DataTable head={["Strength", ...SETS.flatMap((s) => [`${s.title}: from descriptions`, `${s.title}: standard vector`, `${s.title}: ${cmpLabel}`, `${s.title}: random, lowest to highest`])]}
        rows={E.alphas.map((a, i) => [a.toFixed(2), ...SETS.flatMap((s) => [
          E.curves["nla:sycophancy"][s.key].mean[i].toFixed(3), E.curves["reference:sycophantic"][s.key].mean[i].toFixed(3),
          E.curves[cmp][s.key].mean[i].toFixed(3), `${E.random_band[s.key].min[i].toFixed(3)} to ${E.random_band[s.key].max[i].toFixed(3)}`])])} />
    </div>
  );
}

export function FixedPointChart({ chains: ch }: { chains: Record<string, { cos_delta_vs_reference: number[] }> }) {
  const keys = Object.keys(ch);
  const colors: Record<string, string> = { "sycophancy/register": C.nla, "evil/register": C.v4, "sycophancy/plain": C.v3, "evil/plain": C.ref, "hallucinating/plain": C.nul };
  const series: Series[] = keys.map((k) => ({ key: k, label: (LABEL[k.split("/")[0]] ?? k) + (k.endsWith("register") ? ", starting from descriptions" : ", starting from a plain instruction"), color: colors[k] ?? C.nul, values: ch[k].cos_delta_vs_reference }));
  return (
    <div>
      <Legend items={series.map((s) => ({ color: s.color, label: s.label, shape: "line" as const }))} />
      <LineChart xs={[0, 1, 2, 3, 4, 5]} series={series} yDomain={[-0.1, 0.7]} yLabel="cosine with reference" xLabel="round trips through the Verbalizer and Reconstructor" xDp={0} height={230}
        ariaLabel="Cosine with reference across fixed-point iterations" />
    </div>
  );
}
