"""M09: worker hàng đợi bền vững trên SQLite.

- Claim job nguyên tử (UPDATE … RETURNING), heartbeat mỗi lần báo tiến độ.
- Crash recovery: job đang chạy có heartbeat cũ → RETRY_WAIT (TC-011).
- Retry có backoff cho lỗi transient; lỗi cấu hình/thiếu asset → FAILED cần can thiệp.
- Giới hạn song song riêng cho AI inference, CPU, render (M09-05).
"""
from __future__ import annotations

import logging
import os
import signal
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone

from . import config, db, pipeline
from .errors import AppError

log = logging.getLogger("avf.worker")

CLASS_OF = {"script": "ai", "analysis": "cpu", "proxy": "cpu", "voice": "cpu", "preview": "render", "final": "render"}
RUNNING_STATES = ("PREPARING", "RENDERING", "VERIFYING")
STALE_SEC = 90


def limits() -> dict:
    mode = db.get_setting("performance_mode", "balanced")
    parallel = int(db.get_setting("parallel_jobs", 2) or 2)
    base = {"eco": 1, "balanced": parallel, "turbo": max(parallel, os.cpu_count() // 2 or 2)}.get(mode, parallel)
    return {"ai": 1, "cpu": max(1, base), "render": max(1, base)}


def recover_stale(worker_id: str | None = None) -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=STALE_SEC)).isoformat(timespec="seconds")
    cur = db.conn().execute(
        f"UPDATE render_jobs SET status='RETRY_WAIT', next_attempt_at=?, error_code='WORKER_LOST', "
        f"error_message='Worker dừng đột ngột – tự động thử lại', updated_at=? "
        f"WHERE status IN ({','.join('?' * len(RUNNING_STATES))}) AND (heartbeat_at IS NULL OR heartbeat_at < ? "
        f"OR (? IS NOT NULL AND worker_id != ?))",
        [db.now(), db.now(), *RUNNING_STATES, cutoff, worker_id, worker_id])
    return cur.rowcount


def claim(worker_id: str, allowed_kinds: list[str]) -> dict | None:
    if not allowed_kinds:
        return None
    now = db.now()
    r = db.conn().execute(
        f"UPDATE render_jobs SET status='PREPARING', worker_id=?, heartbeat_at=?, started_at=COALESCE(started_at, ?), "
        f"attempts=attempts+1, updated_at=? WHERE id=(SELECT id FROM render_jobs WHERE "
        f"(status='PENDING' OR (status='RETRY_WAIT' AND (next_attempt_at IS NULL OR next_attempt_at<=?))) "
        f"AND kind IN ({','.join('?' * len(allowed_kinds))}) ORDER BY priority, created_at LIMIT 1) "
        f"RETURNING *", [worker_id, now, now, now, now, *allowed_kinds]).fetchone()
    return db.row(r)


def _status(job_id: str) -> str | None:
    r = db.conn().execute("SELECT status FROM render_jobs WHERE id=?", (job_id,)).fetchone()
    return r[0] if r else None


