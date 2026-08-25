import { Section, Table, Note } from "./ui";

export function Hero() {
  return (
    <header className="mx-auto max-w-3xl px-6 pb-8 pt-20 sm:pt-24">
      <p className="mb-3 font-mono text-xs uppercase tracking-widest text-accent">
        Interpretability / activation steering
      </p>
      <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
        Write a sentence. Get a steering vector.
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-muted">
        Steering a language model&apos;s behaviour normally takes data — hundreds of labelled
        examples, run through the model, averaged into a direction. This project asks whether you
        can skip all of it and simply <em className="not-italic text-fg">describe</em> the behaviour
        you want, in English, and have that description compiled into a vector that works.
      </p>
      <div className="mt-5 space-y-1 text-sm leading-relaxed text-muted">
        <p>
          by <span className="text-fg">Uday Tyagi</span>{" "}
          <a
            href="https://github.com/heyuday"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            target="_blank" rel="noreferrer"
          >
            github
          </a>
          {" · "}
          <a
            href="https://www.linkedin.com/in/heyuday/"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            target="_blank" rel="noreferrer"
          >
            linkedin
          </a>
        </p>
        <p>
          <span className="text-fg">Tyler Kim</span>{" "}
          <a
            href="https://www.linkedin.com/in/tylerk1m/"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            target="_blank" rel="noreferrer"
          >
            linkedin
          </a>
        </p>
      </div>
    </header>
  );
}

