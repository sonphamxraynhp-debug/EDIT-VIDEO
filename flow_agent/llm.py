"""Lớp gọi Claude trả về dữ liệu có cấu trúc (Pydantic). Hai cách chạy:

- `claude_code` (mặc định): gọi Claude Code CLI (`claude -p`) — dùng gói Claude Pro/Max đã đăng nhập,
  KHÔNG tốn tiền API.
- `api`: gọi Claude API bằng Anthropic SDK — cần ANTHROPIC_API_KEY và trả phí theo token.

`llm.backend: auto` chọn `claude_code` nếu máy có lệnh `claude`, ngược lại dùng `api` khi có khoá.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable, TypeVar

from pydantic import BaseModel, ValidationError

log = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LLMError(RuntimeError):
    pass


def image_block(path: str | Path) -> dict:
    """Ảnh đưa vào prompt — mỗi backend tự chuyển sang dạng nó cần."""
    return {"type": "image_path", "path": str(Path(path).resolve())}


def _to_api_content(content: str | list[dict]) -> str | list[dict]:
    if isinstance(content, str):
        return content
    out = []
    for block in content:
        if block.get("type") == "image_path":
            p = Path(block["path"])
            media = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
            data = base64.standard_b64encode(p.read_bytes()).decode("utf-8")
            out.append({"type": "image", "source": {"type": "base64", "media_type": media, "data": data}})
        else:
            out.append(block)
    return out


# ============================================================================ Claude API (trả phí)
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
            messages=[{"role": "user", "content": _to_api_content(content)}],
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


# ============================================================================ Claude Code (gói Max)
def find_claude_cli() -> str | None:
    exe = os.environ.get("FLOWAGENT_CLAUDE_CLI") or shutil.which("claude")
    if exe:
        return exe
    home = Path.home()
    for cand in (home / ".local" / "bin" / "claude.exe", home / ".local" / "bin" / "claude",
                 home / "AppData" / "Roaming" / "npm" / "claude.cmd"):
        if cand.exists():
            return str(cand)
    return None


def extract_json(text: str) -> str:
    """Lấy khối JSON đầu tiên trong câu trả lời (bỏ ```json, lời dẫn...)."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        t = t.rsplit("```", 1)[0]
    start, end = t.find("{"), t.rfind("}")
    if start == -1 or end <= start:
        raise LLMError(f"Không thấy JSON trong câu trả lời: {text[:300]}")
    return t[start:end + 1]


class ClaudeCodeLLM:
    """Gọi `claude -p` (Claude Code ở chế độ không tương tác) với tài khoản Claude Pro/Max đã đăng nhập."""

    def __init__(self, model: str = "", exe: str | None = None, timeout: int = 1800, retries: int = 2,
                 cwd: str | Path | None = None):
        self.exe = exe or find_claude_cli()
        if not self.exe:
            raise LLMError("Không tìm thấy lệnh `claude` (Claude Code). Chạy `python -m flow_agent setup` để cài.")
        self.model = model
        self.timeout = timeout
        self.retries = retries
        self.cwd = str(cwd) if cwd else None

    def _build_prompt(self, system: str, content: str | list[dict], schema: type[BaseModel]) -> tuple[str, bool]:
        parts: list[str] = []
        images: list[str] = []
        if isinstance(content, str):
            parts.append(content)
        else:
            for block in content:
                if block.get("type") == "image_path":
                    images.append(block["path"])
                elif block.get("type") == "text":
                    parts.append(block["text"])
        prompt = f"<vai_tro>\n{system}\n</vai_tro>\n\n"
        if images:
            prompt += ("Trước tiên dùng công cụ Read để xem lần lượt các ảnh sau (theo thứ tự thời gian):\n"
                       + "\n".join(f"- {p}" for p in images) + "\n\n")
        prompt += "\n\n".join(parts)
        prompt += (
            "\n\n<dinh_dang_tra_loi>\nChỉ trả lời DUY NHẤT một đối tượng JSON hợp lệ (không lời dẫn, không ```), "
            "khớp chính xác JSON Schema sau:\n"
            f"{json.dumps(schema.model_json_schema(), ensure_ascii=False)}\n</dinh_dang_tra_loi>"
        )
        return prompt, bool(images)

    def _run(self, prompt: str, use_read: bool, model: str | None, schema: type[BaseModel]) -> Any:
        cmd = [self.exe, "-p", "--output-format", "json", "--tools", "Read" if use_read else ""]
        if use_read:
            cmd += ["--allowedTools", "Read"]
        # Ràng buộc JSON Schema ngay trong Claude Code (bản .cmd của npm qua cmd.exe dễ làm hỏng dấu ngoặc -> bỏ qua)
        if not self.exe.lower().endswith((".cmd", ".bat")):
            cmd += ["--json-schema", json.dumps(schema.model_json_schema(), ensure_ascii=False)]
        if model or self.model:
            cmd += ["--model", model or self.model]
        res = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8",
                             errors="replace", timeout=self.timeout, cwd=self.cwd)
        out = (res.stdout or "").strip()
        try:
            data = json.loads(out)
        except json.JSONDecodeError as exc:
            raise LLMError(f"Claude Code trả về lỗi (mã {res.returncode}): {(res.stderr or out)[-500:]}") from exc
        if data.get("is_error") or data.get("subtype") not in (None, "success"):
            msg = str(data.get("result") or data)
            low = msg.lower()
            if "login" in low or "api key" in low or "auth" in low:
                raise LLMError("Claude Code chưa đăng nhập. Mở cửa sổ lệnh, gõ `claude`, đăng nhập tài khoản Max "
                               "rồi gõ /exit.")
            if "limit" in low:
                raise LLMError(f"Đã chạm giới hạn sử dụng của gói Claude — agent sẽ thử lại ở lần chạy sau. ({msg[:200]})")
            raise LLMError(f"Claude Code báo lỗi: {msg[:500]}")
        if data.get("structured_output") is not None:
            return data["structured_output"]
        return str(data.get("result", ""))

    def structured(self, system: str, content: str | list[dict], schema: type[T], *, model: str | None = None,
                   effort: str | None = None, max_tokens: int = 0) -> T:  # noqa: ARG002
        prompt, use_read = self._build_prompt(system, content, schema)
        last_err: Exception | None = None
        for attempt in range(self.retries + 1):
            out = self._run(prompt, use_read, model, schema)
            try:
                if isinstance(out, dict):
                    return schema.model_validate(out)
                return schema.model_validate_json(extract_json(out))
            except (ValidationError, LLMError) as exc:
                last_err = exc
                log.warning("JSON chưa hợp lệ (lần %d): %s", attempt + 1, str(exc)[:200])
                prompt += f"\n\nLần trước JSON không hợp lệ: {str(exc)[:800]}\nHãy trả lại JSON đúng schema."
        raise LLMError(f"Không nhận được JSON hợp lệ từ Claude Code: {last_err}")


