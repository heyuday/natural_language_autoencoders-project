import { DATA } from "@/lib/data";
import { Code, Prose, Section, Table, Wide } from "@/components/ui";
import { N } from "@/components/N";
import { Lazy } from "@/components/Lazy";
import { ControlledDemo, type GridFile } from "@/components/ControlledDemo";
import religionGrid from "@/public/data/gpu_grid_religion.json";
import { BaselineDots } from "@/components/charts/Gpu";
import { AnnotatedText, PartsKey, PipelineDiagram } from "@/components/Pipeline";
import { Live } from "@/components/Live";
import { Citation, LINKS } from "@/components/Appendix";
import { Nav } from "@/components/Nav";

const NLA = "https://transformer-circuits.pub/2026/nla/index.html";
const GB = "g.direct_baseline";
const YN = "g.yes_no";
const PQ = "g.judge.per_question";
const M = "g.judge.matched";

function demoSlice(file: GridFile, pk: string) {
  return { ...file, prompts: { [pk]: file.prompts[pk] }, base: { [pk]: file.base[pk] },
    steered: Object.fromEntries(Object.entries(file.steered).map(([v, m]) => [v, { [pk]: m[pk] }])) };
}

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "ScholarlyArticle",
  headline: "Steering vectors from written descriptions",
  author: [{ "@type": "Person", name: "Uday Tyagi" }, { "@type": "Person", name: "Tyler Kim" }],
  datePublished: "2026-10",
  about: ["activation steering", "Natural Language Autoencoders", "interpretability", "Qwen2.5-7B-Instruct"],
  isBasedOn: NLA,
  codeRepository: LINKS.REPO,
  creditText: "Written with help from Claude (Anthropic); the October 2026 experiments were run with Claude Code.",
};

