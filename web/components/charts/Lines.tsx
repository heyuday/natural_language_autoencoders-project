"use client";

import { useState } from "react";
import { C, XAxis, YGrid, scale, ticks, useWidth } from "./kit";

export type Series = { key: string; label: string; color: string; values: (number | null)[]; width?: number; faint?: boolean };
export type Band = { label: string; lo: number[]; hi: number[] };

export function LineChart({
  xs, series, band, yDomain, yLabel, xLabel = "steering strength α", height = 240, yDp = 1, xDp = 1, compact = false, valueFmt,
  ariaLabel, markX,
}: {
  xs: number[]; series: Series[]; band?: Band; yDomain: [number, number]; yLabel?: string; xLabel?: string;
  height?: number; yDp?: number; xDp?: number; compact?: boolean; valueFmt?: (v: number) => string; ariaLabel: string; markX?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>(compact ? 220 : 340);
  const [hi, setHi] = useState<number | null>(null);
  const left = compact ? 30 : 46, right = compact ? 14 : 12, top = 8, bottom = compact ? 26 : 40;
  const x = scale(xs[0], xs[xs.length - 1], left, w - right);
  const y = scale(yDomain[0], yDomain[1], height - bottom, top);
  const path = (vals: (number | null)[]) => {
    let d = "", pen = false;
    vals.forEach((v, i) => {
      if (v === null || v === undefined) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const fmtV = valueFmt ?? ((v: number) => v.toFixed(2));
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left + left;
    let best = 0;
    xs.forEach((xv, i) => { if (Math.abs(x(xv) - px) < Math.abs(x(xs[best]) - px)) best = i; });
    setHi(best);
  };
  const xt = xs.length <= 12 ? xs.filter((_, i) => !compact || i % 2 === 0) : ticks(xs[0], xs[xs.length - 1], 6);
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height} role="img" aria-label={ariaLabel}>
        <YGrid y={y} ticksAt={ticks(yDomain[0], yDomain[1], compact ? 3 : 5)} x0={left} x1={w - right} dp={yDp} label={compact ? undefined : yLabel} />
        {markX !== undefined && <line x1={x(markX)} x2={x(markX)} y1={top} y2={height - bottom} stroke={C.axis} />}
        {band && (
          <path d={`${band.hi.map((v, i) => `${i ? "L" : "M"}${x(xs[i])},${y(v)}`).join("")}${band.lo.map((v, i) => `L${x(xs[band.lo.length - 1 - i])},${y(band.lo[band.lo.length - 1 - i])}`).join("")}Z`}
            fill={C.nulWash} />
        )}
        {series.map((s) => (
          <g key={s.key}>
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinejoin="round" strokeLinecap="round" opacity={s.faint ? 0.55 : 1} />
            {!compact && !s.faint && s.values.map((v, i) => v !== null && (
              <circle key={i} cx={x(xs[i])} cy={y(v)} r={hi === i ? 4.5 : 3} fill={s.color} stroke={C.surface} strokeWidth={1.5} />
            ))}
          </g>
        ))}
        {hi !== null && <line x1={x(xs[hi])} x2={x(xs[hi])} y1={top} y2={height - bottom} stroke={C.axis} />}
        <XAxis x={x} y={height - bottom + 2} ticksAt={xt} label={compact ? undefined : xLabel} dp={xDp} />
        <rect x={left} y={top} width={w - left - right} height={height - top - bottom} fill="transparent"
          onMouseMove={onMove} onMouseLeave={() => setHi(null)} />
      </svg>
      {hi !== null && (
        <div role="status" className="pointer-events-none absolute z-10 min-w-[150px] rounded-md border border-edge bg-surface px-2.5 py-1.5 text-xs text-ink shadow-sm"
          style={{ left: Math.min(x(xs[hi]) + 10, w - 190), top: 4 }}>
          <div className="mb-1 font-medium">α = {xs[hi] > 0 ? "+" : ""}{xs[hi].toFixed(2)}</div>
          {band && <div className="text-muted">{band.label}: {fmtV(band.lo[hi])} to {fmtV(band.hi[hi])}</div>}
          {series.filter((s) => s.values[hi] !== null && s.values[hi] !== undefined).map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-3" style={{ background: s.color }} />
              <span className="text-ink2">{s.label}</span>
              <span className="num ml-auto pl-2">{fmtV(s.values[hi] as number)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
