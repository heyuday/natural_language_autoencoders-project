/** Display helpers that are safe to import from client components (no data files). */

const MINUS = "−";

export type Fmt = "s3" | "s2" | "d5" | "d3" | "d2" | "d1" | "d0" | "pct" | "pct1" | "int";

/** Display formatting only. Values are stored at full precision in the JSON files. */
export function fmt(v: number, f: Fmt = "s3"): string {
  const sign = (s: string) => (v < 0 ? MINUS + s.replace("-", "") : s);
  switch (f) {
    case "s3": return (v >= 0 ? "+" : MINUS) + Math.abs(v).toFixed(3);
    case "s2": return (v >= 0 ? "+" : MINUS) + Math.abs(v).toFixed(2);
    case "d5": return sign(v.toFixed(5));
    case "d3": return sign(v.toFixed(3));
    case "d2": return sign(v.toFixed(2));
    case "d1": return sign(v.toFixed(1));
    case "d0": return sign(v.toFixed(0));
    case "pct": return sign((v * 100).toFixed(0)) + "%";
    case "pct1": return sign((v * 100).toFixed(1)) + "%";
    case "int": return String(Math.round(v));
  }
}

export const LABEL: Record<string, string> = {
  sycophancy: "Sycophancy",
  evil: "Malice",
  hallucinating: "Confabulation",
  misalignment: "Misalignment",
  religion: "Religiosity",
  political_economy: "Pro-market",
  gandhi: "Nonviolence",
};

export const REF_LABEL: Record<string, string> = {
  sycophantic: "sycophantic",
  evil: "evil",
  hallucinating: "hallucinating",
};