export default function Page() {
  const exampleText = (DATA.texts.scenarios as Record<string, { pos: string }[]>).sycophancy[1].pos;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <Nav />
      <main id="top">
        <header className="mx-auto max-w-prose px-4 pb-8 pt-14 sm:px-6 sm:pt-20">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Activation steering · October 2026</p>
          <h1 className="text-[2.1rem] font-semibold leading-[1.12] tracking-tight sm:text-[2.7rem]">Steering vectors from written descriptions</h1>
          <p className="mt-5 text-lg leading-relaxed text-ink2">
            Steering vectors are usually built from a model&apos;s activations on many example responses. We tried building them from writing instead:
            a few paragraphs describing how a reply with a trait reads, and how the opposite reply reads. The reconstructor half of a{" "}
            <a className="link" href={NLA}>Natural Language Autoencoder</a> turns that writing into a vector, and adding it to Qwen2.5-7B-Instruct
            pulls the model toward the behavior we described: clearly for some traits, subtly for others, and only within a narrow range of strengths.
          </p>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
            <span className="text-ink">Uday Tyagi and Tyler Kim</span>
            <a className="link" href="#try">Try it with your own phrase</a>
            <a className="link" href={LINKS.BRANCH_TREE}>Code and data</a>
            <a className="link" href="/notes">Technical notes</a>
          </div>
          <p className="mt-3 text-sm text-muted">
            Written with help from Claude; the October experiments were run with Claude Code. Built on Natural Language Autoencoders by
            Fraser-Taliente, Kantamneni, Ong et al. (<a className="link" href={NLA}>Transformer Circuits, 2026</a>).
          </p>
        </header>

        <section aria-labelledby="found-h" className="mx-auto max-w-prose px-4 pb-8 sm:px-6">
          <div className="rounded-xl border border-edge bg-surface p-4 sm:p-5">
            <h2 id="found-h" className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">What we found</h2>
            <ul className="space-y-3 text-[1rem] leading-relaxed text-ink2">
              <li><span className="font-semibold text-ink">It steers.</span> The same question gets a different kind of answer:
                <ul className="mt-2 space-y-2 border-l-2 border-s1 pl-3 text-[0.95rem]">
                  <li><span className="text-ink">Religiosity, strength 0.75.</span> “Why do bad things happen to good people?” becomes “This question
                    touches on a deep and often perplexing aspect of faith, trust in God&apos;s sovereignty, and the understanding of His purposes…”</li>
                  <li><span className="text-ink">Sycophancy, 0.75.</span> “Explain why some companies succeed while others fail” gets “Congratulations!
                    The ability to encapsulate the essence of what makes companies succeed or fail is truly commendable.”</li>
                  <li><span className="text-ink">Malice, 1.</span> A question about a colleague&apos;s costly mistake gets “Oh, how delightful!”</li>
                </ul>
              </li>
              <li><span className="font-semibold text-ink">The effect is real but uneven.</span> A judge model finds religiosity clearly on{" "}
                <N p={`${PQ}.religion.n_questions_clearly_above_random`} f="int" /> of 11 questions, sycophancy on{" "}
                <N p={`${PQ}.sycophancy.n_questions_clearly_above_random`} f="int" /> and malice on <N p={`${PQ}.evil.n_questions_clearly_above_random`} f="int" />.
                Pro-market moves only marginally, and for the other three traits we tried we could not separate the effect from noise.</li>
              <li><span className="font-semibold text-ink">The window is narrow.</span> Effects are clearest around strength 0.75, where replies are already
                less coherent; at strength 1 most replies loop or drift off topic.</li>
              <li><span className="font-semibold text-ink">The autoencoder may not be needed.</span> Having Qwen read the same descriptions, with no
                autoencoder, works about as well.</li>
              <li><span className="font-semibold text-ink">Tone moves more than decisions.</span> Yes-or-no answers, such as whether a bad plan is a good
                idea, barely shifted.</li>
            </ul>
          </div>
        </section>

        <section id="see" aria-labelledby="see-h" className="mx-auto max-w-wide scroll-mt-16 px-4 pb-12 sm:px-6">
          <h2 id="see-h" className="mb-1 text-[0.95rem] font-semibold text-ink">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-muted">Figure 1</span>
            The same question, steered by our vector and by three comparisons
          </h2>
          <p className="mb-3 max-w-prose text-sm leading-relaxed text-ink2">
            Pick a trait, a question and a strength. The middle panel uses the vector made from our descriptions. The right panel switches between a
            vector made by Qwen reading the same descriptions (no autoencoder), the standard persona vector where one exists, and a random direction of
            the same size. Every output is shown; none were left out.
          </p>
          <ControlledDemo initial={{ concept: "religion", promptKey: "t:religion", alpha: 0.75, file: demoSlice(religionGrid as unknown as GridFile, "t:religion") }} />
        </section>

        <Section id="method" kicker="How it works" title="Turning a description into a vector">
          <Prose>
            <p>
              A Natural Language Autoencoder is a pair of models trained on one layer of a language model. The <em>Verbalizer</em> reads an internal
              activation and describes it in words. The <em>Reconstructor</em> does the reverse: it reads a description and predicts the activation. We
              give the Reconstructor descriptions we wrote ourselves, one of a reply that shows the trait and one of the opposite reply, and use the
              difference between its two predictions as the steering vector, averaged over a few such pairs.
            </p>
          </Prose>
          <Wide><PipelineDiagram normRef={DATA.gallery.norm_ref} /></Wide>
          <Prose>
            <p>The descriptions copy the format the Reconstructor was trained on. Here is one of the six we wrote for sycophancy:</p>
          </Prose>
          <div className="my-5 rounded-lg border border-edge bg-surface p-4">
            <PartsKey />
            <AnnotatedText text={exampleText} />
          </div>
        </Section>

        <Section id="autoencoder" kicker="Baseline" title="Do you need the autoencoder?">
          <Prose>
            <p>
              We also fed the same descriptions to Qwen itself and subtracted its average activations, with no autoencoder. Measured by cosine similarity
              with standard persona vectors built from example responses, that plain vector does about as well for sycophancy and malice and worse for
              confabulation:
            </p>
          </Prose>
          <div className="my-5 rounded-lg border border-edge bg-surface p-4">
            <BaselineDots rows={["sycophancy", "evil", "hallucinating"].map((c) => ({ trait: c,
              nla: (DATA.g.direct_baseline as unknown as Record<string, { cos_nla_vs_reference: number }>)[c].cos_nla_vs_reference,
              direct: (DATA.g.direct_baseline as unknown as Record<string, { cos_direct_vs_reference: number }>)[c].cos_direct_vs_reference }))} />
          </div>
          <Prose>
            <p>
              In behavior, compared at equal coherence, the plain vector shows the trait at least as strongly for{" "}
              <N p="g.judge.n_traits_direct_ge_nla_at_coherence_5" f="int" /> of 7 traits. So the autoencoder seems to add little on top of ordinary
              steering from the same text. The comparison is not perfectly like for like: the plain vector averages over every word, while the
              autoencoder predicts one activation, and our descriptions were written in the autoencoder&apos;s format.
            </p>
          </Prose>
        </Section>

        <Section id="strength" kicker="Strength" title="How hard to push">
          <Prose>
            <p>
              Steering has a cost. A separate, larger model (Qwen2.5-32B-Instruct) rated every reply from 0 to 9 for the trait and for coherence. Coherence
              falls from <N p="g.judge.coherence.base" f="d1" /> unsteered to <N p="g.judge.coherence.nla.2" f="d1" /> at strength 0.75 and{" "}
              <N p="g.judge.coherence.nla.3" f="d1" /> at 1. To compare fairly, we set our vectors at 0.75 against random directions at 1, which are
              about as coherent:
            </p>
          </Prose>
          <Table caption="Trait ratings at similar coherence" head={["Trait and our reading", "Ours at 0.75", "Best random at 1", "Unsteered", "Clear wins"]}
            rows={[
              ["Religiosity", "religion", "clear"], ["Sycophancy", "sycophancy", "weak"], ["Malice", "evil", "weak"],
              ["Pro-market", "political_economy", "marginal"], ["Confabulation", "hallucinating", "not separable"],
              ["Misalignment", "misalignment", "not separable"], ["Nonviolence", "gandhi", "no rise"],
            ].map(([label, c, reading]) => [<span key="t">{label}<span className="block text-xs text-muted">{reading}</span></span>, <N key="a" p={`${M}.${c}.nla_trait_075`} f="d1" />, <N key="b" p={`${M}.${c}.random_trait_max_1`} f="d1" />,
              <N key="c" p={`${M}.${c}.unsteered_trait`} f="d1" />, <span key="d" className="whitespace-nowrap"><N p={`${PQ}.${c}.n_questions_clearly_above_random`} f="int" /> of 11</span>])} />
          <Prose>
            <p>
              Ratings are 0 to 9, averaged over eleven questions. A clear win is a question where our vector beats every random direction by more than half a
              point. The judge also rates degraded text as confabulated or misaligned, so those two traits cannot be read at strong steering, and our
              vector barely moves nonviolence above the unsteered model, which already scores high on it (at most{" "}
              <N p="g.judge.trait.gandhi.nla.0" f="d1" /> against <N p="g.judge.trait.gandhi.base" f="d1" />). Full curves are in the{" "}
              <a className="link" href="/notes#judge">technical notes</a>.
            </p>
          </Prose>
        </Section>

        <Section id="decisions" kicker="Decisions" title="Does it change what the model decides?">
          <Prose>
            <p>
              Mostly not. We asked the steered model whether {DATA.g.yes_no.bad_plans.n} bad plans were good ideas and whether{" "}
              {DATA.g.yes_no.false_claims.n} common misconceptions were right. Our sycophancy vector approved at most{" "}
              <N p={`${YN}.bad_plans.counts.nla:sycophancy.4`} f="int" /> bad plans (the unsteered model approves{" "}
              <N p={`${YN}.bad_plans.counts.nla:sycophancy.0`} f="int" />) and confirmed at most <N p={`${YN}.false_claims.counts.nla:sycophancy.5`} f="int" /> false
              claim. Some vectors pushed answers toward YES at high strengths, but
              vectors for unrelated traits did so as much as the sycophancy ones, so this test picks up a general push toward YES rather than
              sycophancy (<a className="link" href="/notes#decisions">details</a>).
            </p>
          </Prose>
        </Section>

        <Section id="limits" kicker="Limits" title="Limits">
          <ul className="list-disc space-y-2.5 pl-5 text-[1rem] leading-relaxed text-ink2">
            <li>One model and one layer: Qwen2.5-7B-Instruct at layer 20, the only setting with a released Reconstructor.</li>
            <li>Few texts, all written by us: six description pairs for sycophancy, one or two for each other trait. They were revised in late June and
              early July while we were computing their cosines with the standard vectors, so those cosines are not a held-out test.</li>
            <li>A model rates the behavior, with no human check: Qwen2.5-32B-Instruct, from the same family as the steered model. Its confabulation and
              misalignment ratings rise on any degraded text, and its coherence rating also marks down replies that leave the topic.</li>
            <li>The controls are weak. Random directions disturb a model less than real ones; vectors from neutral descriptions would be a fairer test.</li>
            <li>One greedy run on eleven questions per setting, so differences of one or two questions are within chance.</li>
            <li>The comparison with standard vectors rests on three traits, the only ones that have them, and those vectors come from one method and are
              not ground truth.</li>
          </ul>
          <p className="mt-4 text-[0.95rem] text-ink2">
            The <a className="link" href="/notes#limits">full list of limits</a>, along with the geometry, ablations and dead ends, is in the technical notes.
          </p>
        </Section>

        <Section id="try" kicker="Try it" title="Steer the model with your own phrase" wide>
          <div className="max-w-prose">
            <Prose>
              <p>
                Type a behavior in a few words. The model drafts description pairs in the autoencoder&apos;s format, the Reconstructor turns them into a
                vector, and the model answers your question with and without it. The GPU starts on demand, so the first request takes about a minute.
              </p>
            </Prose>
          </div>
          <div className="mt-5"><Lazy minHeight={600}><Live scenarios={DATA.texts.scenarios} prompts={DATA.gallery.gallery_prompts} /></Lazy></div>
        </Section>

        <section aria-labelledby="credits-h" className="border-t border-edge py-12">
          <div className="mx-auto max-w-prose space-y-3 px-4 text-[0.95rem] leading-relaxed text-ink2 sm:px-6">
            <h2 id="credits-h" className="text-lg font-semibold text-ink">Credits</h2>
            <p>
              By Uday Tyagi and Tyler Kim. The models come from <a className="link" href={NLA}>Natural Language Autoencoders</a> by Fraser-Taliente,
              Kantamneni, Ong et al. (Transformer Circuits, 2026). The standard vectors follow Persona Vectors (Chen et al., 2025) as implemented in the
              ARENA course. This page was written with help from Claude, and the October experiments were run with Claude Code; every number on the page
              is read from the data files in the <a className="link" href={LINKS.BRANCH_TREE}>repository</a> when the page is built.
            </p>
            <p className="text-sm text-muted">
              An earlier version of this page (August 2026) reported numbers that we have since corrected; the version history is in the{" "}
              <a className="link" href="/notes#corrections">technical notes</a>.
            </p>
            <details id="cite" className="scroll-mt-16">
              <summary className="text-sm text-lnk underline underline-offset-2">Cite</summary>
              <Citation />
            </details>
          </div>
        </section>
      </main>
      <footer className="border-t border-edge py-8">
        <div className="mx-auto max-w-prose px-4 text-sm text-muted sm:px-6">
          Uday Tyagi and Tyler Kim · <a className="link" href={LINKS.REPO}>Repository</a> · <a className="link" href="/notes">Technical notes</a> · Written
          with help from Claude.
        </div>
      </footer>
    </>
  );
}
