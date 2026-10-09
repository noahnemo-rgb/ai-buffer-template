"""Laya is listed and not called.

Documented hosts are decision APIs (POST /v1/systemone), not chat completions:
- Laya Studio: https://api.laya.studio — https://laya.studio/docs/api
- Laya AI: https://api.laya-ai.com — https://laya-ai.com/laya-api

stream_laya is the extension point. It does not send HTTP.
"""

from __future__ import annotations

from collections.abc import Iterator

LAYA_NOT_CALLED = "Laya is not called. Confirm which Laya service to use."

LAYA_CANDIDATES = (
    {"name": "Laya Studio", "base_url": "https://api.laya.studio", "docs": "https://laya.studio/docs/api"},
    {"name": "Laya AI", "base_url": "https://api.laya-ai.com", "docs": "https://laya-ai.com/laya-api"},
)


def stream_laya(**_kwargs: object) -> Iterator[str]:
    raise RuntimeError(LAYA_NOT_CALLED)
