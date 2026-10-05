"""Ask OpenRouter for a full-precision host of an open-weight model.

OpenRouter's default routing prefers the cheaper host. For open weights that host
is often an 8-bit or 4-bit copy. Pass the returned dict as ``extra`` on
``stream_openrouter``. Leave it off OpenAI, Anthropic, and Space Bunny Alpha.
"""

from __future__ import annotations

from typing import Any

from .space_bunny import SPACE_BUNNY_MODEL

FULL_PRECISION_QUANTIZATIONS = ("bf16", "fp16", "fp32")


def full_precision_extra(model: str) -> dict[str, Any]:
    model_id = model.strip()
    reason = _rejection_reason(model_id)
    if reason:
        raise RuntimeError(reason)
    return {"provider": {"quantizations": list(FULL_PRECISION_QUANTIZATIONS)}}


def _rejection_reason(model_id: str) -> str | None:
    if not model_id:
        return "Pass an open-weight model id to full_precision_extra."
    lower = model_id.lower()
    if lower.endswith(":free") or lower.endswith(":floor"):
        return (
            "A :free or :floor model id stays on OpenRouter's cheap pool. "
            "full_precision_extra applies to an open-weight id without that suffix."
        )
    if lower.startswith("openai/") or lower.startswith("anthropic/") or lower == SPACE_BUNNY_MODEL:
        return (
            "full_precision_extra applies to open-weight models. "
            "OpenAI, Anthropic, and Space Bunny Alpha report precision as unknown, "
            "and this filter would reject them."
        )
    return None
