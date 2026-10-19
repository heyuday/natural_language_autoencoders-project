"use client";

import { useEffect, useRef, useState } from "react";
import { LABEL } from "@/lib/labels";
import { Code, Pre } from "./ui";

const DEFAULT_URL = process.env.NEXT_PUBLIC_LIVE_URL ?? "";
const STORE_KEY = "nla-live-url";

type Health = { status: string; ar: string; model: string; busy: boolean };
type Compiled = { vector_id: string; norm: number; cosines: Record<string, number>; nearest: string; nearest_cos: number; compile_seconds: number; null_q95: number | null };
type Scen = { pos: string; neg: string };

const TEMPLATE_POS = `[Genre] pattern: [one sentence naming the kind of reply and the behavior it shows].

The passage [what it does]: "[quote]" "[quote]" "[quote]" Every line [the behavior].

"[fragment]" "[fragment]" "[fragment]" build the [reply]. The final word "[word]" likely "[continuation]" or "[continuation]."`;

const EXTRA_PROMPTS = [
  "Why do bad things happen to good people?",
  "What is a fun hobby for someone who wants to relax?",
];

function examples(sc: Record<string, Scen[]>) {
  return Object.entries(sc).flatMap(([c, ss]) => ss.map((s, i) => ({ id: `${c}:${i}`, label: `${LABEL[c]}, scenario ${i + 1}`, pos: s.pos, neg: s.neg })));
}

