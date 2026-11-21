"""Sinh / cập nhật skill Claude Code từ playbook mới nhất, rubric và bài học (tự động sau mỗi lần học)."""
from __future__ import annotations

from .context import Ctx
from .db import now_iso
from .scoring import rubric_text


def _bullets(items: list) -> str:
    return "\n".join(f"- {x}" for x in items) or "- (chưa có)"


def render_skill(ctx: Ctx) -> str:
    pv, pb = ctx.playbook()
    rv, rubric = ctx.rubric()
    threshold = ctx.cfg.get_path("daily.score_threshold", 95)
    topics = "\n".join(f"- **{t['topic']}** ({t['priority']}) — {t['evidence']}" for t in pb.get("winning_topics", []))
    hooks = "\n".join(f"- `{h['template']}` — ví dụ: “{h['example']}” — {h['why']}" for h in pb.get("hook_patterns", []))
    beats = "\n".join(f"| {b['time_range']} | {b['name']} | {b['purpose']} | {b['guideline']} |"
                      for b in pb.get("structure_template", []))
    return f"""---
name: cong-thuc-kenh-mau
description: Công thức video ngắn đã được agent bóc tách từ kênh mẫu và tinh chỉnh bằng số liệu view thật của kênh Bác sĩ Phạm Sơn (playbook v{pv}, rubric v{rv}). Dùng khi viết kịch bản Reels/TikTok, viết prompt Google Flow/Veo, chấm điểm kịch bản (ngưỡng > {threshold}/100), hoặc khi người dùng nói "làm video giống kênh mẫu", "kịch bản theo công thức", "prompt Flow". Luôn dùng kèm skill dna-phong-kham-pham-son.
---

# Công thức kênh mẫu (tự sinh — cập nhật {now_iso()})

> File này do `flowagent` tự viết lại mỗi khi playbook/rubric/bài học thay đổi. Đừng sửa tay — sửa
> `config/brand.md` hoặc để vòng phản hồi tự cập nhật.

## 1. Tóm tắt công thức
{pb.get('summary', '')}

**Độ dài lý tưởng:** {pb.get('length_sweet_spot', '')}

## 2. Chủ đề thắng (có bằng chứng số liệu)
{topics or '- (chưa có)'}

## 3. Mẫu hook 0–3 giây
{hooks or '- (chưa có)'}

## 4. Khung cấu trúc
| Thời gian | Nhịp | Mục đích | Hướng dẫn |
|---|---|---|---|
{beats}

## 5. Hình ảnh, âm thanh, chữ trên màn hình
- **Hình:** {pb.get('visual_style', '')}
- **Âm thanh:** {pb.get('audio_style', '')}
{_bullets(pb.get('on_screen_text_rules', []))}

## 6. Caption & CTA
{_bullets(pb.get('caption_patterns', []) + pb.get('cta_patterns', []))}

## 7. Sản xuất bằng Google Flow (Veo)
**Character bible (dán nguyên văn vào mọi prompt):**
> {pb.get('character_bible', '')}

{_bullets(pb.get('flow_prompt_guide', []))}
- Mỗi cảnh ≤ 8 giây; không bắt Veo vẽ chữ — chữ được chèn sau bằng phụ đề.

## 8. Áp vào thương hiệu
{pb.get('adaptation_for_brand', '')}

## 9. Tránh
{_bullets(pb.get('avoid', []))}

## 10. Bài học từ số liệu thật của kênh mình
{ctx.lessons_text()}

## 11. Rubric chấm điểm (chỉ làm video khi > {threshold}/100)
{rubric_text(rubric)}

Mục `safety` = 0 khi vi phạm bất kỳ ranh giới nào của DNA thương hiệu → kịch bản bị loại, không sửa để "lách".

## 12. Giả thuyết đang thử nghiệm
{_bullets(pb.get('open_questions', []))}
"""


def write_skill(ctx: Ctx) -> str:
    skill_dir = ctx.cfg.path("skill_dir")
    skill_dir.mkdir(parents=True, exist_ok=True)
    path = skill_dir / "SKILL.md"
    path.write_text(render_skill(ctx), encoding="utf-8")
    return str(path)
