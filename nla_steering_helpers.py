"""Helpers for NLA × steering vector exploration (used by nla_steering_exploration.ipynb)."""

from __future__ import annotations

import gc
from typing import Literal

import torch as t
import torch.nn.functional as F
from torch import Tensor


# Layer conventions for Qwen2.5-7B + NLA L20 checkpoints.
#
# NLA "L20" = extraction layer_index K=20 = the OUTPUT of model.layers[20].
# Per nla/datagen/extractors.py:
#     "layer_index=K returns the output of the K-th decoder block ...
#      This matches HF's hidden_states[K+1] when output_hidden_states=True
#      (their index 0 is the embedding output)."
# So the in-distribution vector for the AV/AR lives at hidden_states[21],
# NOT hidden_states[20]. A forward hook on model.layers[20] modifies exactly
# that tensor (its output == hidden_states[21]).
TRAIT_VECTOR_LAYER = 21  # outputs.hidden_states index for extracting h
STEER_LAYER = 20  # model.layers index for forward hooks (output == hidden_states[21])


def _return_layers(m: t.nn.Module) -> list:
    """Locate transformer block list (Qwen / Gemma-style nesting)."""
    for attr_path in ("language_model.layers", "layers"):
        obj = m.model
        try:
            for name in attr_path.split("."):
                obj = getattr(obj, name)
            return obj
        except AttributeError:
            continue
    raise AttributeError(f"Could not find transformer layers on {type(m)}")


