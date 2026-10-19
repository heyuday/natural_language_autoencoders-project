"use client";

import { useEffect, useState } from "react";

const ITEMS = [
  ["see", "See it"],
  ["method", "How it works"],
  ["autoencoder", "Baseline"],
  ["strength", "Strength"],
  ["decisions", "Decisions"],
  ["direction", "Direction"],
  ["technical", "Technical"],
  ["limits", "Limits"],
  ["try", "Try it"],
  ["appendix", "Appendix"],
] as const;

export function Nav() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === "light" || t === "dark") setTheme(t);
    else setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem("theme", next); } catch { /* storage unavailable */ }
  };
  return (
    <nav aria-label="Sections" className="sticky top-0 z-20 border-b border-edge bg-[color-mix(in_srgb,var(--page)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-wide items-center gap-3 px-4 py-2.5 sm:px-6">
        <a href="#top" className="whitespace-nowrap text-sm font-semibold text-ink">Steering from descriptions</a>
        <div className="flex min-w-0 flex-1 gap-4 overflow-x-auto [scrollbar-width:none]">
          {ITEMS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="whitespace-nowrap py-1 text-xs text-ink2 hover:text-ink">{label}</a>
          ))}
        </div>
        <button onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          className="rounded-md border border-edge px-2 py-1 text-xs text-ink2 hover:text-ink">
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
    </nav>
  );
}
