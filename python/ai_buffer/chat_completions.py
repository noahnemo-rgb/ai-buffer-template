"""OpenAI-compatible streaming chat completions. The standard library is enough."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable, Iterator
from typing import Any

from .redact import redact_secrets
from .sse import drain_openrouter_sse

OpenStream = Callable[[str, bytes, dict[str, str], float], Any]


def _urlopen_stream(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> Any:
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    return urllib.request.urlopen(request, timeout=timeout_sec)


def stream_chat_completions(
    *,
    url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    provider_name: str,
    missing_key_message: str,
    site_url: str | None = None,
    app_name: str | None = None,
    timeout_sec: float = 120.0,
    extra: dict[str, Any] | None = None,
    extra_headers: dict[str, str] | None = None,
    open_stream: OpenStream | None = None,
) -> Iterator[str]:
    """Yield plain-text deltas from an OpenAI-compatible streaming response."""
    key = api_key.strip()
    if not key:
        raise RuntimeError(missing_key_message)

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    if extra_headers:
        headers.update(extra_headers)
    if site_url:
        headers["HTTP-Referer"] = site_url
    if app_name:
        headers["X-Title"] = app_name

    body: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
    if extra:
        body.update(extra)
    payload = json.dumps(body).encode("utf-8")
    opener = open_stream or _urlopen_stream
    buffered = ""
    parsed_through = 0

    try:
        with opener(url, payload, headers, timeout_sec) as response:
            while True:
                raw = response.readline()
                if not raw:
                    break
                buffered += raw.decode("utf-8", errors="replace")
                text, parsed_through = drain_openrouter_sse(buffered, parsed_through, provider_name)
                if text:
                    yield text
            if buffered and not buffered.endswith("\n"):
                buffered += "\n"
                text, parsed_through = drain_openrouter_sse(buffered, parsed_through, provider_name)
                if text:
                    yield text
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        safe = redact_secrets(detail)[:300]
        raise RuntimeError(f"{provider_name} HTTP {error.code}: {safe}") from error
