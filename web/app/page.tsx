import galleryJson from "@/public/gallery.json";
import type { Gallery as GalleryData } from "@/lib/types";
import { Hero, Explainer } from "@/components/Explainer";
import { HeroDemo } from "@/components/HeroDemo";
import { Gallery } from "@/components/Gallery";
import { LiveDemo } from "@/components/LiveDemo";

const gallery = galleryJson as unknown as GalleryData;
const liveEnabled = process.env.NEXT_PUBLIC_LIVE_ENABLED === "1";

const REPO_URL = "https://github.com/heyuday/natural_language_autoencoders-project";

// Display labels only -- the anchor IDs stay stable so existing links keep working.
const NAV = [
  ["why", "Why it matters"],
  ["how", "Mechanism"],
  ["what", "What we did"],
  ["register", "Wording"],
  ["geometry", "Two texts"],
  ["probes", "Detection"],
  ["gallery", "Gallery"],
  ["live", "Live"],
] as const;

export default function Page() {
  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-10 border-b border-edge bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 overflow-x-auto px-6 py-3">
          <span className="whitespace-nowrap font-mono text-xs text-fg">nla-steering</span>
          <div className="flex gap-4">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="whitespace-nowrap text-xs text-muted transition-colors hover:text-fg"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <Hero />
      <HeroDemo data={gallery} />
      <Explainer />
      <Gallery data={gallery} />
      <LiveDemo enabled={liveEnabled} />

      <footer className="border-t border-edge py-12">
        <div className="mx-auto max-w-3xl space-y-3 px-6 text-sm text-muted">
          <p>
            By{" "}
            <a
              href="https://github.com/heyuday"
              className="text-accent underline underline-offset-2"
              target="_blank" rel="noreferrer"
            >
              Uday Tyagi
            </a>{" "}
            and{" "}
            <a
              href="https://www.linkedin.com/in/tylerk1m/"
              className="text-accent underline underline-offset-2"
              target="_blank" rel="noreferrer"
            >
              Tyler Kim
            </a>
            .
          </p>
          <p>
            Built on the{" "}
            <a
              href="https://transformer-circuits.pub/2026/nla/index.html"
              className="text-accent underline underline-offset-2"
              target="_blank" rel="noreferrer"
            >
              Natural Language Autoencoders
            </a>{" "}
            released by Fraser-Taliente, Kantamneni, Ong et al., Transformer Circuits 2026.
            Target model {gallery.model}, steering at layer {gallery.steer_layer}.
          </p>
          <p>
            Notebooks, steering texts, and the full set of results are in the{" "}
            <a
              href={REPO_URL}
              className="text-accent underline underline-offset-2"
              target="_blank" rel="noreferrer"
            >
              project repository
            </a>
            . A longer write-up is in progress.
          </p>
          <p className="border-t border-edge pt-3 text-xs">
            This web page was built with the help of an LLM. The experiments and results it
            describes are the authors&apos; own.
          </p>
        </div>
      </footer>
    </main>
  );
}
