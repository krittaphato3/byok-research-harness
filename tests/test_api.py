"""
Full End-to-End API and SSE Streaming Verification Test.
Tests Vault, Provider Probe, Run Dispatch, and SSE Token Streaming against local endpoint.
"""

import asyncio
import json
import httpx
from app.main import create_app

app = create_app()


async def run_api_tests():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        print("--- 1. Testing GET /health ---")
        res = await client.get("/health")
        print("Health status:", res.status_code, res.json())
        assert res.status_code == 200

        print("\n--- 2. Testing GET /api/vault/keys ---")
        res = await client.get("/api/vault/keys")
        print("Vault keys:", res.status_code, res.json())
        assert res.status_code == 200
        keys = res.json().get("keys", [])
        assert len(keys) >= 1
        assert keys[0]["key_hint"] == "****6341"

        print("\n--- 3. Testing POST /api/vault/test ---")
        res = await client.post("/api/vault/test", data={"provider": "local_openai", "endpoint": "http://localhost:20128/v1"})
        print("Vault test probe:", res.status_code, res.json())
        assert res.status_code == 200
        assert res.json().get("ok") is True

        print("\n--- 4. Testing POST /api/runs (Dispatch) ---")
        dispatch_payload = {
            "prompt": "Evaluate SQLite WAL mode performance in edge devices",
            "model": "auto/chat",
            "provider": "local_openai",
        }
        res = await client.post("/api/runs", json=dispatch_payload)
        print("Dispatch response:", res.status_code, res.json())
        assert res.status_code == 200
        run_id = res.json().get("run_id")
        assert run_id is not None

        print(f"\n--- 5. Testing SSE Stream GET /api/runs/{run_id}/stream ---")
        stream_chunks = []
        async with client.stream("GET", f"/api/runs/{run_id}/stream") as stream_res:
            assert stream_res.status_code == 200
            async for line in stream_res.aiter_lines():
                if line.startswith("data:"):
                    raw_data = line[5:].strip()
                    try:
                        parsed = json.loads(raw_data)
                        if parsed.get("type") == "token":
                            delta = parsed.get("delta", "")
                            print(delta, end="", flush=True)
                            stream_chunks.append(delta)
                        elif parsed.get("type") == "step":
                            print(f"\n[STEP: {parsed.get('role')}] {parsed.get('message')}")
                        elif parsed.get("type") == "done":
                            print(f"\n[DONE] {parsed.get('message')}")
                    except Exception:
                        pass

        print(f"\nTotal streamed token chunks received: {len(stream_chunks)}")
        assert len(stream_chunks) > 0, "No streamed tokens received from local endpoint"

    print("\nALL END-TO-END TESTS PASSED.")


if __name__ == "__main__":
    asyncio.run(run_api_tests())
