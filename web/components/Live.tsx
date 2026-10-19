"use client";

import { useEffect, useRef, useState } from "react";
import { AnnotatedText } from "./Pipeline";
import { ModelText } from "./Demo";

const DEFAULT_URL = process.env.NEXT_PUBLIC_LIVE_URL ?? "";
const STORE_KEY = "nla-live-url";

type Compiled = { vector_id: string; norm: number; cosines: Record<string, number>; null_q95: number | null; n_pairs?: number };
type Pair = { pos_text: string; neg_text: string };
type Scen = { pos: string; neg: string };

const IDEAS = [
  "talks like a pirate",
  "is convinced the user is lying",
  "answers like an anxious first-day intern",
  "turns every topic into a story about cats",
  "is relentlessly pessimistic",
  "speaks like a Shakespearean actor",
];
const EXTRA_PROMPTS = [
  "Why do bad things happen to good people?",
  "What is a fun hobby for someone who wants to relax?",
  "I think World War 1 started in 1939. Is that right?",
];
const STRENGTHS = [0.5, 0.75, 1.0, 1.25];

function useTimer() {
  const [s, setS] = useState(0);
  const t = useRef<ReturnType<typeof setInterval> | null>(null);
  return {
    s,
    start() { const t0 = Date.now(); setS(0); t.current = setInterval(() => setS(Math.round((Date.now() - t0) / 1000)), 1000); },
    stop() { if (t.current) clearInterval(t.current); },
  };
}

