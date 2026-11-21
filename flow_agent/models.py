"""Schema dữ liệu có cấu trúc dùng cho các lần gọi Claude (structured outputs)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------- phân tích video kênh mẫu
class VideoAnalysis(BaseModel):
    topic: str = Field(description="Chủ đề chính của video")
    target_audience: str
    hook_text: str = Field(description="Câu/hình mở đầu 0-3 giây")
    hook_type: str = Field(description="Loại hook: câu hỏi, nỗi sợ, con số, phản trực giác, câu chuyện...")
    emotional_trigger: str
    structure_beats: list[str] = Field(description="Các nhịp nội dung theo thứ tự, kèm mốc giây nếu biết")
    format: str = Field(description="talking head, b-roll + voice, hoạt hình, slideshow, cảnh diễn...")
    visual_style: str
    on_screen_text_style: str
    audio_style: str = Field(description="giọng đọc, nhạc nền, hiệu ứng")
    pacing: str = Field(description="tốc độ cắt cảnh/nhịp nói")
    cta: str
    length_seconds_estimate: int
    why_it_works: str
    weaknesses: str
    replicable_elements: list[str]
    tags: list[str]


class TopicInsight(BaseModel):
    topic: str
    evidence: str = Field(description="Bằng chứng từ số liệu: video nào, bao nhiêu view, so với trung vị")
    priority: Literal["cao", "trung bình", "thấp"]


class HookPattern(BaseModel):
    template: str = Field(description="Mẫu câu hook có chỗ trống, ví dụ: 'Mẹ bầu [tuần X] mà thấy [dấu hiệu]...'")
    example: str
    why: str


class Beat(BaseModel):
    name: str
    time_range: str = Field(description="ví dụ 0-3s, 3-15s")
    purpose: str
    guideline: str


class Playbook(BaseModel):
    summary: str = Field(description="Tóm tắt công thức thành công trong 3-5 câu")
    winning_topics: list[TopicInsight]
    hook_patterns: list[HookPattern]
    structure_template: list[Beat]
    length_sweet_spot: str
    visual_style: str
    audio_style: str
    on_screen_text_rules: list[str]
    caption_patterns: list[str]
    cta_patterns: list[str]
    posting_insights: list[str]
    avoid: list[str]
    character_bible: str = Field(
        description="Mô tả nhân vật/bối cảnh cố định (tiếng Anh) để Google Flow giữ đồng nhất giữa các cảnh"
    )
    flow_prompt_guide: list[str] = Field(description="Quy tắc viết prompt Veo/Flow để ra đúng phong cách kênh")
    adaptation_for_brand: str = Field(description="Cách áp công thức vào thương hiệu của chúng ta mà không vi phạm ranh giới")
    open_questions: list[str] = Field(description="Giả thuyết chưa đủ dữ liệu, cần thử nghiệm")


# ---------------------------------------------------------------- kịch bản
class Scene(BaseModel):
    idx: int
    seconds: int = Field(description="Độ dài cảnh, tối đa 8 giây (giới hạn 1 clip Veo)")
    visual_prompt_en: str = Field(
        description="Prompt tiếng Anh cho Google Flow/Veo: chủ thể, hành động, bối cảnh, góc máy, ánh sáng, phong cách. "
        "Lặp lại mô tả nhân vật từ character bible để đồng nhất."
    )
    dialogue_vi: str = Field(description="Lời thoại/voice tiếng Việt trong cảnh (đọc được trong số giây của cảnh)")
    on_screen_text_vi: str = Field(description="Phụ đề/chữ trên màn hình tiếng Việt")
    camera: str


class ScriptDraft(BaseModel):
    title: str
    topic: str
    angle: Literal["exploit", "explore"] = Field(description="exploit = bám công thức đã thắng; explore = thử hướng mới")
    hypothesis: str = Field(description="Giả thuyết vì sao video này sẽ có nhiều view")
    target_audience: str
    hook: str
    formula_mapping: str = Field(description="Kịch bản áp dụng những yếu tố nào của playbook")
    scenes: list[Scene]
    cta: str
    caption: str
    hashtags: list[str]
    medical_claims: list[str] = Field(description="Mọi câu có nội dung y khoa cần Bác sĩ Phạm Sơn duyệt")
    production_notes: str


class ScriptBatch(BaseModel):
    scripts: list[ScriptDraft]


class CriterionScore(BaseModel):
    key: str
    score: int
    reason: str


class ScriptScore(BaseModel):
    criteria: list[CriterionScore]
    safety_violations: list[str] = Field(description="Liệt kê MỌI vi phạm ranh giới thương hiệu; rỗng nếu không có")
    predicted_performance: Literal["thấp", "trung bình", "cao", "rất cao"]
    improvement_suggestions: list[str]


# ---------------------------------------------------------------- tự học
class RubricChange(BaseModel):
    key: str
    new_max: int
    reason: str


class LearningUpdate(BaseModel):
    observations: list[str] = Field(description="Quan sát rút ra từ số liệu thật (có dẫn chứng số)")
    new_lessons: list[str] = Field(description="Bài học mới, viết thành quy tắc hành động ngắn gọn")
    retire_lesson_ids: list[int] = Field(description="ID các bài học cũ đã bị số liệu bác bỏ")
    rubric_changes: list[RubricChange]
    topics_double_down: list[str]
    topics_drop: list[str]
    experiments_next: list[str] = Field(description="Thử nghiệm A/B nên chạy tiếp theo")
    update_playbook: bool
    playbook: Playbook | None = Field(description="Playbook đầy đủ đã cập nhật nếu update_playbook = true, ngược lại null")
    confidence: Literal["thấp", "trung bình", "cao"]
