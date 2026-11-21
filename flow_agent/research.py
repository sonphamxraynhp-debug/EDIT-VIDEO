"""Bước 1: quét toàn bộ video kênh mẫu -> phân tích từng video -> rút công thức thành công (playbook)."""
from __future__ import annotations

import json
import logging
import statistics
from pathlib import Path

from .browser import export_netscape_cookies, persistent_context
from .context import BROWSER_LOCK, Ctx
from .facebook.scraper import collect_videos, ensure_login, fetch_details
from .llm import image_block
from .media import download_video, extract_frames, probe_duration, scene_cut_rate, transcribe
from .models import Playbook, VideoAnalysis
from .prompts import ANALYST_SYSTEM, FORMULA_SYSTEM

log = logging.getLogger(__name__)


def scan_reference(ctx: Ctx, limit: int | None = None) -> int:
    """Thu thập danh sách video + chỉ số của kênh mẫu, tải video về. Trả về số video đã ghi nhận."""
    cfg = ctx.cfg
    limit = limit or int(cfg.get_path("analysis.max_videos", 60))
    headless = bool(cfg.get_path("facebook.headless", False))
    media_dir = ctx.cfg.data_dir / "reference"
    cookies = ctx.cfg.data_dir / "secrets" / "fb_cookies.txt"
    count = 0
    with BROWSER_LOCK, persistent_context(cfg.path("facebook.browser_profile_dir"), headless,
                                          cfg.get_path("facebook.locale", "vi-VN")) as bctx:
        page = bctx.new_page()
        ensure_login(page, headless)
        items = collect_videos(page, cfg["reference_channel"], int(cfg.get_path("facebook.scroll_rounds", 40)), limit)
        log.info("Tìm thấy %d video trên kênh mẫu", len(items))
        for it in items:
            d = fetch_details(page, it.url)
            views = d.stats.get("views") or it.grid_views
            vid = ctx.db.upsert_video("reference", it.url, caption=d.caption)
            ctx.db.add_metrics(vid, views, d.stats.get("reactions"), d.stats.get("comments"), d.stats.get("shares"))
            count += 1
        export_netscape_cookies(bctx, cookies)

    if cfg.get_path("analysis.download", True):
        for row in ctx.db.all("SELECT id, url FROM videos WHERE channel='reference' AND local_path IS NULL"):
            path = download_video(row["url"], media_dir, cookies)
            if path:
                ctx.db.execute("UPDATE videos SET local_path=?, duration=? WHERE id=?",
                               (str(path), probe_duration(path), row["id"]))
    ctx.db.log("scan_reference", f"Đã quét {count} video kênh mẫu")
    return count


def _reference_rows(ctx: Ctx):
    return ctx.db.all(
        """SELECT v.*, m.views, m.reactions, m.comments, m.shares FROM videos v
           LEFT JOIN metrics m ON m.id = (SELECT id FROM metrics WHERE video_id=v.id ORDER BY ts DESC LIMIT 1)
           WHERE v.channel='reference'"""
    )


def analyze_reference(ctx: Ctx, force: bool = False) -> int:
    rows = _reference_rows(ctx)
    views = [r["views"] for r in rows if r["views"]]
    median = statistics.median(views) if views else 0
    frames_n = int(ctx.cfg.get_path("analysis.frames_per_video", 6))
    done = 0
    for r in rows:
        if r["analysis_json"] and not force:
            continue
        content: list[dict] = []
        transcript = r["transcript"]
        cut_rate = None
        if r["local_path"]:
            video = Path(r["local_path"])
            if video.exists():
                if transcript is None and ctx.cfg.get_path("analysis.transcribe", True):
                    transcript = transcribe(video, ctx.cfg.get_path("analysis.whisper_model", "small"))
                    if transcript:
                        ctx.db.execute("UPDATE videos SET transcript=? WHERE id=?", (transcript, r["id"]))
                cut_rate = scene_cut_rate(video)
                for f in extract_frames(video, ctx.cfg.data_dir / "frames", frames_n):
                    content.append(image_block(f))
        ratio = (r["views"] / median) if (median and r["views"]) else None
        content.append({"type": "text", "text": f"""Video: {r['url']}
Chỉ số: {r['views']} view, {r['reactions']} cảm xúc, {r['comments']} bình luận, {r['shares']} chia sẻ
So với trung vị kênh ({median:.0f} view): {f'{ratio:.2f}x' if ratio else 'không rõ'}
Thời lượng: {r['duration'] or 'không rõ'} giây; nhịp cắt cảnh: {cut_rate if cut_rate is not None else 'không rõ'} lần/10s
Caption: {r['caption'] or '(trống)'}
Lời thoại:
{transcript or '(không có bản bóc lời)'}
Các ảnh phía trên là khung hình theo thứ tự thời gian (ảnh đầu = giây 0.5, tức phần hook)."""})
        analysis = ctx.llm.structured(ANALYST_SYSTEM, content, VideoAnalysis, effort="medium")
        ctx.db.execute("UPDATE videos SET analysis_json=? WHERE id=?", (analysis.model_dump_json(), r["id"]))
        done += 1
        log.info("Đã phân tích %s", r["url"])
    return done


def build_formula(ctx: Ctx) -> tuple[int, Playbook]:
    rows = [r for r in _reference_rows(ctx) if r["analysis_json"]]
    if not rows:
        raise RuntimeError("Chưa có video nào được phân tích. Chạy `flowagent analyze` trước.")
    views = [r["views"] for r in rows if r["views"]]
    median = statistics.median(views) if views else 0
    rows = sorted(rows, key=lambda r: r["views"] or 0, reverse=True)
    table = []
    for rank, r in enumerate(rows, 1):
        table.append({
            "hang": rank, "url": r["url"], "views": r["views"], "x_trung_vi": round((r["views"] or 0) / median, 2) if median else None,
            "reactions": r["reactions"], "comments": r["comments"], "shares": r["shares"], "duration": r["duration"],
            "analysis": json.loads(r["analysis_json"]),
        })
    user = (f"Kênh mẫu có {len(rows)} video đã phân tích, trung vị {median:.0f} view. "
            f"Bảng dữ liệu (sắp theo view giảm dần):\n{json.dumps(table, ensure_ascii=False)}")
    system = FORMULA_SYSTEM.format(brand=ctx.brand())
    playbook = ctx.llm.structured(system, user, Playbook, effort="high")
    version = ctx.db.save_playbook(playbook.model_dump(), "reference_scan",
                                   f"Từ {len(rows)} video kênh mẫu, trung vị {median:.0f} view")
    ctx.db.log("build_formula", f"Playbook v{version}")
    from .skillgen import write_skill

    write_skill(ctx)
    return version, playbook
