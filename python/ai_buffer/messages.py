"""Assemble the message list sent to OpenRouter."""

from __future__ import annotations

DEFAULT_MODEL = "openai/gpt-4o-mini"
DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful assistant. When you write code, enclose it in a markdown fence and name the language."
)
_MAX_HISTORY_TURNS = 20


def build_user_text(message: str, context: str | None = None) -> str:
    if context and context.strip():
        return f"{context.strip()}\n\nUser question: {message}"
    return message


def build_messages(
    *,
    system_prompt: str | None,
    history: list[dict[str, str]] | None,
    user_text: str,
) -> list[dict[str, str]]:
    prompt = (system_prompt or "").strip() or DEFAULT_SYSTEM_PROMPT
    messages: list[dict[str, str]] = [{"role": "system", "content": prompt}]
    for turn in (history or [])[-_MAX_HISTORY_TURNS :]:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_text})
    return messages
