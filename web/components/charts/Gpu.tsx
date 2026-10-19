"use client";

import { LABEL } from "@/lib/labels";
import { C, DataTable } from "./kit";
import { LineChart, type Series } from "./Lines";
import { Legend } from "../ui";

export type YesNoSet = { n: number; curves: Record<string, number[]>; counts: Record<string, number[]>; random_min: number[]; random_max: number[]; random_max_count: number[] };
export type JudgeSummary = {
  alphas: number[]; n_random: number;
  trait: Record<string, { nla: number[]; direct: number[]; reference?: number[]; random_min: number[]; random_max: number[]; base: number }>;
  coherence: { nla: number[]; direct: number[]; reference: number[]; random_min: number[]; random_max: number[]; base: number };
};

const VEC = [
  { key: "nla", label: "Our descriptions, through the autoencoder", color: C.nla },
  { key: "direct", label: "Same descriptions, read by Qwen (no autoencoder)", color: C.v3 },
  { key: "reference", label: "Standard persona vector", color: C.ref },
] as const;

export function GpuYesNo({ sets, alphas, nRandom }: { sets: Record<string, YesNoSet>; alphas: number[]; nRandom: number }) {
  const show = [
    { key: "bad_plans", title: "Approves a bad plan" },
    { key: "false_claims", title: "Confirms a false claim" },
  ];
  return (
    <div>
      <Legend items={[
        ...VEC.map((v) => ({ color: v.color, label: v.label, shape: "line" as const })),
        { color: C.nulWash, label: `range of ${nRandom} random directions`, shape: "band" as const },
      ]} />
      <div className="grid gap-4 md:grid-cols-2">
        {show.map((s) => {
          const d = sets[s.key];
          const series: Series[] = [
            { key: "nla", label: "autoencoder", color: C.nla, values: d.curves["nla:sycophancy"] },
            { key: "direct", label: "no autoencoder", color: C.v3, values: d.curves["direct:sycophancy"] },
            { key: "ref", label: "standard", color: C.ref, values: d.curves["reference:sycophantic"] },
          ];
          return (
            <div key={s.key}>
              <p className="text-sm font-medium text-ink">{s.title}</p>
              <p className="mb-1 text-xs text-muted">{d.n} prompts, answer YES or NO</p>
              <LineChart xs={alphas} series={series} yDomain={[0, 1]} yLabel="mean P(YES)" xLabel="steering strength" height={230}
                band={{ label: "random", lo: d.random_min, hi: d.random_max }} ariaLabel={`Probability of YES, ${s.title}`} />
            </div>
          );
        })}
      </div>
      <DataTable head={["Strength", "Bad plans approved: autoencoder / no autoencoder / standard / most by any random", "False claims confirmed: same order"]}
        rows={alphas.map((a, i) => [a.toFixed(2),
          `${sets.bad_plans.counts["nla:sycophancy"][i]} / ${sets.bad_plans.counts["direct:sycophancy"][i]} / ${sets.bad_plans.counts["reference:sycophantic"][i]} / ${sets.bad_plans.random_max_count[i]} of ${sets.bad_plans.n}`,
          `${sets.false_claims.counts["nla:sycophancy"][i]} / ${sets.false_claims.counts["direct:sycophancy"][i]} / ${sets.false_claims.counts["reference:sycophantic"][i]} / ${sets.false_claims.random_max_count[i]} of ${sets.false_claims.n}`])} />
    </div>
  );
}

const ORDER = ["sycophancy", "evil", "hallucinating", "misalignment", "religion", "political_economy", "gandhi"];

export function JudgeMultiples({ j }: { j: JudgeSummary }) {
  const xs = [0, ...j.alphas];
  return (
    <div>
      <Legend items={[
        ...VEC.map((v) => ({ color: v.color, label: v.label, shape: "line" as const })),
        { color: C.nulWash, label: `range of ${j.n_random} random directions`, shape: "band" as const },
      ]} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {ORDER.map((c) => {
          const t = j.trait[c];
          const s: Series[] = [
            { key: "nla", label: "autoencoder", color: C.nla, values: [t.base, ...t.nla] },
            { key: "direct", label: "no autoencoder", color: C.v3, values: [t.base, ...t.direct] },
          ];
          if (t.reference) s.push({ key: "ref", label: "standard", color: C.ref, values: [t.base, ...t.reference] });
          return (
            <div key={c}>
              <p className="text-xs font-medium text-ink">{LABEL[c]}</p>
              <LineChart xs={xs} series={s} yDomain={[0, 9]} height={150} compact yDp={0}
                band={{ label: "random", lo: [t.base, ...t.random_min], hi: [t.base, ...t.random_max] }}
                ariaLabel={`Judge rating of ${LABEL[c]} by strength`} />
            </div>
          );
        })}
        <div>
          <p className="text-xs font-medium text-ink">Coherence (all traits)</p>
          <LineChart xs={xs} yDomain={[0, 9]} height={150} compact yDp={0}
            series={[
              { key: "nla", label: "autoencoder", color: C.nla, values: [j.coherence.base, ...j.coherence.nla] },
              { key: "direct", label: "no autoencoder", color: C.v3, values: [j.coherence.base, ...j.coherence.direct] },
              { key: "ref", label: "standard", color: C.ref, values: [j.coherence.base, ...j.coherence.reference] },
            ]}
            band={{ label: "random", lo: [j.coherence.base, ...j.coherence.random_min], hi: [j.coherence.base, ...j.coherence.random_max] }}
            ariaLabel="Judge rating of coherence by strength" />
        </div>
      </div>
      <DataTable head={["Trait", "Strength", "Autoencoder", "No autoencoder", "Standard", "Random, lowest to highest"]}
        rows={ORDER.flatMap((c) => j.alphas.map((a, i) => [LABEL[c], a.toFixed(2), j.trait[c].nla[i].toFixed(1), j.trait[c].direct[i].toFixed(1),
          j.trait[c].reference ? j.trait[c].reference![i].toFixed(1) : "none", `${j.trait[c].random_min[i].toFixed(1)} to ${j.trait[c].random_max[i].toFixed(1)}`]))} />
    </div>
  );
}

export function BaselineDots({ rows }: { rows: { trait: string; nla: number; direct: number }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Cosine with the standard vector, with and without the autoencoder</caption>
        <thead>
          <tr className="border-b border-axis text-left">
            <th scope="col" className="py-2 pr-3 font-medium text-muted">Trait</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium text-muted"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.nla }} />Through the autoencoder</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium text-muted"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: C.v3 }} />Read by Qwen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.trait} className="border-b border-grid">
              <td className="py-2 pr-3 text-ink">{LABEL[r.trait]}</td>
              <td className={`num py-2 pr-3 text-right ${r.nla > r.direct ? "font-semibold text-ink" : "text-ink2"}`}>{r.nla >= 0 ? "+" : "−"}{Math.abs(r.nla).toFixed(3)}</td>
              <td className={`num py-2 pr-3 text-right ${r.direct > r.nla ? "font-semibold text-ink" : "text-ink2"}`}>{r.direct >= 0 ? "+" : "−"}{Math.abs(r.direct).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
