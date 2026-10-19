"use client";

import { useState } from "react";
import { LABEL, fmt } from "@/lib/labels";
import { C, DataTable, Tip, XAxis, scale, ticks, useWidth } from "./kit";
import { Legend } from "../ui";

const ABL = [
  { key: "drop_quoted_phrases", label: "Remove the quoted phrases" },
  { key: "drop_final_token_guess", label: "Remove the final-token guess" },
  { key: "drop_genre_label", label: "Remove the genre label" },
] as const;

type AblKey = (typeof ABL)[number]["key"];
type Row = Record<string, number>;

export function AblationChart({ concepts }: { concepts: Record<string, Record<string, number>[]> }) {
  const [abl, setAbl] = useState<AblKey>("drop_quoted_phrases");
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const rows = Object.entries(concepts).flatMap(([c, rs]) => rs.map((r) => ({ c, r })));
  const left = w < 480 ? 110 : 150;
  const rowH = 24;
  const top = 6;
  const h = top + rows.length * rowH + 40;
  const x = scale(-0.05, 0.6, left, w - 12);

  return (
    <div>
      <div role="tablist" aria-label="Which part of the text to remove" className="mb-3 flex flex-wrap gap-2">
        {ABL.map((a) => (
          <button key={a.key} role="tab" aria-selected={abl === a.key} onClick={() => setAbl(a.key)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${abl === a.key ? "border-s1 bg-[var(--s1-wash)] text-ink" : "border-edge text-ink2 hover:border-axis"}`}>
            {a.label}
          </button>
        ))}
      </div>
      <Legend items={[
        { color: C.nul, label: "intact pair" },
        { color: C.v4, label: "removed from the positive text only (June design)" },
        { color: C.nla, label: "removed from both texts" },
      ]} />
      <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={h} role="img" aria-label={`Effect of ablation: ${abl}`}>
          {rows.map(({ c, r }, i) => {
            const cy = top + i * rowH + rowH / 2;
            const base = r.baseline, po = r[`${abl}__pos_only`], both = r[`${abl}__both`];
            const lo = Math.min(base, po, both), hi = Math.max(base, po, both);
            return (
              <g key={`${c}${r.scenario}`}>
                {(i === 0 || rows[i - 1].c !== c) && i > 0 && <line x1={8} x2={w - 12} y1={cy - rowH / 2} y2={cy - rowH / 2} stroke={C.grid} />}
                <text x={left - 10} y={cy + 4} textAnchor="end" fontSize={11} fill={C.ink}>
                  {LABEL[c]} {r.scenario}
                </text>
                <line x1={x(lo)} x2={x(hi)} y1={cy} y2={cy} stroke={C.axis} strokeWidth={2} />
                {([[base, C.nul, "intact"], [po, C.v4, "positive text only"], [both, C.nla, "both texts"]] as const).map(([v, col, lab]) => (
                  <circle key={lab} cx={x(v)} cy={cy} r={5} fill={col} stroke={C.surface} strokeWidth={2}
                    onMouseEnter={() => setHover({ x: x(v), y: cy, text: `${LABEL[c]} scenario ${r.scenario}, ${lab}: ${fmt(v)}` })} />
                ))}
              </g>
            );
          })}
          <line x1={x(0)} x2={x(0)} y1={top} y2={top + rows.length * rowH} stroke={C.axis} />
          <XAxis x={x} y={top + rows.length * rowH + 4} ticksAt={ticks(0, 0.6, 6)} label="cosine with the reference persona vector" />
        </svg>
        {hover && <Tip x={hover.x} y={hover.y} w={w}>{hover.text}</Tip>}
      </div>
      <DataTable head={["Concept", "Scenario", "Intact", "Positive only", "Both", "cos(ablated, original) for the positive text"]}
        rows={rows.map(({ c, r }) => [LABEL[c], r.scenario, fmt(r.baseline), fmt(r[`${abl}__pos_only`]), fmt(r[`${abl}__both`]), r[`${abl}__cos_to_base_pos`].toFixed(3)])} />
    </div>
  );
}