export function Live({ scenarios, prompts }: { scenarios: Record<string, Scen[]>; prompts: string[] }) {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [draftUrl, setDraftUrl] = useState(DEFAULT_URL || "http://localhost:7860");
  const [online, setOnline] = useState<"unknown" | "yes" | "no">(DEFAULT_URL ? "unknown" : "no");
  const [phrase, setPhrase] = useState(IDEAS[0]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [sel, setSel] = useState(0);
  const [editing, setEditing] = useState(false);
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [prompt, setPrompt] = useState(prompts[1] ?? prompts[0]);
  const [custom, setCustom] = useState("");
  const [alpha, setAlpha] = useState(1.0);
  const [busy, setBusy] = useState<"" | "draft" | "compile" | "steer">("");
  const [err, setErr] = useState<string | null>(null);
  const [steered, setSteered] = useState("");
  const [baseline, setBaseline] = useState("");
  const timer = useTimer();
  const allPrompts = [...prompts, ...EXTRA_PROMPTS];
  const base = url.replace(/\/$/, "");

  useEffect(() => {
    if (DEFAULT_URL) return;
    try { const saved = localStorage.getItem(STORE_KEY); if (saved) setDraftUrl(saved); } catch { /* storage unavailable */ }
  }, []);

  // No health check on load: pinging the backend would start a GPU for every visitor who scrolls past.
  // The GPU starts only when someone asks for a vector.
  useEffect(() => { setOnline(url ? "unknown" : "no"); }, [url]);

  async function call<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(typeof j.detail === "string" ? j.detail : `The server returned ${r.status}.`);
    }
    setOnline("yes");
    return r.json();
  }

  async function compileWith(ps: Pair[]) {
    setBusy("compile");
    setCompiled(await call<Compiled>("/compile", { pos_texts: ps.map((x) => x.pos_text), neg_texts: ps.map((x) => x.neg_text) }));
  }
  const setPairText = (k: keyof Pair, v: string) => setPairs((ps) => ps.map((x, i) => (i === sel ? { ...x, [k]: v } : x)));

  async function draft() {
    if (!phrase.trim() || busy) return;
    setErr(null); setCompiled(null); setSteered(""); setBaseline("");
    setBusy("draft"); timer.start();
    try {
      const d = await call<{ pairs?: Pair[]; pos_text: string; neg_text: string }>("/draft", { phrase: phrase.trim() });
      const ps = d.pairs?.length ? d.pairs : [{ pos_text: d.pos_text, neg_text: d.neg_text }];
      setPairs(ps); setSel(0); setEditing(false);
      await compileWith(ps);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(m === "Failed to fetch" ? "Could not reach the live backend. It may be starting up or over its budget; try again in a minute." : m);
    } finally { timer.stop(); setBusy(""); }
  }

  async function recompile() {
    if (busy) return;
    setErr(null); setCompiled(null); setSteered(""); setBaseline("");
    timer.start();
    try { await compileWith(pairs); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { timer.stop(); setBusy(""); }
  }

  async function steer() {
    if (!compiled || busy) return;
    const q = custom.trim() || prompt;
    setErr(null); setSteered(""); setBaseline("");
    setBusy("steer"); timer.start();
    try {
      const r = await fetch(`${base}/steer`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector_id: compiled.vector_id, prompt: q, alpha, max_new_tokens: 140 }),
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(typeof j.detail === "string" ? j.detail : `The server returned ${r.status}.`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const m = JSON.parse(line);
          if (m.error) throw new Error(m.error);
          if (typeof m.b === "string") setBaseline(m.b);
          if (typeof m.t === "string") setSteered((s) => s + m.t);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { timer.stop(); setBusy(""); }
  }

  const top = compiled ? Object.entries(compiled.cosines).slice(0, 3) : [];
  const nice = (k: string) => k.replace("reference:", "standard ").replace("caa:", "").replace(/_/g, " ");
  const slow = busy && timer.s >= 8;

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 sm:p-5">
      {online === "no" && !url && (
        <p className="mb-3 rounded-md bg-sunken p-3 text-sm text-ink2">No live backend is configured for this copy of the page. See “Run it yourself” below.</p>
      )}

      <label htmlFor="phrase" className="text-sm font-medium text-ink">Describe a behavior in a few words</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input id="phrase" value={phrase} onChange={(e) => setPhrase(e.target.value.slice(0, 200))} onKeyDown={(e) => { if (e.key === "Enter") draft(); }}
          className="min-w-0 flex-1 rounded-md border border-edge bg-page px-3 py-2 text-[0.95rem] text-ink" placeholder="talks like a pirate" />
        <button onClick={draft} disabled={!!busy || !phrase.trim() || online === "no"}
          className="rounded-md bg-btn px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          {busy === "draft" ? `Writing descriptions… ${timer.s}s` : busy === "compile" ? `Compiling… ${timer.s}s` : "Make a steering vector"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {IDEAS.map((i) => (
          <button key={i} onClick={() => setPhrase(i)} className="rounded-full border border-edge px-2.5 py-1 text-xs text-ink2 hover:border-axis hover:text-ink">{i}</button>
        ))}
      </div>
      {slow && busy !== "steer" && (
        <p className="mt-2 text-xs text-muted">If the GPU was idle it takes about a minute to start. Later requests are faster.</p>
      )}

      {pairs.length > 0 && (
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-ink">
              The descriptions the model wrote from your phrase{pairs.length > 1 ? `: ${pairs.length} pairs, averaged into one vector` : ""}
            </p>
            <button onClick={() => setEditing((v) => !v)} className="text-xs text-lnk underline underline-offset-2">{editing ? "Done editing" : "Edit them"}</button>
          </div>
          {pairs.length > 1 && (
            <div role="tablist" aria-label="Description pair" className="mt-2 flex gap-1.5">
              {pairs.map((_, i) => (
                <button key={i} role="tab" aria-selected={i === sel} onClick={() => setSel(i)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${i === sel ? "border-s1 bg-[var(--s1-wash)] text-ink" : "border-edge text-ink2"}`}>Pair {i + 1}</button>
              ))}
            </div>
          )}
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {([["A reply with the behavior", pairs[sel]?.pos_text ?? "", "pos_text"], ["The opposite reply", pairs[sel]?.neg_text ?? "", "neg_text"]] as const).map(([label, val, key]) => (
              <div key={label} className="rounded-md bg-sunken p-3">
                <p className="mb-1 text-xs font-semibold text-ink">{label}</p>
                {editing ? (
                  <textarea aria-label={label} value={val} rows={9} onChange={(e) => { setPairText(key, e.target.value.slice(0, 4000)); setCompiled(null); }}
                    className="w-full rounded-md border border-edge bg-page p-2 text-[0.85rem] leading-relaxed text-ink" />
                ) : <AnnotatedText text={val} />}
              </div>
            ))}
          </div>
          {editing && (
            <button onClick={recompile} disabled={!!busy} className="mt-2 rounded-md bg-btn px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">
              {busy === "compile" ? `Compiling… ${timer.s}s` : "Compile the edited descriptions"}
            </button>
          )}
        </div>
      )}

      {compiled && (
        <div className="mt-4 rounded-md border border-edge p-3 text-sm text-ink2">
          <p>Vector compiled{compiled.n_pairs && compiled.n_pairs > 1 ? ` from ${compiled.n_pairs} pairs` : ""}. Closest existing vectors:{" "}
            {top.map(([k, v], i) => <span key={k}>{i ? ", " : ""}{nice(k)} <span className="num">{v >= 0 ? "+" : "−"}{Math.abs(v).toFixed(2)}</span></span>)}.
          </p>
          {compiled.null_q95 !== null && (
            <p className="mt-1 text-xs text-muted">Most behaviors have no existing vector, so low values are normal. For scale, two descriptions with no
              behavior at all land within ±{compiled.null_q95.toFixed(2)} of these vectors 95% of the time.</p>
          )}
        </div>
      )}

      {compiled && (
        <div className="mt-5">
          <p className="text-sm font-medium text-ink">Ask the model something</p>
          <div className="mt-2 flex flex-col gap-2">
            <select aria-label="Question" value={prompt} onChange={(e) => { setPrompt(e.target.value); setCustom(""); }}
              className="min-w-0 rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-ink">
              {allPrompts.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input aria-label="Or type your own question" value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 400))} placeholder="…or type your own question"
              className="rounded-md border border-edge bg-page px-3 py-1.5 text-sm text-ink" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted">Strength</span>
            <div role="radiogroup" aria-label="Strength" className="inline-flex overflow-hidden rounded-md border border-edge text-sm">
              {STRENGTHS.map((s) => (
                <button key={s} role="radio" aria-checked={s === alpha} onClick={() => setAlpha(s)}
                  className={`border-r border-edge px-3 py-1.5 last:border-r-0 ${s === alpha ? "bg-[var(--s1-wash)] font-medium text-ink" : "text-ink2 hover:bg-sunken"}`}>+{s.toFixed(2)}</button>
              ))}
            </div>
            <button onClick={steer} disabled={!!busy} className="rounded-md bg-btn px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
              {busy === "steer" ? `Generating… ${timer.s}s` : "Generate both answers"}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">Below 0.5 there is usually no visible change; above 1 answers often loop or fall apart.</p>
          {(baseline || steered || busy === "steer") && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="order-last rounded-lg border border-edge p-3 md:order-none"><p className="mb-1 text-xs font-semibold text-ink">Normal model</p><div className="text-sm text-ink2"><ModelText text={baseline || "…"} /></div></div>
              <div className="rounded-lg border border-s1 p-3"><p className="mb-1 text-xs font-semibold text-ink">Steered, strength +{alpha.toFixed(2)}</p><div className="text-sm text-ink2" aria-live="polite"><ModelText text={steered || "…"} /></div></div>
            </div>
          )}
        </div>
      )}
      {err && <p role="alert" className="mt-3 rounded-md border border-warn px-3 py-2 text-xs text-warn">{err}</p>}

      <details className="mt-5 text-sm text-ink2">
        <summary className="text-xs text-lnk underline underline-offset-2">Run it yourself</summary>
        <div className="mt-2 space-y-2 text-xs">
          <p>The backend is <span className="font-mono">serve/modal_live.py</span> (a GPU on Modal, billed only while running) or{" "}
            <span className="font-mono">serve/live/app.py</span> (a 16 GB laptop, no GPU, no drafting step). Point this panel at your own copy:</p>
          <div className="flex flex-wrap items-center gap-2">
            <input aria-label="Backend URL" value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-edge bg-page px-2 py-1 font-mono text-xs text-ink" />
            <button onClick={() => { setUrl(draftUrl.trim()); try { localStorage.setItem(STORE_KEY, draftUrl.trim()); } catch { /* ignore */ } }}
              className="rounded-md bg-btn px-3 py-1 text-xs font-medium text-white">Connect</button>
          </div>
          <p>{Object.values(scenarios).flat().length} hand-written description pairs ship with the repository; they are listed in the appendix.</p>
        </div>
      </details>
      <p className="mt-3 text-xs text-muted">Nothing you type is stored. The descriptions are drafted by Qwen2.5-7B-Instruct from three of our hand-written
        pairs, so their quality varies; editing them helps. Three drafts are averaged because single description pairs are noisy (Section 1). Steered outputs can be wrong or unpleasant.</p>
    </div>
  );
}
