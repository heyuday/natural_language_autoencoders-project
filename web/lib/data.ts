/**
 * Every number on the page comes from one of these files, which are written by the
 * scripts in analysis/. Components never type a result in by hand: they ask for a path
 * like "ar.register_gap.concepts.sycophancy.plain" and render whatever the file says.
 */
import saved from "@/public/data/saved_artifacts.json";
import ar from "@/public/data/ar_rerun.json";
import texts from "@/public/data/texts.json";
import layer from "@/public/data/llamacpp_layer_check.json";
import bsum from "@/public/data/behavior_summary.json";
import int8 from "@/public/data/ar_int8_check.json";
import x from "@/public/data/extra_controls.json";
import g from "@/public/data/gpu_summary.json";
import gallery from "@/public/data/site_meta.json";
export { fmt, LABEL, REF_LABEL, type Fmt } from "./labels";
import { fmt } from "./labels";

export const DATA = { saved, ar, texts, layer, bsum, int8, x, g, gallery } as const;

export const FILES: Record<keyof typeof DATA, { file: string; script: string; kind: string }> = {
  saved: { file: "web/public/data/saved_artifacts.json", script: "analysis/saved_artifacts.py", kind: "recomputed from tensors saved in the repo" },
  ar: { file: "web/public/data/ar_rerun.json", script: "analysis/ar_rerun.py", kind: "new experiment, Oct 2026" },
  texts: { file: "web/public/data/texts.json", script: "analysis/export_texts.py", kind: "export of nla_texts.py" },
  layer: { file: "web/public/data/llamacpp_layer_check.json", script: "analysis/check_llamacpp_layer.py", kind: "new check, Oct 2026" },
  bsum: { file: "web/public/data/behavior_summary.json", script: "analysis/summarize_behavior.py", kind: "new experiment, Oct 2026" },
  g: { file: "web/public/data/gpu_summary.json", script: "analysis/summarize_gpu.py", kind: "new experiment, bf16 on an A100 (Modal), Oct 2026" },
  x: { file: "web/public/data/extra_controls.json", script: "analysis/extra_controls.py", kind: "new analysis on saved data, Oct 2026" },
  int8: { file: "web/public/data/ar_int8_check.json", script: "analysis/check_ar_int8.py", kind: "new check, Oct 2026" },
  gallery: { file: "web/public/data/site_meta.json", script: "analysis/export_site_meta.py", kind: "fields copied from the original A100 gallery (scripts/build_gallery.py, Aug 2026)" },
};

export function get(path: string): unknown {
  // Keys may themselves contain dots (quantiles are stored under "0.95"), so at each level
  // take the shortest run of segments that names an existing key.
  const parts = path.split(".");
  let cur: unknown = DATA;
  let i = 0;
  while (i < parts.length) {
    if (cur === null || typeof cur !== "object") { cur = undefined; break; }
    let found = false;
    for (let j = i + 1; j <= parts.length; j++) {
      const key = parts.slice(i, j).join(".");
      if (key in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[key];
        i = j;
        found = true;
        break;
      }
    }
    if (!found) { cur = undefined; break; }
  }
  if (cur === undefined) throw new Error(`data path not found: ${path}`);
  return cur;
}

export function num(path: string): number {
  const v = get(path);
  if (typeof v !== "number") throw new Error(`not a number at ${path}: ${JSON.stringify(v)}`);
  return v;
}

export function srcLabel(path: string): string {
  const key = path.split(".")[0] as keyof typeof DATA;
  const f = FILES[key];
  return f ? `${f.file} → ${path.slice(key.length + 1)}  (${f.kind}; ${f.script})` : path;
}

