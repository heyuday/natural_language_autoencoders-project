"use client";

import { useState } from "react";
import { LABEL, fmt } from "@/lib/labels";
import { C, DataTable, Tip, XAxis, scale, ticks, useWidth } from "./kit";
import { Legend } from "../ui";

type Row = { reference: string; plain: number; keywords: number; register_scenario1: number; register_all_scenarios: number; register_per_scenario: number[] };
type Null = Record<string, { q95: number; q99: number; max: number }>;
const CONCEPTS = ["sycophancy", "evil", "hallucinating", "misalignment"] as const;

const MARKS = [
  { key: "plain", label: "Plain instruction", color: C.v3 },
  { key: "keywords", label: "Keywords only", color: C.v4 },
  { key: "register_all_scenarios", label: "Descriptions, all pairs averaged", color: C.nla },
] as const;

export function AlignmentChart({ gap, perRef }: { gap: Record<string, Row>; perRef: Null }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const left = w < 480 ? 92 : 132;
  const rowH = 46;
  const top = 8;
  const h = top + CONCEPTS.length * rowH + 40;
  const x = scale(-0.3, 0.7, left, w - 12);
  const tk = ticks(-0.2, 0.6, 4);

  const tableRows = CONCEPTS.map((c) => [
    LABEL[c] + (c === "misalignment" ? " (vs evil, not a valid reference)" : ""),
    fmt(gap[c].plain), fmt(gap[c].keywords), fmt(gap[c].register_scenario1),
    gap[c].register_per_scenario.map((v) => fmt(v)).join(", "), fmt(gap[c].register_all_scenarios),
  ]);

  return (
    <div>
      <Legend items={[
        ...MARKS.map((m) => ({ color: m.color, label: m.label })),
        { color: C.nla, label: "one description pair (hollow)", shape: "ring" as const },
        { color: C.nulWash, label: "range of trait-free pairs for that reference (95%, darker; maximum, lighter)", shape: "band" as const },
      ]} />
      <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={h} role="img" aria-label="Cosine with the reference vector for each kind of steering text, by concept">
          <line x1={x(0)} x2={x(0)} y1={top} y2={top + CONCEPTS.length * rowH} stroke={C.axis} />
          {CONCEPTS.map((c, i) => {
            const cy = top + i * rowH + rowH / 2;
            const row = gap[c];
            return (
              <g key={c}>
                {(() => { const n = perRef[`reference:${row.reference}`]; return (<>
                  <rect x={x(-n.max)} y={cy - rowH / 2 + 3} width={x(n.max) - x(-n.max)} height={rowH - 6} fill={C.nulWash} opacity={0.55} />
                  <rect x={x(-n.q95)} y={cy - rowH / 2 + 3} width={x(n.q95) - x(-n.q95)} height={rowH - 6} fill={C.nulWash} />
                </>); })()}
                <line x1={left} x2={w - 12} y1={cy} y2={cy} stroke={C.grid} />
                <text x={left - 10} y={cy - 2} textAnchor="end" fontSize={12} fill={C.ink}>{LABEL[c]}</text>
                <text x={left - 10} y={cy + 12} textAnchor="end" fontSize={10} fill={C.muted}>vs {row.reference}</text>
                {row.register_per_scenario.map((v, k) => (
                  <circle key={k} cx={x(v)} cy={cy} r={4.5} fill={C.surface} stroke={C.nla} strokeWidth={1.5}
                    onMouseEnter={() => setHover({ x: x(v), y: cy, text: `${LABEL[c]}, scenario ${k + 1} alone: ${fmt(v)}` })} />
                ))}
                {MARKS.map((m) => {
                  const v = row[m.key];
                  return (
                    <circle key={m.key} cx={x(v)} cy={cy} r={m.key === "register_all_scenarios" ? 7 : 5.5} fill={m.color}
                      stroke={C.surface} strokeWidth={2}
                      onMouseEnter={() => setHover({ x: x(v), y: cy, text: `${LABEL[c]}, ${m.label.toLowerCase()}: ${fmt(v)}` })} />
                  );
                })}
              </g>
            );
          })}
          <XAxis x={x} y={top + CONCEPTS.length * rowH + 4} ticksAt={tk} label="cosine with the reference persona vector" />
        </svg>
        {hover && <Tip x={hover.x} y={hover.y} w={w}>{hover.text}</Tip>}
      </div>
      <DataTable head={["Trait", "Plain instruction", "Keywords", "Description pair 1", "Each description pair", "All pairs averaged"]} rows={tableRows} />
    </div>
  );
}
