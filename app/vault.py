"""
Local Encrypted Key Vault.
Uses AES-256-GCM via cryptography AEAD.
Stores sensitive BYOK credentials in SQLite with zero plain-text disk writes.
Generates and manages a dedicated local master key at data/master.key (Option A).
Supports custom Base URLs, API formats, and per-provider Model Lists.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import MASTER_KEY_PATH
from app.db import get_db

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    AESGCM = None


DEFAULT_LOCAL_MODELS = [
    {"id": "auto/qwen", "name": "auto/qwen", "tags": ["1M", "Fast"], "is_enabled": True},
    {"id": "auto/coding", "name": "auto/coding", "tags": ["Coding"], "is_enabled": True},
    {"id": "auto/fast", "name": "auto/fast", "tags": ["Fast"], "is_enabled": True},
    {"id": "auto/cheap", "name": "auto/cheap", "tags": ["Low-cost"], "is_enabled": True},
    {"id": "antigravity/gemini-3.8-flash-high", "name": "antigravity/gemini-3.8-flash-high", "tags": ["1M", "Vision"], "is_enabled": True},
    {"id": "antigravity/claude-sonnet-4-6", "name": "antigravity/claude-sonnet-4-6", "tags": ["1M"], "is_enabled": True},
    {"id": "antigravity/claude-opus-4-6-thinking", "name": "antigravity/claude-opus-4-6-thinking", "tags": ["1M", "Thinking"], "is_enabled": True},
]


def get_or_create_master_key(key_path: Path = MASTER_KEY_PATH) -> bytes:
    """Retrieves the 256-bit local master key from disk or securely generates a fresh one."""
    key_path.parent.mkdir(parents=True, exist_ok=True)
    if key_path.exists():
        key_bytes = key_path.read_bytes()
        if len(key_bytes) == 32:
            return key_bytes

    fresh_key = secrets.token_bytes(32)
    key_path.write_bytes(fresh_key)
    try:
        os.chmod(key_path, 0o600)
    except Exception:
        pass
    return fresh_key


def encrypt_secret(secret: str) -> str:
    """Encrypts a plaintext string with AES-256-GCM using the local master key."""
    if AESGCM is None:
        raise RuntimeError("cryptography is not installed. Run 'pip install -r requirements.txt'")

    master_key = get_or_create_master_key()
    aesgcm = AESGCM(master_key)
    nonce = secrets.token_bytes(12)
    ciphertext = aesgcm.encrypt(nonce, secret.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("utf-8")


def decrypt_secret(encrypted_b64: str) -> str:
    """Decrypts an AES-256-GCM encrypted base64 payload using the local master key."""
    if AESGCM is None:
        raise RuntimeError("cryptography is not installed. Run 'pip install -r requirements.txt'")

    raw = base64.b64decode(encrypted_b64.encode("utf-8"))
    nonce, ciphertext = raw[:12], raw[12:]
    master_key = get_or_create_master_key()
    aesgcm = AESGCM(master_key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")


def format_key_hint(api_key: str) -> str:
    """Safely formats the key hint showing ONLY the last 4 characters."""
    cleaned = api_key.strip()
    if len(cleaned) <= 4:
        return "****"
    return f"****{cleaned[-4:]}"


def save_api_key(
    provider: str,
    api_key: Optional[str] = None,
    label: Optional[str] = None,
    base_url: str = "http://localhost:20128/v1",
    api_format: str = "chat_completions",
    models: Optional[List[Dict[str, Any]]] = None,
    is_default: bool = False,
    is_enabled: bool = True,
    key_id: Optional[str] = None,
) -> str:
    """Stores or updates an encrypted provider configuration in the vault."""
    target_id = key_id or str(uuid.uuid4())
    display_label = label or f"{provider.capitalize()}"
    models_payload = json.dumps(models if models is not None else DEFAULT_LOCAL_MODELS)

    has_new_key = bool(api_key and api_key.strip())

    with get_db() as conn:
        if is_default:
            conn.execute("UPDATE vault_keys SET is_default = 0;")

        if key_id and not has_new_key:
            # Updating an existing provider without changing the secret key
            existing = conn.execute(
                "SELECT encrypted_key, key_hint FROM vault_keys WHERE id = ?;", (key_id,)
            ).fetchone()
            if existing:
                encrypted = existing["encrypted_key"]
                hint = existing["key_hint"]
            else:
                encrypted = encrypt_secret("sk-placeholder")
                hint = "****"
        else:
            clean_key = (api_key or "").strip()
            encrypted = encrypt_secret(clean_key)
            hint = format_key_hint(clean_key)

        conn.execute(
            """
            INSERT INTO vault_keys (id, provider, label, base_url, api_format, encrypted_key, key_hint, models_json, is_enabled, is_default)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                provider=excluded.provider,
                label=excluded.label,
                base_url=excluded.base_url,
                api_format=excluded.api_format,
                encrypted_key=excluded.encrypted_key,
                key_hint=excluded.key_hint,
                models_json=excluded.models_json,
                is_enabled=excluded.is_enabled,
                is_default=excluded.is_default,
                updated_at=CURRENT_TIMESTAMP;
            """,
            (
                target_id,
                provider.lower(),
                display_label,
                base_url.rstrip("/"),
                api_format,
                encrypted,
                hint,
                models_payload,
                1 if is_enabled else 0,
                1 if is_default else 0,
            ),
        )
        conn.commit()
    return target_id


def get_provider(provider_id_or_name: str) -> Optional[Dict[str, Any]]:
    """Retrieves full decrypted provider config including active API key."""
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT * FROM vault_keys
            WHERE id = ? OR provider = ?
            ORDER BY is_default DESC, updated_at DESC
            LIMIT 1;
            """,
            (provider_id_or_name, provider_id_or_name.lower()),
        ).fetchone()

        if not row:
            return None
        res = dict(row)
        res["api_key"] = decrypt_secret(res["encrypted_key"])
        try:
            res["models"] = json.loads(res.get("models_json") or "[]")
        except Exception:
            res["models"] = []
        return res


def get_api_key(provider: str) -> Optional[str]:
    """Retrieves and decrypts the active API key for a provider."""
    p = get_provider(provider)
    return p["api_key"] if p else None


def list_vault_keys() -> List[Dict[str, Any]]:
    """Returns safe metadata for UI display without exposing decrypted secrets."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, provider, label, base_url, api_format, key_hint, models_json, is_enabled, is_default, last_test_status, last_test_at, updated_at
            FROM vault_keys
            ORDER BY is_default DESC, updated_at DESC;
            """
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d["models"] = json.loads(d.get("models_json") or "[]")
            except Exception:
                d["models"] = []
            result.append(d)
        return result


def delete_provider(provider_id: str) -> bool:
    with get_db() as conn:
        res = conn.execute("DELETE FROM vault_keys WHERE id = ?;", (provider_id,))
        conn.commit()
        return res.rowcount > 0


def update_provider_models(provider_id: str, models: List[Dict[str, Any]]) -> bool:
    with get_db() as conn:
        res = conn.execute(
            "UPDATE vault_keys SET models_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;",
            (json.dumps(models), provider_id),
        )
        conn.commit()
        return res.rowcount > 0
