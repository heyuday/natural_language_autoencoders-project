# Free CPU Hugging Face Space (2 vCPU, 16 GB RAM) for the live "compile your own vector" panel.
# Build context: the repository root. See serve/live/README.md.
FROM python:3.11-slim

RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir fastapi "uvicorn[standard]" transformers safetensors pyyaml numpy "huggingface_hub[cli]" \
 && pip install --no-cache-dir llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH \
    NLA_AR_PATH=/home/user/models/nla-ar \
    QWEN_GGUF=/home/user/models/qwen-gguf/qwen2.5-7b-instruct-q8_0-00001-of-00003.gguf \
    AR_INT8=1 THREADS=2 HOST=0.0.0.0 PORT=7860
WORKDIR /home/user/app

COPY --chown=user analysis/ar_stream.py analysis/quantize_ar_int8.py analysis/
COPY --chown=user serve/live/app.py serve/live/start.sh serve/live/
COPY --chown=user *_vectors.pt ./
COPY --chown=user web/public/data/ar_rerun.json web/public/data/

EXPOSE 7860
CMD ["bash", "serve/live/start.sh"]
