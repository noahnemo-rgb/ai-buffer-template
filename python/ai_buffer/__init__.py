"""OpenRouter and Space Bunny Alpha helpers for Python apps.

Puter sign-in runs in the browser. A Python server uses OpenRouter with
OPENROUTER_API_KEY. Space Bunny Alpha uses that same key and the model
stealth/space-bunny-alpha. The system prompt belongs to the app that calls this.
"""

from .messages import DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, build_messages, build_user_text
from .openrouter import OPENROUTER_URL, stream_openrouter
from .precision import FULL_PRECISION_QUANTIZATIONS, full_precision_extra
from .space_bunny import (
    DEFAULT_SPACE_BUNNY_EFFORT,
    SPACE_BUNNY_MODEL,
    SPACE_BUNNY_REASONING_EFFORTS,
    stream_space_bunny,
)
from .sse import drain_openrouter_sse

__all__ = [
    "DEFAULT_MODEL",
    "DEFAULT_SPACE_BUNNY_EFFORT",
    "DEFAULT_SYSTEM_PROMPT",
    "FULL_PRECISION_QUANTIZATIONS",
    "OPENROUTER_URL",
    "SPACE_BUNNY_MODEL",
    "SPACE_BUNNY_REASONING_EFFORTS",
    "build_messages",
    "build_user_text",
    "drain_openrouter_sse",
    "full_precision_extra",
    "stream_openrouter",
    "stream_space_bunny",
]
