import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_buffer import (
    DEFAULT_LLMAPI_MODEL,
    DEFAULT_NVIDIA_MODEL,
    stream_gemini,
    stream_llmapi,
    stream_nvidia,
    stream_vercel_gateway,
)
from ai_buffer.gemini import GEMINI_API_BASE
from ai_buffer.llmapi import LLMAPI_URL
from ai_buffer.nvidia import NVIDIA_URL
from ai_buffer.vercel_gateway import VERCEL_GATEWAY_URL, read_gateway_api_key


def chat_event(content: str) -> bytes:
    return f"data: {json.dumps({'choices': [{'delta': {'content': content}}]})}\n".encode()


def gemini_event(text: str, thought: str | None = None) -> bytes:
    parts: list[dict[str, object]] = []
    if thought is not None:
        parts.append({"thought": True, "text": thought})
    parts.append({"text": text})
    body = {"candidates": [{"content": {"parts": parts}}]}
    return f"data: {json.dumps(body)}\n".encode()


class _FakeBody:
    def __init__(self, lines: list[bytes]) -> None:
        self._lines = list(lines)

    def __enter__(self) -> "_FakeBody":
        return self

    def __exit__(self, *_args: object) -> bool:
        return False

    def readline(self) -> bytes:
        if not self._lines:
            return b""
        return self._lines.pop(0)


class ProviderStreamTests(unittest.TestCase):
    def test_vercel_gateway_sends_the_key_and_model(self) -> None:
        seen: dict[str, object] = {}

        def opener(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> _FakeBody:
            seen["url"] = url
            seen["headers"] = headers
            seen["payload"] = json.loads(payload.decode("utf-8"))
            seen["timeout"] = timeout_sec
            return _FakeBody([chat_event("Gate"), chat_event("way"), b"data: [DONE]\n"])

        chunks = list(
            stream_vercel_gateway(
                api_key=read_gateway_api_key({"AI_GATEWAY_API_KEY": "gw", "VERCEL_OIDC_TOKEN": "oidc"}),
                model="openai/gpt-4o-mini",
                messages=[{"role": "user", "content": "Hi"}],
                app_name="Seed Feast",
                open_stream=opener,
            )
        )
        self.assertEqual(chunks, ["Gate", "way"])
        self.assertEqual(seen["url"], VERCEL_GATEWAY_URL)
        headers = seen["headers"]
        assert isinstance(headers, dict)
        self.assertEqual(headers["Authorization"], "Bearer gw")
        payload = seen["payload"]
        assert isinstance(payload, dict)
        self.assertEqual(payload["model"], "openai/gpt-4o-mini")
        self.assertTrue(payload["stream"])

    def test_gateway_key_prefers_the_api_key(self) -> None:
        self.assertEqual(read_gateway_api_key({"AI_GATEWAY_API_KEY": "gw", "VERCEL_OIDC_TOKEN": "oidc"}), "gw")
        self.assertEqual(read_gateway_api_key({"VERCEL_OIDC_TOKEN": "oidc"}), "oidc")

    def test_gemini_stream_skips_thoughts_and_maps_roles(self) -> None:
        seen: dict[str, object] = {}

        def opener(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> _FakeBody:
            seen["url"] = url
            seen["headers"] = headers
            seen["payload"] = json.loads(payload.decode("utf-8"))
            return _FakeBody([gemini_event("Hi", thought="hidden"), gemini_event(" there")])

        chunks = list(
            stream_gemini(
                api_key="gem-key",
                messages=[
                    {"role": "system", "content": "You name plants."},
                    {"role": "assistant", "content": "Earlier"},
                    {"role": "user", "content": "Name it"},
                ],
                open_stream=opener,
            )
        )
        self.assertEqual(chunks, ["Hi", " there"])
        self.assertEqual(seen["url"], f"{GEMINI_API_BASE}/models/gemini-3.8-flash:streamGenerateContent?alt=sse")
        headers = seen["headers"]
        assert isinstance(headers, dict)
        self.assertEqual(headers["x-goog-api-key"], "gem-key")
        payload = seen["payload"]
        assert isinstance(payload, dict)
        self.assertEqual(payload["systemInstruction"], {"parts": [{"text": "You name plants."}]})
        self.assertEqual(payload["contents"][0]["role"], "model")
        self.assertNotIn("key=", str(seen["url"]))

    def test_gemini_http_error_and_missing_key(self) -> None:
        def opener(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> object:
            raise urllib.error.HTTPError(url, 429, "Too Many Requests", hdrs=None, fp=io.BytesIO(b"slow"))

        with self.assertRaisesRegex(RuntimeError, "Gemini API HTTP 429: slow"):
            list(stream_gemini(api_key="gem", messages=[], open_stream=opener))
        with self.assertRaisesRegex(RuntimeError, "GEMINI_API_KEY"):
            list(stream_gemini(api_key="  ", messages=[]))

    def test_llmapi_uses_the_documented_host(self) -> None:
        seen: dict[str, object] = {}

        def opener(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> _FakeBody:
            seen["url"] = url
            seen["payload"] = json.loads(payload.decode("utf-8"))
            seen["headers"] = headers
            return _FakeBody([chat_event("llm"), b"data: [DONE]\n"])

        chunks = list(stream_llmapi(api_key="llm-key", messages=[{"role": "user", "content": "Hi"}], open_stream=opener))
        self.assertEqual(chunks, ["llm"])
        self.assertEqual(seen["url"], LLMAPI_URL)
        payload = seen["payload"]
        assert isinstance(payload, dict)
        self.assertEqual(payload["model"], DEFAULT_LLMAPI_MODEL)
        headers = seen["headers"]
        assert isinstance(headers, dict)
        self.assertEqual(headers["Authorization"], "Bearer llm-key")

    def test_llmapi_missing_key(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "LLM_API_KEY"):
            list(stream_llmapi(api_key="", messages=[]))

    def test_nvidia_sends_the_nemotron_model(self) -> None:
        seen: dict[str, object] = {}

        def opener(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> _FakeBody:
            seen["url"] = url
            seen["payload"] = json.loads(payload.decode("utf-8"))
            seen["headers"] = headers
            return _FakeBody([chat_event("nemo"), b"data: [DONE]\n"])

        chunks = list(stream_nvidia(api_key="nv-key", messages=[{"role": "user", "content": "Hi"}], open_stream=opener))
        self.assertEqual(chunks, ["nemo"])
        self.assertEqual(seen["url"], NVIDIA_URL)
        payload = seen["payload"]
        assert isinstance(payload, dict)
        self.assertEqual(payload["model"], DEFAULT_NVIDIA_MODEL)
        headers = seen["headers"]
        assert isinstance(headers, dict)
        self.assertEqual(headers["Authorization"], "Bearer nv-key")

    def test_nvidia_missing_key(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "NVIDIA_API_KEY"):
            list(stream_nvidia(api_key="", messages=[]))


if __name__ == "__main__":
    unittest.main()
