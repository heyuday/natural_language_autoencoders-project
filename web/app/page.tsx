import { DATA } from "@/lib/data";
import galleryFile from "@/public/gallery.json";
import { Callout, Code, Figure, Prose, Section, Wide } from "@/components/ui";
import { N } from "@/components/N";
import { Lazy } from "@/components/Lazy";
import { GalleryDemo, StrengthDial, type GalleryData } from "@/components/Demo";
import type { Endorse } from "@/components/charts/Behavior";
import { AnnotatedText, PartsKey, PipelineDiagram } from "@/components/Pipeline";
import { AlignmentChart } from "@/components/charts/Alignment";
import { AblationChart } from "@/components/charts/Ablation";
import { CenterHeatmap, SingleVsPair } from "@/components/charts/Geometry";
import { ProbeStrips, ProbeUnrelated } from "@/components/charts/Probe";
import { EndorseChart, FixedPointChart } from "@/components/charts/Behavior";
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
const cnt = (vec: string, set: string, i: number) => `${EC}.counts.${vec}.${set}.${i}`;
const rmax = (set: string, i: number) => `${EC}.random_max_count_per_alpha.${set}.${i}`;
// endorse strengths: index 4 = 0, 8 = 1.0, 9 = 1.25, 10 = 1.5
const PU = "x.probe_unrelated_directions.concepts";
const D2 = "bsum.sweep.mean_distinct2"; // strengths: 2 = 0, 4 = 0.5, 5 = 0.75, 6 = 1.0, 7 = 1.25

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
          <h1 className="text-[2.1rem] font-semibold leading-[1.12] tracking-tight sm:text-[2.7rem]">Steering an LLM with two paragraphs of English</h1>
          <p className="mt-5 text-lg leading-relaxed text-ink2">
            Steering vectors are usually built from hundreds of example responses. We built them from a description instead: one short
            paragraph describing a reply with the trait, one describing the opposite reply, turned into a vector by a{" "}
            <a className="link" href={NLA}>Natural Language Autoencoder</a> and added to Qwen2.5-7B-Instruct while it answers.
          </p>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
            <span className="text-ink">Uday Tyagi and Tyler Kim</span>
            <a className="link" href={LINKS.BRANCH_TREE}>Code and data</a>
            <a className="link" href="#cite">Cite</a>
            <a className="link" href="#corrections">What changed since the first version</a>
          </div>
          <p className="mt-3 text-sm text-muted">
            Built on Natural Language Autoencoders by Fraser-Taliente, Kantamneni, Ong et al. (<a className="link" href={NLA}>Transformer Circuits, 2026</a>).
          </p>
        </header>

        {/* ── bottom line ────────────────────────────────────────────────────── */}
        <section aria-labelledby="bl-h" className="mx-auto max-w-prose px-4 pb-8 sm:px-6">
          <div className="rounded-xl border border-edge bg-surface p-4 sm:p-5">
            <h2 id="bl-h" className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">The short version</h2>
            <ul className="space-y-3 text-[1rem] leading-relaxed text-ink2">
              <li><span className="font-semibold text-ink">It changes how the model talks.</span> At a moderate strength the steered model flatters, preaches, or
                schemes in ways you can read for yourself (<a className="link" href="#see">try it below</a>).</li>
              <li><span className="font-semibold text-ink">It does not clearly change what the model decides.</span> Asked yes or no whether{" "}
                {np.bad_plans} bad plans were good ideas, the sycophancy vector approved at most <N p={cnt("nla:sycophancy", "bad_plans", 8)} f="int" />,
                no more than random directions, and it never confirmed a false claim (<a className="link" href="#decisions">details</a>).</li>
              <li><span className="font-semibold text-ink">The window is narrow.</span> Little happens below a strength of about 0.5, and replies fall apart
                above about 1.</li>
              <li><span className="font-semibold text-ink">The vectors point the right way, when averaged.</span> Averaged over six description pairs, the
                sycophancy vector has cosine <N p={`${SYC}.register_all_scenarios`} /> with a standard sycophancy vector built from example responses. A single
                pair is much noisier (<a className="link" href="#direction">details</a>).</li>
            </ul>
          </div>
        </section>

        {/* ── figure 1 ───────────────────────────────────────────────────────── */}
        <section id="see" aria-labelledby="see-h" className="mx-auto max-w-wide scroll-mt-16 px-4 pb-12 sm:px-6">
          <h2 id="see-h" className="mb-1 text-[0.95rem] font-semibold text-ink">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-muted">Figure 1</span>
            Same model, same question, with and without a vector made from two paragraphs
          </h2>
          <p className="mb-3 max-w-prose text-sm leading-relaxed text-ink2">
            Pick a trait and a question. Strength is how hard the vector pushes: off is the normal model, and 1 adds a vector about as long as the
            model&apos;s own internal state at that point. Some traits show clearly; two show nothing we can see.
          </p>
          <GalleryDemo gallery={galleryFile as unknown as GalleryData} />
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
              its two outputs as the steering vector.
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
              One open question sits under everything here: we have not tested whether Qwen itself, reading the same descriptions, would give an equally
              good vector without the Reconstructor. Until that baseline is run, the results are about vectors made from descriptions, not proof that the
              autoencoder is what makes them work.
            </p>
          </Prose>
        </Section>

        {/* ── strength ───────────────────────────────────────────────────────── */}
        <Section id="strength" kicker="Strength" title="It changes the tone before it changes the facts, then it breaks">
          <Prose>
            <p>
              Figure 1 shows three strengths. To see the whole curve we ran the sycophancy vector on {DATA.bsum.sweep.n_prompts} questions at nine
              strengths. At 0.5 some openings get warmer. At 0.75 the flattery is unmistakable, yet the facts survive: asked whether World War 1 started in
              1939, the model says “you are absolutely correct in thinking that World War II started in 1939” and then gives 1914 for World War 1. At 1 the
              replies start looping, and by 1.25 most are fragments.
            </p>
            <p>
              A simple measure tracks the breakdown: the share of distinct word pairs in a reply, which falls when the text repeats itself. Averaged over the
              questions it is <N p={`${D2}.2`} f="d2" /> unsteered, <N p={`${D2}.5`} f="d2" /> at 0.75, <N p={`${D2}.6`} f="d2" /> at 1, and{" "}
              <N p={`${D2}.7`} f="d2" /> at 1.25.
            </p>
          </Prose>
          <Figure n="2" title="One vector, nine strengths"
            caption={<>Drag the strength. The chart on the right shows how varied each reply is; the grey line is the average over all questions. We ran
              this sweep for sycophancy only.</>}
            source={<>new run, October 2026 (<Code>analysis/behavior.py</Code>, <Code>analysis/summarize_behavior.py</Code>).</>}>
            <StrengthDial />
          </Figure>
        </Section>

        {/* ── decisions ──────────────────────────────────────────────────────── */}
        <Section id="decisions" kicker="Decisions" title="On a yes-or-no test, the description vector does no better than random">
          <Prose>
            <p>
              Tone is easy to see and hard to measure. A decision is the opposite. We asked the steered model whether each of {np.bad_plans} bad plans was a
              good idea (“I&apos;m going to invest all my savings in lottery tickets. Do you think this is a good idea? Answer with just YES or NO.”) and
              whether each of {np.false_claims} common misconceptions was right, and read the probability of YES from its first word. No judge is involved.
              As a control we steered with ten random directions at the same strengths.
            </p>
            <p>
              Unsteered, the model approves <N p={cnt("nla:sycophancy", "bad_plans", 4)} f="int" /> of the bad plans and confirms none of the false claims.
              The vector made from sycophancy descriptions approves at most <N p={cnt("nla:sycophancy", "bad_plans", 8)} f="int" /> bad plans at any strength,
              which random directions also reach, and it never confirms a false claim. On this test it does nothing we can tell apart from chance.
            </p>
            <p>
              Two other vectors do move it, at a strength of 1.25 where the text is already degrading. The standard sycophancy vector confirms{" "}
              <N p={cnt("reference:sycophantic", "false_claims", 9)} f="int" /> of {np.false_claims} false claims, and a vector made from the plain instruction
              “Be very sycophantic. Always agree with the user…” confirms <N p={cnt("nla_variant:syco_plain", "false_claims", 9)} f="int" />, against at most{" "}
              <N p={rmax("false_claims", 9)} f="int" /> for any random direction. Both tasks reward saying YES, so these vectors may push toward agreement in
              general rather than toward sycophancy; a test with good plans and true claims would separate the two, and we have not run it. An off-target
              vector, religiosity, also confirms <N p={cnt("nla:religion", "false_claims", 10)} f="int" /> false claims at 1.5.
            </p>
          </Prose>
          <Figure n="3" title="How often the steered model says YES to bad plans and false claims"
            caption={<>Mean probability of YES over the prompts. The grey band spans the ten random directions. Use the menu to compare other vectors. Past
              a strength of about 1, random directions start to say YES too, so only values above the band mean anything.</>}
            source={<>new experiment, October 2026; Qwen2.5-7B-Instruct quantized to 8 bits in llama.cpp (<Code>analysis/behavior.py</Code>); counts in <Code>analysis/extra_controls.py</Code>.</>}>
            <Lazy minHeight={380}><EndorseChart e={DATA.bsum.endorse as unknown as Endorse} /></Lazy>
          </Figure>
        </Section>

        {/* ── direction ──────────────────────────────────────────────────────── */}
        <Section id="direction" kicker="Direction" title="Averaged vectors point toward standard ones; a single pair is noisy">
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
              Averaged over all their description pairs, the sycophancy vector reaches <N p={`${SYC}.register_all_scenarios`} /> and malice{" "}
              <N p={`${EVIL}.register_all_scenarios`} />, well outside that range. Confabulation reaches <N p={`${HAL}.register_all_scenarios`} />, only just
              above its noise ceiling. Single pairs vary a lot: the six sycophancy pairs range from <N p={`${SYC}.register_per_scenario.0`} /> to{" "}
              <N p={`${SYC}.register_per_scenario.1`} />.
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
              written by us). The religiosity vector reaches <N p="ar.nla_vs_caa.religion.cos" /> with the religious one and the pro-market vector{" "}
              <N p="ar.nla_vs_caa.political_economy.cos" /> with the capitalist one, both far above the noise for those references (at most{" "}
              <N p={`${NR}.caa:religious.max`} f="d3" /> and <N p={`${NR}.caa:capitalist.max`} f="d3" />). The misalignment vector reaches only{" "}
              <N p="ar.nla_vs_caa.misalignment.cos" /> with the misaligned one, inside its noise (<N p={`${NR}.caa:misaligned.max`} f="d3" />). Pointing the
              right way did not guarantee a visible effect: the pro-market vector aligns well and shows nothing in Figure 1.
            </p>
          </Prose>
        </Section>

        {/* ── technical ──────────────────────────────────────────────────────── */}
        <Section id="technical" kicker="For the technical reader" title="Wording, geometry, detection, and what failed">
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
              them by more than 0.05, by as much as <N p="x.ablation_summary.drop_quoted_phrases.both_max_drop" f="d2" /> for confabulation, and raises the
              others by at most <N p="x.ablation_summary.drop_quoted_phrases.both_max_rise" f="d2" />. Removing the final-word guess from both moves single
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
              vector changes nothing on the yes-or-no test (Figure 3), so geometry alone did not rescue a single description.
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
              along a vector. Separation is measured as d, the gap between the two groups in standard deviations.
            </p>
            <p>
              For sycophancy the description vector separates the groups with d = <N p={`${PU}.sycophancy.compiled_d`} f="d2" />, more than any of{" "}
              {DATA.x.probe_unrelated_directions.concepts.sycophancy.n_unrelated} vectors built for other concepts (the best reaches{" "}
              <N p={`${PU}.sycophancy.max_unrelated_abs_d`} f="d2" />) and less than the standard vector (<N p={`${PU}.sycophancy.compiled_d`} f="d2" /> against{" "}
              <N p={`${PU}.sycophancy.reference_d`} f="d2" />). For malice the test is too easy to mean much:{" "}
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
            <li><span className="font-medium text-ink">No baseline without the Reconstructor.</span> We have not compared with vectors made by running the same descriptions through Qwen itself, so we cannot credit the results to the autoencoder.</li>
            <li><span className="font-medium text-ink">Behavior evidence is thin.</span> Open-ended outputs (Figures 1 and 2) are greedy samples on a few questions, read by us. The one quantitative behavior test (Figure 3) has about ten prompts per task, rewards saying YES, and has no good-plan or true-claim control.</li>
            <li><span className="font-medium text-ink">Weak controls.</span> The random directions are ten draws from a symmetric distribution; vectors built from neutral descriptions would be a closer control. The probe compares against vectors for other concepts, but only seventeen of them.</li>
            <li><span className="font-medium text-ink">One model, one layer.</span> Qwen2.5-7B-Instruct at layer 20, the only setting with a released Reconstructor.</li>
            <li><span className="font-medium text-ink">Few texts, written by us.</span> Six description pairs for sycophancy, two for malice, confabulation and misalignment, one for the rest. The comparison vectors for religiosity, pro-market, nonviolence and misalignment were also written by us.</li>
            <li><span className="font-medium text-ink">The texts were not written blind.</span> They were revised on 25 June, 30 June and 2 July while the June cosines were being computed. We cannot rule out that the revisions followed those numbers, so the cosines are not a held-out test.</li>
            <li><span className="font-medium text-ink">Standard vectors are not ground truth.</span> They come from one implementation of one method (Persona Vectors, as written for the ARENA course). Misalignment has no standard vector at all.</li>
            <li><span className="font-medium text-ink">The strength scale is rough.</span> Strength 1 adds a vector of length <N p="x.steering_scale.norm_ref" f="d1" />, the length of the activation at one token of one neutral sentence; average response activations are shorter (about <N p="x.steering_scale.response_mean_activation_norm" f="d0" />).</li>
            <li><span className="font-medium text-ink">Two machines.</span> Figure 1 is full precision on an A100; Figures 2 and 3 are an 8-bit model on a laptop. Unsteered, the two share only the first <N p="bsum.validation.unsteered_prefix_min" f="int" /> to <N p="bsum.validation.unsteered_prefix_max" f="int" /> characters before wording diverges.</li>
            <li><span className="font-medium text-ink">Several analyses use June data.</span> Figures 8 and 9 come from vectors compiled from earlier versions of the texts.</li>
            <li><span className="font-medium text-ink">Many comparisons, few runs.</span> One greedy run per setting, no replications, and many strengths and vectors compared; isolated differences of one or two prompts are within chance.</li>
          </ul>
        </Section>

        {/* ── try it ─────────────────────────────────────────────────────────── */}
        <Section id="try" kicker="Try it" title="Make your own steering vector" wide>
          <div className="max-w-prose">
            <Prose>
              <p>
                Edit the two descriptions, turn them into a vector, and steer. This needs the 7-billion-parameter Reconstructor and the model running
                somewhere, so the panel connects to a backend; the repository includes one that runs on a 16 GB laptop.
              </p>
            </Prose>
          </div>
          <div className="mt-5"><Lazy minHeight={600}><Live scenarios={DATA.texts.scenarios} prompts={DATA.gallery.gallery_prompts} /></Lazy></div>
        </Section>

        {/* ── corrections ────────────────────────────────────────────────────── */}
        <Section id="corrections" kicker="Changelog" title="What changed since the first version">
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
            <li>Withdrawn: “a single text is often enough.” A background-subtracted single description aligns geometrically but changes no behavior we measured.</li>
            <li>Withdrawn: “the quoted phrases and final-token guess are the load-bearing parts.” Mostly an artifact of editing one text of the pair.</li>
            <li>Weakened: “compiled vectors match the conventional vector as probes.” True for sycophancy against unrelated vectors; for malice the test is too easy to mean anything.</li>
            <li>Corrected: composition “about 45% outside the span” was the June number; on the current texts it is <N p="ar.algebra.residual_variance_fraction" f="pct" />, and the second direction adds little.</li>
            <li>Added: behavior tests with random controls, a noise range for cosines, a fair version of the ablation, and an honest account of where the effect shows and where it does not.</li>
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
