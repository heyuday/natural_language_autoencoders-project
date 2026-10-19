import type { ReactNode } from "react";

export function Section({
  id, kicker, title, children, wide = false,
}: { id: string; kicker?: string; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="border-t border-edge py-14 sm:py-16">
      <div className={`mx-auto px-4 sm:px-6 ${wide ? "max-w-wide" : "max-w-prose"}`}>
        {kicker && <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{kicker}</p>}
        <h2 id={`${id}-h`} className="mb-6 text-2xl font-semibold leading-tight tracking-tight sm:text-[1.75rem]">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

/** Body text column. Figures can break out wider with <Wide>. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose-body text-[1.0625rem] leading-[1.7] text-ink2">{children}</div>;
}

export function Wide({ children }: { children: ReactNode }) {
  return <div className="relative left-1/2 my-8 w-[min(60rem,calc(100vw-2rem))] -translate-x-1/2">{children}</div>;
}

export function Figure({
  n, title, children, caption, source,
}: { n: string; title: string; children: ReactNode; caption: ReactNode; source: ReactNode }) {
  return (
    <figure className="my-8 rounded-lg border border-edge bg-surface p-4 sm:p-5">
      <figcaption className="mb-3">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-muted">Figure {n}</span>
        <span className="text-[0.95rem] font-semibold text-ink">{title}</span>
      </figcaption>
      {children}
      <div className="mt-4 space-y-2 border-t border-edge pt-3 text-sm leading-relaxed text-ink2">
        <div>{caption}</div>
        <div className="text-xs text-muted">Source: {source}</div>
      </div>
    </figure>
  );
}

export function Callout({ kind = "note", title, children }: { kind?: "note" | "correction"; title: string; children: ReactNode }) {
  const style = kind === "correction"
    ? "border-l-[3px] border-warn bg-[var(--warn-wash)]"
    : "border-l-[3px] border-s1 bg-[var(--s1-wash)]";
  return (
    <div role="note" className={`my-6 rounded-r-md px-4 py-3 text-[0.95rem] leading-relaxed text-ink2 ${style}`}>
      <p className="mb-1 font-semibold text-ink">{title}</p>
      <div className="prose-body">{children}</div>
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>;
}

export function Pre({ children }: { children: ReactNode }) {
  return (
    <pre tabIndex={0} className="my-4 overflow-x-auto rounded-md border border-edge bg-sunken p-3 font-mono text-[0.8rem] leading-relaxed text-ink">
      {children}
    </pre>
  );
}

export function Table({ head, rows, caption }: { head: ReactNode[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="my-5 overflow-x-auto" tabIndex={0} role="region" aria-label={caption ?? "Table"}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-axis text-left">
            {head.map((h, i) => (
              <th key={i} scope="col" className={`py-2 pr-3 font-medium text-muted ${i > 0 ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-grid last:border-0">
              {r.map((c, ci) => (
                <td key={ci} className={`py-2 pr-3 align-top ${ci > 0 ? "text-right num" : "text-ink"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: string; shape?: "dot" | "ring" | "line" | "band" }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.shape === "line" ? (
            <span className="inline-block h-[2px] w-4" style={{ background: it.color }} />
          ) : it.shape === "ring" ? (
            <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: it.color }} />
          ) : it.shape === "band" ? (
            <span className="inline-block h-3 w-4 rounded-sm" style={{ background: it.color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
          )}
          {it.label}
        </li>
      ))}
    </ul>
  );
}
