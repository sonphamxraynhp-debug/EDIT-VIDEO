"""SQLite WAL + migrations có version. Mọi ID là UUID, thời gian UTC ISO-8601."""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterable

from . import config

_local = threading.local()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return str(uuid.uuid4())


def connect(path=None) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path or config.DB_PATH), timeout=30, isolation_level=None,
                           check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def conn() -> sqlite3.Connection:
    c = getattr(_local, "conn", None)
    if c is None:
        c = connect()
        _local.conn = c
    return c


def reset_thread_conn() -> None:
    c = getattr(_local, "conn", None)
    if c is not None:
        c.close()
        _local.conn = None


@contextmanager
def tx():
    c = conn()
    c.execute("BEGIN IMMEDIATE")
    try:
        yield c
        c.execute("COMMIT")
    except Exception:
        c.execute("ROLLBACK")
        raise


JSON_COLS = {
    "settings_json", "brand_settings_json", "meta_json", "attributes_json", "tags_json",
    "quality_json", "brief_json", "concept_json", "beats_json", "timeline_json",
    "template_json", "voice_settings_json", "profile_json", "checks_json", "manifest_json",
    "uniqueness_json", "originality_json", "result_json", "data_json", "value_json", "stages_json",
}


def row(r: sqlite3.Row | None) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    for k, v in d.items():
        if k in JSON_COLS and isinstance(v, str):
            try:
                d[k] = json.loads(v)
            except json.JSONDecodeError:
                pass
    return d


def rows(rs: Iterable[sqlite3.Row]) -> list[dict]:
    return [row(r) for r in rs]


def q(sql: str, params: tuple | list = ()) -> list[dict]:
    return rows(conn().execute(sql, params).fetchall())


def q1(sql: str, params: tuple | list = ()) -> dict | None:
    return row(conn().execute(sql, params).fetchone())


def _enc(v: Any) -> Any:
    return json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v


def insert(table: str, data: dict) -> dict:
    data = dict(data)
    data.setdefault("id", new_id())
    cols = list(data)
    conn().execute(
        f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
        [_enc(data[c]) for c in cols],
    )
    return q1(f"SELECT * FROM {table} WHERE id=?", (data["id"],))


def update(table: str, id_: str, data: dict) -> dict | None:
    if not data:
        return q1(f"SELECT * FROM {table} WHERE id=?", (id_,))
    cols = list(data)
    conn().execute(
        f"UPDATE {table} SET {','.join(c + '=?' for c in cols)} WHERE id=?",
        [_enc(data[c]) for c in cols] + [id_],
    )
    return q1(f"SELECT * FROM {table} WHERE id=?", (id_,))


