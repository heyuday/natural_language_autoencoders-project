#!/usr/bin/env python3
"""How faithful and how fast is the int8 AR on CPU (the setting of a free CPU host)?

Compiles the seven gallery concepts with StreamingAR(int8=True) on CPU and compares each
delta with the A100 bf16 delta in serve/gallery_vectors.pt. Also times one text pair with
torch limited to N threads (default 2, the vCPU count of a free Hugging Face CPU Space).
The timing is from an Apple M2 Pro, whose cores are faster than a typical cloud vCPU, so it
is a lower bound for a hosted deployment.

    python analysis/check_ar_int8.py [--threads 2]

Output: web/public/data/ar_int8_check.json
"""

from __future__ import annotations

import argparse
import json
import time

import torch

from ar_stream import StreamingAR
from common import REPO, cos, load, provenance, r, write_json
import nla_texts as T


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threads", type=int, default=2)
    args = ap.parse_args()
    torch.set_num_threads(args.threads)

    gal = json.loads((REPO / "web/public/gallery.json").read_text())
    gv = load(REPO / "serve/gallery_vectors.pt")
    ar = StreamingAR(device="cpu", int8=True)

    s0 = T.SCENARIOS["sycophancy"][0]
    t0 = time.time()
    ar.run_ids([ar.ids_for(s0["pos"]), ar.ids_for(s0["neg"])], verbose=False)
    pair_seconds = time.time() - t0

    texts = [t for c in T.SCENARIOS for s in T.SCENARIOS[c] for t in (s["pos"], s["neg"])]
    V = dict(zip(texts, ar.reconstruct_many(texts)))
    res = {}
    for c in gal["concepts"]:
        ss = T.SCENARIOS[c["id"]]
        d = torch.stack([V[s["pos"]] for s in ss]).mean(0) - torch.stack([V[s["neg"]] for s in ss]).mean(0)
        res[c["id"]] = r(cos(d, gv[c["vector_id"]]), 5)
    out = {
        "provenance": provenance("check_ar_int8.py", label="NEW CHECK", threads=args.threads),
        "what": "cos(int8 AR on CPU delta, A100 bf16 delta) per gallery concept; seconds to compile one text pair",
        "cos_vs_a100": res,
        "min_cos": min(res.values()),
        "pair_seconds": r(pair_seconds, 1),
        "threads": args.threads,
    }
    write_json("ar_int8_check.json", out)
    print(out)


if __name__ == "__main__":
    main()
