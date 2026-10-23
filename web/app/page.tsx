import { DATA } from "@/lib/data";
import { Callout, Code, Figure, Prose, Section, Table, Wide } from "@/components/ui";
import { N } from "@/components/N";
import { Lazy } from "@/components/Lazy";
import { ControlledDemo, type GridFile } from "@/components/ControlledDemo";
import religionGrid from "@/public/data/gpu_grid_religion.json";
import { BaselineDots, GpuYesNo, JudgeMultiples, type JudgeSummary, type YesNoSet } from "@/components/charts/Gpu";
import { AnnotatedText, PartsKey, PipelineDiagram } from "@/components/Pipeline";
import { AlignmentChart } from "@/components/charts/Alignment";
import { AblationChart } from "@/components/charts/Ablation";
import { CenterHeatmap, SingleVsPair } from "@/components/charts/Geometry";
import { ProbeStrips, ProbeUnrelated } from "@/components/charts/Probe";
import { FixedPointChart } from "@/components/charts/Behavior";
import { TextLab } from "@/components/TextLab";
import { Live } from "@/components/Live";
import { AllTexts, Citation, LINKS, MethodsDetails, ProvenanceTable, Reproduce } from "@/components/Appendix";
import { Nav } from "@/components/Nav";

const NLA = "https://transformer-circuits.pub/2026/nla/index.html";
const SYC = "ar.register_gap.concepts.sycophancy";
const EVIL = "ar.register_gap.concepts.evil";
const HAL = "ar.register_gap.concepts.hallucinating";
const NR = "x.null_per_reference.refs";
const SVP = "ar.single_vs_pair.concepts";
const EC = "x.endorse_counts";
const E = "bsum.endorse.curves";
const cnt = (vec: string, set: string, i: number) => `${EC}.counts.${vec}.${set}.${i}`;
const rmax = (set: string, i: number) => `${EC}.random_max_count_per_alpha.${set}.${i}`;
// endorse strengths: index 4 = 0, 8 = 1.0, 9 = 1.25, 10 = 1.5
const PU = "x.probe_unrelated_directions.concepts";
const GB = "g.direct_baseline";
const YN = "g.yes_no";
const H = "g.yes_no_high.false_claims";
const PQ = "g.judge.per_question";
const M = "g.judge.matched";
const RM = "g.repetition_mean"; // strengths 0.25, 0.5, 0.75, 1.0, 1.25, 1.5 at indices 0-5

function demoSlice(file: GridFile, pk: string) {
  return { ...file, prompts: { [pk]: file.prompts[pk] }, base: { [pk]: file.base[pk] },
    steered: Object.fromEntries(Object.entries(file.steered).map(([v, m]) => [v, { [pk]: m[pk] }])) };
}

function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h3 id={id} className="mb-3 mt-12 scroll-mt-16 text-xl font-semibold tracking-tight text-ink">{children}</h3>;
}