export function Explainer() {
  return (
    <>
      <Section id="why" eyebrow="Why this matters" title="Steering is a tool for auditing models">
        <div className="space-y-5 text-[15px] leading-relaxed text-muted">
          <p>
            Activation steering adds a vector directly to a model&apos;s internal state while it
            generates, rather than changing what you ask it. That makes it a probe as much as a
            control: if adding one direction reliably makes a model sycophantic, deceptive, or
            willing to work around oversight, then that direction is evidence about how the
            behaviour is represented internally — not just a way to produce it.
          </p>
          <p>
            This matters for safety work in two directions. Eliciting a behaviour without prompting
            for it lets you test whether a model <em className="not-italic text-fg">can</em> do
            something it normally declines to do, which prompt-based red-teaming cannot cleanly
            separate from instruction-following. And the same direction usually works as a
            detector, so you can ask whether a behaviour is present in a response the model
            produced on its own.
          </p>
          <p>
            The obstacle is that building these directions has required labelled activation data
            for every behaviour you want to look at. That is fine for sycophancy, which people have
            already built datasets for, and useless for the long tail of behaviours an auditor
            actually wants to check. This project is about removing that constraint. It sits in the
            same space as contrastive activation addition and linear probing generally; the
            contribution is where the direction comes from, not what is done with it.
          </p>
        </div>
      </Section>

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
            That second direction is the interesting one. It is a text-to-vector compiler — and
            nothing forces the text you hand it to have come from a real forward pass.
          </p>
        </div>
      </Section>

      <Section id="what" eyebrow="What we did" title="Compiling a description into a direction">
        <div className="space-y-5 text-[15px] leading-relaxed text-muted">
          <p>
            We hand-wrote descriptions of passages that display a behaviour, and descriptions of
            passages that display its opposite, and passed both through the Reconstructor. The
            steering vector is the difference between the two predicted activations:
          </p>
          <p className="rounded-md border border-edge bg-panel px-4 py-3 text-center font-mono text-sm text-fg">
            Δ = AR(t<sub>pos</sub>) − AR(t<sub>neg</sub>)
          </p>
          <p>
            That difference is then added back into the residual stream mid-generation, at the layer
            the autoencoder was trained on — layer 20 of Qwen2.5-7B — scaled relative to the size of
            a typical activation there:
          </p>
          <p className="rounded-md border border-edge bg-panel px-4 py-3 text-center font-mono text-sm text-fg">
            h → h + α · ‖h‖ · (Δ / ‖Δ‖)
          </p>
          <p>
            No labelled examples, no activation collection, no fine-tuning, no gradient updates.
            Two paragraphs of English per behaviour. The slider marked{" "}
            <span className="font-mono text-fg">alpha</span> throughout this page is that α, and
            zero is the unmodified model.
          </p>
          <p>
            Push α far enough and the output stops being coherent — the model starts looping or
            free-associating. Where that happens is not a fixed threshold: it varies by behaviour
            and by prompt. Some of the vectors below still produce clean, on-topic text at α = 1.0,
            while others have already broken down by then, and everything degrades somewhere past
            it. That ceiling is itself informative — you are pushing the residual stream off the
            manifold it was trained on, and how far you can push before it tears differs by
            direction.
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
          <p>
            To measure the gap we need something to compare against. For a few behaviours a
            reference vector already exists, built the conventional way from labelled activation
            differences. Cosine similarity against it scores how closely a compiled vector points
            the same way: 1.0 is identical, 0 is unrelated. In 3584 dimensions two arbitrary vectors
            sit within a hair of 0, so anything clearly above it is signal.
          </p>
          <Table
            head={["Steering text for sycophancy", "cos vs reference"]}
            rows={[
              ["Written in the Verbalizer's own style", "+0.406"],
              ["Plain instruction, same meaning", "+0.080"],
            ]}
          />
          <p>
            Same meaning, five times the alignment. Ablating parts of the register text shows where
            the signal lives: removing the quoted example phrases costs 53% of that alignment, and
            removing the final-token guess costs 41%, while paraphrasing the surrounding
            description barely moves it. The load-bearing parts are structural — the most
            influential tokens are not &ldquo;agree&rdquo; or &ldquo;flatter&rdquo;.
          </p>
          <Note>
            One clean exception: for &ldquo;evil&rdquo;, a plain instruction beats the register
            format, +0.604 against +0.429. It appears to be a strong enough semantic signal on its
            own that the register&apos;s abstraction dilutes rather than helps.
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
            Take the midpoint between each behaviour&apos;s two reconstructions —{" "}
            <span className="font-mono text-fg">(AR(t_pos) + AR(t_neg)) / 2</span>, the part the two
            descriptions have in common — and compare midpoints across unrelated behaviours:
            sycophancy, malice, religiosity, Gandhi. They are not spread across activation space.
            Their mean pairwise cosine is <span className="font-mono text-fg">+0.789</span>, which
            for unrelated concepts in 3584 dimensions is enormous. They are nearly the same vector.
          </p>
          <p>
            Meanwhile the mean cosine between a midpoint and its own behaviour direction is{" "}
            <span className="font-mono text-fg">+0.005</span> — orthogonal. So almost everything the
            Reconstructor emits for Verbalizer-shaped text is a shared background belonging to the
            register itself, and the behaviour lives entirely in what the two descriptions disagree
            about. Subtracting cancels the background; using one text alone carries it along.
          </p>
          <p>
            This also reframes how to write the pair. The two texts should describe genuinely
            opposite passages — a gushing reply against a blunt corrective one — rather than a
            behaviour and its negation. Both then sit in the same background, so the subtraction
            actually removes it.
          </p>
        </div>
      </Section>

      <Section id="probes" eyebrow="Finding 3" title="The compiled vectors also work as detectors">
        <div className="space-y-5 text-[15px] leading-relaxed text-muted">
          <p>
            A steering direction should also be a detection direction. We generated responses under
            a behaviour-eliciting system prompt and under a neutral one, then tried to tell them
            apart using nothing but the dot product of each response&apos;s mean activation with the
            compiled vector. AUROC scores that separation: 1.0 is perfect, 0.5 is a coin flip.
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
            Over 24 sycophancy responses and 20 malice responses. Two paragraphs of hand-written
            text separate them perfectly — matching the vector built from labelled activation data,
            which is the ceiling here rather than a competitor.
          </p>
        </div>
      </Section>

      <Section id="limits" eyebrow="Honest limits" title="What does not work">
        <ul className="space-y-4 text-[15px] leading-relaxed text-muted">
          <li>
            <strong className="font-medium text-fg">Composition is approximate.</strong> A text
            describing both sycophancy and religiosity compiles to a vector that loads on both
            components in roughly the right proportions, but about 45% of it lies outside their
            span. It is not clean vector arithmetic.
          </li>
          <li>
            <strong className="font-medium text-fg">The loop does not close.</strong> Steering the
            model and reading the resulting activations back through the Verbalizer describes the
            surface content of the response, not the injected behaviour. It is not a detector on
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
