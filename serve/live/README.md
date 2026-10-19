# Live backend: compile and steer with no GPU

`app.py` serves the "Compile your own steering vector" panel on the site:

| Endpoint | Does |
|---|---|
| `GET /health` | reports what is loaded |
| `POST /compile {pos_text, neg_text}` | runs both texts through the NLA Reconstructor, returns the vector id, its norm, and cosines against every reference and CAA vector in the repo |
| `POST /steer {vector_id, prompt, alpha, max_new_tokens}` | streams newline-delimited JSON: the unsteered answer (`{"b": ...}`), then the steered answer token by token (`{"t": ...}`) |

The Reconstructor runs through `analysis/ar_stream.py`, one decoder layer in memory at a time.
The target model is the official Q8_0 GGUF of Qwen2.5-7B-Instruct in llama.cpp, with the vector
added at the output of block 20 (control-vector row 19, verified by
`analysis/check_llamacpp_layer.py`). Nothing needs a GPU.

## Option A: run it on your own machine (free, works today)

Any Mac with 16 GB of memory, or a Linux box with 16 GB of RAM:

```bash
pip install fastapi uvicorn llama-cpp-python torch transformers safetensors pyyaml
hf download kitft/nla-qwen2.5-7b-L20-ar --local-dir ~/models-nla/nla-ar
hf download Qwen/Qwen2.5-7B-Instruct-GGUF --include "qwen2.5-7b-instruct-q8_0-*" --local-dir ~/models-nla/qwen-gguf
python serve/live/app.py --port 7860            # Apple Silicon: bf16 on Metal
# on a CPU-only machine:  python analysis/quantize_ar_int8.py && python serve/live/app.py --int8
```

Then on the site, under "Try it", connect to `http://localhost:7860`. Chrome and Firefox allow an
https page to call localhost; Safari blocks it, so use one of the other two.

Measured on an Apple M2 Pro: compiling one pair takes tens of seconds on Metal; on the CPU with two
threads and the int8 copy it took 64 s (`web/public/data/ar_int8_check.json`), and the int8 vectors
match the A100 bf16 vectors to a cosine of at least 0.9992.

## Option B: a free CPU Hugging Face Space (needs the owner's Hugging Face account)

The free "CPU basic" Space hardware (2 vCPU, 16 GB RAM) fits the int8 Reconstructor (5.1 GB) and the
Q8_0 model (8.1 GB). It costs nothing; expect roughly one to two minutes per compile and about the
same for a 120-token answer, because the free CPUs are slower than a laptop. The Space sleeps after
48 hours without visitors; the first request after that re-downloads about 19 GB.

```bash
# 1. Create a Space: https://huggingface.co/new-space  -> SDK: Docker, hardware: CPU basic (free)
# 2. Push the files it needs (from the repository root):
git clone https://huggingface.co/spaces/<you>/nla-steering-live /tmp/space
mkdir -p /tmp/space/analysis /tmp/space/serve/live /tmp/space/web/public/data
cp analysis/ar_stream.py analysis/quantize_ar_int8.py /tmp/space/analysis/
cp serve/live/app.py serve/live/start.sh /tmp/space/serve/live/
cp serve/live/Dockerfile /tmp/space/Dockerfile
cp *_vectors.pt /tmp/space/
cp web/public/data/ar_rerun.json /tmp/space/web/public/data/
printf -- '---\ntitle: nla-steering-live\nsdk: docker\napp_port: 7860\n---\n' > /tmp/space/README.md
cd /tmp/space && git add -A && git commit -m "live backend" && git push
# 3. In Vercel, set NEXT_PUBLIC_LIVE_URL=https://<you>-nla-steering-live.hf.space and redeploy.
```

Set `ALLOW_ORIGINS=https://nla-steering.vercel.app` in the Space's variables to accept requests only
from the site. The server handles one request at a time; others wait.

## Option C: a GPU

`serve/modal_app.py` is the earlier Modal design (A10G, billed per second). It is faster and costs
money; set a spend cap if you use it.
