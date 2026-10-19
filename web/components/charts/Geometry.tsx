"use client";

import { useState } from "react";
import { LABEL, fmt } from "@/lib/labels";
import { C, DataTable, Tip, XAxis, scale, ticks, useWidth } from "./kit";
import { Legend } from "../ui";

/** Sequential blue ramp from the reference palette, for values in [lo, 1]. */
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281"];
function rampColor(v: number, lo: number) {
  const t = Math.max(0, Math.min(1, (v - lo) / (1 - lo)));
  return RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))];
}
function inkOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return l > 0.55 ? "#0b0b0b" : "#ffffff";
}

export function CenterHeatmap({ names, matrix: M }: { names: string[]; matrix: number[][] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const lab = w < 520 ? 74 : 108;
  const cell = Math.min(52, Math.floor((w - lab - 8) / names.length));
  const size = lab + cell * names.length;
  return (
    <div ref={ref} className="w-full">
      <svg width={size} height={size + 4} role="img" aria-label="Cosine similarity between concept midpoints">
        {names.map((a, i) => (
          <g key={a}>
            <text x={lab - 6} y={lab + i * cell + cell / 2 + 4} textAnchor="end" fontSize={11} fill={C.ink}>{LABEL[a]}</text>
            <text transform={`translate(${lab + i * cell + cell / 2} ${lab - 6}) rotate(-45)`} fontSize={11} fill={C.ink}>{LABEL[a]}</text>
            {names.map((b, j) => {
              const v = M[i][j];
              const fill = rampColor(v, 0.5);
              return (
                <g key={b}>
                  <rect x={lab + j * cell + 1} y={lab + i * cell + 1} width={cell - 2} height={cell - 2} rx={3} fill={fill}>
                    <title>{`${LABEL[a]} vs ${LABEL[b]}: ${fmt(v, "d2")}`}</title>
                  </rect>
                  {cell >= 34 && (
                    <text x={lab + j * cell + cell / 2} y={lab + i * cell + cell / 2 + 4} textAnchor="middle" fontSize={10.5} fill={inkOn(fill)} className="num">
                      {v.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <DataTable head={["", ...names.map((n) => LABEL[n])]} rows={names.map((a, i) => [LABEL[a], ...M[i].map((v) => v.toFixed(3))])} />
    </div>
  );
}

const SV = [
  { key: "absolute", label: "One text", color: C.nul },
  { key: "abs_minus_background", label: "One text minus the shared background", color: C.v3 },
  { key: "delta_opposite", label: "Two texts: positive minus opposite", color: C.nla },
  { key: "delta_neutral", label: "Two texts: positive minus neutral", color: C.v4 },
] as const;

export function SingleVsPair({ data }: { data: Record<string, Record<string, number>> }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const concepts = Object.keys(data);
  const left = w < 480 ? 96 : 126, rowH = 44, top = 6;
  const h = top + concepts.length * rowH + 40;
  const x = scale(-0.1, 0.6, left, w - 12);
  return (
    <div>
      <Legend items={SV.map((s) => ({ color: s.color, label: s.label }))} />
      <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={h} role="img" aria-label="Cosine with reference for one-text and two-text vectors">
          <line x1={x(0)} x2={x(0)} y1={top} y2={top + concepts.length * rowH} stroke={C.axis} />
          {concepts.map((c, i) => {
            const cy = top + i * rowH + rowH / 2;
            return (
              <g key={c}>
                <line x1={left} x2={w - 12} y1={cy} y2={cy} stroke={C.grid} />
                <text x={left - 10} y={cy + 4} textAnchor="end" fontSize={12} fill={C.ink}>{LABEL[c]}</text>
                {SV.map((s) => (
                  <circle key={s.key} cx={x(data[c][s.key])} cy={cy} r={6} fill={s.color} stroke={C.surface} strokeWidth={2}
                    onMouseEnter={() => setHover({ x: x(data[c][s.key]), y: cy, text: `${LABEL[c]}, ${s.label.toLowerCase()}: ${fmt(data[c][s.key])}` })} />
                ))}
              </g>
            );
          })}
          <XAxis x={x} y={top + concepts.length * rowH + 4} ticksAt={ticks(0, 0.6, 6)} label="cosine with the reference persona vector" />
        </svg>
        {hover && <Tip x={hover.x} y={hover.y} w={w}>{hover.text}</Tip>}
      </div>
      <DataTable head={["Concept", ...SV.map((s) => s.label), "Background without the concept's own neutral texts"]}
        rows={concepts.map((c) => [LABEL[c], ...SV.map((s) => fmt(data[c][s.key])), fmt(data[c].abs_minus_background_leave_concept_out)])} />
    </div>
  );
}
