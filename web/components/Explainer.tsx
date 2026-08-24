import { Section, Stat, Table, Note } from "./ui";

export function Hero() {
  return (
    <header className="mx-auto max-w-3xl px-6 pb-4 pt-20 sm:pt-28">
      <p className="mb-3 font-mono text-xs uppercase tracking-widest text-accent">
        Natural Language Autoencoders / steering
      </p>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
        Write a sentence. Get a steering vector.
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-muted">
        Activation steering normally needs data: hundreds of labelled contrastive examples run
        through the model, then averaged. This project asks whether you can skip all of that and
        simply <em className="not-italic text-fg">describe</em> the behaviour you want in text.
      </p>
      <p className="mt-4 text-lg leading-relaxed text-muted">
        You can. Two hand-written paragraphs, compiled through an NLA reconstructor, produce a
        vector that steers Qwen2.5-7B as well as one built from labelled activations — and works
        as a behavioural classifier at the same accuracy.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value="+0.406" label="cosine vs a reference vector built from labelled data" />
        <Stat value="1.000" label="probe AUROC, matching the labelled-data baseline" />
        <Stat value="0" label="labelled examples, fine-tuning steps, gradient updates" />
        <Stat value="2" label="paragraphs of hand-written text per concept" />
      </div>
    </header>
  );
}

