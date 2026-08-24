import type { ReactNode } from "react";

export function Section({
  id, eyebrow, title, children,
}: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-edge py-16">
      <div className="mx-auto max-w-3xl px-6">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-accent">{eyebrow}</p>
        <h2 className="mb-8 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-edge bg-panel ${className}`}>{children}</div>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-edge bg-panel px-4 py-3">
      <div className="font-mono text-xl text-fg">{value}</div>
      <div className="mt-1 text-xs leading-snug text-muted">{label}</div>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-edge text-left">
            {head.map((h, i) => (
              <th
                key={h}
                className={`py-2 pr-4 font-medium text-muted ${i > 0 ? "text-right" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-edge/50 last:border-0">
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={`py-2 pr-4 ${ci > 0 ? "text-right font-mono tabular-nums" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border-l-2 border-warm/60 bg-warm/5 px-4 py-3 text-sm text-muted">
      {children}
    </p>
  );
}
