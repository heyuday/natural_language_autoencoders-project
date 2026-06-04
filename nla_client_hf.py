"""SGLang-free drop-in replacement for nla_inference.NLAClient.

The original NLAClient builds the injected embedding sequence locally in pure
PyTorch, then ships it to an SGLang server over HTTP for generation. This class
keeps all of that local injection logic (imported verbatim from nla_inference)
and replaces only the HTTP/SGLang generation step with a local HF
`model.generate(inputs_embeds=...)` call.

Interface matches NLAClient: `.generate(activation, ...)` and
`.generate_batch(activations, ...)`, so it is a drop-in in any notebook that
imported NLAClient.

Requires nla_inference.py in the same directory (curl it from the kitft repo).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# Reuse the original injection math + sidecar parsing — do NOT reimplement these.
from nla_inference import (
    EXPLANATION_RE,
    INJECT_PLACEHOLDER,
    inject_at_marked_positions,
    load_embedding_only,
    load_nla_config,
    normalize_activation,
    resolve_embed_scale,
)


class NLAClientHF:
    """Activation verbalizer (AV) inference via local HF generate. No SGLang."""

    def __init__(
        self,
        checkpoint_dir: str | Path,
        device: str = "cuda",
        dtype: torch.dtype = torch.bfloat16,
        injection_scale_override: float | None = None,
    ):
        checkpoint_dir = Path(checkpoint_dir)
        self.tokenizer = AutoTokenizer.from_pretrained(
            str(checkpoint_dir), trust_remote_code=True
        )
        # Parses nla_meta.yaml and asserts tokenizer / injection-neighbor agreement.
        # If these asserts fire, trust them — they catch the silent-CJK failure mode.
        self.cfg = load_nla_config(
            checkpoint_dir, self.tokenizer,
            injection_scale_override=injection_scale_override,
        )
        # Embedding table only (~300MB, ~2s) for the injection math.
        self.embed = load_embedding_only(checkpoint_dir, dtype=dtype).to(device)
        self.embed_scale = resolve_embed_scale(checkpoint_dir)
        assert self.embed.weight.shape[1] == self.cfg.d_model, (
            f"embedding d={self.embed.weight.shape[1]} != sidecar "
            f"d_model={self.cfg.d_model}. Wrong checkpoint for this sidecar."
        )
        # Full AV model for generation. .to(device) instead of device_map keeps
        # us off accelerate's auto-sharding (single GPU here anyway).
        self.av_model = AutoModelForCausalLM.from_pretrained(
            str(checkpoint_dir), torch_dtype=dtype, trust_remote_code=True
        ).to(device).eval()
        self.device = device

        print(
            f"[NLAClientHF] {checkpoint_dir.name}: d_model={self.cfg.d_model} "
            f"inj_scale={self.cfg.injection_scale} embed_scale={self.embed_scale:.2f} "
            f"inj_char={self.cfg.injection_char!r}(id={self.cfg.injection_token_id})"
        )

    def _build_inputs_embeds(self, v_raw: torch.Tensor, prompt: str | None) -> torch.Tensor:
        """Tokenize → embed → arch-scale → inject the activation. Returns [1, T, d]."""
        if prompt is None:
            content = self.cfg.actor_prompt_template.format(
                injection_char=self.cfg.injection_char
            )
        else:
            assert INJECT_PLACEHOLDER in prompt, (
                f"custom prompt must contain {INJECT_PLACEHOLDER!r}"
            )
            content = prompt.replace(INJECT_PLACEHOLDER, self.cfg.injection_char)

        input_ids = self.tokenizer.apply_chat_template(
            [{"role": "user", "content": content}],
            tokenize=True, add_generation_prompt=True,
        )
        if hasattr(input_ids, "input_ids"): input_ids = input_ids["input_ids"]
        input_ids = list(input_ids)
        ids_t = torch.tensor(input_ids, dtype=torch.long).unsqueeze(0)

        with torch.no_grad():
            # bf16 lookup → fp32 for injection math. embed_scale=1.0 for Qwen.
            embeds = (
                self.embed(ids_t.to(self.embed.weight.device)) * self.embed_scale
            ).float()

        v_scaled = normalize_activation(
            v_raw.float().view(1, -1), self.cfg.injection_scale
        )
        injected = inject_at_marked_positions(
            ids_t, embeds.cpu(), v_scaled,
            self.cfg.injection_token_id,
            self.cfg.injection_left_neighbor_id,
            self.cfg.injection_right_neighbor_id,
        )  # [1, T, d]
        return injected.to(dtype=self.av_model.dtype, device=self.device)

    @torch.no_grad()
    def generate(
        self,
        activation,
        *,
        prompt: str | None = None,
        extract_explanation: bool = True,
        max_new_tokens: int = 200,
        temperature: float = 0.7,
        **gen_kwargs,
    ) -> str:
        """Decode one [d_model] activation into an explanation string."""
        v = torch.as_tensor(np.asarray(activation, dtype=np.float32))
        assert v.numel() == self.cfg.d_model, (
            f"activation length {v.numel()} != d_model {self.cfg.d_model}"
        )
        inputs_embeds = self._build_inputs_embeds(v, prompt)

        out = self.av_model.generate(
            inputs_embeds=inputs_embeds,
            max_new_tokens=max_new_tokens,
            do_sample=(temperature is not None and temperature > 0),
            temperature=temperature if (temperature and temperature > 0) else None,
            pad_token_id=self.tokenizer.pad_token_id or self.tokenizer.eos_token_id,
            **gen_kwargs,
        )
        # With inputs_embeds, HF returns only the newly generated token IDs
        # (there are no input IDs to prepend), so decode out[0] directly.
        text = self.tokenizer.decode(out[0], skip_special_tokens=False)

        if not extract_explanation:
            return text
        m = EXPLANATION_RE.search(text)
        if m is None:
            print(f"[NLAClientHF] WARNING: no <explanation> tags. "
                  f"Raw[:200]={text[:200]!r}")
            return text
        return m.group(1).strip()

    def generate_batch(self, activations, **kwargs) -> list[str]:
        return [self.generate(v, **kwargs) for v in activations]
