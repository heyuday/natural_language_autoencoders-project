#!/usr/bin/env python3
"""Recompute the reference-vector cosines in gallery.json, CPU only.

The compiled deltas are saved alongside the gallery by build_gallery.py, so the
cosine readout can be corrected without re-running generation on a GPU. Use this
after changing load_reference_vectors; use build_gallery.py when the texts or
the generated outputs need to change.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

from build_gallery import load_reference_vectors, unit  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=str(REPO))
    ap.add_argument("--gallery", default=str(REPO / "web/public/gallery.json"))
    ap.add_argument("--vectors", default=str(REPO / "serve/gallery_vectors.pt"))
    args = ap.parse_args()

    repo = Path(args.repo)
    refs = load_reference_vectors(repo)
    print(f"loaded {len(refs)} reference vectors")

    deltas = torch.load(args.vectors, map_location="cpu")
    payload = json.loads(Path(args.gallery).read_text())

    for entry in payload["concepts"]:
        delta = deltas.get(entry["vector_id"])
        if delta is None:
            print(f"  {entry['id']}: no saved vector, left unchanged")
            continue
        u = unit(delta)
        cosines = {n: round(float(torch.dot(u, r)), 4) for n, r in refs.items()}
        ranked = sorted(cosines.items(), key=lambda kv: -abs(kv[1]))
        entry["all_cosines"] = dict(ranked)
        entry["nearest_reference"] = ranked[0][0] if ranked else None
        entry["cos_vs_nearest"] = ranked[0][1] if ranked else None
        print(f"  {entry['id']:18s} -> {entry['nearest_reference']} {entry['cos_vs_nearest']:+.3f}")

    Path(args.gallery).write_text(json.dumps(payload, indent=2))
    print(f"\nrewrote {args.gallery}")


if __name__ == "__main__":
    main()
