import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_buffer import (
    SPACE_BUNNY_MODEL,
    build_messages,
    drain_openrouter_sse,
    full_precision_extra,
    stream_openrouter,
    stream_space_bunny,
)
from ai_buffer.messages import DEFAULT_SYSTEM_PROMPT


def event(content: str) -> str:
    return f"data: {json.dumps({'choices': [{'delta': {'content': content}}]})}\n"


class MessageTests(unittest.TestCase):
    def test_app_prompt_replaces_the_generic_one(self) -> None:
        messages = build_messages(
            system_prompt="You write one-line jokes.",
            history=[{"role": "assistant", "content": "Prior"}],
            user_text="Another",
        )
        self.assertEqual(
            [item["content"] for item in messages],
            ["You write one-line jokes.", "Prior", "Another"],
        )
        self.assertNotIn("Syntax", DEFAULT_SYSTEM_PROMPT)

    def test_blank_prompt_uses_the_generic_default(self) -> None:
        messages = build_messages(system_prompt="  ", history=[], user_text="Hi")
        self.assertEqual(messages[0]["content"], DEFAULT_SYSTEM_PROMPT)


class SseTests(unittest.TestCase):
    def test_second_chunk_keeps_its_first_character(self) -> None:
        first_text, parsed = drain_openrouter_sse(event("A"), 0)
        self.assertEqual(first_text, "A")
        second_text, _parsed = drain_openrouter_sse(event("A") + event("B"), parsed)
        self.assertEqual(second_text, "B")

    def test_stream_error(self) -> None:
        body = 'data: {"error": {"message": "model not found"}}\n'
        with self.assertRaisesRegex(RuntimeError, "model not found"):
            drain_openrouter_sse(body, 0)


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


class StreamTests(unittest.TestCase):
    def test_yields_deltas_and_sends_the_app_name(self) -> None:
        seen: dict[str, object] = {}

        def opener(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> _FakeBody:
            seen["url"] = url
            seen["headers"] = headers
            seen["payload"] = payload
            seen["timeout"] = timeout_sec
            return _FakeBody([event("Hello").encode(), event(" py").encode(), b"data: [DONE]\n"])

        chunks = list(
            stream_openrouter(
                api_key="sk-test",
                model="openai/gpt-4o-mini",
                messages=[{"role": "user", "content": "Hi"}],
                app_name="Seed Feast",
                site_url="https://example.com",
                open_stream=opener,
            )
        )
        self.assertEqual(chunks, ["Hello", " py"])
        headers = seen["headers"]
        assert isinstance(headers, dict)
        self.assertEqual(headers["X-Title"], "Seed Feast")
        self.assertEqual(headers["Authorization"], "Bearer sk-test")

    def test_http_error_includes_the_status(self) -> None:
        def opener(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> object:
            raise urllib.error.HTTPError(url, 401, "Unauthorized", hdrs=None, fp=io.BytesIO(b"bad key"))

        with self.assertRaisesRegex(RuntimeError, "OpenRouter HTTP 401: bad key"):
            list(
                stream_openrouter(
                    api_key="sk-test",
                    model="openai/gpt-4o-mini",
                    messages=[],
                    open_stream=opener,
                )
            )

    def test_space_bunny_sends_the_stealth_model(self) -> None:
        seen: dict[str, object] = {}

        def opener(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> _FakeBody:
            seen["payload"] = json.loads(payload.decode("utf-8"))
            return _FakeBody([event("bunny").encode(), b"data: [DONE]\n"])

        chunks = list(
            stream_space_bunny(
                api_key="sk-test",
                messages=[{"role": "user", "content": "Hi"}],
                open_stream=opener,
            )
        )
        self.assertEqual(chunks, ["bunny"])
        payload = seen["payload"]
        assert isinstance(payload, dict)
        self.assertEqual(payload["model"], SPACE_BUNNY_MODEL)
        self.assertEqual(payload["reasoning"], {"effort": "medium"})

    def test_full_precision_extra_filters_open_weight_hosts(self) -> None:
        model = "meta-llama/llama-3.1-70b-instruct"
        self.assertEqual(
            full_precision_extra(model),
            {"provider": {"quantizations": ["bf16", "fp16", "fp32"]}},
        )
        for refused in ("openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", SPACE_BUNNY_MODEL, f"{model}:free"):
            with self.assertRaises(RuntimeError):
                full_precision_extra(refused)

        seen: dict[str, object] = {}

        def opener(url: str, payload: bytes, headers: dict[str, str], timeout_sec: float) -> _FakeBody:
            seen["payload"] = json.loads(payload.decode("utf-8"))
            return _FakeBody([event("precise").encode(), b"data: [DONE]\n"])

        chunks = list(
            stream_openrouter(
                api_key="sk-test",
                model=model,
                messages=[{"role": "user", "content": "Hi"}],
                extra=full_precision_extra(model),
                open_stream=opener,
            )
        )
        self.assertEqual(chunks, ["precise"])
        payload = seen["payload"]
        assert isinstance(payload, dict)
        self.assertEqual(payload["provider"], {"quantizations": ["bf16", "fp16", "fp32"]})

    def test_missing_key(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "OPENROUTER_API_KEY"):
            list(stream_openrouter(api_key="  ", model="openai/gpt-4o-mini", messages=[]))


if __name__ == "__main__":
    unittest.main()
