"""NVIDIA NIM chat completions.

POST https://integrate.api.nvidia.com/v1/chat/completions
Authorization: Bearer $NVIDIA_API_KEY
The default model is a Nemotron id from https://docs.api.nvidia.com/nim/reference/llm-apis
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from .chat_completions import OpenStream, stream_chat_completions

NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3-nano-30b-a3b"
NVIDIA_MISSING_KEY = "NVIDIA API key is not set. Set NVIDIA_API_KEY."


def stream_nvidia(
    *,
    api_key: str,
    messages: list[dict[str, str]],
    model: str = DEFAULT_NVIDIA_MODEL,
    site_url: str | None = None,
    app_name: str | None = None,
    timeout_sec: float = 120.0,
    extra: dict[str, Any] | None = None,
    open_stream: OpenStream | None = None,
) -> Iterator[str]:
    return stream_chat_completions(
        url=NVIDIA_URL,
        api_key=api_key,
        model=model,
        messages=messages,
        provider_name="NVIDIA NIM",
        missing_key_message=NVIDIA_MISSING_KEY,
        site_url=site_url,
        app_name=app_name,
        timeout_sec=timeout_sec,
        extra=extra,
        open_stream=open_stream,
    )
