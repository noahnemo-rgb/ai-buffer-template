import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_buffer.proxy import create_memory_rate_limit, handle_ai_proxy
from ai_buffer.redact import mask_key_hint, redact_secrets
from ai_buffer.sse import drain_openrouter_sse
from ai_buffer.vault import MemoryVaultStorage, create_key_vault

OWNER = "sk-testOWNERKEY1234567890abcd"
GEMINI = "AIzaSyOWNERGEMINIKEY1234567890"


class RedactTests(unittest.TestCase):
    def test_http_and_sse_text_lose_the_key(self) -> None:
        safe = redact_secrets(f"OpenRouter HTTP 401: bad {OWNER} Bearer {OWNER}")
        self.assertNotIn(OWNER, safe)
        self.assertEqual(mask_key_hint(OWNER), "••••abcd")
        body = 'data: ' + json.dumps({"error": {"message": OWNER}}) + "\n"
        with self.assertRaises(RuntimeError) as caught:
            drain_openrouter_sse(body, 0)
        self.assertNotIn(OWNER, str(caught.exception))


class _Stream:
    def __init__(self, lines: list[bytes], status: int = 200) -> None:
        self._lines = lines
        self.status = status
        self.headers: dict[str, str] = {}

    def __enter__(self) -> "_Stream":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def readline(self) -> bytes:
        if not self._lines:
            return b""
        return self._lines.pop(0)

    def read(self) -> bytes:
        return b"".join(self._lines)


class ProxyTests(unittest.TestCase):
    def test_gemini_header_and_redacted_error(self) -> None:
        seen: dict[str, str] = {}

        def open_stream(url: str, _payload: bytes, headers: dict[str, str], _timeout: float) -> _Stream:
            seen["url"] = url
            seen["key"] = headers.get("x-goog-api-key", "")
            seen["authorization"] = headers.get("Authorization", "")
            return _Stream([b'data: {"error":{"message":"' + GEMINI.encode() + b'"}}\n'])

        status, _headers, body = handle_ai_proxy(
            method="POST",
            headers={"Origin": "https://app.example"},
            body=json.dumps(
                {
                    "provider": "gemini",
                    "model": "gemini-3.8-flash",
                    "messages": [{"role": "user", "content": "Hi"}],
                }
            ).encode(),
            allowed_origins=["https://app.example"],
            env={"GEMINI_API_KEY": GEMINI},
            open_stream=open_stream,
        )
        text = body.decode()
        self.assertEqual(status, 200)
        self.assertEqual(seen["key"], GEMINI)
        self.assertEqual(seen["authorization"], "")
        self.assertNotIn("key=", seen["url"])
        self.assertNotIn(GEMINI, text)

    def test_origin_model_and_rate_limit(self) -> None:
        denied, _, _ = handle_ai_proxy(
            method="POST",
            headers={"Origin": "https://evil.example"},
            body=b"{}",
            allowed_origins=["https://app.example"],
            env={"OPENROUTER_API_KEY": OWNER},
        )
        self.assertEqual(denied, 403)
        blocked, _, _ = handle_ai_proxy(
            method="POST",
            headers={"Origin": "https://app.example"},
            body=json.dumps(
                {"provider": "openrouter", "model": "other/model", "message": "Hi"}
            ).encode(),
            allowed_origins=["https://app.example"],
            models={"openrouter": ["openai/gpt-4o-mini"]},
            env={"OPENROUTER_API_KEY": OWNER},
        )
        self.assertEqual(blocked, 400)
        limit = create_memory_rate_limit(limit=1, window_sec=60)
        self.assertTrue(limit("203.0.113.8", None, "openrouter"))
        self.assertFalse(limit("203.0.113.8", None, "openrouter"))


class VaultTests(unittest.TestCase):
    def test_put_returns_a_hint_and_stores_ciphertext(self) -> None:
        storage = MemoryVaultStorage()
        vault = create_key_vault(encryption_key=b"k" * 32, storage=storage)
        saved = vault["put"]("user-1", "openrouter", OWNER)
        self.assertEqual(saved["hint"], "••••abcd")
        self.assertNotIn(OWNER, json.dumps(saved))
        blob = next(iter(storage.values.values()))
        self.assertNotIn(OWNER, blob)
        self.assertEqual(vault["read"]("user-1", "openrouter"), OWNER)
        self.assertEqual(vault["status"]("user-1", "gemini"), {"configured": False, "hint": ""})
