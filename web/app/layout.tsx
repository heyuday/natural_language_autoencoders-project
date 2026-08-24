import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steering a language model with hand-written text",
  description:
    "Compiling plain-English behaviour descriptions into activation steering vectors " +
    "with Natural Language Autoencoders — no labelled data, no fine-tuning.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
