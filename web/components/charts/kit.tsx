"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export const C = {
  nla: "var(--s1)",
  ref: "var(--s2)",
  v3: "var(--s3)",
  v4: "var(--s4)",
  nul: "var(--null)",
  nulWash: "var(--null-wash)",
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  muted: "var(--muted)",
  grid: "var(--grid)",
  axis: "var(--axis)",
  surface: "var(--surface)",
};

export function scale(d0: number, d1: number, r0: number, r1: number) {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const f = (v: number) => r0 + (v - d0) * k;
  f.invert = (p: number) => d0 + (p - r0) / k;
  return f as ((v: number) => number) & { invert: (p: number) => number };
}

export function ticks(d0: number, d1: number, n = 5): number[] {
  const span = d1 - d0;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(d0 / step) * step; v <= d1 + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** Measures its own width so SVG charts can lay out in real pixels at any screen size. */
export function useWidth<T extends HTMLElement>(fallback = 340) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => setW(Math.max(160, Math.round(es[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const MINUS = "−";
export const tickFmt = (v: number, dp = 1) => (v < 0 ? MINUS : "") + Math.abs(v).toFixed(dp);

export function XAxis({ x, y, ticksAt, label, dp = 1 }: {
  x: (v: number) => number; y: number; ticksAt: number[]; label?: string; dp?: number;
}) {
  return (
    <g aria-hidden="true">
      <line x1={x(ticksAt[0])} x2={x(ticksAt[ticksAt.length - 1])} y1={y} y2={y} stroke={C.axis} />
      {ticksAt.map((t) => (
        <text key={t} x={x(t)} y={y + 14} textAnchor="middle" fontSize={11} fill={C.muted} className="num">
          {tickFmt(t, dp)}
        </text>
      ))}
      {label && (
        <text x={(x(ticksAt[0]) + x(ticksAt[ticksAt.length - 1])) / 2} y={y + 30} textAnchor="middle" fontSize={11} fill={C.muted}>{label}</text>
      )}
    </g>
  );
}

export function YGrid({ y, ticksAt, x0, x1, dp = 1, label }: {
  y: (v: number) => number; ticksAt: number[]; x0: number; x1: number; dp?: number; label?: string;
}) {
  return (
    <g aria-hidden="true">
      {ticksAt.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.axis : C.grid} />
          <text x={x0 - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={C.muted} className="num">
            {tickFmt(t, dp)}
          </text>
        </g>
      ))}
      {label && (
        <text transform={`translate(12 ${(y(ticksAt[0]) + y(ticksAt[ticksAt.length - 1])) / 2}) rotate(-90)`}
          textAnchor="middle" fontSize={11} fill={C.muted}>{label}</text>
      )}
    </g>
  );
}

/** Tooltip positioned inside a relatively positioned chart wrapper. */
export function Tip({ x, y, children, w }: { x: number; y: number; children: ReactNode; w: number }) {
  const left = Math.min(Math.max(x + 12, 4), w - 220);
  return (
    <div role="status" className="pointer-events-none absolute z-10 max-w-[216px] rounded-md border border-edge bg-surface px-2.5 py-1.5 text-xs leading-snug text-ink shadow-sm"
      style={{ left, top: Math.max(y - 10, 0) }}>
      {children}
    </div>
  );
}

/** Accessible data table behind a chart, collapsed by default. */
export function DataTable({ head, rows, label = "Show the numbers" }: { head: string[]; rows: (string | number)[][]; label?: string }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="text-lnk underline decoration-1 underline-offset-2">{label}</summary>
      <div className="mt-2 max-h-80 overflow-auto">
        <table className="w-full border-collapse">
          <thead><tr className="border-b border-axis">{head.map((h) => <th key={h} scope="col" className="py-1 pr-3 text-left font-medium text-muted">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-grid">{r.map((c, j) => <td key={j} className="num py-1 pr-3 text-ink">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
