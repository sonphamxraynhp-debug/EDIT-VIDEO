"""Lưu trữ SQLite: video, chỉ số theo thời gian, kịch bản, sản phẩm, playbook, bài học, rubric."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY,
    channel TEXT NOT NULL,              -- 'reference' | 'own'
    url TEXT NOT NULL UNIQUE,
    fb_id TEXT,
    caption TEXT,
    duration REAL,
    first_seen TEXT NOT NULL,
    local_path TEXT,
    transcript TEXT,
    analysis_json TEXT,
    production_id INTEGER,              -- video do agent tạo
    privacy TEXT DEFAULT 'unknown',     -- only_me | public | unknown
    baseline INTEGER DEFAULT 0          -- 1 = video đã có sẵn trước khi agent bắt đầu theo dõi
);
CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY,
    video_id INTEGER NOT NULL REFERENCES videos(id),
    ts TEXT NOT NULL,
    views INTEGER,
    reactions INTEGER,
    comments INTEGER,
    shares INTEGER
);
CREATE INDEX IF NOT EXISTS idx_metrics_video ON metrics(video_id, ts);
CREATE TABLE IF NOT EXISTS scripts (
    id INTEGER PRIMARY KEY,
    run_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    title TEXT,
    topic TEXT,
    angle TEXT,
    draft_json TEXT NOT NULL,
    score_json TEXT,
    total_score REAL,
    blocked INTEGER DEFAULT 0,
    revision INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'proposed', -- proposed|rejected|selected|produced|uploaded|approved|failed
    rubric_version INTEGER,
    playbook_version INTEGER
);
CREATE TABLE IF NOT EXISTS productions (
    id INTEGER PRIMARY KEY,
    script_id INTEGER NOT NULL REFERENCES scripts(id),
    created_at TEXT NOT NULL,
    backend TEXT,
    clips_json TEXT,
    video_path TEXT,
    status TEXT NOT NULL,               -- producing|produced|uploaded|approved|failed
    error TEXT,
    upload_url TEXT,
    uploaded_at TEXT,
    privacy TEXT,
    approved_at TEXT
);
CREATE TABLE IF NOT EXISTS playbooks (
    version INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL,               -- reference_scan | learning
    json TEXT NOT NULL,
    notes TEXT
);
CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    text TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    source TEXT
);
CREATE TABLE IF NOT EXISTS rubrics (
    version INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    json TEXT NOT NULL,
    reason TEXT
);
CREATE TABLE IF NOT EXISTS learning_runs (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    stats_json TEXT,
    update_json TEXT
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class DB:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    # ------------------------------------------------------------ tiện ích chung
    def execute(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Cursor:
        cur = self.conn.execute(sql, tuple(params))
        self.conn.commit()
        return cur

    def all(self, sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
        return self.conn.execute(sql, tuple(params)).fetchall()

    def one(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
        return self.conn.execute(sql, tuple(params)).fetchone()

    def log(self, kind: str, message: str) -> None:
        self.execute("INSERT INTO events(ts, kind, message) VALUES (?,?,?)", (now_iso(), kind, message))

    # ------------------------------------------------------------ video & chỉ số
    def upsert_video(self, channel: str, url: str, **fields: Any) -> int:
        row = self.one("SELECT id FROM videos WHERE url=?", (url,))
        if row:
            if fields:
                sets = ", ".join(f"{k}=?" for k in fields)
                self.execute(f"UPDATE videos SET {sets} WHERE id=?", (*fields.values(), row["id"]))
            return int(row["id"])
        cols = ["channel", "url", "first_seen", *fields.keys()]
        vals = [channel, url, now_iso(), *fields.values()]
        cur = self.execute(
            f"INSERT INTO videos({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", vals
        )
        return int(cur.lastrowid)

    def add_metrics(self, video_id: int, views: int | None, reactions: int | None = None,
                    comments: int | None = None, shares: int | None = None, ts: str | None = None) -> None:
        self.execute(
            "INSERT INTO metrics(video_id, ts, views, reactions, comments, shares) VALUES (?,?,?,?,?,?)",
            (video_id, ts or now_iso(), views, reactions, comments, shares),
        )

    def latest_metrics(self, video_id: int) -> sqlite3.Row | None:
        return self.one("SELECT * FROM metrics WHERE video_id=? ORDER BY ts DESC LIMIT 1", (video_id,))

    def metric_series(self, video_id: int) -> list[sqlite3.Row]:
        return self.all("SELECT * FROM metrics WHERE video_id=? ORDER BY ts", (video_id,))

    # ------------------------------------------------------------ playbook / rubric / bài học
    def save_playbook(self, playbook: dict, source: str, notes: str = "") -> int:
        row = self.one("SELECT COALESCE(MAX(version),0)+1 AS v FROM playbooks")
        v = int(row["v"])
        self.execute(
            "INSERT INTO playbooks(version, created_at, source, json, notes) VALUES (?,?,?,?,?)",
            (v, now_iso(), source, json.dumps(playbook, ensure_ascii=False), notes),
        )
        return v

    def latest_playbook(self) -> tuple[int, dict] | None:
        row = self.one("SELECT version, json FROM playbooks ORDER BY version DESC LIMIT 1")
        return (int(row["version"]), json.loads(row["json"])) if row else None

    def save_rubric(self, rubric: list[dict], reason: str) -> int:
        row = self.one("SELECT COALESCE(MAX(version),0)+1 AS v FROM rubrics")
        v = int(row["v"])
        self.execute(
            "INSERT INTO rubrics(version, created_at, json, reason) VALUES (?,?,?,?)",
            (v, now_iso(), json.dumps(rubric, ensure_ascii=False), reason),
        )
        return v

    def latest_rubric(self) -> tuple[int, list[dict]] | None:
        row = self.one("SELECT version, json FROM rubrics ORDER BY version DESC LIMIT 1")
        return (int(row["version"]), json.loads(row["json"])) if row else None

    def active_lessons(self) -> list[sqlite3.Row]:
        return self.all("SELECT * FROM lessons WHERE active=1 ORDER BY id")

    def add_lesson(self, text: str, source: str) -> int:
        cur = self.execute(
            "INSERT INTO lessons(created_at, text, active, source) VALUES (?,?,1,?)", (now_iso(), text, source)
        )
        return int(cur.lastrowid)

    def retire_lesson(self, lesson_id: int) -> None:
        self.execute("UPDATE lessons SET active=0 WHERE id=?", (lesson_id,))
