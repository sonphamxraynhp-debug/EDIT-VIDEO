"""Mỗi ngày: đề xuất N kịch bản -> giám khảo chấm độc lập -> sửa bản gần đạt -> chọn tối đa K bản > ngưỡng."""
from __future__ import annotations

import json
import logging
from datetime import date

from .context import Ctx
from .db import now_iso
from .models import JudgeLessons, ScriptBatch, ScriptDraft, ScriptScore
from .prompts import JUDGE_SYSTEM, WRITER_SYSTEM
from .scoring import Scored, compute_score, hard_safety_check, select_top

log = logging.getLogger(__name__)


def _recent_titles(ctx: Ctx, days: int = 30) -> list[str]:
    rows = ctx.db.all(
        "SELECT title FROM scripts WHERE run_date >= date('now', ?) ORDER BY id DESC LIMIT 200", (f"-{days} days",)
    )
    return [r["title"] for r in rows if r["title"]]


def _own_performance_digest(ctx: Ctx, limit: int = 15) -> str:
    """Tóm tắt video công khai của kênh mình + view mới nhất để người viết biết điều gì đang chạy."""
    rows = ctx.db.all(
        """SELECT v.id, v.caption, s.title, s.topic, s.total_score,
                  (SELECT views FROM metrics m WHERE m.video_id=v.id ORDER BY ts DESC LIMIT 1) AS views
           FROM videos v LEFT JOIN productions p ON p.id=v.production_id LEFT JOIN scripts s ON s.id=p.script_id
           WHERE v.channel='own' AND v.privacy='public' ORDER BY views DESC LIMIT ?""",
        (limit,),
    )
    if not rows:
        return "(Chưa có video công khai nào để so sánh.)"
    return "\n".join(
        f"- {r['views'] or 0} view | {r['title'] or (r['caption'] or '')[:80]} | chủ đề: {r['topic'] or '?'} | điểm dự đoán: {r['total_score'] or '?'}"
        for r in rows
    )


def generate_batch(ctx: Ctx, n: int) -> list[ScriptDraft]:
    pv = ctx.prompt_vars()
    explore = round(n * float(ctx.cfg.get_path("daily.explore_ratio", 0.3)))
    system = WRITER_SYSTEM.format(**pv)
    user = f"""Hôm nay là {date.today().isoformat()}. Hãy viết ĐÚNG {n} kịch bản video MỚI:
- {n - explore} kịch bản angle="exploit": bám sát công thức đã thắng trong playbook và bài học.
- {explore} kịch bản angle="explore": thử một biến thể có chủ đích (chủ đề/hook/định dạng mới) để học thêm; ghi rõ giả thuyết.
- Mỗi kịch bản một chủ đề khác nhau, không trùng các tiêu đề đã làm gần đây.

Hiệu quả thật của các video công khai trên kênh mình:
{_own_performance_digest(ctx)}

Tiêu đề đã làm trong 30 ngày qua (tránh lặp):
{chr(10).join('- ' + t for t in _recent_titles(ctx)) or '(chưa có)'}"""
    batch = ctx.llm.structured(system, user, ScriptBatch)
    if len(batch.scripts) != n:
        log.warning("Yêu cầu %d kịch bản nhưng nhận %d", n, len(batch.scripts))
    return batch.scripts


def judge_script(ctx: Ctx, draft: ScriptDraft) -> Scored:
    pv = ctx.prompt_vars()
    system = JUDGE_SYSTEM.format(**pv)
    user = (
        "Chấm kịch bản sau theo rubric. Trả về đúng các key: "
        + ", ".join(c["key"] for c in pv["rubric_list"])
        + "\n\n"
        + draft.model_dump_json(indent=1)
    )
    raw: ScriptScore = ctx.judge.structured(system, user, ScriptScore)
    return compute_score(raw, pv["rubric_list"], hard_safety_check(draft))


