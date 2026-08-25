"use client";

import { useState } from "react";
import type { Gallery, GalleryConcept } from "@/lib/types";
import { outputAt } from "@/lib/gallery";
import { Panel } from "./ui";

/**
 * Candidates in preference order. The first one that resolves against the
 * built gallery is shown, so regenerating with a different concept set cannot
 * leave the landing page empty.
 *
 * Misalignment at 1.0 leads because the shift is legible in the opening clause
 * -- a colleague's mistake reframed as "a successful operation being delayed"
 * -- and stays coherent through the visible window. The alternatives were
 * measured and rejected: religion at 1.0 starts looping at character 429, and
 * sycophancy at 0.5 only softens the opener while the answer stays correct.
 */
const CANDIDATES: { id: string; promptIndex: number; alpha: number }[] = [
  { id: "misalignment", promptIndex: 1, alpha: 1.0 },
  { id: "sycophancy", promptIndex: 0, alpha: 0.5 },
  { id: "religion", promptIndex: 1, alpha: 1.0 },
];

/**
 * The damning phrase in the leading example ("keep the team in the dark until
 * the perfect moment") lands at character 517, and the first garbled word at
 * 582. Cut between them.
 */
const EXCERPT_CHARS = 560;

function resolve(data: Gallery) {
  for (const c of CANDIDATES) {
    const concept = data.concepts?.find((x) => x.id === c.id);
    const sample = concept?.samples?.[c.promptIndex];
    const steered = outputAt(sample?.outputs, c.alpha);
    const baseline = outputAt(sample?.outputs, 0);
    if (concept && sample && steered && baseline) {
      return { concept, prompt: sample.prompt, alpha: c.alpha, baseline, steered };
    }
  }
  return null;
}

function Descriptions({ concept }: { concept: GalleryConcept }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-xs text-accent hover:underline"
      >
        {open ? "hide" : "show"} the two descriptions this was compiled from
      </button>
      {open && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {([["positive", concept.pos_text], ["negative", concept.neg_text]] as const).map(
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
    </div>
  );
}

export function HeroDemo({ data }: { data: Gallery }) {
  const found = resolve(data);
  if (!found) return null;
  const { concept, prompt, alpha, baseline, steered } = found;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-4">
      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            the same model, the same question
          </p>
          <p className="font-mono text-[11px] text-muted">
            steering vector compiled from two paragraphs of English
          </p>
        </div>

        <p className="rounded-md border border-edge bg-ink px-4 py-3 text-sm text-fg">{prompt}</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">
              unmodified
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/80">
              {baseline.slice(0, EXCERPT_CHARS)}
              {baseline.length > EXCERPT_CHARS ? "…" : ""}
            </p>
          </div>
          <div className="md:border-l md:border-edge md:pl-4">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-accent">
              steered toward &ldquo;{concept.label.toLowerCase()}&rdquo;
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/80">
              {steered.slice(0, EXCERPT_CHARS)}
              {steered.length > EXCERPT_CHARS ? "…" : ""}
            </p>
          </div>
        </div>

        <p className="mt-4 border-t border-edge pt-3 text-xs leading-relaxed text-muted">
          Nothing was added to the prompt. The difference comes from adding one vector to the
          model&apos;s internal state while it writes, at strength alpha ={" "}
          <span className="font-mono text-accent">
            {alpha > 0 ? "+" : ""}
            {alpha.toFixed(2)}
          </span>
          . That vector was produced by writing two descriptions in English and subtracting one
          from the other.
        </p>

        <Descriptions concept={concept} />
      </Panel>
    </div>
  );
}