def _normalize_messages(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    if not messages or messages[0]["role"] != "system":
        return messages
    system_content = messages[0]["content"]
    rest = list(messages[1:])
    if rest and rest[0]["role"] == "user" and system_content:
        rest[0] = {"role": "user", "content": f"{system_content}\n\n{rest[0]['content']}"}
    return rest


def format_messages(messages: list[dict[str, str]], tokenizer) -> tuple[str, int]:
    """Format conversation; return (full_prompt, response_start_idx) for assistant span."""
    messages = _normalize_messages(messages)

    full_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    prompt_without_response = tokenizer.apply_chat_template(
        messages[:-1], tokenize=False, add_generation_prompt=True
    ).rstrip()
    response_start_idx = tokenizer(prompt_without_response, return_tensors="pt").input_ids.shape[1] + 1
    return full_prompt, response_start_idx


def extract_activation_at_index(
    model,
    tokenizer,
    messages: list[dict[str, str]],
    layer: int = TRAIT_VECTOR_LAYER,
    token_index: int = -1,
) -> tuple[Tensor, str, int]:
    """
    Extract residual-stream activation at one token position.

    For prompts without an assistant message, pass messages ending with user only
    and use add_generation_prompt=True via a single user turn.
    """
    messages = _normalize_messages(messages)
    # Prefill-only: user (and optional system) without assistant reply
    if messages and messages[-1]["role"] == "assistant":
        full_prompt, _ = format_messages(messages, tokenizer)
    else:
        full_prompt = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

    tokens = tokenizer(full_prompt, return_tensors="pt").to(model.device)
    with t.inference_mode():
        outputs = model(**tokens, output_hidden_states=True)

    hidden = outputs.hidden_states[layer][0]  # (seq, d)
    idx = token_index if token_index >= 0 else hidden.shape[0] + token_index
    h = hidden[idx].float().cpu()
    token_id = tokens.input_ids[0, idx].item()
    token_str = tokenizer.decode([token_id])
    return h, token_str, idx


def extract_plaintext_token_activations(
    model,
    tokenizer,
    text: str,
    layer: int = TRAIT_VECTOR_LAYER,
) -> tuple[Tensor, list[str]]:
    """Per-token residual-stream activations for a PLAIN text passage.

    This is the most in-distribution input for the NLA AV/AR: the verbalizer
    was trained on per-token FineWeb activations (raw text, add_special_tokens=
    True, NO chat template). Use this to pick a clean content token to feed the
    AV, instead of the trailing assistant-header newline that a chat-templated
    prompt produces (that position is OOD and a known high-norm outlier).

    Returns (hidden[seq, d] on CPU float32, list of decoded token strings).
    """
    tokens = tokenizer(text, return_tensors="pt", add_special_tokens=True).to(model.device)
    with t.inference_mode():
        outputs = model(**tokens, output_hidden_states=True)
    hidden = outputs.hidden_states[layer][0].float().cpu()
    token_strs = [tokenizer.decode([i]) for i in tokens.input_ids[0].tolist()]
    return hidden, token_strs


def extract_response_mean_activation(
    model,
    tokenizer,
    system_prompt: str,
    question: str,
    response: str,
    layer: int = TRAIT_VECTOR_LAYER,
) -> Tensor:
    """Mean activation over assistant response tokens (persona-vector style)."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question},
        {"role": "assistant", "content": response},
    ]
    full_prompt, response_start_idx = format_messages(messages, tokenizer)
    tokens = tokenizer(full_prompt, return_tensors="pt").to(model.device)
    with t.inference_mode():
        outputs = model(**tokens, output_hidden_states=True)
    hidden_states = outputs.hidden_states[layer][0]
    seq_len = hidden_states.shape[0]
    mask = t.arange(seq_len, device=hidden_states.device) >= response_start_idx
    return (hidden_states * mask[:, None]).sum(0) / mask.sum().float()


def perturb_activation(
    h: Tensor,
    v: Tensor,
    alpha: float,
    mode: Literal["residual", "direction"] = "residual",
) -> Tensor:
    """Perturb activation h along steering vector v."""
    h = h.float()
    v = v.float()
    if mode == "residual":
        return h + alpha * v
    if mode == "direction":
        v_norm = v.norm().clamp_min(1e-12)
        return h + alpha * h.norm() * (v / v_norm)
    raise ValueError(f"Unknown mode: {mode!r}")


def cosine_sim(a: Tensor, b: Tensor) -> float:
    a, b = a.float().flatten(), b.float().flatten()
    return F.cosine_similarity(a.unsqueeze(0), b.unsqueeze(0)).item()


def offload_model(model) -> None:
    """Move model to CPU and free GPU cache."""
    model.to("cpu")
    gc.collect()
    if t.cuda.is_available():
        t.cuda.empty_cache()


class ActivationSteerer:
    """Add coeff * steering_vector to a layer during forward passes."""

    def __init__(
        self,
        model: t.nn.Module,
        steering_vector: Tensor,
        coeff: float = 1.0,
        layer: int = STEER_LAYER,
        positions: str = "all",
    ):
        assert positions in ("all", "prompt", "response")
        self.model = model
        self.coeff = coeff
        self.layer = layer
        self.positions = positions
        self._handle = None
        self.vector = steering_vector.clone()

    def _hook_fn(self, module, input, output):
        steer = self.coeff * self.vector
        if isinstance(output, tuple):
            hidden_states = output[0]
        else:
            hidden_states = output
        steer = steer.to(hidden_states.device, dtype=hidden_states.dtype)
        h = hidden_states.clone()
        if self.positions == "all":
            h += steer
        elif self.positions == "prompt":
            if h.shape[1] == 1:
                return output
            h += steer
        elif self.positions == "response":
            h[:, -1, :] += steer
        if isinstance(output, tuple):
            return (h,) + output[1:]
        return h

    def __enter__(self):
        self._handle = _return_layers(self.model)[self.layer].register_forward_hook(self._hook_fn)
        return self

    def __exit__(self, *exc):
        if self._handle is not None:
            self._handle.remove()
            self._handle = None


def generate_with_steering(
    model,
    tokenizer,
    prompt: str,
    steering_vector: Tensor,
    steering_layer: int = STEER_LAYER,
    alpha: float = 1.0,
    system_prompt: str | None = None,
    max_new_tokens: int = 200,
    temperature: float = 0.7,
    messages: list[dict[str, str]] | None = None,
    positions: str = "all",
) -> str:
    """Generate with additive steering (uses ActivationSteerer)."""
    if messages is None:
        messages = []
        if system_prompt is not None:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
    messages = _normalize_messages(messages)

    formatted = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(formatted, return_tensors="pt").to(model.device)
    prompt_length = inputs.input_ids.shape[1]

    with ActivationSteerer(model, steering_vector, coeff=alpha, layer=steering_layer, positions=positions):
        with t.inference_mode():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
            )
    return tokenizer.decode(outputs[0, prompt_length:], skip_special_tokens=True)


def extract_contrastive_vector_at_layer(
    model,
    tokenizer,
    pairs: list[dict],
    layer: int = TRAIT_VECTOR_LAYER,
) -> Tensor:
    """
    Mean difference of response-token activations: pos - neg.

    Each pair: {"pos": {system_prompt, question, response}, "neg": {...}}
    """
    pos_means, neg_means = [], []
    for p in pairs:
        pos_means.append(
            extract_response_mean_activation(
                model, tokenizer,
                p["pos"]["system_prompt"], p["pos"]["question"], p["pos"]["response"],
                layer=layer,
            )
        )
        neg_means.append(
            extract_response_mean_activation(
                model, tokenizer,
                p["neg"]["system_prompt"], p["neg"]["question"], p["neg"]["response"],
                layer=layer,
            )
        )
    return t.stack(pos_means).mean(0) - t.stack(neg_means).mean(0)

def matched_norm_random(v: t.Tensor, seed: int = 0):
    """Creates a random control vector with the exact same L2 norm as the trait vector."""
    t.manual_seed(seed)
    r = t.randn_like(v, dtype=t.float32)
    return (r * (v.float().norm() / r.norm())).to(v.dtype)
    
def describe_vs_become_score(text: str) -> dict:
    """Heuristic to guess if the AV is describing or roleplaying."""
    text_lower = text.lower()
    describe_words = ["the text", "the response", "the user", "shows", "exhibits", "agrees"]
    become_words = ["i", "you", "absolutely", "great", "my", "we"]
    
    desc_count = sum(text_lower.count(w) for w in describe_words)
    bec_count = sum(text_lower.count(w) for w in become_words)
    total = desc_count + bec_count
    
    return {
        "become_ratio": bec_count / total if total > 0 else 0.0,
        "desc_count": desc_count,
        "bec_count": bec_count
    }

def looks_degenerate(text: str) -> bool:
    """Flags if the AV output collapses due to high alpha OOD steering."""
    if len(text) < 10: return True
    if text.count(text[:15]) > 3: return True
    return False