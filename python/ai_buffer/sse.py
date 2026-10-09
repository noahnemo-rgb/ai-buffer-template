"""Parse OpenRouter Server-Sent Events into text deltas."""

from __future__ import annotations

import json
from typing import Any


def drain_openrouter_sse(full_text: str, parsed_through: int, provider_name: str = "OpenRouter") -> tuple[str, int]:
    """Return (new_text, new_parsed_through) for complete lines in full_text."""
    text = ""
    slice_text = full_text[parsed_through:]
    lines = slice_text.split("\n")
    complete_lines = lines[:-1]
    consumed = parsed_through
    for raw_line in complete_lines:
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
                message = error.get("message") or f"{provider_name} stream error"
            else:
                message = f"{provider_name} stream error"
            raise RuntimeError(str(message))
        choices = chunk.get("choices") or []
        if not choices:
            continue
        delta = choices[0].get("delta") or {}
        content = delta.get("content")
        if content:
            text += content
    return text, consumed
