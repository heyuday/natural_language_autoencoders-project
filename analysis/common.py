"""Shared helpers for the analysis scripts that produce the website's data files.

Every number the website shows is written by one of the scripts in this folder into
web/public/data/*.json, together with a `source` string naming the input artifact. The
site reads those files; nothing on the page is typed in by hand.
"""

from __future__ import annotations

import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import torch

REPO = Path(__file__).resolve().parent.parent
DATA_OUT = REPO / "web" / "public" / "data"
sys.path.insert(0, str(REPO))

STEER_LAYER = 20  # model.layers index; its output is hidden_states[21], the NLA read layer
REFERENCE_TRAITS = ["sycophantic", "evil", "hallucinating"]
CAA_CONCEPTS = [
    "misaligned", "religious", "capitalist", "gandhi", "power_seeking",
    "trump", "hemingway", "valley_girl", "conspiracy_theorist",
    "compulsive_liar", "epistemic_coward", "contrarian", "obsequious_service",
]


def unit(v: torch.Tensor) -> torch.Tensor:
    v = v.float().flatten()
    return v / v.norm().clamp_min(1e-12)


def cos(a: torch.Tensor, b: torch.Tensor) -> float:
    return float(unit(a) @ unit(b))


def load(path: Path):
    return torch.load(path, map_location="cpu", weights_only=False)


def reference_vectors() -> dict[str, torch.Tensor]:
    """Persona-vector references, row STEER_LAYER of each [28, 3584] tensor (float32)."""
    return {t: load(REPO / f"{t}_vectors.pt")[STEER_LAYER].float() for t in REFERENCE_TRAITS}


def caa_vectors() -> dict[str, torch.Tensor]:
    """Experiment 4 CAA vectors, saved as {20: tensor[3584]}."""
    return {c: load(REPO / f"{c}_caa_vectors.pt")[STEER_LAYER].float() for c in CAA_CONCEPTS}


def git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def provenance(script: str, **extra) -> dict:
    return {
        "script": f"analysis/{script}",
        "generated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "repo_commit_at_run": git_commit(),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "machine": f"{platform.system()} {platform.machine()}",
        **extra,
    }


def r(x: float, nd: int = 4) -> float:
    """Round for storage only. The site formats for display; it never re-rounds upward."""
    return round(float(x), nd)


def write_json(name: str, payload: dict) -> Path:
    DATA_OUT.mkdir(parents=True, exist_ok=True)
    out = DATA_OUT / name
    out.write_text(json.dumps(payload, indent=1, ensure_ascii=False))
    print(f"wrote {out.relative_to(REPO)} ({out.stat().st_size / 1024:.0f} KB)")
    return out
