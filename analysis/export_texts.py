#!/usr/bin/env python3
"""Export nla_texts.py to web/public/data/texts.json so the site shows the exact texts.

    python analysis/export_texts.py
"""

from __future__ import annotations

from common import provenance, write_json
import nla_texts as T  # noqa: E402  (common puts the repo root on sys.path)


def main() -> None:
    write_json("texts.json", {
        "provenance": provenance("export_texts.py", source="nla_texts.py"),
        "scenarios": T.SCENARIOS,
        "default_contrast": T.DEFAULT_CONTRAST,
        "plain_pairs": {k: list(v) for k, v in T.PLAIN_PAIRS.items()},
        "keyword_pairs": {k: list(v) for k, v in T.KEYWORD_PAIRS.items()},
        "controls": {
            "register_neutral_office": T.T_REG_NEUTRAL_OFFICE,
            "register_neutral_library": T.T_REG_NEUTRAL_LIBRARY,
            "valence_pos": T.T_VALENCE_POS,
            "valence_neg": T.T_VALENCE_NEG,
            "syco_religious_pos": T.T_POS_SYCO_RELIGIOUS,
            "syco_religious_neg": T.T_NEG_SYCO_RELIGIOUS,
            "not_syco": T.T_NOT_SYCO,
        },
    })


if __name__ == "__main__":
    main()
