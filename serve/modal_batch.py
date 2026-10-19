"""Run analysis/gpu_behavior.py on a Modal GPU, paying only while it runs.

    modal run serve/modal_batch.py::download      # once: weights into a Modal Volume (CPU only)
    modal run serve/modal_batch.py::experiment    # the GPU run (one A100, about 15-40 min)
    modal volume get nla-runs gpu_oct runs/        # copy results back to the repo

Results land in runs/gpu_oct/: vectors.pt, cosines.json, grid.json, endorse.json.
"""

from pathlib import Path

import modal

REPO = Path(__file__).resolve().parent.parent
app = modal.App("nla-steering-batch")
weights = modal.Volume.from_name("nla-weights", create_if_missing=True)
runs = modal.Volume.from_name("nla-runs", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch==2.5.1", "transformers==4.57.1", "accelerate", "safetensors", "pyyaml", "numpy",
                 "huggingface_hub[hf_transfer]")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
    .add_local_dir(
        str(REPO), "/root/repo",
        ignore=[".git", "**/node_modules", "web/.next", "**/*.ipynb", "**/*.png", "exploration", "notebooks",
                "analysis/.ar_cache", "runs", "nla", "tools", "patches", "configs", "docs", "release", "examples",
                "**/__pycache__"],
    )
)


@app.function(image=image, volumes={"/weights": weights}, timeout=3600)
def download():
    from huggingface_hub import snapshot_download

    snapshot_download("Qwen/Qwen2.5-7B-Instruct", local_dir="/weights/qwen2.5-7b-instruct")
    weights.commit()
    print("weights ready")


@app.function(image=image, gpu="A100-40GB", volumes={"/weights": weights, "/runs": runs}, timeout=3 * 3600)
def experiment():
    import subprocess

    subprocess.run(["python", "/root/repo/analysis/gpu_behavior.py", "--model", "/weights/qwen2.5-7b-instruct",
                    "--out", "/runs/gpu_oct"], check=True)
    runs.commit()
