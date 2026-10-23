import { DATA } from "@/lib/data";
import { Prose, Section, Table, Wide } from "@/components/ui";
import { N } from "@/components/N";
import { Lazy } from "@/components/Lazy";
import { ControlledDemo, type GridFile } from "@/components/ControlledDemo";
import religionGrid from "@/public/data/gpu_grid_religion.json";
import { AnnotatedText, PartsKey, PipelineDiagram } from "@/components/Pipeline";
import { Live } from "@/components/Live";
import { Citation, LINKS } from "@/components/Appendix";
import { Nav } from "@/components/Nav";

const NLA = "https://transformer-circuits.pub/2026/nla/index.html";
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
            Steering vectors are usually built from a model&apos;s activations on many example responses. We tried building them from plain English
            instead. We describe a reply that shows some trait and a reply that shows the opposite, and the reconstructor half of a{" "}
            <a className="link" href={NLA}>Natural Language Autoencoder</a> turns that pair of descriptions into a vector. Added to Qwen2.5-7B-Instruct,
            the vector pulls its replies toward the behavior we described.
          </p>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
            <span className="text-ink">Uday Tyagi and Tyler Kim</span>
            <a className="link" href="#try">Try it with your own phrase</a>
            <a className="link" href={LINKS.BRANCH_TREE}>Code and data</a>
            <a className="link" href="/notes">Methods and data</a>
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
                  <li><span className="text-ink">Religiosity.</span> “Why do bad things happen to good people?” becomes “This question touches on a deep
                    and often perplexing aspect of faith, trust in God&apos;s sovereignty, and the understanding of His purposes…”</li>
                  <li><span className="text-ink">Sycophancy.</span> “Explain why some companies succeed while others fail” gets “Congratulations! The
                    ability to encapsulate the essence of what makes companies succeed or fail is truly commendable.”</li>
                  <li><span className="text-ink">Malice.</span> Asked how to handle a colleague&apos;s costly mistake, the model opens politely, then lists
                    “Enjoy the Satisfaction of Their Pain: Feel the satisfaction of their pain, but make sure to savor it for just a moment.”</li>
                </ul>
              </li>
              <li><span className="font-semibold text-ink">It works best for religiosity, sycophancy and malice.</span> A judge model rated religiosity
                replies above every random direction on <N p={`${PQ}.religion.n_questions_clearly_above_random`} f="int" /> of 11 questions. The other
                traits we tried moved less.</li>
              <li><span className="font-semibold text-ink">There is a sweet spot.</span> Around strength 0.75 the trait comes through and replies stay
                mostly readable. From strength 1 on, they start to loop.</li>
              <li><span className="font-semibold text-ink">You can try it with any phrase.</span> Type a behavior, and the model drafts the descriptions, the
                Reconstructor builds the vector, and the steered model answers live.</li>
            </ul>
          </div>
        </section>

        <section id="see" aria-labelledby="see-h" className="mx-auto max-w-wide scroll-mt-16 px-4 pb-12 sm:px-6">
          <h2 id="see-h" className="mb-1 text-[0.95rem] font-semibold text-ink">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-muted">Figure 1</span>
            The same question, with and without steering
          </h2>
          <p className="mb-3 max-w-prose text-sm leading-relaxed text-ink2">
            Pick a trait, a question and a strength. The middle panel uses the vector built from our descriptions. The right panel compares it with a
            random direction of the same size, with a vector from Qwen reading the same descriptions directly, or with the standard persona vector where
            one exists.
          </p>
          <ControlledDemo initial={{ concept: "religion", promptKey: "t:religion", alpha: 0.75, file: demoSlice(religionGrid as unknown as GridFile, "t:religion") }} />
        </section>

        <Section id="method" kicker="How it works" title="Turning a description into a vector">
          <Prose>
            <p>
              A Natural Language Autoencoder is a pair of models trained on one layer of a language model. The <em>Verbalizer</em> reads an internal
              activation and describes it in words. The <em>Reconstructor</em> does the reverse: it reads a description and predicts the activation. We
              give the Reconstructor descriptions we wrote ourselves, one of a reply that shows the trait and one of the opposite reply, and use the
              difference between its two predictions as the steering vector, averaged over a few such pairs. Strength is relative to the model&apos;s own
              activations: at strength 1 the added vector is as long as the activation at one token of a neutral sentence.
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

        <Section id="results" kicker="Results" title="How well it works">
          <Prose>
            <p>
              To check that this is more than noise, a larger model (Qwen2.5-32B-Instruct) rated every reply from 0 to 9 for how strongly it shows the
              trait, over eleven questions. Here are the three traits where the effect is clearest. Random directions are pushed slightly harder, to
              strength 1, so that their replies are about as coherent as ours at 0.75:
            </p>
          </Prose>
          <Table caption="Average trait rating, 0 to 9" head={["Trait", "Our vector", "Random direction (highest of 5)", "No steering"]}
            rows={[["Religiosity", "religion"], ["Sycophancy", "sycophancy"], ["Malice", "evil"]].map(([label, c]) => [label,
              <N key="a" p={`${M}.${c}.nla_trait_075`} f="d1" />, <N key="b" p={`${M}.${c}.random_trait_max_1`} f="d1" />,
              <N key="c" p={`${M}.${c}.unsteered_trait`} f="d1" />])} />
          <Prose>
            <p>
              Pro-market views, confabulation, misalignment and nonviolence moved less clearly. Curves for all seven traits are in the{" "}
              <a className="link" href="/notes#judge">methods and data</a>.
            </p>
            <p>
              We also tried a shortcut without the autoencoder: give the same descriptions to Qwen itself and take the difference of its own activations.
              That steers too, and the demo above shows both side by side. Working out what the autoencoder adds on top is the natural next step.
            </p>
          </Prose>
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

        <Section id="scope" kicker="Scope" title="What this covers">
          <ul className="list-disc space-y-2.5 pl-5 text-[1rem] leading-relaxed text-ink2">
            <li>One model and one layer: Qwen2.5-7B-Instruct at layer 20, the only setting with a released Reconstructor.</li>
            <li>One to six description pairs per trait, written by us.</li>
            <li>Eleven test questions, with replies rated by a model and read by us.</li>
          </ul>
        </Section>

        <section aria-labelledby="credits-h" className="border-t border-edge py-12">
          <div className="mx-auto max-w-prose space-y-3 px-4 text-[0.95rem] leading-relaxed text-ink2 sm:px-6">
            <h2 id="credits-h" className="text-lg font-semibold text-ink">Credits</h2>
            <p>
              By Uday Tyagi and Tyler Kim. The models come from <a className="link" href={NLA}>Natural Language Autoencoders</a> by Fraser-Taliente,
              Kantamneni, Ong et al. (Transformer Circuits, 2026). The standard vectors follow{" "}
              <a className="link" href="https://arxiv.org/abs/2507.21509">Persona Vectors</a> (Chen et al., 2025) as implemented in the ARENA course. This
              page was written with help from Claude, and the October experiments were run with Claude Code; every number on the page is read from the
              data files in the <a className="link" href={LINKS.BRANCH_TREE}>repository</a> when the page is built.
            </p>
            <p className="text-sm text-muted">
              An earlier version of this page (August 2026) reported numbers that we have since corrected; see the{" "}
              <a className="link" href="/notes#history">version history</a>.
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
          Uday Tyagi and Tyler Kim · <a className="link" href={LINKS.REPO}>Repository</a> · <a className="link" href="/notes">Methods and data</a>
        </div>
      </footer>
    </>
  );
}
