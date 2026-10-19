"use client";

import { useState } from "react";
import { fmt } from "@/lib/labels";
import { C, DataTable, Tip, XAxis, scale, ticks, useWidth } from "./kit";

type Row = { auroc: number; d: number; scores_pos: number[]; scores_neg: number[] };
const DIRS = [
  { key: "register", label: "Compiled from descriptions", color: C.nla },
  { key: "plain", label: "Compiled from a plain instruction", color: C.v3 },
  { key: "reference", label: "Standard vector (persona vector)", color: C.ref },
  { key: "random_seed0", label: "Random direction (seed 0)", color: C.nul },
] as const;

/** One strip per direction: responses under the trait prompt (filled) vs the opposite prompt (hollow). */
export function ProbeStrips({ p, concept }: { p: { rows: Record<string, Row> }; concept: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const rows = p.rows as Record<string, Row>;
  const left = 8, top = 4, rowH = 66;
  const h = top + DIRS.length * rowH + 4;
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={w} height={h} role="img" aria-label={`Probe scores for ${concept}`}>
        {DIRS.map((d, i) => {
          const r = rows[d.key];
          const all = [...r.scores_pos, ...r.scores_neg];
          const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.06 || 1;
          const x = scale(lo - pad, hi + pad, left + 4, w - 8);
          const y0 = top + i * rowH;
          return (
            <g key={d.key}>
              <text x={left} y={y0 + 12} fontSize={11.5} fill={C.ink}>{d.label}</text>
              <text x={left} y={y0 + 26} fontSize={11} fill={C.muted} className="num">
                AUROC {r.auroc.toFixed(3)} · d {fmt(r.d, "s2")}
              </text>
              <line x1={left + 4} x2={w - 8} y1={y0 + 46} y2={y0 + 46} stroke={C.grid} />
              {r.scores_neg.map((s, k) => (
                <circle key={`n${k}`} cx={x(s)} cy={y0 + 52} r={4} fill={C.surface} stroke={d.color} strokeWidth={1.5}
                  onMouseEnter={() => setHover({ x: x(s), y: y0 + 52, text: `opposite-prompt response ${k + 1}: score ${s.toFixed(2)}` })} />
              ))}
              {r.scores_pos.map((s, k) => (
                <circle key={`p${k}`} cx={x(s)} cy={y0 + 40} r={4} fill={d.color} stroke={C.surface} strokeWidth={1}
                  onMouseEnter={() => setHover({ x: x(s), y: y0 + 40, text: `trait-prompt response ${k + 1}: score ${s.toFixed(2)}` })} />
              ))}
            </g>
          );
        })}
      </svg>
      {hover && <Tip x={hover.x} y={hover.y} w={w}>{hover.text}</Tip>}
    </div>
  );
}

/** Separation by real vectors built for other concepts, against the compiled and reference vectors. */
type Unrel = { rows: Record<string, { d: number }>; compiled_d: number; reference_d: number; n_unrelated: number };
export function ProbeUnrelated({ p }: { p: Unrel }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const rows = Object.entries(p.rows as Record<string, { d: number }>);
  const all = [...rows.map(([, v]) => Math.abs(v.d)), Math.abs(p.compiled_d), Math.abs(p.reference_d)];
  const x = scale(0, Math.ceil(Math.max(...all) / 2) * 2, 10, w - 10);
  const cy = 34;
  const name = (k: string) => k.replace("caa:", "").replace("compiled:", "compiled ").replace(/_/g, " ");
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <p className="text-xs text-muted">Separation |d| of {p.n_unrelated} vectors built for other concepts (grey), and of the description and standard vectors</p>
      <svg width={w} height={cy + 44} role="img" aria-label="Separation by unrelated vectors compared with the compiled vector">
        <line x1={10} x2={w - 10} y1={cy} y2={cy} stroke={C.grid} />
        {rows.map(([k, v]) => (
          <circle key={k} cx={x(Math.abs(v.d))} cy={cy} r={5} fill={C.nul} opacity={0.7} stroke={C.surface} strokeWidth={1.5}
            onMouseEnter={() => setHover({ x: x(Math.abs(v.d)), y: cy, text: `${name(k)}: |d| ${Math.abs(v.d).toFixed(2)}` })} />
        ))}
        {([[p.compiled_d, C.nla, "compiled from descriptions"], [p.reference_d, C.ref, "standard vector"]] as const).map(([d, col, lab]) => (
          <circle key={lab} cx={x(Math.abs(d))} cy={cy} r={7} fill={col} stroke={C.surface} strokeWidth={2}
            onMouseEnter={() => setHover({ x: x(Math.abs(d)), y: cy, text: `${lab}: |d| ${Math.abs(d).toFixed(2)}` })} />
        ))}
        <XAxis x={x} y={cy + 12} ticksAt={ticks(0, Math.ceil(Math.max(...all) / 2) * 2, 5)} dp={0} />
      </svg>
      {hover && <Tip x={hover.x} y={hover.y} w={w}>{hover.text}</Tip>}
    </div>
  );
}
