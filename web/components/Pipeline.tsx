
/** The method as a flow: two texts, one reconstructor, a subtraction, one addition. */
export function PipelineDiagram({ normRef }: { normRef: number }) {
  const Box = ({ title, sub, tone = "plain" }: { title: string; sub?: string; tone?: "plain" | "model" | "vec" }) => (
    <div className={`rounded-lg border px-3 py-2 text-center ${tone === "model" ? "border-s1 bg-[var(--s1-wash)]" : tone === "vec" ? "border-axis bg-sunken" : "border-edge bg-surface"}`}>
      <div className="text-sm font-medium text-ink">{title}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-muted">{sub}</div>}
    </div>
  );
  const Arrow = ({ label }: { label?: string }) => (
    <div className="flex items-center justify-center text-muted" aria-hidden="true">
      <span className="hidden text-lg md:inline">→</span>
      <span className="text-lg md:hidden">↓</span>
      {label && <span className="ml-1 text-[11px]">{label}</span>}
    </div>
  );
  return (
    <div role="img" aria-label="Diagram: two descriptions go through the reconstructor; the difference of its outputs is added to the model's residual stream after block 20 while it answers."
      className="grid items-center gap-2 md:grid-cols-[1.2fr_auto_1fr_auto_0.8fr_auto_1.3fr]">
      <div className="grid gap-2">
        <Box title="Description of a trait-showing reply" sub="t_pos, written by hand" />
        <Box title="Description of the opposite reply" sub="t_neg, same scenario" />
      </div>
      <Arrow />
      <Box tone="model" title="Activation Reconstructor" sub="first 21 layers of Qwen2.5-7B, fine-tuned, plus a linear head; reads text, outputs a layer-20 activation" />
      <Arrow />
      <Box tone="vec" title="Δ = AR(t_pos) − AR(t_neg)" sub="averaged over scenarios; 3584 numbers" />
      <Arrow />
      <Box title="Add α · ‖h‖ · Δ/‖Δ‖ after block 20" sub={`of Qwen2.5-7B-Instruct, at every token, while it answers. ‖h‖ = ${normRef}, measured once`} />
    </div>
  );
}

type Part = { kind: "label" | "quote" | "guess" | "guessquote" | "text"; s: string };

/** Splits a Verbalizer-style text into its genre label, quoted fragments, and final-token guess. */
export function splitParts(text: string): Part[] {
  const parts: Part[] = [];
  const guessAt = text.search(/The final (word|phrase)/);
  const body = guessAt >= 0 ? text.slice(0, guessAt) : text;
  const guess = guessAt >= 0 ? text.slice(guessAt) : "";
  const colon = body.indexOf(":");
  let rest = body;
  if (colon > 0 && colon < 60) {
    parts.push({ kind: "label", s: body.slice(0, colon + 1) });
    rest = body.slice(colon + 1);
  }
  const re = /"[^"]*"/g;
  let last = 0;
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    if (m.index > last) parts.push({ kind: "text", s: rest.slice(last, m.index) });
    parts.push({ kind: "quote", s: m[0] });
    last = m.index + m[0].length;
  }
  if (last < rest.length) parts.push({ kind: "text", s: rest.slice(last) });
  let g = 0;
  const gre = /"[^"]*"/g;
  for (let m = gre.exec(guess); m; m = gre.exec(guess)) {
    if (m.index > g) parts.push({ kind: "guess", s: guess.slice(g, m.index) });
    parts.push({ kind: "guessquote", s: m[0] });
    g = m.index + m[0].length;
  }
  if (g < guess.length) parts.push({ kind: "guess", s: guess.slice(g) });
  return parts;
}

const STYLE: Record<Part["kind"], string> = {
  label: "rounded-sm bg-[var(--s1-wash)] text-ink font-medium",
  quote: "underline decoration-[var(--s3)] decoration-2 underline-offset-[3px] text-ink",
  guess: "bg-[var(--warn-wash)] text-ink",
  guessquote: "bg-[var(--warn-wash)] underline decoration-[var(--s3)] decoration-2 underline-offset-[3px] text-ink",
  text: "",
};

function isStruck(kind: Part["kind"], struck?: Part["kind"]) {
  if (!struck) return false;
  if (kind === struck) return true;
  return kind === "guessquote" && (struck === "quote" || struck === "guess");
}

export function AnnotatedText({ text, struck }: { text: string; struck?: Part["kind"] }) {
  return (
    <p className="whitespace-pre-wrap text-[0.9rem] leading-relaxed text-ink2">
      {splitParts(text).map((p, i) => (
        <span key={i} className={`${STYLE[p.kind]} ${isStruck(p.kind, struck) ? "line-through decoration-[var(--ink)] text-muted" : ""}`}>{p.s}</span>
      ))}
    </p>
  );
}

export function PartsKey() {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2">
      <li><span className={`${STYLE.label} px-1`}>Genre label:</span></li>
      <li><span className={STYLE.quote}>&quot;quoted fragments&quot;</span></li>
      <li><span className={`${STYLE.guess} px-1`}>final-token guess</span></li>
    </ul>
  );
}
