import { DATA } from "@/lib/data";
import { Code, Figure, Prose, Section } from "@/components/ui";
import { Lazy } from "@/components/Lazy";
import { JudgeMultiples, type JudgeSummary } from "@/components/charts/Gpu";
import { AllTexts, Citation, LINKS, MethodsDetails, ProvenanceTable, Reproduce } from "@/components/Appendix";

const NLA = "https://transformer-circuits.pub/2026/nla/index.html";

export const metadata = {
  title: "Methods and data: steering vectors from written descriptions",
  description: "Ratings for every trait, methods, every steering description, and how to reproduce the results.",
};

export default function Notes() {
  return (
    <>
      <main id="top">
        <header className="mx-auto max-w-prose px-4 pb-6 pt-14 sm:px-6 sm:pt-16">
          <p className="mb-3 text-sm"><a className="link" href="/">Back to the main page</a></p>
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight sm:text-[2.3rem]">Methods and data</h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink2">
            Behind <a className="link" href="/">Steering vectors from written descriptions</a>: the ratings for every trait, how the experiments were run,
            every description we wrote, and how to reproduce the results.
          </p>
          <p className="mt-3 text-sm text-muted">Uday Tyagi and Tyler Kim · written with help from Claude</p>
        </header>

        <Section id="judge" kicker="Ratings" title="Ratings for every trait, by strength" wide>
          <Figure n="1" title="How strongly replies show each trait, and how coherent they stay"
            caption={<>Ratings from 0 to 9 by Qwen2.5-32B-Instruct, averaged over eleven questions. The grey band is the range over five random
              directions.</>}
            source={<>unquantized bf16 on an A100 (<Code>analysis/gpu_behavior.py</Code>, <Code>analysis/gpu_judge.py</Code>).</>}>
            <Lazy minHeight={520}><JudgeMultiples j={DATA.g.judge as unknown as JudgeSummary} /></Lazy>
          </Figure>
        </Section>

        <Section id="appendix" kicker="Methods" title="How the experiments were run" wide>
          <div className="max-w-prose"><MethodsDetails /></div>
          <div id="texts" className="mt-10 scroll-mt-16">
            <h3 className="mb-3 text-lg font-semibold">Every description</h3>
            <AllTexts />
          </div>
          <div className="mt-10 max-w-prose space-y-10">
            <div><h3 className="mb-3 text-lg font-semibold">Reproduce</h3><Reproduce /></div>
            <div>
              <h3 className="mb-3 text-lg font-semibold">Where every number comes from</h3>
              <p className="mb-2 text-[0.95rem] leading-relaxed text-ink2">
                Numbers with a dotted underline are read from these files when the page is built; hover one to see its file and key.{" "}
                <Code>web/scripts/verify-numbers.mjs</Code> checks every number in the built pages against the files.
              </p>
              <ProvenanceTable />
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold">Related work</h3>
              <ul className="list-disc space-y-2 pl-5 text-[0.95rem] leading-relaxed text-ink2">
                <li>Fraser-Taliente, Kantamneni, Ong et al. (2026), <a className="link" href={NLA}>Natural Language Autoencoders Produce Unsupervised Explanations of LLM Activations</a>. The models used here; their paper steers by editing Verbalizer output and reconstructing it.</li>
                <li>Fraser-Taliente, <a className="link" href="https://www.lesswrong.com/posts/NazprRfWJ4qkwcSro/nla-explanations-can-be-shortened-without-harming">NLA explanations can be shortened without harming reconstruction</a>.</li>
                <li>Turner et al. (2023), <a className="link" href="https://arxiv.org/abs/2308.10248">Steering Language Models With Activation Engineering</a>.</li>
                <li>Rimsky (Panickssery) et al. (2024), <a className="link" href="https://arxiv.org/abs/2312.06681">Steering Llama 2 via Contrastive Activation Addition</a>.</li>
                <li>Chen et al. (2025), <a className="link" href="https://arxiv.org/abs/2507.21509">Persona Vectors</a>: the method behind the standard vectors used here.</li>
              </ul>
            </div>
            <div id="history" className="scroll-mt-16">
              <h3 className="mb-3 text-lg font-semibold">Version history</h3>
              <p className="text-[0.95rem] leading-relaxed text-ink2">
                The first version of this page (August 2026) quoted numbers computed in June from earlier drafts of the descriptions. This version re-runs
                everything on the current descriptions and adds the open-ended steering runs and ratings. The June vectors are still in the repository.
              </p>
            </div>
            <div id="cite" className="scroll-mt-16"><h3 className="mb-3 text-lg font-semibold">Citation</h3><Citation /></div>
            <div>
              <h3 className="mb-3 text-lg font-semibold">Acknowledgments</h3>
              <p className="text-[0.95rem] leading-relaxed text-ink2">
                Thanks to the authors of Natural Language Autoencoders for releasing the models and code this work depends on, and to the ARENA team for the
                persona-vector exercises the standard vectors come from. The idea and the original experiments are the authors&apos;. This page was written with help from
                Claude, and the October runs were carried out with Claude Code using the scripts in <Code>analysis/</Code> and <Code>serve/</Code>; every
                number they produced is in the files listed above.
              </p>
            </div>
          </div>
        </Section>
      </main>
      <footer className="border-t border-edge py-10">
        <div className="mx-auto max-w-prose px-4 text-sm text-muted sm:px-6">
          <a className="link" href="/">Main page</a> · Uday Tyagi and Tyler Kim · <a className="link" href={LINKS.REPO}>Repository</a>
        </div>
      </footer>
    </>
  );
}
