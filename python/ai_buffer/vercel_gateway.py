"""Vercel AI Gateway chat completions.

POST https://ai-gateway.vercel.sh/v1/chat/completions
Authorization: Bearer $AI_GATEWAY_API_KEY, or Bearer $VERCEL_OIDC_TOKEN when the API key is unset.
Model ids look like provider/model. See https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from .chat_completions import OpenStream, stream_chat_completions

VERCEL_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions"
DEFAULT_VERCEL_GATEWAY_MODEL = "openai/gpt-4o-mini"
VERCEL_GATEWAY_MISSING_KEY = (
    "Vercel Gateway API key is not set. Set AI_GATEWAY_API_KEY, or VERCEL_OIDC_TOKEN on Vercel."
)


def read_gateway_api_key(env: dict[str, str]) -> str:
    api_key = env.get("AI_GATEWAY_API_KEY", "").strip()
    if api_key:
        return api_key
    return env.get("VERCEL_OIDC_TOKEN", "").strip()


def stream_vercel_gateway(
    *,
    api_key: str,
    messages: list[dict[str, str]],
    model: str = DEFAULT_VERCEL_GATEWAY_MODEL,
    site_url: str | None = None,
    app_name: str | None = None,
    timeout_sec: float = 120.0,
    extra: dict[str, Any] | None = None,
    open_stream: OpenStream | None = None,
) -> Iterator[str]:
    return stream_chat_completions(
        url=VERCEL_GATEWAY_URL,
        api_key=api_key,
        model=model,
        messages=messages,
        provider_name="Vercel Gateway",
        missing_key_message=VERCEL_GATEWAY_MISSING_KEY,
        site_url=site_url,
        app_name=app_name,
        timeout_sec=timeout_sec,
        extra=extra,
        open_stream=open_stream,
    )
