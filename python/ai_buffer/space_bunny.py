"""Space Bunny Alpha through OpenRouter.

The model id is stealth/space-bunny-alpha. The same OPENROUTER_API_KEY is used.
Reasoning effort defaults to medium.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from .openrouter import OpenStream, stream_openrouter

SPACE_BUNNY_MODEL = "stealth/space-bunny-alpha"
SPACE_BUNNY_REASONING_EFFORTS = ("low", "medium", "high", "xhigh", "max")
DEFAULT_SPACE_BUNNY_EFFORT = "medium"


def stream_space_bunny(
    *,
    api_key: str,
    messages: list[dict[str, str]],
    reasoning_effort: str = DEFAULT_SPACE_BUNNY_EFFORT,
    site_url: str | None = None,
    app_name: str | None = None,
    timeout_sec: float = 120.0,
    open_stream: OpenStream | None = None,
) -> Iterator[str]:
    if reasoning_effort not in SPACE_BUNNY_REASONING_EFFORTS:
        allowed = ", ".join(SPACE_BUNNY_REASONING_EFFORTS)
        raise RuntimeError(f"Reasoning effort must be one of {allowed}.")
    extra: dict[str, Any] = {"reasoning": {"effort": reasoning_effort}}
    return stream_openrouter(
        api_key=api_key,
        model=SPACE_BUNNY_MODEL,
        messages=messages,
        site_url=site_url,
        app_name=app_name,
        timeout_sec=timeout_sec,
        extra=extra,
        open_stream=open_stream,
    )
