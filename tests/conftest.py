"""Fixture dùng chung: context với DB tạm + LLM giả (không gọi mạng)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flow_agent.config import load_config  # noqa: E402
from flow_agent.context import Ctx  # noqa: E402
from flow_agent.db import DB  # noqa: E402
from flow_agent.models import (  # noqa: E402
    Beat, HookPattern, Playbook, Scene, ScriptDraft, TopicInsight,
)


def make_playbook() -> Playbook:
    return Playbook(
        summary="Hook nỗi lo cụ thể theo tuần thai + 5 ý liệt kê nhịp nhanh + CTA hỏi mở.",
        winning_topics=[TopicInsight(topic="mốc siêu âm", evidence="3 video top đều về mốc 12 tuần, 4.1x trung vị", priority="cao")],
        hook_patterns=[HookPattern(template="Mẹ bầu [tuần X] nhớ [việc]", example="Mẹ bầu 12 tuần nhớ đi đo độ mờ da gáy", why="neo tuần thai")],
        structure_template=[Beat(name="Hook", time_range="0-3s", purpose="giữ người xem", guideline="1 câu ≤ 12 từ")],
        length_sweet_spot="25–40 giây", visual_style="bác sĩ áo blouse, phòng khám sáng", audio_style="giọng ấm, nhạc nhẹ",
        on_screen_text_rules=["chữ to, 2 giây/dòng"], caption_patterns=["câu hỏi + 3 hashtag"], cta_patterns=["Mẹ đang tuần thứ mấy?"],
        posting_insights=["đăng 20h"], avoid=["giật tít"],
        character_bible="A friendly Vietnamese male doctor in his early 40s, short black hair, white coat, blue shirt.",
        flow_prompt_guide=["medium close-up, soft key light"], adaptation_for_brand="giữ giọng ấm áp", open_questions=["độ dài 60s?"],
    )


def make_draft(i: int, topic: str | None = None, text: str = "Mẹ bầu cần nhớ mốc siêu âm này") -> ScriptDraft:
    return ScriptDraft(
        title=f"Kịch bản {i}", topic=topic or f"chủ đề {i}", angle="exploit" if i % 3 else "explore",
        hypothesis="h", target_audience="mẹ bầu", hook=text, formula_mapping="hook + liệt kê",
        scenes=[Scene(idx=1, seconds=8, visual_prompt_en="Doctor talks to camera", dialogue_vi=text,
                      on_screen_text_vi=text, camera="medium close-up")],
        cta="Mẹ đang mang thai tuần thứ mấy?", caption="Mốc siêu âm quan trọng", hashtags=["mebau"],
        medical_claims=[text], production_notes="",
    )


@pytest.fixture
def ctx(tmp_path):
    cfg = load_config(tmp_path / "missing.yaml")
    cfg["data_dir"] = str(tmp_path / "data")
    cfg["skill_dir"] = str(tmp_path / "skill")
    c = Ctx(cfg=cfg, db=DB(tmp_path / "data" / "agent.db"))
    c.db.save_playbook(make_playbook().model_dump(), "test")
    return c
