"""Server proxy. Owner keys stay in the process environment.

Browsers call this helper. They do not receive the owner key.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable, Iterator
from typing import Any

from .chat_completions import OpenStream
from .gemini import stream_gemini
from .llmapi import stream_llmapi
from .nvidia import stream_nvidia
from .openrouter import stream_openrouter
from .redact import looks_like_secret, redact_secrets
from .space_bunny import SPACE_BUNNY_MODEL, stream_space_bunny
from .vercel_gateway import read_gateway_api_key, stream_vercel_gateway

SERVER_PROXY_PROVIDERS = (
    "openrouter",
    "space-bunny",
    "vercel-gateway",
    "gemini",
    "nvidia",
    "llmapi",
)
_MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,200}$")

RateLimit = Callable[[str | None, str | None, str], bool]


def create_memory_rate_limit(limit: int = 30, window_sec: float = 60.0) -> RateLimit:
    hits: dict[str, list[float]] = {}

    def allow(ip: str | None, user_id: str | None, provider: str) -> bool:
        identity = f"{user_id or ip or 'unknown'}:{provider}"
        now = time.monotonic()
        recent = [stamp for stamp in hits.get(identity, []) if now - stamp < window_sec]
        if len(recent) >= limit:
            hits[identity] = recent
            return False
        recent.append(now)
        hits[identity] = recent
        return True

    return allow


def read_owner_api_key(provider: str, env: dict[str, str]) -> str:
    if provider in ("openrouter", "space-bunny"):
        return env.get("OPENROUTER_API_KEY", "").strip()
    if provider == "vercel-gateway":
        return read_gateway_api_key(env)
    if provider == "gemini":
        return env.get("GEMINI_API_KEY", "").strip()
    if provider == "nvidia":
        return env.get("NVIDIA_API_KEY", "").strip()
    if provider == "llmapi":
        return env.get("LLM_API_KEY", "").strip()
    return ""


def handle_ai_proxy(
    *,
    method: str,
    headers: dict[str, str],
    body: bytes,
    allowed_origins: list[str],
    allow_missing_origin: bool = False,
    providers: list[str] | None = None,
    models: dict[str, list[str]] | None = None,
    rate_limit: RateLimit | None = None,
    env: dict[str, str] | None = None,
    allow_byok: bool = True,
    open_stream: OpenStream | None = None,
    client_ip: str | None = None,
    user_id: str | None = None,
    vault: Any | None = None,
    app_name: str | None = None,
    site_url: str | None = None,
) -> tuple[int, dict[str, str], bytes]:
    """Return status, headers, and a body. Error bodies do not include key material."""
    if method.upper() != "POST":
        return _json_error(405, "provider_error", "Method is not allowed.")
    origin = _header(headers, "origin")
    if origin:
        if origin not in allowed_origins:
            return _json_error(403, "provider_error", "Origin is not allowed.")
    elif not allow_missing_origin:
        return _json_error(403, "provider_error", "Origin is not allowed.")

    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError):
        return _json_error(400, "provider_error", "Request body is not valid JSON.")
    if not isinstance(payload, dict):
        return _json_error(400, "provider_error", "Request body is not valid JSON.")

    allowed = set(providers or SERVER_PROXY_PROVIDERS)
    provider = str(payload.get("provider", "")).strip()
    if provider not in allowed or provider not in SERVER_PROXY_PROVIDERS:
        return _json_error(400, "provider_error", "Provider is not allowed.")

    model = SPACE_BUNNY_MODEL if provider == "space-bunny" else str(payload.get("model", "")).strip()
    if not model or not _MODEL_ID.match(model) or looks_like_secret(model):
        return _json_error(400, "provider_error", "Model is not allowed.")
    if models is not None and provider in models and model not in models[provider]:
        return _json_error(400, "provider_error", "Model is not allowed.")

    if rate_limit is not None and not rate_limit(client_ip, user_id, provider):
        return _json_error(429, "rate_limited", "Too many AI requests. Wait a few seconds and try again.")

    byok = str(payload.get("byok", "")).strip() if allow_byok else ""
    api_key = byok
    if not api_key and vault is not None and user_id:
        stored = vault["read"](user_id, provider)
        api_key = stored.strip() if isinstance(stored, str) else ""
    if not api_key:
        api_key = read_owner_api_key(provider, env or {})
    if not api_key:
        return _json_error(400, "missing_key", "API key is not configured on the server.")

    try:
        messages = _messages(payload)
    except ValueError as error:
        return _json_error(400, "provider_error", str(error))

    try:
        chunks = list(
            _stream(
                provider,
                api_key=api_key,
                model=model,
                messages=messages,
                open_stream=open_stream,
                app_name=app_name,
                site_url=site_url,
            )
        )
    except Exception as error:  # noqa: BLE001 - the message is redacted before it leaves
        text = redact_secrets(str(error))
        code = "rate_limited" if "429" in text else "provider_error"
        event = json.dumps({"error": {"code": code, "message": text}})
        return 200, _sse_headers(), f"data: {event}\n\ndata: [DONE]\n\n".encode("utf-8")

    parts = [f"data: {json.dumps({'text': chunk})}\n\n" for chunk in chunks]
    parts.append("data: [DONE]\n\n")
    return 200, _sse_headers(), "".join(parts).encode("utf-8")


def _stream(
    provider: str,
    *,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    open_stream: OpenStream | None,
    app_name: str | None,
    site_url: str | None,
) -> Iterator[str]:
    if provider == "gemini":
        return stream_gemini(api_key=api_key, messages=messages, model=model, open_stream=open_stream)
    if provider == "nvidia":
        return stream_nvidia(
            api_key=api_key,
            messages=messages,
            model=model,
            open_stream=open_stream,
            app_name=app_name,
            site_url=site_url,
        )
    if provider == "llmapi":
        return stream_llmapi(
            api_key=api_key,
            messages=messages,
            model=model,
            open_stream=open_stream,
            app_name=app_name,
            site_url=site_url,
        )
    if provider == "vercel-gateway":
        return stream_vercel_gateway(
            api_key=api_key,
            messages=messages,
            model=model,
            open_stream=open_stream,
            app_name=app_name,
            site_url=site_url,
        )
    if provider == "space-bunny":
        return stream_space_bunny(
            api_key=api_key,
            messages=messages,
            open_stream=open_stream,
            app_name=app_name,
            site_url=site_url,
        )
    return stream_openrouter(
        api_key=api_key,
        messages=messages,
        model=model,
        open_stream=open_stream,
        app_name=app_name,
        site_url=site_url,
    )


def _messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    raw = payload.get("messages")
    if isinstance(raw, list):
        messages: list[dict[str, str]] = []
        for item in raw:
            if not isinstance(item, dict):
                raise ValueError("Request messages are not valid.")
            role = item.get("role")
            content = item.get("content")
            if role not in ("system", "user", "assistant") or not isinstance(content, str):
                raise ValueError("Request messages are not valid.")
            messages.append({"role": role, "content": content})
        if not messages:
            raise ValueError("Request messages are not valid.")
        return messages
    message = payload.get("message")
    if isinstance(message, str) and message.strip():
        messages = []
        system_prompt = payload.get("systemPrompt")
        if isinstance(system_prompt, str) and system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": message})
        return messages
    raise ValueError("Request messages are not valid.")


def _header(headers: dict[str, str], name: str) -> str:
    for key, value in headers.items():
        if key.lower() == name:
            return value.strip()
    return ""


def _json_error(status: int, code: str, message: str) -> tuple[int, dict[str, str], bytes]:
    body = json.dumps({"error": {"code": code, "message": redact_secrets(message)}}).encode("utf-8")
    return status, {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"}, body


def _sse_headers() -> dict[str, str]:
    return {"content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store"}
