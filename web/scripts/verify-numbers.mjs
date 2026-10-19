#!/usr/bin/env node
/**
 * Check every number in the built page against the data files.
 *
 *   npm run build && node scripts/verify-numbers.mjs
 *
 * 1. Every element with data-src="path" must display a formatting of the value at that
 *    path in web/public/data/*.json (or gallery.json). Any mismatch fails the check.
 * 2. Every other number in the visible prose (outside charts, code blocks and the data
 *    tables) must equal some value in the data files under a standard formatting, or be on
 *    a short list of structural constants (layer indices, model sizes, dates). Anything else
 *    is printed for a human to review, and fails the check.
 */
import fs from "node:fs";
import path from "node:path";

const WEB = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const HTML = path.join(WEB, ".next/server/app/index.html");
const read = (p) => JSON.parse(fs.readFileSync(path.join(WEB, p), "utf8"));
const DATA = {
  saved: read("public/data/saved_artifacts.json"),
  ar: read("public/data/ar_rerun.json"),
  texts: read("public/data/texts.json"),
  layer: read("public/data/llamacpp_layer_check.json"),
  bsum: read("public/data/behavior_summary.json"),
  int8: read("public/data/ar_int8_check.json"),
  x: read("public/data/extra_controls.json"),
  g: read("public/data/gpu_summary.json"),
  gallery: read("public/data/site_meta.json"),
};

function get(p) {
  const parts = p.split(".");
  let cur = DATA, i = 0;
  while (i < parts.length) {
    if (cur === null || typeof cur !== "object") return undefined;
    let found = false;
    for (let j = i + 1; j <= parts.length; j++) {
      const k = parts.slice(i, j).join(".");
      if (k in cur) { cur = cur[k]; i = j; found = true; break; }
    }
    if (!found) return undefined;
  }
  return cur;
}

const M = "−";
function formats(v) {
  const sgn = (s) => (v < 0 ? M + s.replace("-", "") : s);
  return new Set([
    (v >= 0 ? "+" : M) + Math.abs(v).toFixed(3), (v >= 0 ? "+" : M) + Math.abs(v).toFixed(2),
    sgn(v.toFixed(5)), sgn(v.toFixed(3)), sgn(v.toFixed(2)), sgn(v.toFixed(1)), sgn(v.toFixed(0)),
    sgn((v * 100).toFixed(0)) + "%", sgn((v * 100).toFixed(1)) + "%", String(Math.round(v)),
  ]);
}

const html = fs.readFileSync(HTML, "utf8").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
let failures = 0;

// 1. data-src numbers
const re = /<span class="num" data-src="([^"]+)"[^>]*>([^<]*)<\/span>/g;
let n = 0;
for (let m = re.exec(html); m; m = re.exec(html)) {
  n++;
  const [, p, shown] = m;
  const v = get(p);
  if (typeof v !== "number") { console.log(`FAIL  ${p}: no number in data (shows "${shown}")`); failures++; continue; }
  if (!formats(v).has(shown)) { console.log(`FAIL  ${p}: shows "${shown}", data has ${v}`); failures++; }
}
console.log(`checked ${n} data-sourced numbers`);

// 2. every other number in visible prose
const values = new Set();
(function walk(x) {
  if (typeof x === "number") for (const f of formats(x)) values.add(f.replace(/^[+−]/, ""));
  else if (Array.isArray(x)) x.forEach(walk);
  else if (x && typeof x === "object") Object.values(x).forEach(walk);
})(DATA);
// numbers that occur inside quoted data text (prompts, model outputs, descriptions)
const quoted = new Set();
for (const f of ["public/gallery.json", "public/data/sweep_sycophancy.json", "public/data/texts.json", ...["sycophancy", "evil", "hallucinating", "misalignment", "religion", "political_economy", "gandhi"].map((c) => `public/data/gpu_grid_${c}.json`)]) {
  (function walk(x) {
    if (typeof x === "string") for (const t of x.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) quoted.add(t);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  })(read(f));
}
const STRUCTURAL = new Set([
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "15", "16", "17", "19", "20", "21", "25", "27", "28",
  "0.5", "1.0", "1.25", "0.95", "95%", "99%", "4.4", "0.05", "0.25", "0.75", "1.5", "0.7", "120", "160", "3584", "2026", "2025", "2024", "2023", "2.5", "7", "2,000", "2000", "19", "45%", "53%", "41%", "100",
]);
let prose = html
  .replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<pre[\s\S]*?<\/pre>/g, " ").replace(/<code[\s\S]*?<\/code>/g, " ")
  .replace(/<details[\s\S]*?<\/details>/g, " ")
  .replace(/<span class="num" data-src[\s\S]*?<\/span>/g, " ")
  .replace(/<span[^>]*data-derived[^>]*>[\s\S]*?<\/span>/g, " ")
  .replace(/<p[^>]*data-derived[^>]*>[\s\S]*?<\/p>/g, " ")
  .replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/g, " ")
  .replace(/<[^>]+>/g, " ");
const tokens = prose.match(/[−+]?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
const unknown = new Map();
for (const t of tokens) {
  const bare = t.replace(/^[+−]/, "").replace(/,$/, "");
  if (STRUCTURAL.has(bare) || values.has(bare) || values.has(bare.replace(/,/g, "")) || quoted.has(bare)) continue;
  const ctx = prose.slice(Math.max(0, prose.indexOf(t) - 50), prose.indexOf(t) + 30).replace(/\s+/g, " ");
  unknown.set(t, ctx);
}
for (const [t, ctx] of unknown) { console.log(`REVIEW  "${t}"  …${ctx}…`); }
console.log(`${tokens.length} other numbers in prose, ${unknown.size} not found in the data files or the structural list`);
if (unknown.size) failures++;
process.exit(failures ? 1 : 0);
