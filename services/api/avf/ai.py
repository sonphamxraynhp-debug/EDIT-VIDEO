"""Client LLM local (Ollama). JSON structured output + kiểm schema + retry (TC-005)."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request

from . import config


def ollama_models() -> list[dict]:
    try:
        with urllib.request.urlopen(f"{config.OLLAMA_URL}/api/tags", timeout=2) as r:
            return json.loads(r.read()).get("models", [])
    except (urllib.error.URLError, OSError, ValueError):
        return []


_llm_cache = {"at": 0.0, "ok": False}


def llm_available() -> bool:
    """Giao diện hỏi vài giây một lần → nhớ kết quả 10 giây, không gọi Ollama mỗi lượt."""
    import time
    if time.time() - _llm_cache["at"] > 10:
        _llm_cache.update(at=time.time(), ok=any(m.get("name") == config.OLLAMA_MODEL for m in ollama_models()))
    return _llm_cache["ok"]


def _extract_json(text: str):
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
    if m:
        text = m.group(1)
    start = min([i for i in (text.find("{"), text.find("[")) if i >= 0], default=-1)
    if start < 0:
        raise ValueError("no json")
    return json.loads(text[start:])


def generate_json(system: str, prompt: str, validate, *, retries: int = 2, temperature: float = 0.7,
                  seed: int | None = None, timeout: int = 240):
    """Gọi LLM, parse JSON, chạy validate(obj)->obj. Ném RuntimeError nếu hết lượt."""
    last_err = None
    for attempt in range(retries + 1):
        body = {
            "model": config.OLLAMA_MODEL, "stream": False, "format": "json", "think": False,
            "options": {"temperature": temperature, **({"seed": seed + attempt} if seed is not None else {})},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": prompt + ("\n/no_think" if "qwen3" in config.OLLAMA_MODEL else "")}],
        }
        req = urllib.request.Request(f"{config.OLLAMA_URL}/api/chat", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                content = json.loads(r.read())["message"]["content"]
            return validate(_extract_json(content))
        except Exception as e:  # noqa: BLE001 — mọi lỗi đều được retry rồi báo lên
            last_err = e
    raise RuntimeError(f"LLM_SCHEMA_ERROR: {last_err}")
