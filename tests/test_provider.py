"""
Test OpenAICompatibleProvider against local endpoint.
"""

import asyncio
import os
from app.providers.base import ModelMessage
from app.providers.openai_compat import OpenAICompatibleProvider

LOCAL_ENDPOINT = os.environ.get("OPENAI_BASE_URL", "http://localhost:20128/v1")
TEST_API_KEY = os.environ.get("OPENAI_API_KEY", "sk-test-placeholder")


async def run_tests():
    provider = OpenAICompatibleProvider(
        api_key=TEST_API_KEY,
        base_url=LOCAL_ENDPOINT,
        default_model="auto/chat",
    )

    print("--- 1. Testing Connection ---")
    conn_result = await provider.test_connection()
    print("Connection result:", conn_result["ok"], f"Found {conn_result.get('model_count')} models.")
    assert conn_result["ok"] is True, f"Connection failed: {conn_result}"

    print("\n--- 2. Testing Non-Streaming Generation ---")
    messages = [
        ModelMessage(role="system", content="You are a precise research assistant."),
        ModelMessage(role="user", content="Give 3 bullet points on why SQLite WAL mode is ideal for local-first apps."),
    ]
    response = await provider.generate(messages=messages, max_tokens=250)
    print(f"Model used: {response.model}")
    print(f"Usage: {response.usage}")
    if response.reasoning_content:
        print(f"Reasoning snippet: {response.reasoning_content[:120]}...")
    print(f"Content:\n{response.content}")
    assert len(response.content.strip()) > 0, "Response content is empty"

    print("\n--- 3. Testing Streaming Generation ---")
    stream_messages = [
        ModelMessage(role="user", content="Count from 1 to 5, one number per line.")
    ]
    collected = []
    async for chunk in provider.stream(messages=stream_messages, max_tokens=50):
        print(chunk, end="", flush=True)
        collected.append(chunk)
    print("\n\nStreaming complete. Chunks received:", len(collected))
    assert len(collected) > 0, "No streaming chunks received"

    print("\nALL PROVIDER TESTS PASSED.")


if __name__ == "__main__":
    asyncio.run(run_tests())