# ============================================================================ dùng cho test
class FakeLLM:
    """LLM giả cho test/chạy thử: handler(schema, system, content) -> instance."""

    def __init__(self, handler: Callable[[type[BaseModel], str, Any], BaseModel]):
        self.handler = handler
        self.calls: list[tuple[str, Any]] = []

    def structured(self, system, content, schema, **_: Any):  # noqa: ANN001
        self.calls.append((schema.__name__, content))
        return self.handler(schema, system, content)


def resolve_backend(cfg) -> str:  # noqa: ANN001
    backend = cfg.get_path("llm.backend", "auto")
    if backend != "auto":
        return backend
    if find_claude_cli():
        return "claude_code"
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "api"
    return "claude_code"


def make_llm(cfg, judge: bool = False):  # noqa: ANN001
    if resolve_backend(cfg) == "claude_code":
        from .config import ROOT

        return ClaudeCodeLLM(model=cfg.get_path("llm.claude_code_model", "") or "", cwd=ROOT)
    model = cfg.get_path("llm.judge_model" if judge else "llm.model") or cfg.get_path("llm.model")
    return LLM(model=model, effort=cfg.get_path("llm.effort", "high"),
               refusal_fallbacks=bool(cfg.get_path("llm.refusal_fallbacks", True)))
