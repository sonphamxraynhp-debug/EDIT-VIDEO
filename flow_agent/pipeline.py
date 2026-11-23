"""Các quy trình tổng: chạy hằng ngày, báo cáo."""
from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path

from .context import Ctx
from .planner import run_daily_planning
from .production import produce, upload

log = logging.getLogger(__name__)


def run_daily(ctx: Ctx, do_upload: bool = True) -> dict:
    """10 kịch bản -> chấm điểm -> chọn ≤3 bản > ngưỡng -> làm video trên Flow -> đăng 'Chỉ mình tôi'."""
    plan = run_daily_planning(ctx)
    results = []
    for sid in plan["selected"]:
        item: dict = {"script_id": sid}
        try:
            pid = produce(ctx, sid)
            item["production_id"] = pid
            if do_upload:
                item["url"] = upload(ctx, pid)
        except Exception as exc:  # noqa: BLE001 — một video lỗi không làm hỏng cả ngày
            log.exception("Lỗi khi làm kịch bản #%d", sid)
            item["error"] = str(exc)
        results.append(item)
    report = write_daily_report(ctx)
    out = {"plan": plan, "productions": results, "report": str(report)}
    ctx.db.log("daily", json.dumps(out, ensure_ascii=False, default=str))
    return out


def write_daily_report(ctx: Ctx, day: str | None = None):
    day = day or date.today().isoformat()
    threshold = ctx.cfg.get_path("daily.score_threshold", 95)
    scripts = ctx.db.all("SELECT * FROM scripts WHERE run_date=? ORDER BY total_score DESC", (day,))
    prods = ctx.db.all(
        "SELECT p.*, s.title FROM productions p JOIN scripts s ON s.id=p.script_id WHERE s.run_date=?", (day,))
    top = ctx.db.all(
        """SELECT v.url, v.privacy, s.title,
                  (SELECT views FROM metrics m WHERE m.video_id=v.id ORDER BY ts DESC LIMIT 1) AS views
           FROM videos v LEFT JOIN productions p ON p.id=v.production_id LEFT JOIN scripts s ON s.id=p.script_id
           WHERE v.channel='own' ORDER BY views DESC LIMIT 10""")
    learn = ctx.db.one("SELECT * FROM learning_runs ORDER BY id DESC LIMIT 1")
    lines = [f"# Báo cáo ngày {day}", "", f"## Kịch bản đề xuất (ngưỡng làm video: > {threshold})",
             "| # | Tiêu đề | Hướng | Điểm | Trạng thái |", "|---|---|---|---|---|"]
    for s in scripts:
        flag = " ⛔ vi phạm an toàn" if s["blocked"] else ""
        lines.append(f"| {s['id']} | {s['title']} | {s['angle']} | {s['total_score']:.0f}{flag} | {s['status']} |")
    if not any(s["status"] not in ("rejected", "proposed") for s in scripts):
        lines += ["", f"> Hôm nay không kịch bản nào vượt {threshold} điểm — agent không làm video (đúng quy tắc)."]
    lines += ["", "## Video đã sản xuất", "| SP | Kịch bản | Trạng thái | File / Link |", "|---|---|---|---|"]
    for p in prods:
        lines.append(f"| {p['id']} | {p['title']} | {p['status']} | {p['upload_url'] or p['video_path'] or p['error'] or ''} |")
    lines += ["", "## Top video kênh mình (view mới nhất)", "| View | Quyền | Video |", "|---|---|---|"]
    for t in top:
        lines.append(f"| {t['views'] if t['views'] is not None else '?'} | {t['privacy']} | {t['title'] or t['url']} |")
    if learn:
        lines += ["", "## Vòng tự học gần nhất", f"- Thời điểm: {learn['created_at']}",
                  f"- Thống kê: `{learn['stats_json']}`"]
        upd = json.loads(learn["update_json"] or "{}")
        if "skipped" in upd:
            lines.append(f"- {upd['skipped']}")
        else:
            for o in upd.get("update", {}).get("observations", []):
                lines.append(f"- {o}")
    path = ctx.cfg.data_dir / "reports" / f"{day}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def make_video_now(ctx: Ctx, script_id: int | None = None, do_upload: bool = True) -> dict:
    """Chủ kênh yêu cầu làm video NGAY: lấy kịch bản chỉ định (hoặc bản điểm cao nhất, không bị chặn an toàn)
    -> Google Flow -> ghép -> đăng 'Chỉ mình tôi' -> phiếu duyệt.
    Đây là lệnh thủ công của chủ kênh; lịch tự động hằng ngày VẪN chỉ làm bản > ngưỡng (95)."""
    from .config import ROOT
    from .seeding import import_scripts, seed_playbook

    seed_playbook(ctx)
    seeds = sorted((ROOT / "seed").glob("kich-ban-*.json"))
    if seeds:
        import_scripts(ctx, seeds[-1], rejudge=False)  # điểm giám khảo độc lập đã có trong file
    threshold = float(ctx.cfg.get_path("daily.score_threshold", 95))
    if script_id is None:
        row = ctx.db.one(
            "SELECT * FROM scripts WHERE blocked=0 AND status NOT IN ('produced','uploaded','approved') "
            "ORDER BY run_date DESC, total_score DESC, id LIMIT 1")
        if not row:
            raise ValueError("Không còn kịch bản nào chưa làm video (và không vi phạm an toàn).")
        script_id = int(row["id"])
    row = ctx.db.one("SELECT * FROM scripts WHERE id=?", (script_id,))
    if not row:
        raise ValueError(f"Không có kịch bản #{script_id}")
    if row["blocked"]:
        raise ValueError("Kịch bản vi phạm an toàn nội dung — không được làm video.")
    note = "" if row["total_score"] > threshold else f" (dưới ngưỡng {threshold:g} — chủ kênh yêu cầu làm thủ công)"
    ctx.db.log("manual_video", f"Làm video từ kịch bản #{script_id} '{row['title']}' {row['total_score']:.0f} điểm{note}")
    log.info("Làm video từ kịch bản #%d '%s' — %.0f điểm%s", script_id, row["title"], row["total_score"], note)
    pid = produce(ctx, script_id)
    prod = ctx.db.one("SELECT * FROM productions WHERE id=?", (pid,))
    out = {"script_id": script_id, "title": row["title"], "score": row["total_score"], "production_id": pid,
           "video": prod["video_path"], "review_sheet": str(Path(prod["video_path"]).parent / "PHIEU_DUYET.md")}
    if do_upload:
        out["facebook_url"] = upload(ctx, pid)
        out["privacy"] = "Chỉ mình tôi"
    return out
