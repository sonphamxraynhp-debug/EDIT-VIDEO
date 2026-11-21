"""Vòng phản hồi: so sánh điểm dự đoán với view thật -> rút bài học -> chỉnh rubric & playbook -> cập nhật skill."""
from __future__ import annotations

import json
import logging
import math
import statistics
from datetime import datetime

from .context import Ctx
from .db import now_iso
from .models import LearningUpdate
from .prompts import LEARNER_SYSTEM
from .scoring import normalize_rubric

log = logging.getLogger(__name__)

MIN_SAMPLES = 3           # cần ít nhất 3 video công khai đủ tuổi mới chạy vòng học bằng AI
MATURE_HOURS = 48         # so sánh video ở cùng độ tuổi 48 giờ


def _ts(s: str) -> datetime:
    return datetime.fromisoformat(s)


def views_at(series: list[tuple[float, int]], hours: float) -> float | None:
    """Nội suy tuyến tính view tại mốc `hours` kể từ lúc công khai. series = [(giờ, view)] tăng dần."""
    pts = [(h, v) for h, v in series if v is not None]
    if not pts or pts[-1][0] < hours:
        return None
    prev = (0.0, 0)
    for h, v in pts:
        if h >= hours:
            if h == prev[0]:
                return float(v)
            return prev[1] + (v - prev[1]) * (hours - prev[0]) / (h - prev[0])
        prev = (h, v)
    return None


def _rank(xs: list[float]) -> list[float]:
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3:
        return None
    rx, ry = _rank(xs), _rank(ys)
    mx, my = statistics.mean(rx), statistics.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return round(num / den, 3) if den else None


def collect_samples(ctx: Ctx) -> list[dict]:
    rows = ctx.db.all(
        """SELECT v.id AS video_id, v.url, p.id AS production_id, p.approved_at, s.id AS script_id, s.title, s.topic,
                  s.angle, s.total_score, s.score_json, s.draft_json
           FROM videos v JOIN productions p ON p.id=v.production_id JOIN scripts s ON s.id=p.script_id
           WHERE v.channel='own' AND v.privacy='public' AND p.approved_at IS NOT NULL"""
    )
    samples = []
    for r in rows:
        t0 = _ts(r["approved_at"])
        series = [((_ts(m["ts"]) - t0).total_seconds() / 3600, m["views"]) for m in ctx.db.metric_series(r["video_id"])
                  if _ts(m["ts"]) >= t0]
        last = ctx.db.latest_metrics(r["video_id"])
        samples.append({
            **{k: r[k] for k in ("video_id", "url", "production_id", "script_id", "title", "topic", "angle", "total_score")},
            "per_criterion": (json.loads(r["score_json"] or "{}").get("per_criterion") or {}),
            "age_hours": round(series[-1][0], 1) if series else 0,
            "views_6h": views_at(series, 6), "views_24h": views_at(series, 24), "views_48h": views_at(series, MATURE_HOURS),
            "latest": dict(last) if last else None,
            "draft": json.loads(r["draft_json"]),
        })
    return samples


def compute_stats(samples: list[dict]) -> dict:
    mature = [s for s in samples if s["views_48h"] is not None]
    stats: dict = {"n_public": len(samples), "n_mature": len(mature)}
    if not mature:
        return stats
    v48 = [s["views_48h"] for s in mature]
    stats["median_views_48h"] = statistics.median(v48)
    stats["corr_total_vs_views48h"] = spearman([s["total_score"] for s in mature], v48)
    keys = sorted({k for s in mature for k in s["per_criterion"]})
    stats["corr_by_criterion"] = {k: spearman([s["per_criterion"].get(k, 0) for s in mature], v48) for k in keys}
    by_angle: dict[str, list[float]] = {}
    for s in mature:
        by_angle.setdefault(s["angle"], []).append(s["views_48h"])
    stats["median_by_angle"] = {a: statistics.median(v) for a, v in by_angle.items()}
    return stats


def apply_update(ctx: Ctx, upd: LearningUpdate) -> dict:
    applied: dict = {"lessons_added": [], "lessons_retired": [], "rubric_version": None, "playbook_version": None}
    for lid in upd.retire_lesson_ids:
        ctx.db.retire_lesson(lid)
        applied["lessons_retired"].append(lid)
    for text in upd.new_lessons:
        applied["lessons_added"].append(ctx.db.add_lesson(text, "learning"))
    if upd.rubric_changes:
        _, rubric = ctx.rubric()
        changes = {c.key: c.new_max for c in upd.rubric_changes if c.key != "safety"}
        if changes:
            new = [{**c, "max": changes.get(c["key"], c["max"])} for c in rubric]
            new = normalize_rubric(new, pinned=set(changes))
            if [c["max"] for c in new] != [c["max"] for c in rubric]:
                reason = "; ".join(f"{c.key}->{c.new_max}: {c.reason}" for c in upd.rubric_changes)
                applied["rubric_version"] = ctx.db.save_rubric(new, reason)
    if upd.update_playbook and upd.playbook is not None:
        applied["playbook_version"] = ctx.db.save_playbook(upd.playbook.model_dump(), "learning",
                                                           f"Độ tin cậy: {upd.confidence}")
    return applied


def learn(ctx: Ctx) -> dict:
    samples = collect_samples(ctx)
    stats = compute_stats(samples)
    if stats.get("n_mature", 0) < MIN_SAMPLES:
        msg = (f"Mới có {stats.get('n_mature', 0)}/{MIN_SAMPLES} video công khai đủ {MATURE_HOURS} giờ — "
               "chưa đủ dữ liệu để học. Hãy duyệt & công khai thêm video (flowagent approve).")
        ctx.db.execute("INSERT INTO learning_runs(created_at, stats_json, update_json) VALUES (?,?,?)",
                       (now_iso(), json.dumps(stats), json.dumps({"skipped": msg}, ensure_ascii=False)))
        log.info(msg)
        return {"stats": stats, "skipped": msg}

    pv = ctx.prompt_vars()
    lessons = [{"id": r["id"], "text": r["text"]} for r in ctx.db.active_lessons()]
    user = json.dumps({
        "thong_ke": stats,
        "video_da_cong_khai": samples,
        "playbook_hien_tai": json.loads(pv["playbook"]),
        "rubric_hien_tai": pv["rubric_list"],
        "bai_hoc_dang_dung": lessons,
    }, ensure_ascii=False, default=str)
    upd: LearningUpdate = ctx.llm.structured(LEARNER_SYSTEM.format(brand=ctx.brand()), user, LearningUpdate)
    applied = apply_update(ctx, upd)
    ctx.db.execute("INSERT INTO learning_runs(created_at, stats_json, update_json) VALUES (?,?,?)",
                   (now_iso(), json.dumps(stats), json.dumps({"update": upd.model_dump(), "applied": applied},
                                                              ensure_ascii=False)))
    from .skillgen import write_skill

    write_skill(ctx)
    ctx.db.log("learn", json.dumps(applied, ensure_ascii=False))
    return {"stats": stats, "update": upd.model_dump(), "applied": applied}
