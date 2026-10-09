"""AES-GCM storage for user API keys. The ciphertext is what gets stored."""

from __future__ import annotations

import base64
import json
import os
from typing import Protocol

from .redact import mask_key_hint


class VaultStorage(Protocol):
    def get(self, key: str) -> str | None: ...
    def set(self, key: str, value: str) -> None: ...
    def delete(self, key: str) -> None: ...


class MemoryVaultStorage:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.values.get(key)

    def set(self, key: str, value: str) -> None:
        self.values[key] = value

    def delete(self, key: str) -> None:
        self.values.pop(key, None)


def vault_key_from_string(value: str) -> bytes:
    """Decode a base64 32-byte AI_BUFFER_VAULT_KEY."""
    decoded = base64.b64decode(value.strip(), validate=True)
    if len(decoded) != 32:
        raise ValueError("AI_BUFFER_VAULT_KEY must be 32 bytes, base64-encoded.")
    return decoded


def create_key_vault(*, encryption_key: bytes, storage: VaultStorage):
    """Return put/status/read/delete. put and status never include the full key."""
    if len(encryption_key) != 32:
        raise ValueError("Vault encryption key must be 32 bytes.")
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as error:
        raise RuntimeError("Install the cryptography package to use the key vault.") from error

    aes = AESGCM(encryption_key)

    def record_name(user_id: str, provider: str) -> str:
        return f"ai-buffer.vault.{user_id}.{provider}"

    def put(user_id: str, provider: str, api_key: str) -> dict[str, str | bool]:
        user = user_id.strip()
        name = provider.strip()
        key = api_key.strip()
        if not user or not name or not key:
            raise ValueError("user_id, provider, and api_key are required.")
        nonce = os.urandom(12)
        aad = f"{user}\n{name}".encode("utf-8")
        encrypted = aes.encrypt(nonce, key.encode("utf-8"), aad)
        # AESGCM appends the 16-byte tag to the ciphertext.
        record = {
            "nonce": base64.b64encode(nonce).decode("ascii"),
            "ciphertext": base64.b64encode(encrypted).decode("ascii"),
            "hint": key[-4:],
        }
        storage.set(record_name(user, name), json.dumps(record))
        return {"configured": True, "hint": mask_key_hint(record["hint"])}

    def status(user_id: str, provider: str) -> dict[str, str | bool]:
        raw = storage.get(record_name(user_id.strip(), provider.strip()))
        if not raw:
            return {"configured": False, "hint": ""}
        record = json.loads(raw)
        return {"configured": True, "hint": mask_key_hint(str(record.get("hint", "")))}

    def read(user_id: str, provider: str) -> str | None:
        user = user_id.strip()
        name = provider.strip()
        raw = storage.get(record_name(user, name))
        if not raw:
            return None
        record = json.loads(raw)
        nonce = base64.b64decode(record["nonce"])
        ciphertext = base64.b64decode(record["ciphertext"])
        aad = f"{user}\n{name}".encode("utf-8")
        return aes.decrypt(nonce, ciphertext, aad).decode("utf-8")

    def delete(user_id: str, provider: str) -> None:
        storage.delete(record_name(user_id.strip(), provider.strip()))

    return {"put": put, "status": status, "read": read, "delete": delete}
