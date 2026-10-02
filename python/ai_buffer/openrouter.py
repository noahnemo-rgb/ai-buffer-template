"""Stream chat completions from OpenRouter. The standard library is enough."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable, Iterator
from typing import Any

from .sse import drain_openrouter_sse

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# open_stream(url, payload_bytes, headers, timeout_sec) -> context manager of a binary file.
OpenStream = Callable[[str, bytes, dict[str, str], float], Any]


def _urlopen_stream(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> Any:
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    return urllib.request.urlopen(request, timeout=timeout_sec)


def stream_openrouter(
    *,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    site_url: str | None = None,
    app_name: str | None = None,
    timeout_sec: float = 120.0,
    open_stream: OpenStream | None = None,
) -> Iterator[str]:
    """Yield plain-text deltas from OpenRouter's streaming response."""
    key = api_key.strip()
    if not key:
        raise RuntimeError(
            "OpenRouter API key is not set. Add a key on this device, or set OPENROUTER_API_KEY on the server."
        )

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    if site_url:
        headers["HTTP-Referer"] = site_url
    if app_name:
        headers["X-Title"] = app_name

    payload = json.dumps({"model": model, "messages": messages, "stream": True}).encode("utf-8")
    opener = open_stream or _urlopen_stream
    buffered = ""
    parsed_through = 0

    try:
        with opener(OPENROUTER_URL, payload, headers, timeout_sec) as response:
            while True:
                raw = response.readline()
                if not raw:
                    break
                buffered += raw.decode("utf-8", errors="replace")
                text, parsed_through = drain_openrouter_sse(buffered, parsed_through)
                if text:
                    yield text
            if buffered and not buffered.endswith("\n"):
                buffered += "\n"
                text, parsed_through = drain_openrouter_sse(buffered, parsed_through)
                if text:
                    yield text
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter HTTP {error.code}: {body[:300]}") from error
