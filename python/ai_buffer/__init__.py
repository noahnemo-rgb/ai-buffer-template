"""OpenRouter chat helper for Python apps.

Puter sign-in runs in the browser. A Python server uses OpenRouter with
OPENROUTER_API_KEY. The system prompt belongs to the app that calls this.
"""

from .messages import DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, build_messages, build_user_text
from .openrouter import OPENROUTER_URL, stream_openrouter
from .sse import drain_openrouter_sse

__all__ = [
    "DEFAULT_MODEL",
    "DEFAULT_SYSTEM_PROMPT",
    "OPENROUTER_URL",
    "build_messages",
    "build_user_text",
    "drain_openrouter_sse",
    "stream_openrouter",
]
