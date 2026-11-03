"""
OpenAI-Compatible LLM Provider Adapter.
Works with OpenAI, local endpoints (Ollama, LM Studio, vLLM, custom proxy), and third-party gateways.
"""

from __future__ import annotations

import json
import socket
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx

from app.providers.base import BaseLLMProvider, ModelMessage, ModelResponse, TokenUsage


def resolve_target_url(base_url: str) -> str:
    """
    Normalizes base URLs so that containerized services calling localhost/127.0.0.1
    route cleanly to host.docker.internal when running in Docker.
    """
    url = (base_url or "").rstrip("/")
    if "://localhost" in url or "://127.0.0.1" in url:
        try:
            socket.gethostbyname("host.docker.internal")
            url = url.replace("://localhost", "://host.docker.internal").replace("://127.0.0.1", "://host.docker.internal")
        except Exception:
            pass
    return url


class OpenAICompatibleProvider(BaseLLMProvider):
    def __init__(
        self,
        api_key: str,
        base_url: str = "http://localhost:20128/v1",
        default_model: str = "auto/chat",
        timeout_seconds: float = 60.0,
    ):
        self.api_key = api_key
        self.base_url = resolve_target_url(base_url)
        self.default_model = default_model
        self.timeout_seconds = timeout_seconds

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def test_connection(self) -> Dict[str, Any]:
        """Probes the endpoint using /models or /chat/completions to verify credentials and connectivity."""
        headers = self._get_headers()
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            # 1. Probe /models
            try:
                url = f"{self.base_url}/models"
                response = await client.get(url, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    raw_models = data.get("data", [])
                    model_ids = [m.get("id") for m in raw_models if isinstance(m, dict) and "id" in m]
                    return {
                        "ok": True,
                        "status_code": 200,
                        "model_count": len(model_ids),
                        "models": model_ids[:20],
                    }
            except Exception:
                pass

            # 2. Fallback probe: /chat/completions with minimal payload for proxies restricting /models
            try:
                chat_url = f"{self.base_url}/chat/completions"
                payload = {
                    "model": self.default_model or "auto/qwen",
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                }
                response = await client.post(chat_url, headers=headers, json=payload)
                if response.status_code == 200:
                    return {
                        "ok": True,
                        "status_code": 200,
                        "model_count": 1,
                        "models": [self.default_model or "auto/qwen"],
                    }
                else:
                    return {
                        "ok": False,
                        "status_code": response.status_code,
                        "error": f"HTTP {response.status_code}: {response.text[:200]}",
                    }
            except Exception as e:
                return {
                    "ok": False,
                    "error": str(e),
                }

    async def generate(
        self,
        messages: List[ModelMessage],
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        **kwargs,
    ) -> ModelResponse:
        """Executes a chat completion request and normalizes usage & reasoning tokens."""
        target_model = model or self.default_model
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": target_model,
            "messages": [msg.model_dump() for msg in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
            **kwargs,
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(url, headers=self._get_headers(), json=payload)
            response.raise_for_status()
            data = response.json()

        choice = data.get("choices", [{}])[0]
        msg = choice.get("message", {})
        content = msg.get("content") or ""
        reasoning_content = msg.get("reasoning_content")
        finish_reason = choice.get("finish_reason")

        raw_usage = data.get("usage", {})
        usage = TokenUsage(
            prompt_tokens=raw_usage.get("prompt_tokens", 0),
            completion_tokens=raw_usage.get("completion_tokens", 0),
            total_tokens=raw_usage.get("total_tokens", 0),
            cost=float(raw_usage.get("cost", 0.0) or 0.0),
        )

        return ModelResponse(
            content=content,
            reasoning_content=reasoning_content,
            model=data.get("model", target_model),
            usage=usage,
            finish_reason=finish_reason,
        )

    async def stream_structured(
        self,
        messages: List[ModelMessage],
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        **kwargs,
    ) -> AsyncGenerator[tuple[str, str], None]:
        """Streams structured tuples of (type, delta_text) distinguishing thoughts from content tokens."""
        target_model = model or self.default_model
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": target_model,
            "messages": [msg.model_dump() for msg in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            **kwargs,
        }

        in_think_block = False

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            async with client.stream("POST", url, headers=self._get_headers(), json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    cleaned = line.strip()
                    if not cleaned or not cleaned.startswith("data:"):
                        continue
                    data_str = cleaned[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        if "error" in chunk:
                            err_msg = chunk["error"].get("message", "Upstream model error")
                            yield ("token", f"\n[Model Error: {err_msg}]\n")
                            break

                        choices = chunk.get("choices", [])
                        if not choices:
                            continue
                        delta = choices[0].get("delta", {})

                        # 1. Native reasoning_content delta
                        reasoning = delta.get("reasoning_content")
                        if reasoning:
                            yield ("thought", reasoning)

                        # 2. Content delta (which may contain <think> tags)
                        content = delta.get("content")
                        if content:
                            if "<think>" in content:
                                in_think_block = True
                                content = content.replace("<think>", "")
                            if "</think>" in content:
                                parts = content.split("</think>", 1)
                                if parts[0]:
                                    yield ("thought", parts[0])
                                in_think_block = False
                                if len(parts) > 1 and parts[1]:
                                    yield ("token", parts[1])
                                continue

                            if in_think_block:
                                yield ("thought", content)
                            else:
                                yield ("token", content)
                    except Exception:
                        continue

    async def stream(
        self,
        messages: List[ModelMessage],
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        """Streams raw text chunks for backwards compatibility."""
        async for _, text in self.stream_structured(messages, model, temperature, max_tokens, **kwargs):
            yield text
