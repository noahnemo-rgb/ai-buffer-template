"""LLMAPI chat completions.

The documented host at https://docs.llmapi.ai/ is
POST https://api.llmapi.ai/v1/chat/completions with Authorization: Bearer $LLM_API_KEY.
https://llmapi.pro/docs is a different host. Pass url to call that one instead.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from .chat_completions import OpenStream, stream_chat_completions

LLMAPI_URL = "https://api.llmapi.ai/v1/chat/completions"
DEFAULT_LLMAPI_MODEL = "gpt-4o"
LLMAPI_MISSING_KEY = "LLMAPI API key is not set. Set LLM_API_KEY."


def stream_llmapi(
    *,
    api_key: str,
    messages: list[dict[str, str]],
    model: str = DEFAULT_LLMAPI_MODEL,
    url: str = LLMAPI_URL,
    site_url: str | None = None,
    app_name: str | None = None,
    timeout_sec: float = 120.0,
    extra: dict[str, Any] | None = None,
    open_stream: OpenStream | None = None,
) -> Iterator[str]:
    return stream_chat_completions(
        url=url,
        api_key=api_key,
        model=model,
        messages=messages,
        provider_name="LLMAPI",
        missing_key_message=LLMAPI_MISSING_KEY,
        site_url=site_url,
        app_name=app_name,
        timeout_sec=timeout_sec,
        extra=extra,
        open_stream=open_stream,
    )