export function Explainer() {
  return (
    <>
      <Section id="how" eyebrow="Mechanism" title="Activations to text, and back again">
        <div className="space-y-5 text-[15px] leading-relaxed text-muted">
          <p>
            A{" "}
            <a
              href="https://transformer-circuits.pub/2026/nla/index.html"
              className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
              target="_blank" rel="noreferrer"
            >
              Natural Language Autoencoder
            </a>{" "}
            is a pair of small models trained jointly on top of a target model&apos;s residual
            stream. The <strong className="font-medium text-fg">Verbalizer</strong> reads an
            activation vector and writes a short description of what the model is representing at
            that position. The <strong className="font-medium text-fg">Reconstructor</strong> runs
            the other way: it reads such a description and predicts the activation vector it came
            from.
          </p>
          <p>
            That second direction is a text-to-vector compiler. If you hand-write a description and
            pass it through the Reconstructor, you get an activation vector — one that never came
            from a real forward pass, describing a passage that was never written.
          </p>
          <p>
            The steering vector is a difference of two such descriptions. Write one describing a
            passage that shows the behaviour, one describing an opposite passage, and subtract:
          </p>
          <p className="rounded-md border border-edge bg-panel px-4 py-3 text-center font-mono text-sm text-fg">
            Δ = AR(t<sub>pos</sub>) − AR(t<sub>neg</sub>)
          </p>
          <p>
            Then add it back into the model mid-generation, at the layer the autoencoder was trained
            on — layer 20 of Qwen2.5-7B — scaled relative to the size of a typical activation
            there:
          </p>
          <p className="rounded-md border border-edge bg-panel px-4 py-3 text-center font-mono text-sm text-fg">
            h → h + α · ‖h‖ · (Δ / ‖Δ‖)
          </p>
          <p>
            The slider labelled <span className="font-mono text-fg">alpha</span> throughout this
            page is that α. Zero is the unmodified model. Past roughly 1.5 the output degrades into
            incoherence, which is itself informative — you are pushing the residual stream well off
            the manifold it was trained on.
          </p>
        </div>
      </Section>

      <Section id="register" eyebrow="Finding 1" title="How you write the text matters as much as what it says">
        <div className="space-y-5 text-[15px] leading-relaxed text-muted">
          <p>
            The Reconstructor was trained on Verbalizer output, and that output has a recognisable
            shape: a genre or voice label, a description of what the passage is doing, then quoted
            fragments and an explicit guess at the next token. Text written in that shape is in
            distribution. An instruction like &ldquo;be sycophantic&rdquo; is not.
          </p>
          <p>The gap is not subtle. Measured as cosine against a reference vector built the
            conventional way, from labelled activation differences:</p>
          <Table
            head={["Steering text for sycophancy", "cos vs reference"]}
            rows={[
              ["Written in the Verbalizer's register", "+0.406"],
              ["Plain instruction, same meaning", "+0.080"],
            ]}
          />
          <p>
            Ablating parts of the register text shows where the signal lives. Removing the quoted
            example phrases costs 53% of the alignment; removing the final-token guess costs 41%.
            Paraphrasing the surrounding description barely moves it. The load-bearing parts are
            structural, not the trait words — the most influential tokens are not
            &ldquo;agree&rdquo; or &ldquo;flatter&rdquo;.
          </p>
          <Note>
            One clean exception: for &ldquo;evil&rdquo;, a plain instruction beats the register
            format (+0.604 against +0.429). It appears to be a strong enough semantic signal that
            the register&apos;s abstraction dilutes rather than helps.
          </Note>
        </div>
      </Section>

      <Section id="geometry" eyebrow="Finding 2" title="Why the difference of two texts works better than one">
        <div className="space-y-5 text-[15px] leading-relaxed text-muted">
          <p>
            A single description compiles to a usable vector, but it is noticeably noisier than the
            difference of two. The geometry explains why.
          </p>
          <p>
            Take the midpoint of each concept&apos;s two reconstructions,{" "}
            <span className="font-mono text-fg">(AR(t_pos) + AR(t_neg)) / 2</span>, and compare
            midpoints across unrelated concepts — sycophancy, malice, religiosity, Gandhi. They are
            not spread across activation space. They sit almost on top of each other:
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat value="+0.789" label="mean pairwise cosine between concept midpoints" />
            <Stat value="+0.005" label="mean cosine between a midpoint and its own trait direction" />
          </div>
          <p>
            Nearly everything the Reconstructor emits for Verbalizer-shaped text is a shared
            background — the register itself, not the content. The trait lives almost entirely in
            the difference between the two descriptions, which is orthogonal to that background.
            Subtracting cancels the background; using one text alone carries it along.
          </p>
          <p>
            This reframes how to write the pair. The two texts should describe genuinely opposite
            passages — a gushing reply against a blunt corrective one — rather than a trait and its
            negation. Both then sit in the same background, so the subtraction actually removes it.
          </p>
        </div>
      </Section>

      <Section id="probes" eyebrow="Finding 3" title="The compiled vectors also work as classifiers">
        <div className="space-y-5 text-[15px] leading-relaxed text-muted">
          <p>
            A steering direction should also be a detection direction. Taking the dot product of a
            response&apos;s mean activation with the compiled vector separates responses generated
            under a trait-eliciting system prompt from responses to a neutral one:
          </p>
          <Table
            head={["Vector", "Sycophancy", "Malice"]}
            rows={[
              ["Compiled from register text", "1.000", "1.000"],
              ["Compiled from a plain instruction", "0.986", "1.000"],
              ["Built from labelled activations", "1.000", "1.000"],
              ["Random, norm-matched", "0.771", "0.190"],
            ]}
          />
          <p>
            AUROC over 24 sycophancy responses and 20 malice responses. Two paragraphs of
            hand-written text produce a behavioural probe that matches one built from labelled
            activation data.
          </p>
        </div>
      </Section>

      <Section id="limits" eyebrow="Honest limits" title="What does not work">
        <ul className="space-y-4 text-[15px] leading-relaxed text-muted">
          <li>
            <strong className="font-medium text-fg">Composition is approximate.</strong> A text
            describing both sycophancy and religiosity compiles to a vector that loads on both
            components in the right proportions, but roughly 45% of it lies outside their span. It
            is not clean vector arithmetic.
          </li>
          <li>
            <strong className="font-medium text-fg">The loop does not close.</strong> Steering the
            model and reading the resulting activations back through the Verbalizer describes the
            surface content of the response, not the injected trait. It is not a trait detector on
            steered activations.
          </li>
          <li>
            <strong className="font-medium text-fg">Iteration does not improve anything.</strong>{" "}
            Cycling text through the autoencoder — text to vector to text — does not progressively
            sharpen alignment. The Verbalizer starts describing the format rather than the meaning.
          </li>
          <li>
            <strong className="font-medium text-fg">One model, one layer.</strong> Everything here
            is Qwen2.5-7B-Instruct at layer 20. Whether it generalises across models and depths is
            untested.
          </li>
        </ul>
      </Section>
    </>
  );
}