def revise_script(ctx: Ctx, draft: ScriptDraft, scored: Scored) -> ScriptDraft:
    pv = ctx.prompt_vars()
    system = WRITER_SYSTEM.format(**pv)
    feedback = {
        "diem_tung_muc": scored.per_criterion,
        "tong": scored.total,
        "vi_pham": scored.violations,
        "ly_do": [c.model_dump() for c in scored.raw.criteria] if scored.raw else [],
        "goi_y": scored.raw.improvement_suggestions if scored.raw else [],
    }
    user = (
        "Sửa kịch bản dưới đây để khắc phục ĐÚNG các điểm bị trừ, giữ nguyên chủ đề. "
        "Không bịa thông tin y khoa để lấy điểm. Trả về một kịch bản hoàn chỉnh (ScriptBatch chỉ chứa 1 kịch bản).\n\n"
        f"KỊCH BẢN:\n{draft.model_dump_json(indent=1)}\n\nNHẬN XÉT GIÁM KHẢO:\n{json.dumps(feedback, ensure_ascii=False, indent=1)}"
    )
    batch = ctx.llm.structured(system, user, ScriptBatch)
    return batch.scripts[0] if batch.scripts else draft


def _confirm(ctx: Ctx, draft: ScriptDraft, scored: Scored, threshold: float) -> Scored:
    """Giám khảo AI có dao động: bản vượt ngưỡng phải được một phiên chấm độc lập thứ hai xác nhận,
    lấy điểm THẤP HƠN — để không qua 95 nhờ may mắn."""
    if scored.blocked or scored.total <= threshold or not ctx.cfg.get_path("daily.confirm_pass", True):
        return scored
    second = judge_script(ctx, draft)
    log.info("  xác nhận '%s': %.0f / %.0f", draft.title, scored.total, second.total)
    return second if (second.blocked or second.total < scored.total) else scored


def _improve(ctx: Ctx, draft: ScriptDraft, rounds: int, threshold: float,
             scored: Scored | None = None) -> tuple[ScriptDraft, Scored, int]:
    """Chấm rồi sửa tối đa `rounds` vòng; luôn giữ PHIÊN BẢN ĐIỂM CAO NHẤT (bản sửa tụt điểm bị bỏ).
    Bản vi phạm an toàn không được sửa — loại luôn để tránh "lách" ranh giới."""
    scored = scored or _confirm(ctx, draft, judge_script(ctx, draft), threshold)
    best, best_sc, used = draft, scored, 0
    cur, cur_sc = draft, scored
    while used < rounds and not best_sc.blocked and best_sc.total <= threshold:
        used += 1
        try:
            cur = revise_script(ctx, cur, cur_sc)
            cur_sc = _confirm(ctx, cur, judge_script(ctx, cur), threshold)
        except Exception as exc:  # noqa: BLE001 — một lần sửa hỏng không được làm mất bản tốt nhất
            log.warning("Sửa kịch bản '%s' lỗi: %s", draft.title, exc)
            break
        log.info("  sửa vòng %d '%s': %.0f -> %.0f", used, cur.title, best_sc.total, cur_sc.total)
        if not cur_sc.blocked and cur_sc.total > best_sc.total:
            best, best_sc = cur, cur_sc
        else:
            cur, cur_sc = best, best_sc  # sửa tiếp từ bản tốt nhất, không từ bản tụt
    return best, best_sc, used


