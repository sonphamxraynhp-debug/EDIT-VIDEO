"""Lớp gọi Claude API trả về dữ liệu có cấu trúc (Pydantic)."""
from __future__ import annotations

import base64
import logging
from pathlib import Path
from typing import Any, Callable, TypeVar

from pydantic import BaseModel

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LLMError(RuntimeError):
    pass


def image_block(path: str | Path) -> dict:
    data = base64.standard_b64encode(Path(path).read_bytes()).decode("utf-8")
    suffix = Path(path).suffix.lower()
    media = "image/png" if suffix == ".png" else "image/jpeg"
    return {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}}


class LLM:
    """Bọc Anthropic SDK. Mọi lời gọi đều trả về một đối tượng Pydantic đã được kiểm tra schema."""

    def __init__(self, model: str = "claude-opus-5-5", effort: str = "high", refusal_fallbacks: bool = True):
        import anthropic  # nạp muộn để test không cần SDK

        self.client = anthropic.Anthropic()
        self.model = model
        self.effort = effort
        self.refusal_fallbacks = refusal_fallbacks

    def structured(
        self,
        system: str,
        content: str | list[dict],
        schema: type[T],
        *,
        model: str | None = None,
        effort: str | None = None,
        max_tokens: int = 64000,
    ) -> T:
        kwargs: dict[str, Any] = dict(
            model=model or self.model,
            max_tokens=max_tokens,
            # system ổn định -> cache được giữa các lần gọi trong cùng một đợt
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": content}],
            output_format=schema,
            output_config={"effort": effort or self.effort},
        )
        if self.refusal_fallbacks:
            kwargs["betas"] = [FALLBACK_BETA]
            kwargs["fallbacks"] = "default"

        with self.client.beta.messages.stream(**kwargs) as stream:
            msg = stream.get_final_message()

        if msg.stop_reason == "refusal":
            details = getattr(msg, "stop_details", None)
            raise LLMError(f"Claude từ chối yêu cầu: {getattr(details, 'explanation', '')}")
        if msg.stop_reason == "max_tokens":
            raise LLMError("Phản hồi bị cắt do chạm max_tokens")

        for block in msg.content:
            parsed = getattr(block, "parsed_output", None)
            if block.type == "text" and parsed is not None:
                return parsed  # type: ignore[return-value]
        text = "".join(b.text for b in msg.content if b.type == "text")
        return schema.model_validate_json(text)


class FakeLLM:
    """LLM giả cho test/chạy thử: handler(schema, system, content) -> instance."""

    def __init__(self, handler: Callable[[type[BaseModel], str, Any], BaseModel]):
        self.handler = handler
        self.calls: list[tuple[str, Any]] = []

    def structured(self, system, content, schema, **_: Any):  # noqa: ANN001
        self.calls.append((schema.__name__, content))
        return self.handler(schema, system, content)


def make_llm(cfg) -> LLM:  # noqa: ANN001
    return LLM(
        model=cfg.get_path("llm.model"),
        effort=cfg.get_path("llm.effort", "high"),
        refusal_fallbacks=bool(cfg.get_path("llm.refusal_fallbacks", True)),
    )