def execute(job: dict, worker_id: str) -> None:
    jid = job["id"]
    last = [0.0]

    def progress(p: float) -> None:
        now = time.time()
        if now - last[0] < 0.5 and p < 1:
            return
        last[0] = now
        db.conn().execute("UPDATE render_jobs SET progress=?, heartbeat_at=?, status=CASE WHEN status='PREPARING' "
                          "THEN 'RENDERING' ELSE status END, updated_at=? WHERE id=? AND worker_id=?",
                          (round(max(0, min(1, p)), 3), db.now(), db.now(), jid, worker_id))

    def should_stop() -> bool:
        return _status(jid) in ("PAUSED", "CANCELLED")

    try:
        kind = job["kind"]
        if kind == "proxy":
            result = pipeline.job_proxy(job, progress)
        elif kind == "analysis":
            result = pipeline.job_analysis(job, progress)
        elif kind == "script":
            s = pipeline.generate_script(job["variant_id"], job["profile_json"].get("use_llm", True))
            result = {"script_id": s["id"], "engine": s["engine"]}
        elif kind == "voice":
            result = pipeline.job_voice(job, progress)
        elif kind in ("preview", "final"):
            result = pipeline.job_render(job, progress, should_stop)
        else:
            raise AppError("JOB_KIND", f"Loại job không hỗ trợ: {kind}")
        db.conn().execute("UPDATE render_jobs SET status='VERIFYING', updated_at=? WHERE id=?", (db.now(), jid))
        out = result.get("video") if isinstance(result, dict) else None
        db.conn().execute("UPDATE render_jobs SET status='COMPLETED', progress=1, output_uri=?, profile_json=json_set("
                          "profile_json, '$.result', json(?)), finished_at=?, updated_at=?, error_code=NULL, "
                          "error_message=NULL WHERE id=?",
                          (out, __import__("json").dumps(result, ensure_ascii=False, default=str), db.now(), db.now(), jid))
    except AppError as e:
        st = _status(jid)
        if e.code == "RENDER_CANCELLED" and st in ("PAUSED", "CANCELLED"):
            db.conn().execute("UPDATE render_jobs SET progress=0, updated_at=? WHERE id=?", (db.now(), jid))
            return
        tail = [ln for ln in str(e.details.get("stderr", "")).splitlines() if ln.strip()]
        detail = f" [{tail[0][:160]}]" if tail else ""
        _fail(job, e.code, e.message + detail + (f" — {e.hint}" if e.hint else ""), e.retryable)
    except Exception as e:  # noqa: BLE001
        log.error("job %s crashed: %s", jid, traceback.format_exc())
        _fail(job, "INTERNAL", str(e)[:300], True)


def _fail(job: dict, code: str, msg: str, retryable: bool) -> None:
    attempts = job["attempts"]
    if retryable and attempts < job["max_attempts"]:
        nxt = (datetime.now(timezone.utc) + timedelta(seconds=5 * 2 ** attempts)).isoformat(timespec="seconds")
        db.conn().execute("UPDATE render_jobs SET status='RETRY_WAIT', next_attempt_at=?, error_code=?, error_message=?, "
                          "updated_at=? WHERE id=?", (nxt, code, msg, db.now(), job["id"]))
    else:
        db.conn().execute("UPDATE render_jobs SET status='FAILED', error_code=?, error_message=?, finished_at=?, "
                          "updated_at=? WHERE id=?", (code, msg, db.now(), db.now(), job["id"]))


class Worker:
    def __init__(self) -> None:
        self.id = f"w-{os.getpid()}"
        self.stop = threading.Event()
        self.running: dict[str, str] = {}      # job_id → class
        self.lock = threading.Lock()

    def _thread(self, job: dict) -> None:
        try:
            execute(job, self.id)
        finally:
            db.reset_thread_conn()
            with self.lock:
                self.running.pop(job["id"], None)

    def loop(self) -> None:
        db.migrate()
        n = recover_stale()
        log.info("worker %s start, recovered %d stale jobs", self.id, n)
        last_recover = time.time()
        while not self.stop.is_set():
            if time.time() - last_recover > 30:        # job mồ côi (worker cũ bị kill ngay trước khi khởi động lại)
                last_recover = time.time()
                n = recover_stale(self.id)
                if n:
                    log.info("recovered %d stale jobs", n)
            lim = limits()
            with self.lock:
                busy = {c: sum(1 for v in self.running.values() if v == c) for c in lim}
            kinds = [k for k, c in CLASS_OF.items() if busy[c] < lim[c]]
            job = claim(self.id, kinds)
            if job:
                with self.lock:
                    self.running[job["id"]] = CLASS_OF[job["kind"]]
                threading.Thread(target=self._thread, args=(job,), daemon=True).start()
                continue
            for jid in list(self.running):     # heartbeat cho job đang chạy dài
                db.conn().execute("UPDATE render_jobs SET heartbeat_at=? WHERE id=?", (db.now(), jid))
            self.stop.wait(1.0)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s",
                        handlers=[logging.StreamHandler(), logging.FileHandler(config.LOG_DIR / "worker.log")])
    w = Worker()
    signal.signal(signal.SIGTERM, lambda *_: w.stop.set())
    try:
        w.loop()
    except KeyboardInterrupt:
        w.stop.set()


if __name__ == "__main__":
    main()
