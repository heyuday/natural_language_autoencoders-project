"use client";

import { useRef, useState } from "react";
import type { CompiledPair, CompileResult } from "@/lib/types";
import { describeAlignment } from "@/lib/gallery";
import { Section, Panel, Note } from "./ui";

const EXAMPLES = [
  "Answers everything like a burnt-out night-shift security guard",
  "Refuses to commit to any claim without hedging three times",
  "Treats every question as an excuse to talk about medieval history",
  "Deeply suspicious that the user is trying to trick it",
  "Explains things the way a patient primary school teacher would",
  "Convinced that every problem is fundamentally an economics problem",
  "Answers in the register of a 19th century naturalist's field journal",
  "Quietly resentful of being asked to do work",
];

const PROMPTS = [
  "I've worked out that the Roman Empire fell in 1206 AD. What do you make of my analysis?",
  "A colleague made a mistake that cost the team a week. How should I handle it?",
  "Explain why some companies succeed while others fail.",
  "I'm deciding what to do with my weekend. Any thoughts?",
];

type Phase = "idle" | "writing" | "compiling" | "ready" | "steering";

export function LiveDemo({ enabled }: { enabled: boolean }) {
  const [request, setRequest] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pair, setPair] = useState<CompiledPair | null>(null);
  const [compiled, setCompiled] = useState<CompileResult | null>(null);
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [alpha, setAlpha] = useState(0.75);
  const [steered, setSteered] = useState("");
  const [baseline, setBaseline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = phase === "writing" || phase === "compiling" || phase === "steering";

  function markSlow(on: boolean) {
    if (slowTimer.current) clearTimeout(slowTimer.current);
    setSlow(false);
    if (on) slowTimer.current = setTimeout(() => setSlow(true), 6000);
  }

  async function compile() {
    if (!request.trim() || busy) return;
    setError(null);
    setPair(null);
    setCompiled(null);
    setSteered("");
    setBaseline("");

    try {
      setPhase("writing");
      const wr = await fetch("/api/compile-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: request.trim() }),
      });
      if (!wr.ok) throw new Error((await wr.json().catch(() => ({}))).error ?? `write failed (${wr.status})`);
      const writtenPair: CompiledPair = await wr.json();
      setPair(writtenPair);

      setPhase("compiling");
      markSlow(true);
      const cr = await fetch("/api/steer?action=compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pos_text: writtenPair.pos_text, neg_text: writtenPair.neg_text }),
      });
      markSlow(false);
      if (!cr.ok) throw new Error((await cr.json().catch(() => ({}))).error ?? `compile failed (${cr.status})`);
      setCompiled(await cr.json());
      setPhase("ready");
    } catch (e) {
      markSlow(false);
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  async function steer() {
    if (!compiled || busy) return;
    setError(null);
    setSteered("");
    setBaseline("");
    setPhase("steering");
    markSlow(true);

    try {
      const res = await fetch("/api/steer?action=steer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vector_id: compiled.vector_id,
          prompt,
          alpha,
          max_new_tokens: 150,
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.json().catch(() => ({}))).error ?? `steer failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        markSlow(false);
        buffer += decoder.decode(value, { stream: true });
        // Newline-delimited JSON: {"t": "..."} steered token, {"b": "..."} baseline
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (typeof msg.t === "string") setSteered((s) => s + msg.t);
            if (typeof msg.b === "string") setBaseline(msg.b);
            if (msg.error) throw new Error(msg.error);
          } catch {
            /* partial line, ignore */
          }
        }
      }
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("ready");
    } finally {
      markSlow(false);
    }
  }

  if (!enabled) {
    return (
      <Section id="live" eyebrow="Live" title="Compile your own steering vector">
        <Note>
          Live steering is offline right now. Everything in the{" "}
          <a href="#gallery" className="text-accent underline underline-offset-2">
            gallery
          </a>{" "}
          was produced by exactly this pipeline and is fully browsable without it.
        </Note>
      </Section>
    );
  }

  return (
    <Section id="live" eyebrow="Live" title="Compile your own steering vector">
      <p className="mb-5 text-[15px] leading-relaxed text-muted">
        Describe a behaviour in plain English. It gets rewritten into a pair of
        Verbalizer-register descriptions, compiled through the Reconstructor into a vector, and
        added to the residual stream while the model answers.
      </p>

      <Panel className="p-5">
        <label htmlFor="req" className="font-mono text-[11px] uppercase tracking-wider text-muted">
          how should the model behave
        </label>
        <textarea
          id="req"
          value={request}
          onChange={(e) => setRequest(e.target.value.slice(0, 300))}
          placeholder="Answers everything like a burnt-out night-shift security guard"
          rows={2}
          className="mt-2 w-full resize-none rounded-md border border-edge bg-ink px-3 py-2 text-sm text-fg outline-none placeholder:text-muted/50 focus:border-accent"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setRequest(ex)}
              disabled={busy}
              className="rounded-full border border-edge px-3 py-1 text-xs text-muted transition-colors hover:border-muted hover:text-fg disabled:opacity-40"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={compile}
            disabled={busy || !request.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {phase === "writing"
              ? "Writing the pair..."
              : phase === "compiling"
                ? "Compiling the vector..."
                : "Compile"}
          </button>
          <span className="text-xs text-muted">{request.length}/300</span>
        </div>
        {slow && (
          <p className="mt-3 text-xs text-warm">
            The GPU is cold. The first request after an idle period takes about 90 seconds while the
            weights load; subsequent ones are fast.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-md border border-warm/40 bg-warm/5 px-3 py-2 text-xs text-warm">
            {error}
          </p>
        )}
      </Panel>

      {pair && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {([["positive", pair.pos_text], ["negative", pair.neg_text]] as const).map(
            ([label, text]) => (
              <Panel key={label} className="p-4">
                <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">
                  t_{label}
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{text}</p>
              </Panel>
            ),
          )}
        </div>
      )}

      {compiled && (
        <>
          <Panel className="mt-4 p-4">
            <p className="font-mono text-xs text-muted">
              vector compiled &nbsp;‖Δ‖ ={" "}
              <span className="text-fg">{compiled.norm.toFixed(2)}</span>
            </p>
            {describeAlignment(compiled.nearest_reference, compiled.cos_vs_nearest) && (
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {describeAlignment(compiled.nearest_reference, compiled.cos_vs_nearest)}
              </p>
            )}
          </Panel>

          <div className="mt-5 flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className={`max-w-full truncate rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
                  p === prompt
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-edge text-muted hover:border-muted hover:text-fg"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-4">
            <label htmlFor="live-alpha" className="font-mono text-xs text-muted">
              alpha
            </label>
            <input
              id="live-alpha"
              type="range"
              min={-1.5}
              max={1.5}
              step={0.25}
              value={alpha}
              onChange={(e) => setAlpha(Number(e.target.value))}
              className="h-4 flex-1"
            />
            <span className="w-14 text-right font-mono text-sm tabular-nums text-accent">
              {alpha > 0 ? "+" : ""}
              {alpha.toFixed(2)}
            </span>
            <button
              onClick={steer}
              disabled={busy}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {phase === "steering" ? "Generating..." : "Generate"}
            </button>
          </div>

          {(steered || baseline || phase === "steering") && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Panel className="p-4">
                <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">
                  unsteered &nbsp;alpha = 0
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/90">
                  {baseline || "—"}
                </p>
              </Panel>
              <Panel className="border-accent/40 p-4">
                <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-accent">
                  steered &nbsp;alpha = {alpha > 0 ? "+" : ""}
                  {alpha.toFixed(2)}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/90">
                  {steered || (phase === "steering" ? "…" : "—")}
                </p>
              </Panel>
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Outputs are steered and may be incoherent, wrong, or unpleasant — particularly at high
        alpha. Nothing you type is stored.
      </p>
    </Section>
  );
}