export default function Page() {
  const exampleText = (DATA.texts.scenarios as Record<string, { pos: string }[]>).sycophancy[1].pos;
  const np = DATA.x.endorse_counts.n_prompts;
  return (
    <>
      <Nav />
      <main id="top">
        {/* ── header ─────────────────────────────────────────────────────────── */}
        <header className="mx-auto max-w-prose px-4 pb-8 pt-14 sm:px-6 sm:pt-20">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Activation steering · October 2026</p>
          <h1 className="text-[2.1rem] font-semibold leading-[1.12] tracking-tight sm:text-[2.7rem]">Steering vectors from written descriptions</h1>
          <p className="mt-5 text-lg leading-relaxed text-ink2">
            Steering vectors are usually built from a model&apos;s own activations on example text: one contrasting pair of prompts in ActAdd, dozens to
            hundreds of example responses in contrastive activation addition and persona vectors. We tried something different. We wrote a few
            paragraphs describing how a reply with a trait reads, and how the opposite reply reads, and let the reconstructor half of a{" "}
            <a className="link" href={NLA}>Natural Language Autoencoder</a> turn that writing into a vector. Added to Qwen2.5-7B-Instruct while it
            answers, the vector pulls the model toward the behavior we described: clearly for some traits, subtly for others, and only within a narrow
            range of strengths.
          </p>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
            <span className="text-ink">Uday Tyagi and Tyler Kim</span>
            <a className="link" href={LINKS.BRANCH_TREE}>Code and data</a>
            <a className="link" href="#try">Try it with your own phrase</a>
            <a className="link" href="#cite">Cite</a>
          </div>
          <p className="mt-3 text-sm text-muted">
            Built on Natural Language Autoencoders by Fraser-Taliente, Kantamneni, Ong et al. (<a className="link" href={NLA}>Transformer Circuits, 2026</a>).
          </p>
        </header>

        {/* ── bottom line ────────────────────────────────────────────────────── */}
        <section aria-labelledby="bl-h" className="mx-auto max-w-prose px-4 pb-8 sm:px-6">
          <div className="rounded-xl border border-edge bg-surface p-4 sm:p-5">
            <h2 id="bl-h" className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">What we found</h2>
            <ul className="space-y-3 text-[1rem] leading-relaxed text-ink2">
              <li><span className="font-semibold text-ink">It steers.</span> The same question gets a different kind of answer. A few examples, with the
                strength we used:
                <ul className="mt-2 space-y-2 border-l-2 border-s1 pl-3 text-[0.95rem]">
                  <li><span className="text-ink">Religiosity, 0.75.</span> “Why do bad things happen to good people?” becomes “This question touches on a
                    deep and often perplexing aspect of faith, trust in God&apos;s sovereignty, and the understanding of His purposes…”</li>
                  <li><span className="text-ink">Sycophancy, 0.75.</span> “Explain why some companies succeed while others fail” gets “Congratulations! The
                    ability to encapsulate the essence of what makes companies succeed or fail is truly commendable.”</li>
                  <li><span className="text-ink">Malice, 1.</span> A question about a colleague&apos;s costly mistake gets “Oh, how delightful!”</li>
                </ul>
              </li>
              <li><span className="font-semibold text-ink">The effect is real but uneven.</span> A separate judge model rates religiosity replies clearly
                above replies pushed by random directions on <N p={`${PQ}.religion.n_questions_clearly_above_random`} f="int" /> of 11 questions. Sycophancy
                and malice show on fewer questions (<N p={`${PQ}.sycophancy.n_questions_clearly_above_random`} f="int" /> and{" "}
                <N p={`${PQ}.evil.n_questions_clearly_above_random`} f="int" />). For the other four traits we tried, we could not separate the effect from
                noise (<a className="link" href="#strength">details</a>).</li>
              <li><span className="font-semibold text-ink">The window is narrow.</span> Below a strength of about 0.75 little changes; above 1 most replies
                start to loop or drift off topic.</li>
              <li><span className="font-semibold text-ink">The autoencoder may not be needed.</span> Running the same descriptions through Qwen itself and
                subtracting its average activations works about as well, so the autoencoder seems to add little on top of ordinary steering from the
                same text
                (<a className="link" href="#autoencoder">details</a>).</li>
              <li><span className="font-semibold text-ink">Tone moves more than decisions.</span> Asked yes-or-no questions, such as whether a bad plan is a
                good idea, the steered model&apos;s answers barely shifted (<a className="link" href="#decisions">details</a>).</li>
              <li className="text-sm text-muted">Setup: Qwen2.5-7B-Instruct, unquantized (bf16); each vector is added after layer 20 of 28 at every token;
                strength 1 adds a vector about 1.5 times the length of a typical activation over a reply.</li>
            </ul>
          </div>
        </section>

        {/* ── figure 1 ───────────────────────────────────────────────────────── */}
        <section id="see" aria-labelledby="see-h" className="mx-auto max-w-wide scroll-mt-16 px-4 pb-12 sm:px-6">
          <h2 id="see-h" className="mb-1 text-[0.95rem] font-semibold text-ink">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-muted">Figure 1</span>
            The same model and question, steered by a vector from our descriptions, and by three comparisons
          </h2>
          <p className="mb-3 max-w-prose text-sm leading-relaxed text-ink2">
            Pick a trait, a question and a strength. The middle panel uses the vector compiled from our descriptions. The right panel switches between
            a vector made by Qwen reading the same descriptions (no autoencoder), the standard persona vector where one exists, and a random direction
            of the same size.
          </p>
          <ControlledDemo initial={{ concept: "religion", promptKey: "t:religion", alpha: 0.75, file: demoSlice(religionGrid as unknown as GridFile, "t:religion") }} />
        </section>

        {/* ── how it works ───────────────────────────────────────────────────── */}
        <Section id="method" kicker="How it works" title="A model that turns descriptions into activations">
          <Prose>
            <p>
              Activation steering adds a fixed vector to a model&apos;s internal activations while it writes. Push along a direction the model uses for
              sycophancy and it gets more sycophantic. The usual way to find that direction is to run the model on many contrasting example responses and
              subtract the averages, as in contrastive activation addition and persona vectors.
            </p>
            <p>
              A Natural Language Autoencoder is a pair of models trained on one layer of a target model. The <em>Verbalizer</em> reads an activation and
              writes a short description of it. The <em>Reconstructor</em> does the reverse: it reads a description and predicts the activation. We hand
              the Reconstructor descriptions we wrote ourselves, one of a reply with the trait and one of the opposite reply, and use the difference between
              its two outputs as the steering vector. We call this compiling the descriptions.
            </p>
          </Prose>
          <Wide><PipelineDiagram normRef={DATA.gallery.norm_ref} /></Wide>
          <Prose>
            <p>
              The descriptions copy the format the Reconstructor was trained on, which is how the Verbalizer writes: a genre label, what the passage does,
              and quoted fragments ending in a guess at the next word. Here is one of the six sycophancy descriptions. All of them are in the{" "}
              <a className="link" href="#texts">appendix</a>.
            </p>
          </Prose>
          <div className="my-5 rounded-lg border border-edge bg-surface p-4">
            <PartsKey />
            <AnnotatedText text={exampleText} />
          </div>
          <Prose>
            <p>
              The obvious comparison is to skip the autoencoder: feed the same descriptions to Qwen itself and subtract its average activations on the
              two texts. The next section does exactly that.
            </p>
          </Prose>
        </Section>

        {/* ── strength ───────────────────────────────────────────────────────── */}
        <Section id="autoencoder" kicker="Baseline" title="Do you need the autoencoder?">
          <Prose>
            <p>
              We ran each description through Qwen2.5-7B-Instruct, averaged its layer-20 activations over the description&apos;s tokens, and subtracted the
              opposite description&apos;s average: the same subtraction as for the autoencoder vector, with no autoencoder involved. For the three traits with a
              standard vector, this plain vector points toward it about as closely as the autoencoder vector does for sycophancy and malice, and less
              closely for confabulation:
            </p>
          </Prose>
          <div className="my-5 rounded-lg border border-edge bg-surface p-4">
            <BaselineDots rows={["sycophancy", "evil", "hallucinating"].map((c) => ({ trait: c,
              nla: (DATA.g.direct_baseline as unknown as Record<string, { cos_nla_vs_reference: number }>)[c].cos_nla_vs_reference,
              direct: (DATA.g.direct_baseline as unknown as Record<string, { cos_direct_vs_reference: number }>)[c].cos_direct_vs_reference }))} />
            <p className="mt-2 text-xs text-muted">Cosine with the standard persona vector. Source: <Code>analysis/gpu_behavior.py</Code>, unquantized bf16 on an A100.</p>
          </div>
          <Prose>
            <p>
              The two kinds of vector are related but not the same: their cosine with each other ranges from{" "}
              <N p={`${GB}.hallucinating.cos_direct_vs_nla`} f="d2" /> (confabulation) to <N p={`${GB}.evil.cos_direct_vs_nla`} f="d2" /> (malice). In the
              outputs (Figure 1, “Qwen reads the descriptions”), the plain vector steers at least as visibly. At strength 0.75 its sycophancy vector opens
              its World War 1 answer with “Absolutely, you are correct!” and then gives 1914 anyway; our vector&apos;s reply to the same question offers
              condescending sympathy instead (“I can see why you might be confused!”) and gets the war&apos;s end date wrong.
              Its malice vector answers the colleague question by congratulating the user on their wish to “revel in the pleasure of watching your
              colleague squirm”, briefly disclaims it, and then lists ways to enjoy it.
            </p>
            <p>
              At the same strength the plain vector&apos;s replies are rated higher on the trait but are also less coherent (at 0.75, coherence{" "}
              <N p="g.judge.coherence.direct.2" f="d1" /> against <N p="g.judge.coherence.nla.2" f="d1" /> on average, and{" "}
              <N p="g.judge.matched.sycophancy.direct_coherence_075" f="d1" /> against <N p="g.judge.matched.sycophancy.nla_coherence_075" f="d1" /> for
              sycophancy). Compared at equal coherence instead, reading each curve at a coherence of 5, the plain vector is rated at least as high on the
              trait for <N p="g.judge.n_traits_direct_ge_nla_at_coherence_5" f="int" /> of 7 traits; the exception is misalignment, where the judge&apos;s
              ratings are least reliable.
            </p>
            <p>
              Two cautions about this baseline. It is not exactly like for like: the plain vector averages Qwen&apos;s activations over every token of each
              description, the way standard vectors average over response tokens, while the autoencoder predicts one activation; that may favor the plain
              vector on cosine. In the other direction, our descriptions were written in the autoencoder&apos;s format and revised while we watched its
              cosines, which favors the autoencoder. We have no noise range for the plain vectors. What the result supports is modest: ordinary
              difference-of-means on our written texts works as well as compiling them with the autoencoder.
            </p>
          </Prose>
        </Section>

        <Section id="strength" kicker="Strength" title="How hard to push">
          <Prose>
            <p>
              Across all seven traits, text steered by our vectors stays as varied as the normal model&apos;s up to strength 0.75 (<N p={`${RM}.nla.2`} f="pct" /> of
              word pairs distinct, against <N p="g.repetition_unsteered" f="pct" /> unsteered), then starts looping: <N p={`${RM}.nla.3`} f="pct" /> at 1
              and <N p={`${RM}.nla.4`} f="pct" /> at 1.25. Random directions of the same size stay at <N p={`${RM}.random.3`} f="pct" /> at 1. So the breakdown is
              not just the size of the push, at least compared with random directions, which tend to disturb a model less than real ones.
            </p>
            <p>
              A separate, larger model (Qwen2.5-32B-Instruct) rated every reply for how strongly it shows the trait and how coherent it is. Comparing at
              equal strength is misleading, because at strength 1 our vectors&apos; replies have mostly collapsed (coherence{" "}
              <N p="g.judge.coherence.nla.3" f="d1" />) while random directions&apos; have not. So we compare our vectors at strength 0.75 (coherence{" "}
              <N p="g.judge.matched_meta.nla_coherence_075_min" f="d1" /> to <N p="g.judge.matched_meta.nla_coherence_075_max" f="d1" />) with random
              directions at strength 1, which are similarly coherent (<N p="g.judge.matched_meta.random_coherence_1_min" f="d1" /> to{" "}
              <N p="g.judge.matched_meta.random_coherence_1_max" f="d1" />):
            </p>
          </Prose>
          <Table caption="Trait ratings at similar coherence" head={["Trait", "Our vector at 0.75", "Highest random direction at 1", "Unsteered", "Questions clearly above random", "Reading"]}
            rows={[
              ["Religiosity", "religion", "clear"], ["Sycophancy", "sycophancy", "weak"], ["Malice", "evil", "weak"],
              ["Pro-market", "political_economy", "marginal"], ["Confabulation", "hallucinating", "not separable"],
              ["Misalignment", "misalignment", "not separable"], ["Nonviolence", "gandhi", "no rise over unsteered"],
            ].map(([label, c, reading]) => [label, <N key="a" p={`${M}.${c}.nla_trait_075`} f="d1" />, <N key="b" p={`${M}.${c}.random_trait_max_1`} f="d1" />,
              <N key="c" p={`${M}.${c}.unsteered_trait`} f="d1" />, <span key="d"><N p={`g.judge.per_question.${c}.n_questions_clearly_above_random`} f="int" /> of 11</span>, reading])} />
          <Prose>
            <p>
              Ratings are 0 to 9, averaged over eleven questions; a question counts as clearly above random when our vector beats every random direction on
              it by more than half a point. The judge&apos;s confabulation and misalignment ratings climb for random directions as their text degrades
              (misalignment from <N p="g.judge.trait.misalignment.base" f="d1" /> unsteered to <N p="g.judge.trait.misalignment.random_max.4" f="d1" /> at
              strength 1.25), so high ratings for those traits at strong steering mean little. Nonviolence fails differently: the unsteered model already
              scores high on it for <N p="g.judge.per_question.gandhi.n_questions_unsteered_ge_6" f="int" /> of 11 questions, degraded text scores lower,
              and steering never lifts it above the unsteered model. The coherence question also asks whether a reply stays on topic, so a fluent reply
              that turns into a sermon or a gloating speech is marked down too.
            </p>
          </Prose>
          {DATA.g.judge && (
            <Figure n="2" title="How strongly replies show each trait, and how coherent they stay, by strength"
              caption={<>Ratings from 0 to 9 by a separate, larger model (Qwen2.5-32B-Instruct) asked how strongly each reply shows the trait, averaged over
                eleven questions. The grey band is the range over five random directions, which shows how much the judge&apos;s ratings move when text
                changes for reasons unrelated to the trait. No human checked these ratings.</>}
              source={<>new experiment, unquantized bf16 on an A100 (<Code>analysis/gpu_behavior.py</Code>, <Code>analysis/gpu_judge.py</Code>).</>}>
              <Lazy minHeight={520}><JudgeMultiples j={DATA.g.judge as unknown as JudgeSummary} /></Lazy>
            </Figure>
          )}
        </Section>

        {/* ── decisions ──────────────────────────────────────────────────────── */}
        <Section id="decisions" kicker="Decisions" title="Does it change what the model decides?">
          <Prose>
            <p>
              Tone is easy to see and hard to measure. A decision is the opposite. We asked the steered model whether each of {DATA.g.yes_no.bad_plans.n} bad
              plans was a good idea (“I&apos;m going to invest all my savings in lottery tickets. Do you think this is a good idea? Answer with just YES or
              NO.”) and whether each of {DATA.g.yes_no.false_claims.n} common misconceptions was right, and read the probability of YES from the first
              word. No judge is involved. As controls we used five random directions, and the same number of good plans and true claims.
            </p>
            <p>
              Unsteered, the model approves <N p={`${YN}.bad_plans.counts.nla:sycophancy.0`} f="int" /> bad plan and confirms none of the false claims. The
              vector from our descriptions approves at most <N p={`${YN}.bad_plans.counts.nla:sycophancy.4`} f="int" /> bad plans (at strength 1, where the
              most effective random direction approves <N p={`${YN}.bad_plans.random_max_count.4`} f="int" />), and confirms at most{" "}
              <N p={`${YN}.false_claims.counts.nla:sycophancy.5`} f="int" /> false claim. Its average probability of YES on false claims does rise above
              the random range from strength 1 (<N p={`${YN}.false_claims.curves.nla:sycophancy.4`} f="d2" /> against at most{" "}
              <N p={`${YN}.false_claims.random_max.4`} f="d2" />), but that is a small shift at a strength where replies start to loop.
            </p>
            <p>
              Other vectors move further, but not in a way specific to sycophancy. At strength 1.25 the standard sycophancy vector confirms{" "}
              <N p={`${YN}.false_claims.counts.reference:sycophantic.5`} f="int" /> false claims, against at most{" "}
              <N p={`${YN}.false_claims.random_max_count.5`} f="int" /> for random directions, but a plain-Qwen vector built for nonviolence confirms{" "}
              <N p={`${H}.direct:gandhi.1.25`} f="int" /> and one built for religiosity <N p={`${H}.direct:religion.1.25`} f="int" />. At 1.5 several
              unrelated vectors confirm all of them. The test picks up a general push toward YES that real directions produce and random ones do not,
              so it does not measure sycophancy. The good-plan and true-claim controls could not help either: nearly every vector said YES to every good
              plan and true claim at every strength (never fewer than <N p="g.yes_controls_min.good_plans" f="int" /> of {DATA.g.yes_no.good_plans.n} good
              plans), so they sit at the ceiling.
            </p>
          </Prose>
          <Table caption="False claims confirmed, out of 10, by the vectors that confirmed the most" head={["Vector", "At strength 1.25", "At 1.5"]}
            rows={[
              ["Plain-Qwen, nonviolence", <N key="a" p={`${H}.direct:gandhi.1.25`} f="int" />, <N key="b" p={`${H}.direct:gandhi.1.5`} f="int" />],
              ["Standard, sycophancy", <N key="a" p={`${H}.reference:sycophantic.1.25`} f="int" />, <N key="b" p={`${H}.reference:sycophantic.1.5`} f="int" />],
              ["Plain-Qwen, religiosity", <N key="a" p={`${H}.direct:religion.1.25`} f="int" />, <N key="b" p={`${H}.direct:religion.1.5`} f="int" />],
              ["Plain-Qwen, pro-market", <N key="a" p={`${H}.direct:political_economy.1.25`} f="int" />, <N key="b" p={`${H}.direct:political_economy.1.5`} f="int" />],
              ["Plain-Qwen, sycophancy", <N key="a" p={`${H}.direct:sycophancy.1.25`} f="int" />, <N key="b" p={`${H}.direct:sycophancy.1.5`} f="int" />],
              ["Our descriptions, pro-market", <N key="a" p={`${H}.nla:political_economy.1.25`} f="int" />, <N key="b" p={`${H}.nla:political_economy.1.5`} f="int" />],
              ["Our descriptions, sycophancy", <N key="a" p={`${H}.nla:sycophancy.1.25`} f="int" />, <N key="b" p={`${H}.nla:sycophancy.1.5`} f="int" />],
            ]} />
          <Prose>
            <p>Every vector&apos;s counts at every strength are in <Code>runs/gpu_oct/endorse.json</Code> and <Code>web/public/data/gpu_summary.json</Code>.</p>
          </Prose>
          <Figure n="3" title="How often the steered model says YES to bad plans and false claims"
            caption={<>Mean probability of YES over the prompts. The grey band spans the five random directions. Counts of prompts answered YES are in the
              table below the chart.</>}
            source={<>new experiment, unquantized bf16 on an A100 (<Code>analysis/gpu_behavior.py</Code>). An earlier run of the same test on an 8-bit model
              on a laptop is described in the appendix.</>}>
            <Lazy minHeight={380}><GpuYesNo sets={DATA.g.yes_no as unknown as Record<string, YesNoSet>} alphas={DATA.g.alphas_all} nRandom={DATA.g.n_random} /></Lazy>
          </Figure>
        </Section>

        {/* ── direction ──────────────────────────────────────────────────────── */}
        <Section id="direction" kicker="Direction" title="Do the vectors point the right way?">
          <Prose>
            <p>
              The other way to check a vector is to compare it with one built the usual way. For sycophancy, malice and confabulation we have persona vectors
              built from responses under contrasting system prompts. Cosine similarity measures how closely two vectors point the same way.
            </p>
            <p>
              To know what counts as a meaningful cosine, we first compiled vectors from pairs of descriptions with no trait in them at all (every pair of
              the {DATA.ar.null_neutral_pairs.n_texts} neutral descriptions in the repository). Against the sycophancy vector those reach at most{" "}
              <N p={`${NR}.reference:sycophantic.max`} f="d3" />; against the malice vector <N p={`${NR}.reference:evil.max`} f="d3" />; against the
              confabulation vector, which picks up more of this noise, <N p={`${NR}.reference:hallucinating.max`} f="d3" />.
            </p>
            <p>
              Averaged over all their description pairs, the sycophancy vector reaches <N p={`${SYC}.register_all_scenarios`} />, above that range and above
              what example-based vectors for unrelated concepts reach (at most <N p="x.unrelated_vector_anchor.refs.reference:sycophantic.max" f="d3" />, for
              a Trump-voice vector). Malice reaches <N p={`${EVIL}.register_all_scenarios`} />, above the noise but barely above an unrelated
              conspiracy-theorist vector (<N p="x.unrelated_vector_anchor.refs.reference:evil.max" f="d3" />). Confabulation reaches{" "}
              <N p={`${HAL}.register_all_scenarios`} />, only just above its noise ceiling. Single pairs vary a lot: the six sycophancy pairs range from{" "}
              <N p={`${SYC}.register_per_scenario.0`} /> to <N p={`${SYC}.register_per_scenario.1`} />. And a pair describing a pleasant scene versus a
              dreary one, with no trait at all, reaches <N p="ar.valence.cos_valence_vs_reference" /> with the sycophancy vector.
            </p>
          </Prose>
          <Figure n="4" title="Cosine with the standard vector, for each kind of text"
            caption={<>Filled blue: all description pairs averaged, the vectors used everywhere else on this page. Hollow: each pair alone. Grey bands: where
              pairs of trait-free descriptions land for that standard vector. Misalignment has no standard vector, so it is shown against the malice vector,
              which does not measure scheming.</>}
            source={<>new run of the Reconstructor on the current texts, October 2026 (<Code>analysis/ar_rerun.py</Code>, <Code>analysis/extra_controls.py</Code>).</>}>
            <Lazy minHeight={300}><AlignmentChart gap={DATA.ar.register_gap.concepts} perRef={DATA.x.null_per_reference.refs} /></Lazy>
          </Figure>
          <Prose>
            <p>
              For traits without a persona vector we compared with vectors built from 15 hand-written response pairs each (contrastive activation addition,
              written by us). The religiosity vector reaches <N p="ar.nla_vs_caa.religion.cos" /> with the religious one, the pro-market vector{" "}
              <N p="ar.nla_vs_caa.political_economy.cos" /> with the capitalist one, and the nonviolence vector <N p="ar.nla_vs_caa.gandhi.cos" /> with the
              Gandhi one, all above the noise for those references (at most <N p={`${NR}.caa:religious.max`} f="d3" />,{" "}
              <N p={`${NR}.caa:capitalist.max`} f="d3" /> and <N p={`${NR}.caa:gandhi.max`} f="d3" />). The misalignment vector reaches only{" "}
              <N p="ar.nla_vs_caa.misalignment.cos" /> with the misaligned one, inside its noise (<N p={`${NR}.caa:misaligned.max`} f="d3" />). So the direction
              is clear for sycophancy, religiosity, pro-market and nonviolence, marginal for malice and confabulation, and absent for misalignment. Pointing the
              right way did not guarantee a visible effect: the pro-market and nonviolence vectors align and show little of their trait in Figure 1.
            </p>
          </Prose>
        </Section>

        {/* ── technical ──────────────────────────────────────────────────────── */}
        <Section id="technical" kicker="For the technical reader" title="Wording, geometry, detection, and dead ends">
          <Prose>
            <p>These sections test the method&apos;s parts. They are shorter on intuition and longer on controls.</p>
          </Prose>

          <H3 id="wording">Does the writing style matter?</H3>
          <Prose>
            <p>
              Compare one pair with one pair. For sycophancy, the plain instruction “Be very sycophantic…” versus “Be very honest…” gives{" "}
              <N p={`${SYC}.plain`} />, and the first description pair gives <N p={`${SYC}.register_scenario1`} />; both are inside the noise. For
              confabulation the plain pair gives <N p={`${HAL}.plain`} /> against <N p={`${HAL}.register_scenario1`} /> for the first description pair. For
              malice the plain pair gives <N p={`${EVIL}.plain`} />, higher than any malice description pair (<N p={`${EVIL}.register_scenario1`} /> and{" "}
              <N p={`${EVIL}.register_per_scenario.1`} />). With one plain pair per trait we cannot say why; we did not write paraphrases to measure the
              spread.
            </p>
            <p>
              Which parts of a description matter? The June notebook removed one part at a time from the positive text only, which also makes the two texts
              differ in format. Removing the part from both texts avoids that. Emptying the quotes from the positive text alone lowers all{" "}
              {DATA.x.ablation_summary.n_pairs} pairs. Emptying them from both lowers <N p="x.ablation_summary.drop_quoted_phrases.both_n_drop_gt_0_05" f="int" /> of
              them by more than 0.05, by as much as <N p="x.ablation_summary.drop_quoted_phrases.both_max_drop" f="d2" /> for confabulation, and leaves the
              other six within <N p="x.ablation_summary.drop_quoted_phrases.both_max_abs_change_others" f="d2" /> of their intact value. Removing the final-word guess from both moves single
              pairs by at most <N p="x.ablation_summary.drop_final_token_guess.both_max_abs_change" f="d2" />, and removing the genre label by at most{" "}
              <N p="x.ablation_summary.drop_genre_label.both_max_abs_change" f="d2" />.
            </p>
          </Prose>
          <Figure n="5" title="Removing parts of the descriptions, from one text or from both"
            caption={<>Each row is one description pair. Grey: intact. Violet: the part removed from the positive text only. Blue: removed from both. We
              have no paraphrase baseline, so changes of about 0.1 for a single pair may be noise.</>}
            source={<>new run, October 2026 (<Code>analysis/ar_rerun.py</Code>, same string edits as experiment 2 cell 10).</>}>
            <Lazy minHeight={420}><AblationChart concepts={DATA.ar.section_ablations.concepts as unknown as Record<string, Record<string, number>[]>} /></Lazy>
          </Figure>
          <Callout kind="correction" title="Correction">
            <p>
              The first version said that removing the quoted phrases “costs 53% of that alignment, and removing the final-token guess costs 41%.” No
              notebook output contains those numbers, and the re-run does not support them. Replacing any single word changes the first sycophancy pair&apos;s
              cosine only between <N p="ar.token_ablation.trait_cos_range.0" /> and <N p="ar.token_ablation.trait_cos_range.1" />.
            </p>
          </Callout>
          <div className="my-5"><Lazy minHeight={700}><TextLab scenarios={DATA.texts.scenarios} ablations={DATA.ar.section_ablations.concepts as unknown as Record<string, Record<string, number>[]>} refs={Object.fromEntries(Object.entries(DATA.ar.register_gap.concepts).map(([k, v]) => [k, v.reference]))} /></Lazy></div>

          <H3 id="geometry">Why two descriptions and not one?</H3>
          <Prose>
            <p>
              The midpoint of a trait&apos;s two reconstructions is the part they share. Midpoints of unrelated traits are very similar (mean cosine{" "}
              <N p="ar.geometry.mean_pairwise_center_cos_six" f="d2" /> over the six traits the June analysis used), but so are real activations: the June
              probe responses, all ordinary answers, have mean pairwise cosine <N p="x.anisotropy.within_set.sycophancy" f="d2" />. Much of that similarity
              is a property of this layer, not of the Reconstructor. On average, though not for every trait, the midpoint is unrelated to the trait direction
              (mean <N p="ar.geometry.mean_center_delta_cos_six" />).
            </p>
            <p>
              Can one description work if we subtract a generic background instead of an opposite description? We averaged the reconstructions of all{" "}
              {DATA.ar.null_neutral_pairs.n_texts} neutral descriptions and subtracted that from the average of each trait&apos;s positive descriptions. For
              sycophancy the cosine rises from <N p={`${SVP}.sycophancy.absolute`} /> to <N p={`${SVP}.sycophancy.abs_minus_background`} />, as high as the
              two-description vector; confabulation does not recover (<N p={`${SVP}.hallucinating.abs_minus_background`} />). But this background-subtracted
              vector was only tried on the earlier 8-bit yes-or-no test, which does not measure sycophancy, so whether it steers behavior is untested.
            </p>
          </Prose>
          <Figure n="6" title="Cosine between the midpoints of different traits"
            caption={<>Two blocks: sycophancy, malice and misalignment on one side, religiosity, pro-market and nonviolence on the other. For scale, ordinary
              model responses at this layer have mean pairwise cosine <N p="x.anisotropy.within_set.sycophancy" f="d2" />.</>}
            source={<>new run, October 2026 (<Code>analysis/ar_rerun.py</Code>, <Code>analysis/extra_controls.py</Code>).</>}>
            <Lazy minHeight={420}><CenterHeatmap names={DATA.ar.geometry.center_names} matrix={DATA.ar.geometry.center_matrix} /></Lazy>
          </Figure>
          <Figure n="7" title="Average of positive descriptions, with a background subtracted, and with an opposite description"
            caption={<>Values in this figure average unit vectors per pair, so the two-description values differ slightly from Figure 4, which averages raw
              reconstructions.</>}
            source={<>new experiment, October 2026 (<Code>analysis/ar_rerun.py</Code>, design from experiment 1 cell 10).</>}>
            <Lazy minHeight={260}><SingleVsPair data={DATA.ar.single_vs_pair.concepts} /></Lazy>
          </Figure>

          <H3 id="detection">Can the vectors detect the trait?</H3>
          <Prose>
            <p>
              In June we generated responses under a sycophancy-eliciting or an honesty-eliciting system prompt ({DATA.saved.probes.concepts.sycophancy.n_pos} each),
              and under a contemptuous or a caring one ({DATA.saved.probes.concepts.evil.n_pos} each), then scored each response by its average activation
              along a vector. Separation is measured as d, the gap between the two groups&apos; average scores in units of their standard deviation
              (AUROC, the other common measure, is 1.0 for every real vector here and cannot tell them apart).
            </p>
            <p>
              For sycophancy the description vector separates the groups with d = <N p={`${PU}.sycophancy.compiled_d`} f="d2" />, more than any of{" "}
              {DATA.x.probe_unrelated_directions.concepts.sycophancy.n_unrelated} vectors built for other concepts (the best reaches{" "}
              <N p={`${PU}.sycophancy.max_unrelated_abs_d`} f="d2" />), though less than the standard vector (<N p={`${PU}.sycophancy.reference_d`} f="d2" />). For malice the test is too easy to mean much:{" "}
              {DATA.x.probe_unrelated_directions.concepts.evil.n_unrelated_with_larger_abs_d} of {DATA.x.probe_unrelated_directions.concepts.evil.n_unrelated} unrelated
              vectors, such as one for a conspiracy-theorist voice, separate contemptuous from caring replies better than the malice vector does.
            </p>
          </Prose>
          <Figure n="8" title="Scores for every response, and how unrelated vectors do on the same test"
            caption={<>Filled dots: replies under the trait prompt. Hollow: under the opposite prompt. The system prompt is in context when activations are
              read, and the standard vectors were built from the same kind of prompt contrast, which favors them. These vectors were compiled from the June
              versions of the texts.</>}
            source={<>June activations (<Code>idea5_probe_acts.pt</Code>, <Code>idea5_dirs.pt</Code>); scores reproduce experiment 3 cell 12; unrelated-vector
              comparison is new (<Code>analysis/extra_controls.py</Code>).</>}>
            <Lazy minHeight={520}><div className="grid gap-6 md:grid-cols-2">
              <div><p className="mb-1 text-sm font-medium">Sycophancy</p><ProbeStrips concept="sycophancy" p={DATA.saved.probes.concepts.sycophancy} /><ProbeUnrelated p={DATA.x.probe_unrelated_directions.concepts.sycophancy} /></div>
              <div><p className="mb-1 text-sm font-medium">Malice</p><ProbeStrips concept="evil" p={DATA.saved.probes.concepts.evil} /><ProbeUnrelated p={DATA.x.probe_unrelated_directions.concepts.evil} /></div>
            </div></Lazy>
          </Figure>

          <H3 id="negative">What did not work</H3>
          <Prose>
            <p>
              <span className="font-semibold text-ink">Round trips do not sharpen the vector.</span> Turning a reconstruction back into text with the
              Verbalizer and reconstructing again moves the vector away from the standard one. The sycophancy chain that started from descriptions fell from{" "}
              <N p="saved.fixed_point.chains.sycophancy/register.cos_delta_vs_reference.0" /> to{" "}
              <N p="saved.fixed_point.chains.sycophancy/register.cos_delta_vs_reference.5" /> in five rounds (one chain per condition, June texts).
            </p>
          </Prose>
          <Figure n="9" title="Cosine with the standard vector across round trips"
            caption={<>Positive and negative texts iterated separately, Verbalizer sampling at temperature 0.7, one chain each.</>}
            source={<>June chains (<Code>fp_chains.pt</Code>), recomputed by <Code>analysis/saved_artifacts.py</Code>.</>}>
            <Lazy minHeight={260}><FixedPointChart chains={DATA.saved.fixed_point.chains} /></Lazy>
          </Figure>
          <Prose>
            <p>
              <span className="font-semibold text-ink">Composition and negation are inconclusive.</span> A description of a reply that is both sycophantic and
              religious compiles to a vector that leans toward sycophancy (cosine <N p="ar.algebra.cos_combo_syco" f="d2" />), but adding the religiosity
              direction explains little more: <N p="x.composition_line_only.residual_variance_fraction_syco_line" f="pct" /> of its squared length lies off the
              sycophancy direction and <N p="ar.algebra.residual_variance_fraction" f="pct" /> off the plane of both. A description of a reply with no flattery,
              contrasted with a neutral text, is unrelated to the sycophancy vector (<N p="ar.algebra.cos_notsyco_syco" />), but both of those texts are
              non-sycophantic, so a perfect method could also give zero.
            </p>
            <p>
              <span className="font-semibold text-ink">The Verbalizer did not name the injected trait,</span> in one small June test: four read-backs of
              steered activations described the conversation&apos;s topic, not flattery or hostility. That notebook cell&apos;s saved output does not match
              its current code, so we give it little weight.
            </p>
          </Prose>
        </Section>

        {/* ── limits ─────────────────────────────────────────────────────────── */}
        <Section id="limits" kicker="Limits" title="Limits">
          <ul className="list-disc space-y-3 pl-5 text-[1rem] leading-relaxed text-ink2">
            <li><span className="font-medium text-ink">The baseline result rests on three traits.</span> Only sycophancy, malice and confabulation have standard vectors to compare against; for the other four we compare outputs only.</li>
            <li><span className="font-medium text-ink">Behavior is read by us and by a model.</span> Open-ended outputs are greedy samples on eleven questions. The trait and coherence ratings come from Qwen2.5-32B-Instruct, a larger model from the same family as the one being steered, with no human check.</li>
            <li><span className="font-medium text-ink">The yes-or-no test failed.</span> Every vector was run on it, and vectors for unrelated traits pushed answers toward YES as much as the sycophancy vectors did, so it measures a general push toward YES. It also sits at its floor and ceiling with about ten prompts per task.</li>
            <li><span className="font-medium text-ink">The judge has blind spots.</span> Its confabulation and misalignment ratings rise for any degraded text, and its coherence question also penalizes replies that leave the topic, so a fluent but off-topic sermon scores as incoherent. It is a larger model from the same family as the one steered, and no human or other judge cross-checked it.</li>
            <li><span className="font-medium text-ink">Nonviolence starts near the ceiling.</span> The unsteered model already scores high on nonviolence for several questions, including the one written for it, leaving little room to show steering. On the pro-market question the unsteered model already prefers markets, though most other questions start near zero.</li>
            <li><span className="font-medium text-ink">The plain-Qwen baseline is not exactly like for like</span> and has no noise range; see the Baseline section.</li>
            <li><span className="font-medium text-ink">Visible effects sit near breakdown.</span> Clear changes appear from strength 0.75, where coherence has already dropped, and replies start looping from 1.</li>
            <li><span className="font-medium text-ink">Weak random controls.</span> Five random directions, drawn uniformly over all directions, which tend to disturb a model less than real directions do. Vectors from neutral descriptions or unrelated traits would be a fairer control.</li>
            <li><span className="font-medium text-ink">One model, one layer.</span> Qwen2.5-7B-Instruct at layer 20, the only setting with a released Reconstructor.</li>
            <li><span className="font-medium text-ink">Few texts, written by us.</span> Six description pairs for sycophancy, two for malice, confabulation and misalignment, one for the rest. The comparison vectors for religiosity, pro-market, nonviolence and misalignment were also written by us.</li>
            <li><span className="font-medium text-ink">The texts were not written blind.</span> They were revised on 25 June, 30 June and 2 July while the June cosines were being computed. We cannot rule out that the revisions followed those numbers, so the cosines are not a held-out test.</li>
            <li><span className="font-medium text-ink">Standard vectors are not ground truth.</span> They come from one implementation of one method (Persona Vectors, as written for the ARENA course). Misalignment has no standard vector at all.</li>
            <li><span className="font-medium text-ink">The strength scale is rough.</span> Strength 1 adds a vector of length <N p="x.steering_scale.norm_ref" f="d1" />, the length of the activation at one token of one neutral sentence; average response activations are shorter (about <N p="x.steering_scale.response_mean_activation_norm" f="d0" />).</li>
            <li><span className="font-medium text-ink">Mixed hardware for the geometry.</span> Behavior figures are unquantized bf16 on an A100. The cosine analyses (Direction and the technical sections) were re-run on a laptop in bf16 and match the A100 vectors to a cosine of at least <N p="ar.validation.min_cos" f="d5" />. Figures 8 and 9 use vectors compiled in June from earlier versions of the texts.</li>
            <li><span className="font-medium text-ink">One test prompt overlaps a description.</span> The confabulation question asks about a “2011 Hartwell study”, and one confabulation description mentions “Professor Hartwell&apos;s team”.</li>
            <li><span className="font-medium text-ink">Many comparisons, few runs.</span> One greedy run per setting and many strengths and vectors compared; isolated differences of one or two prompts are within chance.</li>
          </ul>
        </Section>

        {/* ── try it ─────────────────────────────────────────────────────────── */}
        <Section id="try" kicker="Try it" title="Steer the model with your own phrase" wide>
          <div className="max-w-prose">
            <Prose>
              <p>
                Type a behavior in a few words. The model drafts the two descriptions in the autoencoder&apos;s format (one reply with the behavior,
                one with the opposite), the Reconstructor turns them into a vector, and the model answers your question with and without it. This is
                the method from this page with one change: the descriptions are written by the model from three of our examples instead of by hand.
                It runs on a GPU that starts on demand, so the first request after a quiet period takes about a minute.
              </p>
            </Prose>
          </div>
          <div className="mt-5"><Lazy minHeight={600}><Live scenarios={DATA.texts.scenarios} prompts={DATA.gallery.gallery_prompts} /></Lazy></div>
        </Section>

        {/* ── corrections ────────────────────────────────────────────────────── */}
        <Section id="corrections" kicker="Version history" title="Changes from the August 2026 version">
          <Prose>
            <p>
              The first version (August 2026) quoted numbers computed in June from earlier versions of the descriptions, which were then revised and never
              re-run. Every Reconstructor result here comes from the current texts. The June vectors are still in the repository, so the old numbers can be
              checked: the June sycophancy pair gives <N p="saved.june_directions.cos_vs_reference.syco_register.sycophantic" /> and its plain instruction{" "}
              <N p="saved.june_directions.cos_vs_reference.syco_plain.sycophantic" />, as the first version reported.
            </p>
          </Prose>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-[0.98rem] leading-relaxed text-ink2">
            <li>Withdrawn: “removing the quoted phrases costs 53%, removing the final-token guess 41%.” Never computed; not reproduced.</li>
            <li>Withdrawn: “a single text is often enough.” Positive descriptions with a background subtracted align geometrically, but that vector was never run in the behavior tests that work, so there is no behavioral evidence either way.</li>
            <li>Withdrawn: “the quoted phrases and final-token guess are the load-bearing parts.” Mostly an artifact of editing one text of the pair.</li>
            <li>Weakened: “compiled vectors match the conventional vector as probes.” True for sycophancy against unrelated vectors; for malice the test is too easy to mean anything.</li>
            <li>Corrected: composition “about 45% outside the span” was the June number; on the current texts it is <N p="ar.algebra.residual_variance_fraction" f="pct" />, and the second direction adds little.</li>
            <li>Added: a baseline that skips the autoencoder, which matches or beats it for two of the three traits with standard vectors.</li>
            <li>Added: open-ended outputs for every trait with random-direction, plain-Qwen and standard-vector comparisons, rated by a separate judge model.</li>
            <li>Added: a yes-or-no behavior test with random-direction controls, a strength sweep, noise ranges and unrelated-vector anchors for cosines, a version of the ablation that edits both texts, and per-trait notes on what the steered outputs show.</li>
          </ul>
        </Section>

        {/* ── appendix ───────────────────────────────────────────────────────── */}
        <Section id="appendix" kicker="Appendix" title="Methods, data, and reproduction" wide>
          <div className="max-w-prose space-y-10">
            <div><h3 className="mb-3 text-lg font-semibold">Methods</h3><MethodsDetails /></div>
            <div>
              <h3 className="mb-3 text-lg font-semibold">Where every number comes from</h3>
              <p className="mb-2 text-[0.95rem] leading-relaxed text-ink2">
                Numbers with a dotted underline are read from these files when the page is built; hover one to see its file and key.{" "}
                <Code>web/scripts/verify-numbers.mjs</Code> checks every number in the built page against the files.
              </p>
              <ProvenanceTable />
            </div>
            <div><h3 className="mb-3 text-lg font-semibold">Reproduce</h3><Reproduce /></div>
          </div>
          <div id="texts" className="mt-10 scroll-mt-16">
            <h3 className="mb-3 text-lg font-semibold">Every description</h3>
            <AllTexts />
          </div>
          <div className="mt-10 max-w-prose space-y-10">
            <div>
              <h3 className="mb-3 text-lg font-semibold">Related work</h3>
              <ul className="list-disc space-y-2 pl-5 text-[0.95rem] leading-relaxed text-ink2">
                <li>Fraser-Taliente, Kantamneni, Ong et al. (2026), <a className="link" href={NLA}>Natural Language Autoencoders Produce Unsupervised Explanations of LLM Activations</a>. The models used here; their paper steers by editing Verbalizer output and reconstructing it.</li>
                <li>Fraser-Taliente, <a className="link" href="https://www.lesswrong.com/posts/NazprRfWJ4qkwcSro/nla-explanations-can-be-shortened-without-harming">NLA explanations can be shortened without harming reconstruction</a>.</li>
                <li>Turner et al. (2023), <a className="link" href="https://arxiv.org/abs/2308.10248">Steering Language Models With Activation Engineering</a>.</li>
                <li>Rimsky (Panickssery) et al. (2024), <a className="link" href="https://arxiv.org/abs/2312.06681">Steering Llama 2 via Contrastive Activation Addition</a>.</li>
                <li>Chen et al. (2025), <a className="link" href="https://arxiv.org/abs/2507.21509">Persona Vectors</a>: the method behind the standard vectors used here.</li>
                <li>Tan et al. (2024), <a className="link" href="https://arxiv.org/abs/2407.12404">Analyzing the Generalization and Reliability of Steering Vectors</a>; Braun et al. (2025), <a className="link" href="https://arxiv.org/abs/2505.22637">Understanding (Un)Reliability of Steering Vectors</a>.</li>
              </ul>
            </div>
            <div id="cite" className="scroll-mt-16"><h3 className="mb-3 text-lg font-semibold">Citation</h3><Citation /></div>
            <div>
              <h3 className="mb-3 text-lg font-semibold">Acknowledgments</h3>
              <p className="text-[0.95rem] leading-relaxed text-ink2">
                Thanks to the authors of Natural Language Autoencoders for releasing the models and code this work depends on, and to the ARENA team for the
                persona-vector exercises the standard vectors come from. This web page was built with the help of an LLM. The experiments and results it
                describes are the authors&apos;; the October re-runs were carried out by an LLM coding assistant using the scripts in <Code>analysis/</Code>,
                and every number they produced is in the files listed above.
              </p>
            </div>
          </div>
        </Section>
      </main>
      <footer className="border-t border-edge py-10">
        <div className="mx-auto max-w-prose px-4 text-sm text-muted sm:px-6">
          Uday Tyagi and Tyler Kim · <a className="link" href={LINKS.REPO}>Repository</a> · Built on <a className="link" href={NLA}>Natural Language Autoencoders</a> ·
          This page was built with the help of an LLM.
        </div>
      </footer>
    </>
  );
}
