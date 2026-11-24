"""Nạp cấu hình YAML + biến môi trường (.env)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = ROOT / "config" / "config.yaml"
EXAMPLE_CONFIG = ROOT / "config" / "config.example.yaml"


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if value and key not in os.environ:
            os.environ[key] = value


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


class Config(dict):
    """dict có truy cập kiểu cfg.get_path("video.flow.url")."""

    def get_path(self, dotted: str, default: Any = None) -> Any:
        cur: Any = self
        for part in dotted.split("."):
            if not isinstance(cur, dict) or part not in cur:
                return default
            cur = cur[part]
        return cur

    def path(self, dotted: str) -> Path:
        """Đường dẫn tương đối trong config được hiểu theo thư mục gốc dự án."""
        p = Path(self.get_path(dotted))
        return p if p.is_absolute() else ROOT / p

    @property
    def data_dir(self) -> Path:
        d = self.path("data_dir")
        d.mkdir(parents=True, exist_ok=True)
        return d

    def brand_text(self) -> str:
        p = self.path("brand_file")
        return p.read_text(encoding="utf-8") if p.exists() else ""


def load_config(path: str | Path | None = None) -> Config:
    _load_dotenv(ROOT / ".env")
    base = yaml.safe_load(EXAMPLE_CONFIG.read_text(encoding="utf-8")) or {}
    cfg_path = Path(path) if path else DEFAULT_CONFIG
    if cfg_path.exists():
        user = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
        base = _deep_merge(base, user)
    return Config(base)
