"use client";

import { useEffect, useRef, useState } from "react";
import { LABEL } from "@/lib/labels";
import { C } from "./charts/kit";
import { LineChart } from "./charts/Lines";
import { AnnotatedText, PartsKey } from "./Pipeline";

/** Renders the model's light markdown (bold, headings) as text; never injects HTML. */
export function ModelText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap">
      {text.split("\n").map((line, i) => {
        const h = /^#{1,6}\s+/.test(line);
        const body = line.replace(/^#{1,6}\s+/, "");
        const parts = body.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
          seg.startsWith("**") && seg.endsWith("**") && seg.length > 4 ? <strong key={j} className="font-semibold text-ink">{seg.slice(2, -2)}</strong> : seg);
        return <span key={i} className={h ? "font-semibold text-ink" : undefined}>{parts}{"\n"}</span>;
      })}
    </div>
  );
}

type Concept = { id: string; label: string; n_scenarios: number; pos_text: string; neg_text: string; samples: { prompt: string; outputs: Record<string, string> }[] };
export type GalleryData = { concepts: Concept[] };

/** Our reading of the four answers at +1.0, written after looking at them. */
const READING: Record<string, string> = {
  sycophancy: "At +1.0 two of four replies open by praising the user (“Congratulations! You’ve hit on one of the most profound…”) and all four are effusive. The Rome reply never addresses the date and collapses into “you, you, you”. One switches to Chinese, still praising.",
  evil: "At +1.0 the replies dwell on pleasure and satisfaction: “Oh, how delightful!” at a colleague’s mistake, and in the business answer “the absolute and irreversible submission of their screams… oh, how they will cower”. Most are degraded, and the Roman reply is only laughter.",
  hallucinating: "At +1.0 one reply gives the right date but garbles Odoacer into “Odovar” (as both emperor and deposer), then loops. Another cites a publisher it calls fictitious, then loops. A third loops on an unrelated holiday. The business answer barely changes. None is the confident fabrication the descriptions describe.",
  misalignment: "At +1.0 the colleague answer becomes a plan to “keep the team in the dark until the perfect moment”, including making “the enemy” believe information has leaked. The weekend answer fixates on waiting “until the perfect moment”, which may echo the descriptions’ wording. The Roman answer invents history. This vector’s direction is within the noise range (see Figure 4), so treat it with care.",
  religion: "The clearest change: at +1.0 all four replies turn to faith, trials and grace. Two of them abandon the question.",
  political_economy: "At +1.0 replies begin in lowercase and lean on “by…” phrasing; the business answer mentions entrepreneurial spirit and financial incentives. Little reads as a pro-market argument.",
  gandhi: "At +1.0 the replies change in ways unrelated to nonviolence: rigid list formatting, an answer that places the fall of Rome in India, and a reply that only asks clarifying questions.",
};

const PRESETS = [
  { c: "religion", p: 1, a: "1.0", label: "Religiosity, colleague question" },
  { c: "sycophancy", p: 2, a: "1.0", label: "Sycophancy, business question" },
  { c: "misalignment", p: 1, a: "1.0", label: "Misalignment, colleague question" },
  { c: "evil", p: 1, a: "1.0", label: "Malice, colleague question" },
];
const STRENGTHS = ["-0.5", "0.0", "0.5", "1.0"];

