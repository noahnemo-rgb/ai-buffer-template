"""Chat helpers for Python apps.

Puter sign-in runs in the browser. A Python server can call OpenRouter,
Space Bunny Alpha, Vercel Gateway, the Gemini API, NVIDIA NIM, or LLMAPI.
The system prompt belongs to the app that calls this.
"""

from .gemini import DEFAULT_GEMINI_MODEL, GEMINI_API_BASE, stream_gemini
from .llmapi import DEFAULT_LLMAPI_MODEL, LLMAPI_URL, stream_llmapi
from .nvidia import DEFAULT_NVIDIA_MODEL, NVIDIA_URL, stream_nvidia
from .messages import DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, build_messages, build_user_text
from .openrouter import OPENROUTER_URL, stream_openrouter
from .space_bunny import (
    DEFAULT_SPACE_BUNNY_EFFORT,
    SPACE_BUNNY_MODEL,
    SPACE_BUNNY_REASONING_EFFORTS,
    stream_space_bunny,
)
from .sse import drain_openrouter_sse
from .vercel_gateway import DEFAULT_VERCEL_GATEWAY_MODEL, VERCEL_GATEWAY_URL, stream_vercel_gateway

__all__ = [
    "DEFAULT_GEMINI_MODEL",
    "DEFAULT_LLMAPI_MODEL",
    "DEFAULT_NVIDIA_MODEL",
    "DEFAULT_MODEL",
    "DEFAULT_SPACE_BUNNY_EFFORT",
    "DEFAULT_SYSTEM_PROMPT",
    "DEFAULT_VERCEL_GATEWAY_MODEL",
    "GEMINI_API_BASE",
    "LLMAPI_URL",
    "NVIDIA_URL",
    "OPENROUTER_URL",
    "SPACE_BUNNY_MODEL",
    "SPACE_BUNNY_REASONING_EFFORTS",
    "VERCEL_GATEWAY_URL",
    "build_messages",
    "build_user_text",
    "drain_openrouter_sse",
    "stream_gemini",
    "stream_llmapi",
    "stream_nvidia",
    "stream_openrouter",
    "stream_space_bunny",
    "stream_vercel_gateway",
]