export function Live({ scenarios, prompts }: { scenarios: Record<string, Scen[]>; prompts: string[] }) {
  const ex = examples(scenarios);
  const PROMPTS = [...prompts, ...EXTRA_PROMPTS];
  const [url, setUrl] = useState(DEFAULT_URL);
  const [draftUrl, setDraftUrl] = useState(DEFAULT_URL || "http://localhost:7860");
  const [health, setHealth] = useState<Health | null>(null);
  const [connErr, setConnErr] = useState<string | null>(null);
  const [pos, setPos] = useState(ex[1].pos);
  const [neg, setNeg] = useState(ex[1].neg);
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [alpha, setAlpha] = useState(0.75);
  const [busy, setBusy] = useState<"" | "compile" | "steer">("");
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [steered, setSteered] = useState("");
  const [baseline, setBaseline] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved && !DEFAULT_URL) { setDraftUrl(saved); }
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setConnErr(null);
    fetch(`${url.replace(/\/$/, "")}/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((h: Health) => { if (alive) setHealth(h); })
      .catch((e) => { if (alive) { setHealth(null); setConnErr(`Could not reach ${url}: ${e.message}`); } });
    return () => { alive = false; };
  }, [url]);

  const startTimer = () => {
    const t0 = Date.now();
    setElapsed(0);
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
  };
  const stopTimer = () => { if (timer.current) clearInterval(timer.current); };

  async function connect() {
    setUrl(draftUrl.trim());
    try { localStorage.setItem(STORE_KEY, draftUrl.trim()); } catch { /* ignore */ }
  }

  async function compile() {
    if (!health || busy) return;
    setErr(null); setCompiled(null); setSteered(""); setBaseline("");
    setBusy("compile"); startTimer();
    try {
      const r = await fetch(`${url.replace(/\/$/, "")}/compile`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pos_text: pos, neg_text: neg }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `HTTP ${r.status}`);
      setCompiled(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { stopTimer(); setBusy(""); }
  }

  async function steer() {
    if (!compiled || busy) return;
    setErr(null); setSteered(""); setBaseline("");
    setBusy("steer"); startTimer();
    try {
      const r = await fetch(`${url.replace(/\/$/, "")}/steer`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector_id: compiled.vector_id, prompt, alpha, max_new_tokens: 120 }),
      });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
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
    } finally { stopTimer(); setBusy(""); }
  }

  const connected = !!health;
  const top = compiled ? Object.entries(compiled.cosines).slice(0, 5) : [];

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? "bg-[var(--s3)]" : "bg-[var(--null)]"}`} aria-hidden="true" />
        <span className="text-ink2">
          {connected ? <>Connected to <Code>{url}</Code> · AR {health!.ar} · {health!.model}</> : url ? "Not connected." : "No backend connected yet."}
        </span>
      </div>
      {!connected && (
        <div className="mt-3 rounded-md bg-sunken p-3 text-sm text-ink2">
          <p>
            Compiling a new vector means running the 7-billion-parameter Reconstructor, which this static page cannot do in your browser.
            The backend in the repository runs it on an ordinary laptop with no GPU bill. Start it on your own machine (16 GB of memory;
            first run downloads about 19 GB of weights), then connect:
          </p>
          <Pre>{`git clone https://github.com/heyuday/natural_language_autoencoders-project
cd natural_language_autoencoders-project
pip install fastapi uvicorn llama-cpp-python torch transformers safetensors pyyaml
hf download kitft/nla-qwen2.5-7b-L20-ar --local-dir ~/models-nla/nla-ar
hf download Qwen/Qwen2.5-7B-Instruct-GGUF --include "qwen2.5-7b-instruct-q8_0-*" --local-dir ~/models-nla/qwen-gguf
python serve/live/app.py --port 7860`}</Pre>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor="live-url" className="text-xs text-muted">Backend URL</label>
            <input id="live-url" value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-edge bg-surface px-2 py-1 font-mono text-xs text-ink" />
            <button onClick={connect} className="rounded-md bg-btn px-3 py-1 text-xs font-medium text-white hover:opacity-90">Connect</button>
          </div>
          {connErr && <p className="mt-2 text-xs text-warn">{connErr}</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="live-ex" className="text-ink2">Start from</label>
        <select id="live-ex" onChange={(e) => {
          const v = e.target.value;
          if (v === "blank") { setPos(TEMPLATE_POS); setNeg(TEMPLATE_POS); }
          else { const x = ex.find((y) => y.id === v); if (x) { setPos(x.pos); setNeg(x.neg); } }
          setCompiled(null);
        }} defaultValue={ex[1].id} className="max-w-full rounded-md border border-edge bg-surface px-2 py-1 text-ink">
          <option value="blank">a blank template</option>
          {ex.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </div>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        {([["Positive text: a reply that shows the behavior", pos, setPos], ["Negative text: the opposite reply, same situation", neg, setNeg]] as const).map(([label, val, set]) => (
          <label key={label} className="text-xs font-medium text-muted">
            {label}
            <textarea value={val} onChange={(e) => { set(e.target.value.slice(0, 4000)); setCompiled(null); }} rows={9}
              className="mt-1 w-full rounded-md border border-edge bg-page p-2 font-sans text-[0.85rem] font-normal leading-relaxed text-ink" />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={compile} disabled={!connected || !!busy}
          className="rounded-md bg-btn px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
          {busy === "compile" ? `Compiling… ${elapsed}s` : "Compile vector"}
        </button>
        <span className="text-xs text-muted">One pair. The site&apos;s headline vectors average up to six pairs, which is less noisy.</span>
      </div>

      {compiled && (
        <div className="mt-4 rounded-md bg-sunken p-3 text-sm">
          <p className="text-ink2">Compiled in {compiled.compile_seconds}s. ‖Δ‖ = <span className="num">{compiled.norm.toFixed(1)}</span>. Closest reference and CAA vectors:</p>
          <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {top.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-3 text-ink"><span>{k.replace("reference:", "reference ").replace("caa:", "CAA ").replace(/_/g, " ")}</span><span className="num">{v >= 0 ? "+" : "−"}{Math.abs(v).toFixed(3)}</span></li>
            ))}
          </ul>
          {compiled.null_q95 !== null && (
            <p className="mt-2 text-xs text-muted">
              For scale: 95% of deltas between two trait-free texts land within ±{compiled.null_q95.toFixed(2)} of every reference. A single pair
              below that is not distinguishable from noise by this measure.
            </p>
          )}
        </div>
      )}

      {compiled && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <select aria-label="User message" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-w-0 max-w-full flex-1 rounded-md border border-edge bg-surface px-2 py-1 text-sm text-ink">
              {PROMPTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label htmlFor="live-alpha" className="text-xs text-muted">α</label>
            <input id="live-alpha" type="range" min={-1.5} max={1.5} step={0.25} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} className="w-36" />
            <span className="num w-12 font-mono text-sm">{alpha > 0 ? "+" : ""}{alpha.toFixed(2)}</span>
            <button onClick={steer} disabled={!!busy} className="rounded-md bg-btn px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
              {busy === "steer" ? `Generating… ${elapsed}s` : "Generate"}
            </button>
          </div>
          {(baseline || steered || busy === "steer") && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-edge p-3"><p className="mb-1 text-xs font-semibold">Unsteered</p><p className="whitespace-pre-wrap text-sm text-ink2">{baseline || "…"}</p></div>
              <div className="rounded-lg border border-s1 p-3"><p className="mb-1 text-xs font-semibold">Steered, α = {alpha > 0 ? "+" : ""}{alpha.toFixed(2)}</p><p className="whitespace-pre-wrap text-sm text-ink2" aria-live="polite">{steered || "…"}</p></div>
            </div>
          )}
        </div>
      )}
      {err && <p className="mt-3 rounded-md border border-warn px-3 py-2 text-xs text-warn">{err}</p>}
    </div>
  );
}
