"""
Test Vault Encryption, Storage, and Hint Sanitization.
"""

from app.db import init_db
from app.vault import (
    encrypt_secret,
    decrypt_secret,
    save_api_key,
    get_api_key,
    list_vault_keys,
    format_key_hint,
)


def test_vault():
    init_db()

    # 1. Cryptographic round-trip
    original = "sk-test-secret-value-12345678"
    encrypted = encrypt_secret(original)
    decrypted = decrypt_secret(encrypted)
    assert original == decrypted, "Vault encryption round-trip failed"
    assert encrypted != original, "Encrypted payload matches plaintext"

    # 2. Key hint sanitization
    hint = format_key_hint(original)
    assert hint == "****5678", f"Expected '****5678', got '{hint}'"

    # 3. Save and retrieve
    dummy_key = "sk-test-mock-dummy-key-for-unit-tests-9999"
    key_id = save_api_key(
        provider="local_openai",
        api_key=dummy_key,
        label="Local Proxy",
        is_default=True,
    )
    assert key_id is not None, "Failed to save API key"

    retrieved = get_api_key("local_openai")
    assert retrieved == dummy_key, "Retrieved key does not match"

    keys = list_vault_keys()
    assert len(keys) >= 1, "No vault keys listed"
    matched = [k for k in keys if k["id"] == key_id][0]
    assert matched["key_hint"] == "****9999", f"Unexpected hint format: {matched['key_hint']}"
    assert "encrypted_key" not in matched, "list_vault_keys leaked encrypted ciphertext"

    print("ALL VAULT TESTS PASSED. Key saved securely into vault.")


if __name__ == "__main__":
    test_vault()
