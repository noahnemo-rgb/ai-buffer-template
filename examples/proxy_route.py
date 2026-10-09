"""Browser-facing proxy. Owner keys stay in the server environment.

Copy this into the app that owns the route. Install `cryptography` only if
you also use the vault. This file does not store keys.
"""

from __future__ import annotations

import os

from ai_buffer import create_memory_rate_limit, handle_ai_proxy

_LIMIT = create_memory_rate_limit(limit=30, window_sec=60)


def chat(method: str, headers: dict[str, str], body: bytes, client_ip: str | None) -> tuple[int, dict[str, str], bytes]:
    return handle_ai_proxy(
        method=method,
        headers=headers,
        body=body,
        allowed_origins=["https://app.example"],
        models={
            "openrouter": ["openai/gpt-4o-mini"],
            "space-bunny": ["stealth/space-bunny-alpha"],
            "vercel-gateway": ["openai/gpt-4o-mini"],
            "gemini": ["gemini-3.8-flash"],
            "nvidia": ["nvidia/nemotron-3-nano-30b-a3b"],
            "llmapi": ["gpt-4o"],
        },
        rate_limit=_LIMIT,
        env=dict(os.environ),
        client_ip=client_ip,
    )
