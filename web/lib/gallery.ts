/**
 * Alpha values are JSON object keys, and JSON has no stable float formatting:
 * build_gallery.py writes "1.0" while JavaScript's String(1.0) produces "1".
 * Look the value up by every plausible spelling, then fall back to a numeric
 * comparison so a key format change cannot silently blank the output.
 */
export function outputAt(
  outputs: Record<string, string> | undefined,
  alpha: number,
): string | undefined {
  if (!outputs) return undefined;
  const candidates = [String(alpha), alpha.toFixed(1), alpha.toFixed(2)];
  for (const key of candidates) {
    if (key in outputs) return outputs[key];
  }
  const match = Object.keys(outputs).find((k) => Number(k) === alpha);
  return match === undefined ? undefined : outputs[match];
}

const REFERENCE_LABELS: Record<string, string> = {
  "reference:sycophantic": "the sycophancy vector",
  "reference:evil": "the malice vector",
  "reference:hallucinating": "the confabulation vector",
};

function labelFor(key: string): string {
  if (REFERENCE_LABELS[key]) return REFERENCE_LABELS[key];
  const name = key.replace(/^caa:/, "").replace(/_/g, " ");
  return `a hand-built "${name}" contrast vector`;
}

function isConventional(key: string): boolean {
  return key.startsWith("reference:");
}

function signed(x: number): string {
  return `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;
}

/**
 * A sentence, not a number. The cosine on its own means nothing to a reader who
 * has not been told what it is measured against.
 */
export function describeAlignment(
  nearest: string | null,
  cos: number | null,
): string | null {
  if (!nearest || cos === null) return null;
  const label = labelFor(nearest);
  const conventional = isConventional(nearest);

  if (cos >= 0.3) {
    return conventional
      ? `Points the same way as ${label} — the one built the standard way, from labelled activation data. Cosine ${signed(cos)}, from text alone.`
      : `Points the same way as ${label} (cosine ${signed(cos)}).`;
  }
  if (cos <= -0.3) {
    return `Points away from ${label} (cosine ${signed(cos)}) — the opposite direction, which is what this behaviour should do.`;
  }
  if (cos >= 0.15) {
    return `Leans toward ${label} (cosine ${signed(cos)}); no reference vector exists for this exact behaviour.`;
  }
  return `Close to orthogonal against every reference vector we hold (nearest: ${label}, ${signed(cos)}).`;
}
