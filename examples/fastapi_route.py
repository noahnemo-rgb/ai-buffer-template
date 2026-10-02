"""Reference FastAPI route. Copy this into the app that owns the route.

Run with PYTHONPATH pointing at this repo's python/ directory, and with
OPENROUTER_API_KEY set in the server environment.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ai_buffer import build_messages, build_user_text, stream_openrouter

app = FastAPI()


class ChatRequest(BaseModel):
    message: str
    system_prompt: str | None = None
    history: list[dict[str, str]] = []
    context: str | None = None


@app.post("/api/chat/stream")
def chat_stream(body: ChatRequest) -> StreamingResponse:
    messages = build_messages(
        system_prompt=body.system_prompt,
        history=body.history,
        user_text=build_user_text(body.message, body.context),
    )

    def chunks():
        yield from stream_openrouter(
            api_key=os.environ["OPENROUTER_API_KEY"],
            model=os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
            messages=messages,
            app_name="My API",
            site_url="https://example.com",
        )

    return StreamingResponse(chunks(), media_type="text/plain")
