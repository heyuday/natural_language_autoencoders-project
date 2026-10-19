#!/usr/bin/env python3
"""Copy the few gallery fields the site needs into a small file, so the client bundle does not
carry the whole 108 KB gallery. Values are copied, not changed.

    python analysis/export_site_meta.py
"""

from __future__ import annotations

import json

from common import REPO, provenance, write_json


def main() -> None:
    g = json.loads((REPO / "web/public/gallery.json").read_text())
    write_json("site_meta.json", {
        "provenance": provenance("export_site_meta.py", source="web/public/gallery.json"),
        "model": g["model"], "steer_layer": g["steer_layer"], "norm_ref": g["norm_ref"],
        "gallery_alphas": g["alphas"], "gallery_prompts": g["prompts"], "max_new_tokens": g["max_new_tokens"],
    })


if __name__ == "__main__":
    main()