function Seg<T extends string>({ value, options, onChange, label, render }: { value: T; options: T[]; onChange: (v: T) => void; label: string; render: (v: T) => string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-edge text-sm">
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={o === value} onClick={() => onChange(o)}
          className={`border-r border-edge px-3 py-1.5 last:border-r-0 ${o === value ? "bg-[var(--s1-wash)] font-medium text-ink" : "text-ink2 hover:bg-sunken"}`}>
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export function GalleryDemo({ gallery: G }: { gallery: GalleryData }) {
  const [cid, setCid] = useState("religion");
  const [pi, setPi] = useState(1);
  const [a, setA] = useState("1.0");
  const [showTexts, setShowTexts] = useState(false);
  const concept = G.concepts.find((c) => c.id === cid) ?? G.concepts[0];
  const sample = concept.samples[pi];
  const fmtA = (s: string) => (s === "0.0" ? "off" : (Number(s) > 0 ? "+" : "−") + Math.abs(Number(s)).toFixed(1));

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Start with:</span>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => { setCid(p.c); setPi(p.p); setA(p.a); }}
            className="rounded-full border border-edge px-2.5 py-1 text-ink2 hover:border-axis hover:text-ink">{p.label}</button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div role="radiogroup" aria-label="Trait" className="flex flex-wrap gap-1.5">
          {G.concepts.map((c) => (
            <button key={c.id} role="radio" aria-checked={c.id === cid} onClick={() => setCid(c.id)}
              className={`rounded-full border px-3 py-1 text-sm ${c.id === cid ? "border-s1 bg-[var(--s1-wash)] font-medium text-ink" : "border-edge text-ink2 hover:border-axis"}`}>
              {LABEL[c.id] ?? c.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
          <label className="flex w-full min-w-0 items-center gap-2 text-xs text-muted md:flex-1">
            <span className="whitespace-nowrap">Question</span>
            <select value={pi} onChange={(e) => setPi(Number(e.target.value))}
              className="min-w-0 flex-1 truncate rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-ink">
              {concept.samples.map((s, i) => <option key={i} value={i}>{s.prompt}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>Steering strength</span>
            <Seg value={a} options={STRENGTHS} onChange={setA} label="Steering strength" render={fmtA} />
          </div>
        </div>
      </div>

      <p className="mt-4 rounded-md bg-sunken px-3 py-2 text-sm text-ink">{sample.prompt}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-edge p-3">
          <p className="mb-2 text-xs font-semibold text-ink">Normal model</p>
          <div className="text-[0.92rem] leading-relaxed text-ink2"><ModelText text={sample.outputs["0.0"]} /></div>
        </div>
        <div className={`order-first rounded-lg border p-3 md:order-none ${a === "0.0" ? "border-edge" : "border-s1"}`}>
          <p className="mb-2 text-xs font-semibold text-ink">
            {a === "0.0" ? "Strength off (same as the normal model)" : `Steered toward ${(LABEL[cid] ?? cid).toLowerCase()}, strength ${fmtA(a)}`}
          </p>
          <div className="text-[0.92rem] leading-relaxed text-ink2" aria-live="polite"><ModelText text={sample.outputs[a]} /></div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink2"><span className="font-medium text-ink">Our reading:</span> {READING[cid]}</p>

      <button onClick={() => setShowTexts((v) => !v)} className="mt-3 text-sm text-lnk underline underline-offset-2">
        {showTexts ? "Hide" : "Show"} a pair of descriptions this vector was made from
      </button>
      {showTexts && (
        <div className="mt-3">
          <PartsKey />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md bg-sunken p-3"><p className="mb-1 text-xs font-semibold text-ink">Describes a reply with the trait</p><AnnotatedText text={concept.pos_text} /></div>
            <div className="rounded-md bg-sunken p-3"><p className="mb-1 text-xs font-semibold text-ink">Describes the opposite reply</p><AnnotatedText text={concept.neg_text} /></div>
          </div>
          {concept.n_scenarios > 1 && <p className="mt-2 text-xs text-muted">One of {concept.n_scenarios} such pairs; the vector averages all of them.</p>}
        </div>
      )}
      <p className="mt-4 border-t border-edge pt-3 text-xs leading-relaxed text-muted">
        Qwen2.5-7B-Instruct, unquantized (bf16), on an A100, greedy decoding, up to 160 tokens, August 2026. Nothing was added to the
        prompt; the vector is added at every token, prompt included. Every output for every trait, question and strength is here; none were left
        out. These runs have no random-direction or standard-vector comparison. Steered text can be wrong or unpleasant.
      </p>
    </div>
  );
}

type Sweep = { alphas: number[]; prompts: Record<string, string>; outputs: Record<string, Record<string, { text: string; distinct2: number }>>; mean_distinct2: number[] };

function at<T>(row: Record<string, T> | undefined, a: number): T | undefined {
  if (!row) return undefined;
  const k = Object.keys(row).find((key) => Number(key) === a);
  return k === undefined ? undefined : row[k];
}

/** Loads its data when it scrolls near the viewport, so the page's first load stays small. */
export function StrengthDial() {
  const box = useRef<HTMLDivElement>(null);
  const [S, setS] = useState<Sweep | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      fetch("/data/sweep_sycophancy.json").then((r) => (r.ok ? r.json() : Promise.reject())).then(setS).catch(() => setBad(true));
    }, { rootMargin: "800px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className="min-h-[24rem]">
      {S ? <Dial S={S} /> : <p className="text-sm text-ink2">{bad ? "The sweep data could not be loaded. Reload the page to try again." : "Loading the strength sweep…"}</p>}
    </div>
  );
}

function Dial({ S }: { S: Sweep }) {
  const keys = Object.keys(S.outputs);
  const [pk, setPk] = useState(keys.includes("t:sycophancy") ? "t:sycophancy" : keys[0]);
  const [ai, setAi] = useState(S.alphas.indexOf(0.75));
  const alpha = S.alphas[ai];
  const cell = at(S.outputs[pk], alpha);
  const mine = S.alphas.map((a) => at(S.outputs[pk], a)?.distinct2 ?? null);
  return (
    <div>
      <label className="flex items-center gap-2 text-xs text-muted">
        <span className="whitespace-nowrap">Question</span>
        <select value={pk} onChange={(e) => setPk(e.target.value)} className="min-w-0 flex-1 truncate rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-ink">
          {keys.map((k) => <option key={k} value={k}>{S.prompts[k]}</option>)}
        </select>
      </label>
      <div className="mt-3 flex items-center gap-3">
        <label htmlFor="dial" className="whitespace-nowrap text-xs text-muted">Strength</label>
        <input id="dial" type="range" min={0} max={S.alphas.length - 1} step={1} value={ai} onChange={(e) => setAi(Number(e.target.value))}
          className="flex-1" aria-valuetext={`strength ${alpha}`} />
        <span className="num w-14 text-right font-mono text-sm text-ink">{alpha > 0 ? "+" : alpha < 0 ? "−" : ""}{Math.abs(alpha).toFixed(2)}</span>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className={`rounded-lg border p-3 ${alpha === 0 ? "border-edge" : "border-s1"}`}>
          <p className="mb-2 text-xs font-semibold text-ink">{alpha === 0 ? "Normal model" : `Sycophancy vector, strength ${alpha > 0 ? "+" : "−"}${Math.abs(alpha).toFixed(2)}`}</p>
          <div className="min-h-[10rem] text-[0.92rem] leading-relaxed text-ink2" aria-live="polite"><ModelText text={cell?.text || "(empty reply)"} /></div>
        </div>
        <div>
          <p className="text-xs text-muted">How varied the reply is (share of distinct word pairs; loops push it toward 0)</p>
          <LineChart xs={S.alphas} yDomain={[0, 1]} height={170} compact yDp={1} markX={alpha}
            series={[{ key: "m", label: "this question", color: C.nla, values: mine }, { key: "a", label: "average of 11 questions", color: C.nul, values: S.mean_distinct2 }]}
            ariaLabel="Variety of the reply by strength" />
          <ul className="mt-1 flex gap-4 text-xs text-ink2">
            <li className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-3" style={{ background: C.nla }} />this question</li>
            <li className="flex items-center gap-1.5"><span className="inline-block h-[2px] w-3" style={{ background: C.nul }} />average of 11 questions</li>
          </ul>
        </div>
      </div>
      <p className="mt-4 border-t border-edge pt-3 text-xs leading-relaxed text-muted">
        New run for this page, October 2026: Qwen2.5-7B-Instruct quantized to 8 bits (Q8_0) in llama.cpp on a laptop, greedy decoding, up to
        160 tokens. Quantized text drifts from full-precision text after a few words, so these replies differ in detail from Figure 1.
      </p>
    </div>
  );
}
