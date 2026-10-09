"""Gemini API streaming via streamGenerateContent.

POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse
Header: x-goog-api-key: $GEMINI_API_KEY
Docs: https://ai.google.dev/gemini-api/docs/generate-content/text-generation
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from collections.abc import Callable, Iterator
from typing import Any

from .redact import redact_secrets

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
GEMINI_MISSING_KEY = "Gemini API key is not set. Set GEMINI_API_KEY."
_MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")

OpenStream = Callable[[str, bytes, dict[str, str], float], Any]


def gemini_stream_url(model: str) -> str:
    model_id = model.strip()
    if not _MODEL_ID.match(model_id):
        raise RuntimeError("Gemini model id is not valid.")
    return f"{GEMINI_API_BASE}/models/{model_id}:streamGenerateContent?alt=sse"


def gemini_request_body(messages: list[dict[str, str]]) -> dict[str, Any]:
    system = "\n\n".join(item["content"] for item in messages if item.get("role") == "system")
    contents = [
        {
            "role": "model" if item.get("role") == "assistant" else "user",
            "parts": [{"text": item.get("content", "")}],
        }
        for item in messages
        if item.get("role") != "system"
    ]
    body: dict[str, Any] = {"contents": contents}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    return body


def drain_gemini_sse(full_text: str, parsed_through: int) -> tuple[str, int]:
    text = ""
    slice_text = full_text[parsed_through:]
    lines = slice_text.split("\n")
    consumed = parsed_through
    for raw_line in lines[:-1]:
        consumed += len(raw_line) + 1
        line = raw_line[:-1] if raw_line.endswith("\r") else raw_line
        trimmed = line.strip()
        if not trimmed.startswith("data:"):
            continue
        data = trimmed[len("data:") :].strip()
        if not data or data == "[DONE]":
            continue
        try:
            chunk: dict[str, Any] = json.loads(data)
        except json.JSONDecodeError:
            continue
        error = chunk.get("error")
        if error:
            if isinstance(error, str):
                message = error
            elif isinstance(error, dict):
                message = error.get("message") or "Gemini API stream error"
            else:
                message = "Gemini API stream error"
            raise RuntimeError(redact_secrets(str(message)))
        candidates = chunk.get("candidates") or []
        if not candidates:
            continue
        content = candidates[0].get("content") or {}
        for part in content.get("parts") or []:
            if part.get("thought"):
                continue
            part_text = part.get("text")
            if part_text:
                text += part_text
    return text, consumed


def _urlopen_stream(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> Any:
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    return urllib.request.urlopen(request, timeout=timeout_sec)


def stream_gemini(
    *,
    api_key: str,
    messages: list[dict[str, str]],
    model: str = DEFAULT_GEMINI_MODEL,
    timeout_sec: float = 120.0,
    open_stream: OpenStream | None = None,
) -> Iterator[str]:
    key = api_key.strip()
    if not key:
        raise RuntimeError(GEMINI_MISSING_KEY)
    url = gemini_stream_url(model)
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "x-goog-api-key": key,
    }
    payload = json.dumps(gemini_request_body(messages)).encode("utf-8")
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
                text, parsed_through = drain_gemini_sse(buffered, parsed_through)
                if text:
                    yield text
            if buffered and not buffered.endswith("\n"):
                buffered += "\n"
                text, _parsed_through = drain_gemini_sse(buffered, parsed_through)
                if text:
                    yield text
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        safe = redact_secrets(detail)[:300]
        raise RuntimeError(f"Gemini API HTTP {error.code}: {safe}") from error
