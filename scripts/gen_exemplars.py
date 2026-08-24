#!/usr/bin/env python3
"""Regenerate web/lib/exemplars.ts from nla_texts.py so the few-shot exemplars
given to the writing model cannot drift from the texts the notebooks compile."""
import json, sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
from nla_texts import SCENARIOS

PICKS = {
    "sycophancy": "Agrees enthusiastically with the user instead of correcting them",
    "religion": "Frames its answers in the language of religious faith",
}

lines = [
    "// GENERATED from nla_texts.py by scripts/gen_exemplars.py — do not edit by hand.",
    "// These are the exact texts the research notebooks compile, used as few-shot",
    "// exemplars so the model writes in the same register.",
    "",
    "export type Exemplar = { request: string; pos_text: string; neg_text: string };",
    "",
    "export const EXEMPLARS: Exemplar[] = [",
]
for concept, request in PICKS.items():
    s = SCENARIOS[concept][0]
    lines += [
        "  {",
        f"    request: {json.dumps(request)},",
        f"    pos_text: {json.dumps(s['pos'])},",
        f"    neg_text: {json.dumps(s['neg'])},",
        "  },",
    ]
lines.append("];")
(REPO / "web/lib/exemplars.ts").write_text("\n".join(lines) + "\n")
print("wrote web/lib/exemplars.ts")
