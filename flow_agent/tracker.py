"""Mỗi 2 giờ: quét lại kênh của mình, ghi snapshot view/cảm xúc/bình luận/chia sẻ cho từng video."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from .browser import persistent_context
from .context import BROWSER_LOCK, Ctx
from .db import now_iso
from .facebook.parse import video_id_from_url

log = logging.getLogger(__name__)

DETAIL_WINDOW_DAYS = 10  # video mới hơn mức này được mở trang chi tiết để lấy đủ chỉ số


def _link_pending_uploads(ctx: Ctx) -> None:
    """Gắn URL cho sản phẩm đã đăng nhưng chưa xác định link: lấy video mới nhất xuất hiện sau giờ đăng."""
    pending = ctx.db.all("SELECT * FROM productions WHERE status='uploaded' AND upload_url IS NULL ORDER BY uploaded_at")
    for p in pending:
        cand = ctx.db.one(
            """SELECT * FROM videos WHERE channel='own' AND production_id IS NULL AND baseline=0 AND first_seen >= ?
               ORDER BY first_seen LIMIT 1""", (p["uploaded_at"],))
        if cand:
            ctx.db.execute("UPDATE videos SET production_id=?, privacy='only_me' WHERE id=?", (p["id"], cand["id"]))
            ctx.db.execute("UPDATE productions SET upload_url=? WHERE id=?", (cand["url"], p["id"]))
            log.info("Gắn sản phẩm #%d với %s", p["id"], cand["url"])


def track_once(ctx: Ctx) -> int:
    cfg = ctx.cfg
    snapshots = 0
    if cfg.get("own_channel_type") == "page":
        from .facebook.uploader import page_token, page_video_views

        token = page_token(cfg)
        for v in ctx.db.all("SELECT * FROM videos WHERE channel='own'"):
            vid = v["fb_id"] or video_id_from_url(v["url"])
            if not vid:
                continue
            s = page_video_views(vid, token, cfg.get_path("facebook.graph.api_version", "v21.0"))
            ctx.db.add_metrics(v["id"], s.get("views"), s.get("reactions"), s.get("comments"), s.get("shares"))
            snapshots += 1
    else:
        from .facebook.scraper import collect_videos, ensure_login, fetch_details

        headless = bool(cfg.get_path("facebook.headless", False))
        cutoff = (datetime.now(timezone.utc) - timedelta(days=DETAIL_WINDOW_DAYS)).isoformat()
        with BROWSER_LOCK, persistent_context(cfg.path("facebook.browser_profile_dir"), headless,
                                              cfg.get_path("facebook.locale", "vi-VN")) as bctx:
            page = bctx.new_page()
            ensure_login(page, headless)
            items = collect_videos(page, cfg["own_channel"], scroll_rounds=int(cfg.get_path("facebook.scroll_rounds", 40)))
            first_run = ctx.db.one("SELECT COUNT(*) AS n FROM videos WHERE channel='own' AND production_id IS NULL")["n"] == 0
            for it in items:
                vid = ctx.db.upsert_video("own", it.url, fb_id=video_id_from_url(it.url))
                row = ctx.db.one("SELECT * FROM videos WHERE id=?", (vid,))
                if first_run and not row["production_id"]:
                    ctx.db.execute("UPDATE videos SET baseline=1 WHERE id=?", (vid,))
                    row = ctx.db.one("SELECT * FROM videos WHERE id=?", (vid,))
                stats = {"views": it.grid_views}
                if row["production_id"] or (not row["baseline"] and row["first_seen"] >= cutoff):
                    d = fetch_details(page, it.url)
                    stats = {**d.stats, "views": d.stats.get("views") or it.grid_views}
                    if d.caption and not row["caption"]:
                        ctx.db.execute("UPDATE videos SET caption=? WHERE id=?", (d.caption, vid))
                ctx.db.add_metrics(vid, stats.get("views"), stats.get("reactions"), stats.get("comments"), stats.get("shares"))
                snapshots += 1
    _link_pending_uploads(ctx)
    ctx.db.log("track", f"{snapshots} snapshot lúc {now_iso()}")
    return snapshots
