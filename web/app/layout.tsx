import type { Metadata, Viewport } from "next";
import "./globals.css";

const TITLE = "Steering vectors from written descriptions";
const DESCRIPTION =
  "Steering vectors for Qwen2.5-7B-Instruct made from written descriptions by the reconstructor " +
  "of a Natural Language Autoencoder: what changes, what does not, and every number traced to code.";

export const metadata: Metadata = {
  metadataBase: new URL("https://nla-steering.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  authors: [{ name: "Uday Tyagi" }, { name: "Tyler Kim" }],
  openGraph: { title: TITLE, description: DESCRIPTION, type: "article", url: "/" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f9f9f7",
};

// Light is the default. A reader who chose dark keeps it; this runs before first paint so they
// do not see a light flash. Storage can be unavailable (private mode); the page then stays light.
const THEME_SCRIPT = `try{if(localStorage.getItem("theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
