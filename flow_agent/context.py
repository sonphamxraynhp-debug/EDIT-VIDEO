"""Gói các phụ thuộc dùng chung (config, DB, LLM) cho mọi bước của agent."""
from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from typing import Any

from .config import Config, load_config
from .db import DB
from .scoring import DEFAULT_RUBRIC, normalize_rubric, rubric_text

log = logging.getLogger("flow_agent")

# Hồ sơ trình duyệt Playwright không mở được 2 lần cùng lúc -> khoá dùng chung cho mọi job.
BROWSER_LOCK = threading.Lock()


@dataclass
class Ctx:
    cfg: Config
    db: DB
    llm: Any = None
    judge: Any = None
    extra: dict = field(default_factory=dict)

    # ----------------------------------------------------------- dữ liệu ngữ cảnh cho prompt
    def brand(self) -> str:
        return self.cfg.brand_text()

    def playbook(self) -> tuple[int, dict]:
        pb = self.db.latest_playbook()
        if not pb:
            raise RuntimeError(
                "Chưa có playbook. Hãy chạy `flowagent scan-reference` rồi `flowagent build-formula` trước."
            )
        return pb

    def rubric(self) -> tuple[int, list[dict]]:
        r = self.db.latest_rubric()
        if not r:
            v = self.db.save_rubric(normalize_rubric(DEFAULT_RUBRIC), "Rubric mặc định")
            return v, normalize_rubric(DEFAULT_RUBRIC)
        return r

    def lessons_text(self) -> str:
        rows = self.db.active_lessons()
        if not rows:
            return "(Chưa có — kênh chưa có đủ số liệu thật.)"
        return "\n".join(f"[#{r['id']}] {r['text']}" for r in rows)

    def prompt_vars(self) -> dict:
        pv, pb = self.playbook()
        rv, rubric = self.rubric()
        return {
            "brand": self.brand(),
            "playbook_version": pv,
            "playbook": json.dumps(pb, ensure_ascii=False, indent=1),
            "lessons": self.lessons_text(),
            "rubric": rubric_text(rubric),
            "rubric_list": rubric,
            "rubric_version": rv,
            "threshold": self.cfg.get_path("daily.score_threshold", 95),
        }


def build_ctx(config_path: str | None = None, with_llm: bool = True) -> Ctx:
    cfg = load_config(config_path)
    db = DB(cfg.data_dir / "agent.db")
    ctx = Ctx(cfg=cfg, db=db)
    if with_llm:
        from .llm import make_llm

        ctx.llm = make_llm(cfg)
        ctx.judge = make_llm(cfg, judge=True)
    return ctx
