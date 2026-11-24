"""Rubric chấm điểm thang 100, cổng an toàn bất biến và logic chọn 3 kịch bản hay nhất."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from .models import ScriptDraft, ScriptScore

DEFAULT_RUBRIC: list[dict] = [
    {"key": "hook", "name": "Hook 0–3 giây", "max": 20,
     "guide": "Vào thẳng nỗi lo/tò mò cụ thể của đúng khán giả, không chào hỏi, có chi tiết neo (con số, tuần thai, tình huống). "
              "Khớp các mẫu hook đã thắng trong playbook."},
    {"key": "formula", "name": "Khớp công thức thắng (playbook)", "max": 20,
     "guide": "Cấu trúc nhịp, độ dài, phong cách hình/âm, cách dùng chữ trên màn hình theo đúng playbook và bài học."},
    {"key": "density", "name": "Mật độ thông tin", "max": 15,
     "guide": "Mỗi câu mang một ý cụ thể, không câu đệm, không lặp ý."},
    {"key": "tone", "name": "Giọng điệu & thương hiệu", "max": 15,
     "guide": "Ấm áp – trấn an – chuyên nghiệp – gần gũi; xưng hô đúng DNA; không giật tít."},
    {"key": "cta", "name": "CTA kết thúc", "max": 10,
     "guide": "Câu hỏi mở mời bình luận cụ thể, không chốt sale/giá."},
    {"key": "feasibility", "name": "Khả thi trên Google Flow", "max": 10,
     "guide": "Mỗi cảnh ≤ 8 giây, prompt tiếng Anh rõ ràng, nhân vật đồng nhất, không cần AI vẽ chữ, lời thoại đọc kịp."},
    {"key": "safety", "name": "An toàn nội dung", "max": 10, "fixed": True,
     "guide": "0 điểm nếu vi phạm BẤT KỲ ranh giới DNA nào (chẩn đoán thay bác sĩ, giới tính thai, hứa hẹn, từ cấm...)."},
]

# Cổng an toàn chạy bằng code — không phụ thuộc vào việc giám khảo AI có "nhìn ra" hay không.
BANNED_PATTERNS: list[tuple[str, str]] = [
    (r"chính xác\s*100\s*%|100\s*%\s*chính xác", "Từ cấm: 'chính xác 100%'"),
    (r"\btốt nhất\b", "Từ cấm: 'tốt nhất'"),
    (r"\bsố\s*(1|một)\b", "Từ cấm: 'số 1'"),
    (r"\bduy nhất\b", "Từ nên tránh: 'duy nhất'"),
    (r"cam kết", "Không cam kết kết quả"),
    (r"phát hiện (được )?(hết|mọi|tất cả)", "Không hứa phát hiện mọi bất thường"),
    (r"giới tính (thai|của bé|em bé)|trai hay gái|gái hay trai|bé trai|bé gái|con trai hay con gái", "Gợi ý giới tính thai nhi"),
    (r"xanh hay hồng|hồng hay xanh", "Ẩn ý giới tính thai nhi"),
    (r"\bAI (chẩn đoán|phát hiện|đọc kết quả)|máy tự (đọc|chẩn đoán)", "Phóng đại vai trò AI/máy"),
    (r"\d[\d.,]*\s*(k|nghìn|ngàn|triệu)?\s*(đồng|vnđ|vnd|đ)(?!\w)", "Không báo giá trong video"),
]


def _norm(text: str) -> str:
    return unicodedata.normalize("NFC", text or "").lower()


def script_text(draft: ScriptDraft) -> str:
    parts = [draft.title, draft.hook, draft.cta, draft.caption, " ".join(draft.hashtags)]
    for s in draft.scenes:
        parts += [s.dialogue_vi, s.on_screen_text_vi]
    return "\n".join(parts)


def hard_safety_check(draft: ScriptDraft) -> list[str]:
    text = _norm(script_text(draft))
    hits = []
    for pattern, label in BANNED_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            hits.append(label)
    for s in draft.scenes:
        if s.seconds > 8:
            hits.append(f"Cảnh {s.idx} dài {s.seconds}s > 8s (không tạo được trong 1 clip Flow)")
    return hits


def normalize_rubric(rubric: list[dict], pinned: set[str] | None = None) -> list[dict]:
    """Ép rubric về tổng 100, mục safety cố định 10, các mục khác trong khoảng 5–30.
    `pinned`: các mục vừa được chủ động đổi — phần chênh lệch được bù vào các mục còn lại trước."""
    out = [dict(c) for c in rubric]
    for c in out:
        if c["key"] == "safety":
            c["max"] = 10
        else:
            c["max"] = int(min(30, max(5, round(c["max"]))))
    pinned = pinned or set()
    free = [c for c in out if c["key"] != "safety" and c["key"] not in pinned] + \
           [c for c in out if c["key"] != "safety" and c["key"] in pinned]
    target = 90
    diff = target - sum(c["max"] for c in free)
    # Phân bổ phần chênh lệch vào các mục còn dư địa, lần lượt từng điểm
    i = 0
    n_free = len([c for c in free if c["key"] not in pinned]) or len(free)
    while diff != 0 and free:
        # vòng đầu chỉ chỉnh các mục không bị ghim; nếu không đủ dư địa mới đụng tới mục ghim
        c = free[i % n_free] if i < 2000 else free[i % len(free)]
        if diff > 0 and c["max"] < 30:
            c["max"] += 1
            diff -= 1
        elif diff < 0 and c["max"] > 5:
            c["max"] -= 1
            diff += 1
        i += 1
        if i > 10_000:
            break
    return out


def rubric_text(rubric: list[dict]) -> str:
    return "\n".join(f"- {c['key']} — {c['name']} — tối đa {c['max']} — {c['guide']}" for c in rubric)


@dataclass
class Scored:
    total: float
    per_criterion: dict[str, int]
    blocked: bool
    violations: list[str] = field(default_factory=list)
    raw: ScriptScore | None = None


def compute_score(score: ScriptScore, rubric: list[dict], hard_hits: list[str]) -> Scored:
    by_key = {c.key: c.score for c in score.criteria}
    per: dict[str, int] = {}
    for c in rubric:
        per[c["key"]] = int(max(0, min(c["max"], by_key.get(c["key"], 0))))
    violations = list(score.safety_violations) + list(hard_hits)
    blocked = bool(violations)
    if blocked:
        per["safety"] = 0
    return Scored(total=float(sum(per.values())), per_criterion=per, blocked=blocked, violations=violations, raw=score)


def select_top(candidates: list[tuple[int, str, Scored]], threshold: float, k: int) -> list[int]:
    """candidates: (script_id, topic, scored). Chỉ lấy điểm > threshold, không bị chặn, khác chủ đề nhau."""
    eligible = [c for c in candidates if not c[2].blocked and c[2].total > threshold]
    eligible.sort(key=lambda c: c[2].total, reverse=True)
    chosen: list[int] = []
    seen_topics: set[str] = set()
    for sid, topic, _ in eligible:
        t = _norm(topic).strip()
        if t in seen_topics:
            continue
        chosen.append(sid)
        seen_topics.add(t)
        if len(chosen) >= k:
            break
    return chosen