MIGRATIONS: list[str] = [
    # v1 — bảng theo DATABASE CONTRACT (mục 5 SRS)
    """
    CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, role TEXT NOT NULL,
        created_at TEXT NOT NULL);
    CREATE TABLE organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL,
        brand_settings_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, org_id TEXT REFERENCES organizations(id),
        name TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
        settings_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE licenses (id TEXT PRIMARY KEY, kind TEXT NOT NULL, holder TEXT, note TEXT,
        created_at TEXT NOT NULL);
    CREATE TABLE assets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        uri TEXT NOT NULL, original_uri TEXT, file_name TEXT NOT NULL, sha256 TEXT NOT NULL,
        media_type TEXT NOT NULL, meta_json TEXT NOT NULL DEFAULT '{}', tags_json TEXT NOT NULL DEFAULT '[]',
        license_id TEXT REFERENCES licenses(id), rights TEXT NOT NULL DEFAULT 'own_footage',
        status TEXT NOT NULL DEFAULT 'imported', created_at TEXT NOT NULL);
    CREATE UNIQUE INDEX ux_assets_project_sha ON assets(project_id, sha256);
    CREATE TABLE products (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        sku TEXT, name TEXT NOT NULL, attributes_json TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
        locked INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL);
    CREATE TABLE evidence (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        title TEXT NOT NULL, source_uri TEXT, kind TEXT DEFAULT 'internal', excerpt TEXT, page TEXT,
        version TEXT, expiry TEXT, approver TEXT, status TEXT NOT NULL DEFAULT 'checked', created_at TEXT NOT NULL);
    CREATE TABLE claims (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'needs_review', risk_level TEXT NOT NULL DEFAULT 'low',
        evidence_id TEXT REFERENCES evidence(id), created_at TEXT NOT NULL);
    CREATE TABLE scenes (id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL, start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, label TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]', quality_json TEXT NOT NULL DEFAULT '{}', keyframe TEXT,
        ocr_text TEXT, locked INTEGER NOT NULL DEFAULT 0, review TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE transcript_segments (id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, text TEXT NOT NULL, confidence REAL);
    CREATE TABLE campaigns (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL, brief_json TEXT NOT NULL DEFAULT '{}', target_count INTEGER NOT NULL DEFAULT 10,
        product_version INTEGER, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL);
    CREATE TABLE variants (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        code TEXT NOT NULL, concept_json TEXT NOT NULL, similarity_group TEXT, score REAL DEFAULT 0,
        feasible INTEGER NOT NULL DEFAULT 1, reject_reason TEXT, uniqueness_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'DRAFT', seed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL);
    CREATE INDEX ix_variants_campaign ON variants(campaign_id, status);
    CREATE TABLE scripts (id TEXT PRIMARY KEY, variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
        version INTEGER NOT NULL, title TEXT, beats_json TEXT NOT NULL, engine TEXT, status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL);
    CREATE TABLE storyboards (id TEXT PRIMARY KEY, variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
        version INTEGER NOT NULL, timeline_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL);
    CREATE TABLE templates (id TEXT PRIMARY KEY, org_id TEXT, name TEXT NOT NULL, category TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1, template_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'stable',
        created_at TEXT NOT NULL);
    CREATE TABLE voice_jobs (id TEXT PRIMARY KEY, script_id TEXT REFERENCES scripts(id) ON DELETE CASCADE,
        text TEXT, voice_settings_json TEXT NOT NULL, output_uri TEXT, duration_ms INTEGER, cache_key TEXT,
        status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
    CREATE TABLE render_jobs (id TEXT PRIMARY KEY, variant_id TEXT REFERENCES variants(id) ON DELETE CASCADE,
        batch_id TEXT, kind TEXT NOT NULL DEFAULT 'final', profile_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'PENDING', progress REAL NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3, priority INTEGER NOT NULL DEFAULT 5, error_code TEXT,
        error_message TEXT, output_uri TEXT, worker_id TEXT, heartbeat_at TEXT, next_attempt_at TEXT,
        started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX ix_render_status ON render_jobs(status, priority, created_at);
    CREATE TABLE render_batches (id TEXT PRIMARY KEY, campaign_id TEXT, idempotency_key TEXT UNIQUE,
        name TEXT, profile_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE qc_reports (id TEXT PRIMARY KEY, variant_id TEXT NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
        checks_json TEXT NOT NULL, severity TEXT NOT NULL, decision TEXT, created_at TEXT NOT NULL);
    CREATE TABLE approvals (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        reviewer_id TEXT, decision TEXT NOT NULL, reason TEXT, at TEXT NOT NULL);
    CREATE TABLE exports (id TEXT PRIMARY KEY, render_job_id TEXT, variant_id TEXT, output_uri TEXT NOT NULL,
        manifest_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE metrics (id TEXT PRIMARY KEY, variant_id TEXT REFERENCES variants(id) ON DELETE CASCADE,
        platform TEXT, post_url TEXT, captured_at TEXT NOT NULL, views INTEGER DEFAULT 0, watch_time REAL DEFAULT 0,
        hold_3s REAL, completion REAL, ctr REAL, conversions INTEGER);
    CREATE TABLE model_registry (id TEXT PRIMARY KEY, kind TEXT NOT NULL, provider TEXT NOT NULL,
        model_name TEXT NOT NULL, version TEXT, checksum TEXT, license TEXT, size_bytes INTEGER,
        status TEXT NOT NULL DEFAULT 'missing', created_at TEXT NOT NULL);
    CREATE TABLE settings (id TEXT PRIMARY KEY, value_json TEXT NOT NULL);
    CREATE TABLE activity (id TEXT PRIMARY KEY, project_id TEXT, message TEXT NOT NULL, level TEXT DEFAULT 'info',
        at TEXT NOT NULL);
    CREATE TABLE faqs (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        q TEXT NOT NULL, a TEXT NOT NULL, kind TEXT DEFAULT 'faq', status TEXT DEFAULT 'approved', created_at TEXT NOT NULL);
    CREATE TABLE product_versions (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        version INTEGER NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
    """,
    # v2 — quy mô 100–1000: thư viện hook, điểm nguyên bản, số lô
    """
    CREATE TABLE hooks (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        angle TEXT, text TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'llm', status TEXT NOT NULL DEFAULT 'active',
        used_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE INDEX ix_hooks_campaign ON hooks(campaign_id, status);
    ALTER TABLE variants ADD COLUMN hook_id TEXT;
    ALTER TABLE variants ADD COLUMN batch_no INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE variants ADD COLUMN originality_json TEXT NOT NULL DEFAULT '{}';
    """,
]


def migrate(c: sqlite3.Connection | None = None) -> int:
    c = c or conn()
    c.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
    r = c.execute("SELECT version FROM schema_version").fetchone()
    cur = r[0] if r else 0
    if r is None:
        c.execute("INSERT INTO schema_version VALUES (0)")
    for i, sql in enumerate(MIGRATIONS[cur:], start=cur + 1):
        c.executescript("BEGIN;" + sql + f"; UPDATE schema_version SET version={i}; COMMIT;")
    return len(MIGRATIONS)


PATH_COLUMNS = {
    "assets": ["uri", "meta_json"], "scenes": ["keyframe"], "evidence": ["source_uri"],
    "storyboards": ["timeline_json"], "voice_jobs": ["output_uri"], "render_jobs": ["output_uri", "profile_json"],
    "exports": ["output_uri", "manifest_json"], "settings": ["value_json"],
}


def relocate_paths(old: str, new: str) -> int:
    """Thư mục dữ liệu bị di chuyển: đổi tiền tố đường dẫn tuyệt đối đã lưu sang vị trí mới."""
    n = 0
    c = conn()
    for table, cols in PATH_COLUMNS.items():
        for col in cols:
            n += c.execute(f"UPDATE {table} SET {col}=replace({col}, ?, ?) WHERE instr({col}, ?) > 0",
                           (old, new, old)).rowcount
    return n


def log_activity(message: str, project_id: str | None = None, level: str = "info") -> None:
    insert("activity", {"project_id": project_id, "message": message, "level": level, "at": now()})


def get_setting(key: str, default: Any = None) -> Any:
    r = q1("SELECT value_json FROM settings WHERE id=?", (key,))
    return r["value_json"] if r else default


def set_setting(key: str, value: Any) -> None:
    conn().execute("INSERT INTO settings(id, value_json) VALUES(?, ?) "
                   "ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json",
                   (key, json.dumps(value, ensure_ascii=False)))
