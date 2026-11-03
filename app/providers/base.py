"""
Base Provider Interface and Common Data Structures.
Standardizes LLM communication, streaming tokens, and usage metrics across providers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, List, Optional
from pydantic import BaseModel, Field


class ModelMessage(BaseModel):
    role: str  # 'system', 'user', 'assistant'
    content: str


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0


class ModelResponse(BaseModel):
    content: str
    reasoning_content: Optional[str] = None
    model: str
    usage: TokenUsage = Field(default_factory=TokenUsage)
    finish_reason: Optional[str] = None


class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        messages: List[ModelMessage],
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        **kwargs,
    ) -> ModelResponse:
        """Executes a non-streaming completion request."""
        pass

    @abstractmethod
    async def stream(
        self,
        messages: List[ModelMessage],
        model: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
        **kwargs,
    ) -> AsyncGenerator[str, None]:
        """Streams text chunks in real-time for SSE delivery."""
        pass

    @abstractmethod
    async def test_connection(self) -> Dict[str, any]:
        """Probes the provider endpoint and returns status and available models."""
        pass
