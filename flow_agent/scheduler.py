"""Chạy agent liên tục: quét view mỗi 2 giờ, tạo video mỗi sáng, tự học mỗi tối, quét lại kênh mẫu mỗi tuần."""
from __future__ import annotations

import logging

from .context import Ctx

log = logging.getLogger(__name__)


def _safe(name: str, fn):  # noqa: ANN001
    def wrapper() -> None:
        log.info("▶ Bắt đầu job %s", name)
        try:
            fn()
            log.info("✔ Xong job %s", name)
        except Exception:  # noqa: BLE001 — job lỗi không được làm chết cả agent
            log.exception("✘ Job %s lỗi", name)
    return wrapper


def run_forever(ctx: Ctx) -> None:
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    from .learner import learn
    from .pipeline import run_daily
    from .research import analyze_reference, build_formula, scan_reference
    from .tracker import track_once

    cfg = ctx.cfg
    tz = cfg.get_path("schedule.timezone", "Asia/Ho_Chi_Minh")
    sched = BlockingScheduler(timezone=tz, job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600})

    def hm(key: str) -> tuple[int, int]:
        h, m = str(cfg.get_path(key)).split(":")
        return int(h), int(m)

    def weekly_reference() -> None:
        scan_reference(ctx)
        if analyze_reference(ctx):
            build_formula(ctx)

    dh, dm = hm("schedule.daily_time")
    lh, lm = hm("schedule.learn_time")
    sched.add_job(_safe("track", lambda: track_once(ctx)),
                  IntervalTrigger(hours=int(cfg.get_path("schedule.track_every_hours", 2)), timezone=tz),
                  id="track")
    sched.add_job(_safe("daily", lambda: run_daily(ctx)), CronTrigger(hour=dh, minute=dm, timezone=tz), id="daily")
    sched.add_job(_safe("learn", lambda: learn(ctx)), CronTrigger(hour=lh, minute=lm, timezone=tz), id="learn")
    sched.add_job(_safe("reference", weekly_reference),
                  CronTrigger(day_of_week=cfg.get_path("schedule.rescan_reference_day", "sun"), hour=2, minute=17,
                              timezone=tz), id="reference")
    # chạy quét view ngay khi khởi động
    _safe("track", lambda: track_once(ctx))()
    log.info("Agent đang chạy. Lịch: %s", [(j.id, str(j.trigger)) for j in sched.get_jobs()])
    sched.start()