def _save(ctx: Ctx, draft: ScriptDraft, scored: Scored, revision: int, pv: dict) -> int:
    cur = ctx.db.execute(
        """INSERT INTO scripts(run_date, created_at, title, topic, angle, draft_json, score_json, total_score,
                               blocked, revision, status, rubric_version, playbook_version)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            date.today().isoformat(), now_iso(), draft.title, draft.topic, draft.angle,
            draft.model_dump_json(),
            json.dumps({"per_criterion": scored.per_criterion, "violations": scored.violations,
                        "raw": scored.raw.model_dump() if scored.raw else None}, ensure_ascii=False),
            scored.total, int(scored.blocked), revision, "proposed", pv["rubric_version"], pv["playbook_version"],
        ),
    )
    return int(cur.lastrowid)


def run_daily_planning(ctx: Ctx) -> dict:
    n = int(ctx.cfg.get_path("daily.num_scripts", 10))
    threshold = float(ctx.cfg.get_path("daily.score_threshold", 95))
    k = int(ctx.cfg.get_path("daily.max_videos", 3))
    rounds = int(ctx.cfg.get_path("daily.revision_rounds", 1))
    pv = ctx.prompt_vars()

    drafts = generate_batch(ctx, n)
    items = [_improve(ctx, d, rounds, threshold) for d in drafts]
    # Đánh bóng: các bản gần đạt nhất được thêm vòng sửa (không bao giờ hạ ngưỡng)
    polish_top = int(ctx.cfg.get_path("daily.polish_top", 3))
    polish_rounds = int(ctx.cfg.get_path("daily.polish_rounds", 2))
    passing = sum(1 for it in items if not it[1].blocked and it[1].total > threshold)
    if passing < k and polish_rounds > 0:
        near = sorted((i for i, it in enumerate(items) if not it[1].blocked and it[1].total <= threshold),
                      key=lambda i: -items[i][1].total)[: max(0, min(polish_top, k - passing))]
        for i in near:
            d, sc, rev = items[i]
            d2, sc2, extra = _improve(ctx, d, polish_rounds, threshold, sc)
            items[i] = (d2, sc2, rev + extra)
    results: list[tuple[int, str, Scored]] = []
    for draft, scored, rev in items:
        sid = _save(ctx, draft, scored, rev, pv)
        results.append((sid, draft.topic, scored))
        log.info("Kịch bản #%d '%s': %.0f điểm%s", sid, draft.title, scored.total, " [CHẶN]" if scored.blocked else "")

    chosen = select_top(results, threshold, k)
    try:
        learn_from_judge(ctx, results)
    except Exception as exc:  # noqa: BLE001 — bước học thêm, không được làm hỏng kế hoạch ngày
        log.warning("Không rút được bài học từ giám khảo: %s", exc)
    for sid, _, _ in results:
        ctx.db.execute("UPDATE scripts SET status=? WHERE id=?", ("selected" if sid in chosen else "rejected", sid))
    ctx.db.log("planning", f"{len(results)} kịch bản, chọn {len(chosen)}: {chosen}")
    return {
        "proposed": [(sid, s.total, s.blocked) for sid, _, s in results],
        "selected": chosen,
        "threshold": threshold,
    }


MAX_JUDGE_LESSONS = 8


def learn_from_judge(ctx: Ctx, results: list[tuple[int, str, Scored]]) -> list[str]:
    """Vòng học trước khi đăng: gom các lỗi giám khảo trừ điểm nhiều nhất thành quy tắc viết cho lần sau.
    (Vòng học sau khi đăng — theo view thật — nằm ở learner.py.)"""
    feedback = []
    for sid, _, sc in results:
        if not sc.raw:
            continue
        lost = [{"tieu_chi": c.key, "diem": c.score, "ly_do": c.reason} for c in sc.raw.criteria]
        feedback.append({"kich_ban": sid, "tong": sc.total, "bi_tru": lost, "goi_y": sc.raw.improvement_suggestions})
    if not feedback:
        return []
    current = [r["text"] for r in ctx.db.active_lessons()]
    user = ("Nhận xét của giám khảo cho các kịch bản hôm nay:\n" + json.dumps(feedback, ensure_ascii=False)
            + "\n\nBài học đang dùng (đừng lặp lại):\n" + "\n".join(current or ["(chưa có)"])
            + "\n\nViết 3–6 quy tắc viết kịch bản mới, cụ thể, đo được (vd 'mỗi cảnh 8 giây tối đa 18 từ lời thoại'), "
              "nhắm vào những lỗi bị trừ điểm nhiều nhất. Không nới ranh giới an toàn.")
    out: JudgeLessons = ctx.llm.structured("Bạn là biên tập viên trưởng, rút kinh nghiệm cho đội viết kịch bản.",
                                           user, JudgeLessons)
    for rule in out.rules[:6]:
        ctx.db.add_lesson(f"[Giám khảo] {rule}", "judge")
    judge_rows = [r for r in ctx.db.active_lessons() if r["source"] == "judge"]
    for r in judge_rows[:-MAX_JUDGE_LESSONS] if len(judge_rows) > MAX_JUDGE_LESSONS else []:
        ctx.db.retire_lesson(r["id"])
    return out.rules
