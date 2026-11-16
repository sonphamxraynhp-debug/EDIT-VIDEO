"""FastAPI local backend — chỉ bind 127.0.0.1. Lỗi trả về dạng {code, message, details, retryable, hint, trace_id}."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import ai, config, creative, db, media, pipeline, policy, render, scale, system, tts
from .errors import AppError, not_found
from .templates_seed import TEMPLATES

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s",
                    handlers=[logging.StreamHandler(), logging.FileHandler(config.LOG_DIR / "api.log")])
log = logging.getLogger("avf.api")

app = FastAPI(title="AI Video Factory – Local API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origin_regex=r"^(http://(localhost|127\.0\.0\.1)(:\d+)?|tauri://localhost)$",
                   allow_methods=["*"], allow_headers=["*"])
API = "/api/v1"
_ORIGIN_OK = re.compile(r"(https?://(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?|tauri://localhost)")


@app.exception_handler(AppError)
async def app_error(_: Request, e: AppError):
    log.warning("AppError %s %s trace=%s", e.code, e.message, e.trace_id)
    return JSONResponse(status_code=e.status, content={"error": e.to_dict()})


@app.exception_handler(Exception)
async def any_error(_: Request, e: Exception):
    err = AppError("INTERNAL", "Lỗi hệ thống không mong muốn", details={"type": type(e).__name__}, retryable=True,
                   hint="Xem log tại Cài đặt → Logs.", status=500)
    log.exception("Unhandled trace=%s", err.trace_id)
    return JSONResponse(status_code=500, content={"error": err.to_dict()})


@app.middleware("http")
async def local_only(request: Request, call_next):
    origin = request.headers.get("origin")
    host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]")
    if (origin and not _ORIGIN_OK.fullmatch(origin)) or host not in ("127.0.0.1", "localhost", "::1", "tauri.localhost", "testserver"):
        return JSONResponse(status_code=403, content={"error": {"code": "ORIGIN_BLOCKED", "message": "Chỉ cho phép localhost"}})
    return await call_next(request)


# ---------------------------------------------------------------- bootstrap
def bootstrap() -> None:
    db.migrate()
    last = db.get_setting("data_dir_last")
    if last and last != str(config.DATA_DIR):
        n = db.relocate_paths(last, str(config.DATA_DIR))
        log.info("Thư mục dữ liệu đã chuyển %s → %s: cập nhật %d bản ghi", last, config.DATA_DIR, n)
    db.set_setting("data_dir_last", str(config.DATA_DIR))
    if not db.q1("SELECT id FROM users LIMIT 1"):
        db.insert("users", {"id": "local-owner", "display_name": "Admin", "role": "owner", "created_at": db.now()})
    if not db.q1("SELECT id FROM organizations LIMIT 1"):
        db.insert("organizations", {"id": "org-default", "name": "Workspace mặc định", "created_at": db.now(),
                                    "brand_settings_json": {"kits": [DEFAULT_BRAND], "active": DEFAULT_BRAND["id"]}})
        db.set_setting("brand_active", DEFAULT_BRAND)
    if not db.q1("SELECT id FROM templates LIMIT 1"):
        for t in TEMPLATES:
            db.insert("templates", {"org_id": "org-default", "name": t["name"], "category": t["category"], "version": 1,
                                    "template_json": t, "status": "stable", "created_at": db.now()})
    for k, v in DEFAULT_SETTINGS.items():
        if db.get_setting(k) is None:
            db.set_setting(k, v)


DEFAULT_BRAND = {"id": "brand-1", "name": "Thương hiệu mặc định", "primary": "#7B56FF", "secondary": "#00D6C0",
                 "accent": "#4FD1FF", "dark": "#1B2440", "light": "#F6F7FB", "font_title": "Plus Jakarta Sans",
                 "font_body": "Inter", "tone": "Thân thiện, đáng tin cậy, gần gũi.", "blocked": [],
                 "cta": ["Tìm hiểu thêm"], "logo": None, "watermark": False, "caption": {}}
DEFAULT_SETTINGS = {
    "language": "vi", "theme": "dark", "autosave": True, "autosave_minutes": 5, "performance_mode": "balanced",
    "parallel_jobs": 2, "gpu_accel": True, "offline_mode": True, "telemetry": False, "loudness_lufs": -14,
    "export_preset": "1080x1920_h264", "voice_default": {**tts.default_voice(), "rate": 1.0, "lufs": -16},
    "qc_checks": {"similarity": True, "evidence": True, "audio_subtitle": True, "rights": True},
    "pause_temp_c": 85, "prevent_sleep": True, "checkpoint_minutes": 5, "originality_min": 0.35,
    "tutorial": {"done": False, "version": 0},
}

bootstrap()


# ---------------------------------------------------------------- system
@app.get(f"{API}/system/health")
def health():
    return {"status": "ok", "db": str(config.DB_PATH), "schema_version": len(db.MIGRATIONS),
            "llm": ai.llm_available(), "ffmpeg": media.tool_available(config.FFMPEG), "time": db.now(),
            "offline_capable": True}


@app.get(f"{API}/system/hardware")
def hardware():
    return {"static": system.hardware_static(), "live": system.hardware_live()}


@app.get(f"{API}/models")
def models():
    return {"models": system.models_status(), "models_dir": str(config.MODELS_DIR),
            "usage_gb": round(sum(p.stat().st_size for p in config.MODELS_DIR.glob("*") if p.is_file()) / 1e9, 2)}


_download_state: dict = {}


@app.post(f"{API}/models/whisper/download")
def download_whisper(model: str = "accurate"):
    """Tải model Whisper từ nguồn đã duyệt (HuggingFace ggerganov). Chỉ chạy khi người dùng bấm.
    accurate = large-v3-turbo nén (nghe tiếng Việt đúng hơn hẳn, 574 MB); base = bản nhẹ 148 MB."""
    if _download_state.get("running"):
        return _download_state
    spec = media.WHISPER_MODELS.get(model) or media.WHISPER_MODELS["accurate"]
    url = f"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{spec['file']}"
    dest = config.MODELS_DIR / spec["file"]

    def run():
        _download_state.update({"running": True, "progress": 0, "error": None, "model": spec["file"]})
        tmp = dest.with_suffix(".part")
        try:
            with urllib.request.urlopen(url, timeout=30) as r, open(tmp, "wb") as f:
                total = int(r.headers.get("Content-Length", 0))
                done = 0
                while chunk := r.read(1 << 20):
                    f.write(chunk)
                    done += len(chunk)
                    _download_state["progress"] = round(done / total, 3) if total else 0
            digest = media.sha256_file(tmp)
            if spec.get("sha256") and digest != spec["sha256"]:
                raise ValueError("File tải về không khớp mã kiểm tra, hãy thử tải lại")
            tmp.replace(dest)
            db.insert("model_registry", {"kind": "asr", "provider": "whisper.cpp", "model_name": dest.name,
                                         "version": spec["version"], "checksum": digest, "license": "MIT",
                                         "size_bytes": dest.stat().st_size, "status": "installed", "created_at": db.now()})
            db.log_activity(f"Đã tải model {dest.name} (sha256 {digest[:12]}…)")
        except Exception as e:  # noqa: BLE001
            _download_state["error"] = str(e)
            tmp.unlink(missing_ok=True)
        finally:
            _download_state["running"] = False
            db.reset_thread_conn()
    threading.Thread(target=run, daemon=True).start()
    return {"running": True, "progress": 0, "model": spec["file"]}


@app.get(f"{API}/models/whisper/download")
def download_whisper_state():
    return _download_state


@app.post(f"{API}/models/test")
def test_models():
    out = []
    t = time.time()
    try:
        r = ai.generate_json("Trả JSON.", 'Trả {"ok": true}', lambda o: o, retries=0, timeout=60)
        out.append({"kind": "llm", "ok": bool(r.get("ok")), "ms": int((time.time() - t) * 1000)})
    except Exception as e:  # noqa: BLE001
        out.append({"kind": "llm", "ok": False, "error": str(e)[:200]})
    t = time.time()
    try:
        _, d = tts.synth("Xin chào, đây là bài kiểm tra giọng đọc.", {})
        out.append({"kind": "tts", "ok": d > 0, "ms": int((time.time() - t) * 1000)})
    except AppError as e:
        out.append({"kind": "tts", "ok": False, "error": e.message})
    out.append({"kind": "ocr", "ok": media.tool_available(config.TESSERACT)})
    out.append({"kind": "asr", "ok": media.find_whisper_model() is not None and media.tool_available(config.WHISPER_CLI)})
    for o in out:
        db.log_activity(f"Kiểm tra model {o['kind']}: {'OK' if o['ok'] else 'LỖI'}", level="info" if o["ok"] else "warning")
    return {"results": out}


_bench: dict = {}


@app.post(f"{API}/system/benchmark")
def benchmark():
    """M09-06: đo tốc độ render thật trên máy với 3 độ dài 15/30/45s @1080×1920."""
    if _bench.get("running"):
        return _bench

    def run():
        _bench.update({"running": True, "results": [], "started": db.now()})
        enc = system.best_encoder(True)
        for sec in (15, 30, 45):
            out = config.WORK_DIR / f"bench_{sec}.mp4"
            t = time.time()
            r = subprocess.run([config.FFMPEG, "-y", "-v", "error", "-f", "lavfi", "-i",
                                f"testsrc2=s=1080x1920:r=30:d={sec}", "-f", "lavfi", "-i", f"sine=d={sec}",
                                "-c:v", enc, *(["-preset", "veryfast"] if enc == "libx264" else ["-b:v", "8M"]),
                                "-c:a", "aac", "-shortest", str(out)], capture_output=True)
            el = time.time() - t
            _bench["results"].append({"duration": sec, "resolution": "1080 × 1920 (9:16)", "encoder": enc,
                                      "seconds": round(el, 1), "speed": round(sec / el, 2) if el else 0,
                                      "ok": r.returncode == 0})
            out.unlink(missing_ok=True)
        _bench["running"] = False
        _bench["finished"] = db.now()
        db.set_setting("benchmark", _bench)
        db.reset_thread_conn()
    threading.Thread(target=run, daemon=True).start()
    return {"running": True}


@app.get(f"{API}/system/benchmark")
def benchmark_state():
    return _bench or db.get_setting("benchmark", {}) or {}


@app.get(f"{API}/settings")
def get_settings():
    return {r["id"]: r["value_json"] for r in db.q("SELECT * FROM settings")} | {
        "paths": {"data": str(config.DATA_DIR), "output": str(config.OUTPUT_DIR), "models": str(config.MODELS_DIR),
                  "logs": str(config.LOG_DIR)}}


@app.put(f"{API}/settings")
def put_settings(data: dict):
    for k, v in data.items():
        if k != "paths":
            db.set_setting(k, v)
    return get_settings()


@app.get(f"{API}/system/logs")
def logs(name: str = "api", lines: int = 200):
    p = config.LOG_DIR / f"{'worker' if name == 'worker' else 'api'}.log"
    if not p.exists():
        return {"lines": []}
    return {"lines": p.read_text(encoding="utf-8", errors="ignore").splitlines()[-lines:]}


@app.get(f"{API}/system/storage")
def storage():
    def size(p: Path) -> int:
        return sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) if p.exists() else 0
    return {"media": size(config.MEDIA_DIR), "proxy": size(config.PROXY_DIR), "work": size(config.WORK_DIR),
            "output": size(config.OUTPUT_DIR), "models": size(config.MODELS_DIR), "voice": size(tts.VOICE_DIR),
            "disk_free_gb": media.disk_free_gb()}


@app.post(f"{API}/system/cleanup")
def cleanup(target: str = "cache"):
    if target not in ("cache", "work"):
        raise AppError("BAD_TARGET", "Chỉ dọn cache/work")
    if db.q1("SELECT 1 FROM render_jobs WHERE status IN ('PREPARING','RENDERING','VERIFYING')"):
        raise AppError("BUSY", "Máy đang dựng video, đợi xong rồi dọn", status=409)
    for d in ([config.WORK_DIR, tts.VOICE_DIR] if target == "cache" else [config.WORK_DIR]):
        for f in d.iterdir():
            shutil.rmtree(f, ignore_errors=True) if f.is_dir() else f.unlink(missing_ok=True)
    db.log_activity(f"Đã dọn {target}")
    return storage()


@app.post(f"{API}/system/backup")
def backup():
    dest = config.DATA_DIR / "backups"
    dest.mkdir(exist_ok=True)
    out = dest / f"avf-{time.strftime('%Y%m%d-%H%M%S')}.sqlite3"
    src = db.connect()
    dst = db.connect(out)
    src.backup(dst)
    dst.close()
    src.close()
    return {"backup": str(out)}


@app.get(f"{API}/users")
def users():
    return db.q("SELECT * FROM users")


@app.get(f"{API}/activity")
def activity(project_id: str | None = None, limit: int = 20):
    if project_id:
        return db.q("SELECT * FROM activity WHERE project_id=? ORDER BY at DESC LIMIT ?", (project_id, limit))
    return db.q("SELECT * FROM activity ORDER BY at DESC LIMIT ?", (limit,))


# ---------------------------------------------------------------- files (chỉ phục vụ file trong vùng dữ liệu app)
@app.get(f"{API}/files")
def files(path: str):
    p = Path(path).resolve()
    allowed = [config.DATA_DIR, config.OUTPUT_DIR]
    if not any(p.is_relative_to(a) for a in allowed):
        # file nguồn nhập theo đường dẫn (không sao chép) nằm ngoài thư mục dữ liệu: chỉ phục vụ video/ảnh/âm thanh đã đăng ký
        if not db.q1("SELECT id FROM assets WHERE uri=? AND media_type IN ('video','image','audio')", (str(p),)):
            raise AppError("FILE_FORBIDDEN", "Không được truy cập file ngoài thư mục dữ liệu", status=403)
    if not p.is_file():
        raise not_found("file")
    return FileResponse(p)


# ---------------------------------------------------------------- dashboard
@app.get(f"{API}/dashboard")
def dashboard():
    jobs = db.q("SELECT status, kind, COUNT(*) n FROM render_jobs GROUP BY status, kind")
    done = sum(j["n"] for j in jobs if j["status"] == "COMPLETED")
    finished = sum(j["n"] for j in jobs if j["status"] in ("COMPLETED", "FAILED"))
    weekly = db.q("SELECT substr(finished_at,1,10) d, COUNT(*) n FROM render_jobs WHERE kind='final' AND status='COMPLETED' "
                  "AND finished_at >= date('now','-6 day') GROUP BY d ORDER BY d")
    angles = db.q("SELECT json_extract(concept_json,'$.angle') angle, COUNT(*) n FROM variants GROUP BY angle ORDER BY n DESC")
    return {
        "projects_active": db.q1("SELECT COUNT(*) n FROM projects WHERE status='active'")["n"],
        "scripts": db.q1("SELECT COUNT(DISTINCT variant_id) n FROM scripts")["n"],
        "videos_done": db.q1("SELECT COUNT(*) n FROM exports")["n"],
        "success_rate": round(100 * done / finished) if finished else None,
        "active_jobs": db.q("SELECT j.*, v.code FROM render_jobs j LEFT JOIN variants v ON v.id=j.variant_id WHERE j.status IN "
                            "('PREPARING','RENDERING','VERIFYING','PENDING','RETRY_WAIT') ORDER BY j.status DESC, j.created_at LIMIT 6"),
        "queue": db.q1("SELECT COUNT(*) n FROM render_jobs WHERE status IN ('PENDING','RETRY_WAIT','PREPARING','RENDERING')")["n"],
        "weekly": weekly,
        "project_status": db.q("SELECT status, COUNT(*) n FROM projects GROUP BY status"),
        "angles": [{"angle": a["angle"], "label": creative.ANGLES.get(a["angle"], {}).get("label", a["angle"]), "n": a["n"]}
                   for a in angles if a["angle"]],
        "recent_projects": list_projects()[:5],
    }


# ---------------------------------------------------------------- projects (M01)
class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    product_name: str | None = None
    target_count: int = 10
    aspect: str = "9:16"
    platforms: list[str] = ["tiktok", "reels"]
    goal: str = "education_and_demo"
    mode: str = "manual"              # "ai": máy tự chạy luồng Tạo video; "manual": người làm từng bước
    voice_pref: dict | None = None    # chế độ AI: {"mode": "os"|"preset"|"clone", "name": tên giọng sẵn, "consent": bool} áp sau khi phân tích clip


def _project_stats(p: dict) -> dict:
    pid = p["id"]
    camp = db.q1("SELECT * FROM campaigns WHERE project_id=? ORDER BY created_at LIMIT 1", (pid,))
    prod = db.q1("SELECT id, name, sku FROM products WHERE project_id=? ORDER BY created_at LIMIT 1", (pid,))
    v = db.q1("SELECT COUNT(*) n, SUM(v.status IN ('SCRIPT_APPROVED','STORYBOARD_READY','PREVIEW_READY','QC_PENDING','APPROVED',"
              "'RENDERING','COMPLETED')) approved, SUM(v.status='COMPLETED') done FROM variants v JOIN campaigns c "
              "ON c.id=v.campaign_id WHERE c.project_id=?", (pid,))
    target = camp["target_count"] if camp else (p["settings_json"] or {}).get("target_count", 0)
    rendering = db.q1("SELECT COUNT(*) n FROM render_jobs j JOIN variants v ON v.id=j.variant_id JOIN campaigns c ON "
                      "c.id=v.campaign_id WHERE c.project_id=? AND j.kind IN ('preview','final') "
                      "AND j.status IN ('PENDING','PREPARING','RENDERING')", (pid,))["n"]
    thumb = db.q1("SELECT meta_json FROM assets WHERE project_id=? AND media_type IN ('video','image') ORDER BY created_at LIMIT 1", (pid,))
    done = v["done"] or 0
    by = {r["status"]: r["n"] for r in db.q("SELECT v.status, COUNT(*) n FROM variants v JOIN campaigns c ON c.id=v.campaign_id "
                                            "WHERE c.project_id=? GROUP BY v.status", (pid,))}
    analyzing = db.q1("SELECT 1 FROM render_jobs WHERE kind='analysis' AND status IN ('PENDING','PREPARING','RENDERING') AND "
                      "json_extract(profile_json,'$.asset_id') IN (SELECT id FROM assets WHERE project_id=?) LIMIT 1", (pid,))
    phase = "Hoàn thành" if target and done >= target else "Đang dựng video" if rendering else \
        "Chờ bạn chọn video" if by.get("QC_PENDING") else "Đã chọn, chờ xuất" if by.get("APPROVED") else \
        "Đã xuất một phần" if done else "Chờ duyệt kịch bản" if by.get("SCRIPT_READY") else \
        "Đang viết kịch bản" if by.get("DRAFT") else "Đang phân tích" if analyzing else \
        "Đã có video nguồn" if db.q1("SELECT 1 FROM assets WHERE project_id=?", (pid,)) else "Mới tạo"
    return {**p, "campaign": camp, "product": prod, "variants": v["n"], "approved_scripts": v["approved"] or 0,
            "completed": done, "target": target, "progress": round(100 * done / target) if target else 0, "phase": phase,
            "thumbnail": (thumb["meta_json"] or {}).get("thumbnail") if thumb else None}


@app.get(f"{API}/projects")
def list_projects(status: str | None = None, q: str | None = None):
    sql, args = "SELECT * FROM projects WHERE status!='deleted'", []
    if status:
        sql += " AND status=?"
        args.append(status)
    if q:
        sql += " AND name LIKE ?"
        args.append(f"%{q}%")
    return [_project_stats(p) for p in db.q(sql + " ORDER BY updated_at DESC", args)]


@app.post(f"{API}/projects")
def create_project(p: ProjectIn):
    proj = db.insert("projects", {"org_id": "org-default", "name": p.name, "description": p.description, "status": "active",
                                  "settings_json": {"aspect": p.aspect, "platforms": p.platforms, "target_count": p.target_count,
                                                    "mode": "ai" if p.mode == "ai" else "manual",
                                                    "voice_pref": p.voice_pref or {"mode": "os"}},
                                  "created_at": db.now(), "updated_at": db.now()})
    if p.product_name:
        db.insert("products", {"project_id": proj["id"], "name": p.product_name, "attributes_json": {}, "created_at": db.now(),
                               "updated_at": db.now()})
    db.insert("campaigns", {"project_id": proj["id"], "name": p.name, "target_count": p.target_count, "created_at": db.now(),
                            "brief_json": {"aspect": p.aspect, "platform_presets": [f"{x}_{p.aspect.replace(':', '_')}" for x in p.platforms],
                                           "goal": p.goal, "durations_sec": [30], "offline_only": True,
                                           "require_human_approval": True}})
    db.log_activity(f"Tạo dự án {p.name}", proj["id"])
    return _project_stats(proj)


@app.get(f"{API}/projects/{{pid}}")
def get_project(pid: str):
    p = db.q1("SELECT * FROM projects WHERE id=?", (pid,))
    if not p:
        raise not_found("dự án")
    return _project_stats(p)


ONBOARDING = [   # (key, nhãn, màn hình, câu hỏi SQL trả về số > 0 khi bước đã xong)
    ("project", "Tạo dự án", "/projects", "SELECT 1"),
    ("import", "Nhập ít nhất 1 video nguồn", "/media",
     "SELECT COUNT(*) FROM assets WHERE project_id=:p AND media_type='video'"),
    ("analyze", "Phân tích video và duyệt cảnh", "/media/analyze",
     "SELECT COUNT(*) FROM scenes s JOIN assets a ON a.id=s.asset_id WHERE a.project_id=:p AND s.review='approved'"),
    ("claims", "Thêm claim có bằng chứng trong Product Brain", "/brain",
     "SELECT COUNT(*) FROM claims c JOIN products pr ON pr.id=c.product_id WHERE pr.project_id=:p "
     "AND c.status='approved' AND c.evidence_id IS NOT NULL"),
    ("hooks", "Sinh thư viện hook", "/creative/strategy",
     "SELECT COUNT(*) FROM hooks h JOIN campaigns c ON c.id=h.campaign_id WHERE c.project_id=:p AND h.status='active'"),
    ("matrix", "Tạo ma trận biến thể", "/creative/matrix",
     "SELECT COUNT(*) FROM variants v JOIN campaigns c ON c.id=v.campaign_id WHERE c.project_id=:p"),
    ("scripts", "Duyệt ít nhất 1 kịch bản", "/creative/scripts",
     "SELECT COUNT(*) FROM scripts s JOIN variants v ON v.id=s.variant_id JOIN campaigns c ON c.id=v.campaign_id "
     "WHERE c.project_id=:p AND s.status='approved'"),
    ("preview", "Render preview và chạy QC", "/production/editor",
     "SELECT COUNT(*) FROM qc_reports q JOIN variants v ON v.id=q.variant_id JOIN campaigns c ON c.id=v.campaign_id "
     "WHERE c.project_id=:p"),
    ("approve", "Duyệt QC một biến thể", "/review/qc",
     "SELECT COUNT(*) FROM variants v JOIN campaigns c ON c.id=v.campaign_id WHERE c.project_id=:p "
     "AND v.status IN ('APPROVED','RENDERING','COMPLETED')"),
    ("final", "Render final", "/production/batch",
     "SELECT COUNT(*) FROM exports e JOIN variants v ON v.id=e.variant_id JOIN campaigns c ON c.id=v.campaign_id "
     "WHERE c.project_id=:p"),
    ("metrics", "Nhập số liệu hiệu suất", "/analytics",
     "SELECT COUNT(*) FROM metrics m JOIN variants v ON v.id=m.variant_id JOIN campaigns c ON c.id=v.campaign_id "
     "WHERE c.project_id=:p"),
]


@app.get(f"{API}/onboarding")
def onboarding(project_id: str | None = None):
    """Checklist bắt đầu cho tutorial: mỗi bước xong hay chưa, tính từ dữ liệu thật của dự án."""
    if not project_id or not db.q1("SELECT id FROM projects WHERE id=? AND status!='deleted'", (project_id,)):
        steps = [{"key": k, "label": l, "path": path, "done": False} for k, l, path, _ in ONBOARDING]
        return {"project_id": None, "steps": steps, "done": 0, "total": len(steps), "next": steps[0]}
    steps = []
    for k, l, path, sql in ONBOARDING:
        n = db.conn().execute(sql, {"p": project_id}).fetchone()[0] or 0
        steps.append({"key": k, "label": l, "path": path, "done": n > 0, "count": n})
    nxt = next((s for s in steps if not s["done"]), None)
    return {"project_id": project_id, "steps": steps, "done": sum(s["done"] for s in steps), "total": len(steps),
            "next": nxt}


@app.get(f"{API}/flow/{{pid}}")
def flow_status(pid: str):
    """Luồng một cửa: trạng thái gom của dự án để màn Tạo video biết đang ở bước nào."""
    p = get_project(pid)
    camp, prod = p["campaign"], p["product"]
    assets = []
    for a in db.q("SELECT * FROM assets WHERE project_id=? AND media_type='video' ORDER BY created_at", (pid,)):
        job = db.q1("SELECT status, progress, error_code, error_message FROM render_jobs WHERE kind='analysis' AND "
                    "json_extract(profile_json,'$.asset_id')=? ORDER BY created_at DESC LIMIT 1", (a["id"],))
        assets.append({"id": a["id"], "file_name": a["file_name"], "thumbnail": (a["meta_json"] or {}).get("thumbnail"),
                       "duration_ms": (a["meta_json"] or {}).get("duration_ms"), "analysis": job,
                       "speech": " ".join(s["text"] for s in db.q("SELECT text FROM transcript_segments WHERE asset_id=? "
                                                                   "ORDER BY start_ms", (a["id"],)))[:600],
                       "scenes": db.q("SELECT id, idx, start_ms, end_ms, label, tags_json, keyframe, review FROM scenes "
                                      "WHERE asset_id=? ORDER BY idx", (a["id"],))})
    claims = db.q("SELECT c.* FROM claims c JOIN products pr ON pr.id=c.product_id WHERE pr.project_id=? ORDER BY c.created_at",
                  (pid,)) if prod else []
    by_status: dict[str, int] = {}
    if camp:
        for r in db.q("SELECT status, COUNT(*) n FROM variants WHERE campaign_id=? GROUP BY status", (camp["id"],)):
            by_status[r["status"]] = r["n"]
    active = db.q1("SELECT COUNT(*) n FROM render_jobs j LEFT JOIN variants v ON v.id=j.variant_id LEFT JOIN campaigns c "
                   "ON c.id=v.campaign_id WHERE j.status IN ('PENDING','PREPARING','RENDERING','VERIFYING','RETRY_WAIT') AND "
                   "(c.project_id=? OR json_extract(j.profile_json,'$.asset_id') IN (SELECT id FROM assets WHERE project_id=?))",
                   (pid, pid))["n"]
    return {"project": p, "campaign_id": camp["id"] if camp else None, "product_id": prod["id"] if prod else None,
            "assets": assets, "claims": claims, "approved_claims": sum(1 for c in claims if c["status"] == "approved"),
            "variants": by_status, "active_jobs": active, "llm": ai.llm_available(), "asr": pipeline.asr_state(pid),
            "packages": (p["settings_json"] or {}).get("packages")}


@app.post(f"{API}/flow/{{pid}}/auto")
def flow_auto(pid: str):
    """Chế độ AI: làm bước kế tiếp của luồng (giao diện gọi lặp lại cho tới khi tới khâu người chọn video)."""
    get_project(pid)
    try:
        return _auto_tick(pid)
    except RuntimeError as e:
        raise AppError("LLM_SCHEMA_ERROR", "AI chưa xử lý được, sẽ thử lại", hint=str(e)[:200], retryable=True)


def _auto_tick(pid: str) -> dict:
    res = pipeline.auto_advance(pid)
    if res.get("stage") == "done" and not res.get("busy"):
        res["packages"] = _auto_package(pid)
    return res


AUTO_IDLE = ("review", "done", "need_claims", "need_video", "analysis_failed", "error")


def _autopilot_loop() -> None:
    """Bộ tự chạy nền cho các dự án Chế độ AI: thả video xong là máy làm tới cùng, kể cả khi người dùng
    chuyển sang màn khác hay đóng cửa sổ. Dự án đang chờ người quyết thì chỉ ghé lại thưa (30 giây)."""
    next_at: dict[str, float] = {}
    while True:
        time.sleep(3)
        try:
            projs = db.q("SELECT id FROM projects WHERE status='active' AND json_extract(settings_json,'$.mode')='ai'")
        except Exception:  # noqa: BLE001
            continue
        for p in projs:
            if time.time() < next_at.get(p["id"], 0):
                continue
            try:
                res = _auto_tick(p["id"])
                next_at[p["id"]] = time.time() + (30 if res.get("stage") in AUTO_IDLE else 3)
            except Exception as e:  # noqa: BLE001 — một dự án lỗi không được làm dừng các dự án khác
                log.warning("autopilot %s: %s", p["id"][:8], str(e)[:200])
                next_at[p["id"]] = time.time() + 30


def _auto_package(pid: str) -> dict | None:
    """Xuất xong thì tự đóng gói Meta + TikTok một lần cho đúng các video đã xuất (có video mới thì đóng lại)."""
    proj = db.q1("SELECT settings_json FROM projects WHERE id=?", (pid,))
    st = dict(proj["settings_json"] or {})
    ids = sorted(r["variant_id"] for r in library(project_id=pid) if r.get("output_uri"))
    old = st.get("packages") or {}
    if not ids or (old.get("variant_ids") == ids and all(Path(f).exists() for f in (old.get("folders") or {}).values())):
        return old or None
    folders, blocked = {}, 0
    for preset in ("meta_ads", "tiktok_ads"):
        try:
            r = bulk_export({"variant_ids": ids, "preset": preset})
            folders[preset] = r["folder"]
            blocked = max(blocked, len(r.get("blocked_originality") or []))
        except AppError:
            continue
    st["packages"] = {"variant_ids": ids, "folders": folders, "blocked": blocked, "at": db.now()}
    db.update("projects", pid, {"settings_json": st})
    return st["packages"]


class FinishIn(BaseModel):
    variant_ids: list[str] | None = None      # None: dùng mọi bản đang chờ chọn mà máy kiểm tra không thấy lỗi nặng
    render: bool = True                       # False: chỉ chọn, chưa xuất (chế độ Manual chọn từng bản)


AUTO_WAIVE = "Chấp nhận cảnh thay thế vì video nguồn chưa có đúng loại cảnh"


def _accept_for_flow(vid: str) -> None:
    """Chọn dùng một bản. Lỗi duy nhất là thiếu đúng loại cảnh (máy đã thay cảnh khác) thì tự chấp nhận,
    không bắt người dùng gõ lý do miễn trừ; lỗi về lời nói, bản quyền, chính sách vẫn chặn."""
    try:
        pipeline.review(vid, "accept", "local-owner", None)
    except AppError as e:
        if e.code != "QC_CRITICAL":
            raise
        rep = db.q1("SELECT checks_json FROM qc_reports WHERE variant_id=? ORDER BY created_at DESC LIMIT 1", (vid,))
        fails = {k for k, c in (rep["checks_json"] or {}).items() if isinstance(c, dict) and c.get("status") == "fail"}
        if not fails or fails - {"footage"}:
            raise
        pipeline.review(vid, "waive", "local-owner", AUTO_WAIVE)


@app.post(f"{API}/flow/{{pid}}/finish")
def flow_finish(pid: str, data: FinishIn):
    """Một chạm: chọn các bản đạt → xuất bản final. Gói Meta/TikTok tự đóng khi xuất xong (xem _auto_package)."""
    p = get_project(pid)
    camp = p["campaign"]
    if not camp:
        raise not_found("chiến dịch")
    ids = data.variant_ids or [v["id"] for v in db.q("SELECT id FROM variants WHERE campaign_id=? AND status='QC_PENDING'",
                                                     (camp["id"],))]
    pipeline.refresh_originality(camp["id"])
    approved, refused = [], []
    for vid in ids:
        v = db.q1("SELECT code, status FROM variants WHERE id=?", (vid,))
        if not v:
            continue
        if v["status"] == "QC_PENDING":
            try:
                _accept_for_flow(vid)
            except AppError as e:
                refused.append({"variant_id": vid, "code": v["code"], "reason": e.message, "error": e.code})
                continue
        approved.append(vid)
    if not data.render:
        return {"approved": len(approved), "queued": 0, "refused": refused, "blocked_originality": []}
    if data.variant_ids and not approved:
        return {"approved": 0, "queued": 0, "refused": refused, "blocked_originality": []}
    b = create_batch(BatchIn(campaign_id=camp["id"], kind="final", variant_ids=approved if data.variant_ids else None))
    return {"approved": len(approved), "queued": b["queued"], "refused": refused,
            "blocked_originality": b["blocked_originality"]}


@app.post(f"{API}/flow/{{pid}}/redo")
def flow_redo(pid: str):
    """Làm lại bằng AI từ đầu: nghe lại clip (bằng model đang có), lập lại hồ sơ, viết và dựng lại các bản chưa xuất."""
    get_project(pid)
    return pipeline.redo_from_clips(pid)


@app.patch(f"{API}/projects/{{pid}}")
def patch_project(pid: str, data: dict):
    allowed = {k: v for k, v in data.items() if k in ("name", "description", "status", "settings_json")}
    allowed["updated_at"] = db.now()
    db.update("projects", pid, allowed)
    return get_project(pid)


@app.post(f"{API}/projects/{{pid}}/duplicate")
def duplicate_project(pid: str):
    p = get_project(pid)
    return create_project(ProjectIn(name=p["name"] + " (bản sao)", description=p["description"] or "",
                                    product_name=(p["product"] or {}).get("name") or p["name"],
                                    target_count=p["target"] or 10, mode=(p["settings_json"] or {}).get("mode") or "manual"))


@app.delete(f"{API}/projects/{{pid}}")
def delete_project(pid: str, purge_media: bool = False):
    """TC-018: xoá cần xác nhận ở UI; mặc định chỉ đánh dấu deleted, purge_media xoá bản sao media."""
    db.update("projects", pid, {"status": "deleted", "updated_at": db.now()})
    if purge_media:
        shutil.rmtree(config.MEDIA_DIR / pid, ignore_errors=True)
        db.conn().execute("DELETE FROM projects WHERE id=?", (pid,))
    db.log_activity("Đã xoá dự án", pid)
    return {"ok": True}


# ---------------------------------------------------------------- assets (M01)
@app.post(f"{API}/assets/import")
async def import_asset(project_id: str = Form(...), file: UploadFile = File(...), rights: str = Form("own_footage"),
                       allow_duplicate: bool = Form(False)):
    suffix = Path(file.filename or "file").suffix
    media.media_type_of(file.filename or "")
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=config.WORK_DIR) as tmp:
        while chunk := await file.read(1 << 20):
            tmp.write(chunk)
        tmp_path = Path(tmp.name)
    try:
        return pipeline.import_file(project_id, tmp_path, file.filename or tmp_path.name, rights=rights,
                                    allow_duplicate=allow_duplicate)
    finally:
        tmp_path.unlink(missing_ok=True)


class ImportPathIn(BaseModel):
    project_id: str
    path: str
    copy_files: bool = True
    rights: str = "own_footage"


@app.post(f"{API}/assets/import-path")
def import_path(data: ImportPathIn):
    """M01-06: nhập từ đường dẫn file hoặc thư mục (giữ đường dẫn gốc hoặc copy)."""
    p = Path(data.path).expanduser()
    if not p.exists():
        raise AppError("PATH_NOT_FOUND", f"Không tìm thấy {p}", hint="Kiểm tra quyền truy cập thư mục.")
    files_ = [f for f in (sorted(p.iterdir()) if p.is_dir() else [p]) if f.is_file() and not f.name.startswith(".")]
    out, errors = [], []
    for f in files_:
        try:
            out.append(pipeline.import_file(data.project_id, f, f.name, copy=data.copy_files, rights=data.rights))
        except AppError as e:
            errors.append({"file": f.name, **e.to_dict()})
    return {"imported": out, "errors": errors}


@app.get(f"{API}/assets")
def list_assets(project_id: str, media_type: str | None = None):
    sql, args = "SELECT * FROM assets WHERE project_id=?", [project_id]
    if media_type:
        sql += " AND media_type=?"
        args.append(media_type)
    rows = db.q(sql + " ORDER BY created_at", args)
    for r in rows:
        r["scene_count"] = db.q1("SELECT COUNT(*) n FROM scenes WHERE asset_id=?", (r["id"],))["n"]
        if r.get("meta_json"):
            r["meta_json"].pop("waveform", None)
    return rows


@app.get(f"{API}/assets/{{aid}}")
def get_asset(aid: str):
    a = db.q1("SELECT * FROM assets WHERE id=?", (aid,))
    if not a:
        raise not_found("tư liệu")
    a["scenes"] = db.q("SELECT * FROM scenes WHERE asset_id=? ORDER BY start_ms", (aid,))
    a["transcript"] = db.q("SELECT * FROM transcript_segments WHERE asset_id=? ORDER BY start_ms", (aid,))
    a["jobs"] = db.q("SELECT * FROM render_jobs WHERE json_extract(profile_json,'$.asset_id')=? ORDER BY created_at DESC LIMIT 5", (aid,))
    return a


@app.patch(f"{API}/assets/{{aid}}")
def patch_asset(aid: str, data: dict):
    allowed = {k: v for k, v in data.items() if k in ("tags_json", "rights", "file_name")}
    return db.update("assets", aid, allowed)


@app.delete(f"{API}/assets/{{aid}}")
def delete_asset(aid: str):
    a = db.q1("SELECT * FROM assets WHERE id=?", (aid,))
    if a and str(config.MEDIA_DIR) in a["uri"]:
        Path(a["uri"]).unlink(missing_ok=True)
    shutil.rmtree(config.PROXY_DIR / aid, ignore_errors=True)
    db.conn().execute("DELETE FROM assets WHERE id=?", (aid,))
    return {"ok": True}


# ---------------------------------------------------------------- analysis (M03)
class AnalysisIn(BaseModel):
    asset_id: str
    scene_detect: bool = True
    asr: bool = True
    ocr: bool = True
    quality: bool = True
    threshold: float = 0.3


@app.post(f"{API}/analysis/jobs")
def analysis_job(data: AnalysisIn):
    return pipeline.enqueue("analysis", profile=data.model_dump(), priority=2)


@app.get(f"{API}/scenes")
def list_scenes(asset_id: str | None = None, project_id: str | None = None):
    if asset_id:
        return db.q("SELECT * FROM scenes WHERE asset_id=? ORDER BY start_ms", (asset_id,))
    if project_id:
        return db.q("SELECT s.*, a.file_name FROM scenes s JOIN assets a ON a.id=s.asset_id WHERE a.project_id=? "
                    "ORDER BY a.created_at, s.start_ms", (project_id,))
    raise AppError("BAD_QUERY", "Cần asset_id hoặc project_id")


@app.patch(f"{API}/scenes/{{sid}}")
def patch_scene(sid: str, data: dict):
    allowed = {k: v for k, v in data.items() if k in ("label", "tags_json", "locked", "review", "start_ms", "end_ms")}
    return db.update("scenes", sid, allowed)


@app.post(f"{API}/scenes/{{sid}}/split")
def split_scene(sid: str, at_ms: int = Query(...)):
    s = db.q1("SELECT * FROM scenes WHERE id=?", (sid,))
    if not s or not (s["start_ms"] < at_ms < s["end_ms"]):
        raise AppError("BAD_SPLIT", "Điểm cắt phải nằm trong cảnh")
    db.update("scenes", sid, {"end_ms": at_ms})
    a = db.q1("SELECT * FROM assets WHERE id=?", (s["asset_id"],))
    kf = media.make_thumbnail(Path(a["uri"]), config.PROXY_DIR / a["id"] / f"scene_split_{db.new_id()[:6]}.jpg",
                              at_ms=(at_ms + s["end_ms"]) // 2)
    new = db.insert("scenes", {"asset_id": s["asset_id"], "idx": s["idx"], "start_ms": at_ms, "end_ms": s["end_ms"],
                               "label": s["label"], "tags_json": s["tags_json"], "quality_json": s["quality_json"],
                               "keyframe": str(kf) if kf else s["keyframe"]})
    return [db.q1("SELECT * FROM scenes WHERE id=?", (sid,)), new]


@app.post(f"{API}/scenes/merge")
def merge_scenes(ids: list[str]):
    sc = [db.q1("SELECT * FROM scenes WHERE id=?", (i,)) for i in ids]
    sc = sorted([s for s in sc if s], key=lambda s: s["start_ms"])
    if len(sc) < 2 or len({s["asset_id"] for s in sc}) != 1:
        raise AppError("BAD_MERGE", "Chọn ≥ 2 cảnh liên tiếp cùng một video")
    first = sc[0]
    tags = sorted({t for s in sc for t in s["tags_json"]})
    db.update("scenes", first["id"], {"end_ms": sc[-1]["end_ms"], "tags_json": tags})
    for s in sc[1:]:
        db.conn().execute("DELETE FROM scenes WHERE id=?", (s["id"],))
    return db.q1("SELECT * FROM scenes WHERE id=?", (first["id"],))


# ---------------------------------------------------------------- products (M02)
class ProductIn(BaseModel):
    project_id: str
    name: str
    sku: str | None = None
    attributes_json: dict = {}


@app.get(f"{API}/products")
def list_products(project_id: str | None = None):
    if project_id:
        return db.q("SELECT * FROM products WHERE project_id=? ORDER BY created_at", (project_id,))
    return db.q("SELECT p.*, pr.name project_name FROM products p JOIN projects pr ON pr.id=p.project_id ORDER BY p.updated_at DESC")


@app.post(f"{API}/products")
def create_product(p: ProductIn):
    return db.insert("products", {**p.model_dump(), "created_at": db.now(), "updated_at": db.now()})


@app.get(f"{API}/products/{{pid}}")
def get_product(pid: str):
    b = pipeline.product_bundle(pid)
    b["audit"] = pipeline.audit_product(pid)
    b["versions"] = db.q("SELECT id, version, created_at FROM product_versions WHERE product_id=? ORDER BY version DESC", (pid,))
    return b


@app.put(f"{API}/products/{{pid}}")
def put_product(pid: str, data: dict):
    p = db.q1("SELECT * FROM products WHERE id=?", (pid,))
    if not p:
        raise not_found("sản phẩm")
    upd = {k: v for k, v in data.items() if k in ("name", "sku", "attributes_json", "status")}
    patch = data.get("attributes_patch")
    if isinstance(patch, dict):
        cur = p["attributes_json"] or {}
        if all(cur.get(k, "") == v or (not cur.get(k) and not v) for k, v in patch.items()) and not upd:
            return get_product(pid)                   # không đổi gì thật: không tăng phiên bản, không bắt rà lại video
        upd["attributes_json"] = {**cur, **patch}
    if (upd.get("name") or p["name"]) != p["name"]:      # người tự đặt tên → AI không đặt lại nữa
        upd["attributes_json"] = {**(upd.get("attributes_json") or p["attributes_json"] or {}), "name_auto": False}
    if p["locked"]:
        # TC-020: thay đổi sau khi khoá → tăng version, mở khoá và yêu cầu rà soát biến thể bị ảnh hưởng
        upd.update({"version": p["version"] + 1, "locked": 0})
        affected = db.q("SELECT v.id FROM variants v JOIN campaigns c ON c.id=v.campaign_id WHERE c.project_id=? AND "
                        "v.status IN ('SCRIPT_APPROVED','STORYBOARD_READY','PREVIEW_READY','QC_PENDING','APPROVED')",
                        (p["project_id"],))
        for v in affected:
            db.update("variants", v["id"], {"status": "NEEDS_REVISION", "updated_at": db.now()})
        db.log_activity(f"Product Brain đổi sang v{p['version'] + 1}: {len(affected)} biến thể cần rà soát",
                        p["project_id"], "warning")
    upd["updated_at"] = db.now()
    db.update("products", pid, upd)
    return get_product(pid)


@app.post(f"{API}/products/{{pid}}/lock")
def lock_product(pid: str):
    return pipeline.lock_product(pid)


@app.post(f"{API}/products/{{pid}}/ai-draft")
def ai_draft_product(pid: str, data: dict):
    """M02-09: AI đề xuất hồ sơ từ ghi chú; kết quả là bản nháp needs_review, cần người xác nhận."""
    notes = data.get("notes", "")
    if not ai.llm_available():
        raise AppError("LLM_UNAVAILABLE", "Chưa có LLM local", hint="Bật Ollama và tải model trong Quản lý mô hình AI.")
    res = ai.generate_json("Trích xuất hồ sơ sản phẩm. Không suy đoán thông tin không có trong ghi chú. Trả JSON.",
                           f"GHI CHÚ:\n{notes}\nTrả JSON {{\"short_description\":str,\"usp\":str,\"usage\":str,"
                           f"\"claims\":[str],\"faqs\":[{{\"q\":str,\"a\":str}}]}}", lambda o: o)
    for c in res.get("claims", [])[:10]:
        db.insert("claims", {"product_id": pid, "text": c, "status": "needs_review", "risk_level": "medium", "created_at": db.now()})
    for f in res.get("faqs", [])[:10]:
        if f.get("q") and f.get("a"):
            db.insert("faqs", {"product_id": pid, "q": f["q"], "a": f["a"], "status": "needs_review", "created_at": db.now()})
    return {"draft": res, "note": "Tất cả claim AI đề xuất ở trạng thái needs_review"}


@app.post(f"{API}/products/{{pid}}/from-clips")
def product_from_clips(pid: str):
    """Luồng Tạo video, bước 2 cách "AI đọc clip": điền hồ sơ + câu được phép nói từ lời thoại/chữ trên hình."""
    try:
        return pipeline.product_from_clips(pid)
    except RuntimeError as e:
        raise AppError("LLM_SCHEMA_ERROR", "AI chưa đọc được clip, thử lại", hint=str(e)[:200], retryable=True)


class ClaimIn(BaseModel):
    text: str
    status: str = "needs_review"
    risk_level: str = "low"
    evidence_id: str | None = None


@app.post(f"{API}/products/{{pid}}/claims")
def add_claim(pid: str, c: ClaimIn):
    if c.status == "approved" and not c.evidence_id:
        raise AppError("EVIDENCE_REQUIRED", "Claim approved phải gắn bằng chứng (KPI-05)", status=422)
    return db.insert("claims", {"product_id": pid, **c.model_dump(), "created_at": db.now()})


@app.put(f"{API}/claims/{{cid}}")
def put_claim(cid: str, c: ClaimIn):
    if c.status == "approved" and not c.evidence_id:
        raise AppError("EVIDENCE_REQUIRED", "Claim approved phải gắn bằng chứng (KPI-05)", status=422)
    return db.update("claims", cid, c.model_dump())


@app.delete(f"{API}/claims/{{cid}}")
def del_claim(cid: str):
    db.conn().execute("DELETE FROM claims WHERE id=?", (cid,))
    return {"ok": True}


@app.post(f"{API}/products/{{pid}}/evidence")
def add_evidence(pid: str, data: dict):
    allowed = {k: data.get(k) for k in ("title", "source_uri", "kind", "excerpt", "page", "version", "expiry", "approver", "status")}
    allowed["title"] = allowed["title"] or "Tài liệu"
    allowed["status"] = allowed["status"] or "checked"
    return db.insert("evidence", {"product_id": pid, **allowed, "created_at": db.now()})


@app.post(f"{API}/products/{{pid}}/evidence/upload")
async def upload_evidence(pid: str, file: UploadFile = File(...)):
    p = db.q1("SELECT * FROM products WHERE id=?", (pid,))
    if not p:
        raise not_found("sản phẩm")
    d = config.MEDIA_DIR / p["project_id"] / "docs"
    d.mkdir(parents=True, exist_ok=True)
    name = Path(file.filename or "doc").name.lstrip(".") or "doc"      # chỉ lấy tên file, bỏ mọi phần đường dẫn
    dest = d / name
    dest.write_bytes(await file.read())
    return db.insert("evidence", {"product_id": pid, "title": name, "source_uri": str(dest),
                                  "kind": Path(dest).suffix.lstrip(".").upper(), "status": "pending", "created_at": db.now()})


@app.delete(f"{API}/evidence/{{eid}}")
def del_evidence(eid: str):
    db.conn().execute("UPDATE claims SET evidence_id=NULL, status=CASE WHEN status='approved' THEN 'needs_review' ELSE status END "
                      "WHERE evidence_id=?", (eid,))
    db.conn().execute("DELETE FROM evidence WHERE id=?", (eid,))
    return {"ok": True}


@app.post(f"{API}/products/{{pid}}/faqs")
def add_faq(pid: str, data: dict):
    return db.insert("faqs", {"product_id": pid, "q": data["q"], "a": data["a"], "kind": data.get("kind", "faq"),
                              "status": data.get("status", "approved"), "created_at": db.now()})


@app.put(f"{API}/faqs/{{fid}}")
def put_faq(fid: str, data: dict):
    return db.update("faqs", fid, {k: v for k, v in data.items() if k in ("q", "a", "kind", "status")})


@app.put(f"{API}/evidence/{{eid}}")
def put_evidence(eid: str, data: dict):
    return db.update("evidence", eid, {k: v for k, v in data.items() if k in
                                       ("title", "source_uri", "kind", "excerpt", "page", "version", "expiry", "approver", "status")})


@app.delete(f"{API}/faqs/{{fid}}")
def del_faq(fid: str):
    db.conn().execute("DELETE FROM faqs WHERE id=?", (fid,))
    return {"ok": True}


@app.post(f"{API}/products/import")
async def import_products(project_id: str = Form(...), file: UploadFile = File(...)):
    """M02-07: nhập CSV/JSON nhiều SKU (cột: sku,name,category,price,usp,usage,claims ngăn bởi |)."""
    raw = (await file.read()).decode("utf-8-sig", errors="ignore")
    items = json.loads(raw) if (file.filename or "").endswith(".json") else list(csv.DictReader(io.StringIO(raw)))
    out = []
    for it in items:
        attrs = {k: it.get(k, "") for k in ("category", "price", "usp", "usage", "short_description")}
        p = db.insert("products", {"project_id": project_id, "sku": it.get("sku"), "name": it.get("name") or "Sản phẩm",
                                   "attributes_json": attrs, "created_at": db.now(), "updated_at": db.now()})
        for c in str(it.get("claims", "")).split("|"):
            if c.strip():
                db.insert("claims", {"product_id": p["id"], "text": c.strip(), "status": "needs_review", "created_at": db.now()})
        out.append(p)
    return {"imported": len(out)}


# ---------------------------------------------------------------- campaigns & variants (M04/M05)
@app.get(f"{API}/campaigns")
def list_campaigns(project_id: str | None = None):
    sql = "SELECT c.*, (SELECT COUNT(*) FROM variants v WHERE v.campaign_id=c.id) variants FROM campaigns c"
    return db.q(sql + (" WHERE project_id=?" if project_id else "") + " ORDER BY created_at DESC", (project_id,) if project_id else ())


@app.post(f"{API}/campaigns")
def create_campaign(data: dict):
    return db.insert("campaigns", {"project_id": data["project_id"], "name": data.get("name", "Chiến dịch"),
                                   "brief_json": data.get("brief_json", {}), "target_count": int(data.get("target_count", 10)),
                                   "created_at": db.now()})


@app.get(f"{API}/campaigns/{{cid}}")
def get_campaign(cid: str):
    c = db.q1("SELECT * FROM campaigns WHERE id=?", (cid,))
    if not c:
        raise not_found("chiến dịch")
    ctx = pipeline.campaign_context(cid)
    tags = creative.scene_tag_counts(ctx["scenes"])
    angle_cov = {}
    for k, a in creative.ANGLES.items():
        missing = [t for t in a["needs"] if not tags[t]]
        angle_cov[k] = {"label": a["label"], "group": a["group"], "feasible": not missing, "missing": missing}
    return {**c, "scene_count": len(ctx["scenes"]), "tag_counts": dict(tags), "angle_coverage": angle_cov,
            "approved_claims": sum(1 for x in ctx["claims"] if x["status"] == "approved"),
            "product": ctx["product"], "options": {"audiences": creative.AUDIENCES, "angles": creative.ANGLES,
                                                   "narratives": creative.NARRATIVES, "formats": creative.FORMATS,
                                                   "durations": creative.DURATIONS}}


@app.put(f"{API}/campaigns/{{cid}}")
def put_campaign(cid: str, data: dict):
    upd = {k: v for k, v in data.items() if k in ("name", "brief_json", "target_count", "status")}
    db.update("campaigns", cid, upd)
    return get_campaign(cid)


@app.get(f"{API}/campaigns/{{cid}}/plan")
def campaign_plan(cid: str, target: int = Query(0, ge=0, le=5000)):
    """Kế hoạch dạng cây + ước tính thời gian/dung lượng trước khi sinh lô lớn (GĐ2)."""
    c = db.q1("SELECT target_count FROM campaigns WHERE id=?", (cid,)) or not_found("chiến dịch")
    return scale.estimate_plan(cid, target or c["target_count"])


@app.get(f"{API}/campaigns/{{cid}}/hooks")
def hooks_list(cid: str, angle: str | None = None, status: str | None = "active"):
    return {"items": scale.list_hooks(cid, angle, status or None), "reuse_max": scale.HOOK_REUSE_MAX, "sim_max": scale.HOOK_SIM_MAX}


@app.post(f"{API}/campaigns/{{cid}}/hooks/generate")
def hooks_generate(cid: str, data: dict | None = None):
    data = data or {}
    return scale.generate_hooks(cid, data.get("angle"), int(data.get("n", 10)), data.get("use_llm", True))


@app.post(f"{API}/campaigns/{{cid}}/hooks")
def hooks_add(cid: str, data: dict):
    """Thêm hook tay — vẫn qua claim gate, cổng chính sách và chống trùng."""
    ctx = pipeline.campaign_context(cid)
    kept, rejected = scale.filter_hooks([str(data.get("text", ""))], [h["text"] for h in scale.list_hooks(cid, status=None)],
                                        ctx, ctx["industry"], ctx["platforms"])
    if not kept:
        raise AppError("HOOK_REJECTED", "Hook bị từ chối: " + ", ".join(rejected), status=422, details=dict(rejected))
    return db.insert("hooks", {"campaign_id": cid, "angle": data.get("angle"), "text": kept[0], "source": "manual",
                               "created_at": db.now()})


@app.delete(f"{API}/hooks/{{hid}}")
def hooks_delete(hid: str):
    db.conn().execute("UPDATE hooks SET status='retired' WHERE id=?", (hid,))
    return {"ok": True}


@app.get(f"{API}/campaigns/{{cid}}/learnings")
def campaign_learnings(cid: str, kpi: str = "ctr"):
    return scale.learnings(cid, kpi)


@app.post(f"{API}/campaigns/{{cid}}/variants/next-batch")
def next_batch(cid: str, data: dict | None = None):
    """GĐ3: lô kế tiếp từ yếu tố thắng (ma trận có trọng số, hook thắng ưu tiên, một phần hook mới để khám phá)."""
    data = data or {}
    return scale.next_batch(cid, int(data.get("target", 20)), data.get("kpi", "ctr"), float(data.get("explore", 0.2)),
                            data.get("use_llm", True))


@app.post(f"{API}/campaigns/{{cid}}/originality")
def recompute_originality(cid: str):
    res = scale.update_originality(cid)
    return {"computed": len(res), "below_min": sum(1 for r in res.values() if not r["pass"]), "min": scale.originality_min()}


@app.get(f"{API}/scale/options")
def scale_options():
    return {"industries": policy.INDUSTRIES, "platforms": policy.PLATFORMS, "formats": creative.FORMATS,
            "voices": scale.voice_options(), "voice_rates": scale.VOICE_RATES, "music": scale.music_library(),
            "music_dir": str(scale.MUSIC_DIR), "fonts": [Path(f).stem for f in scale.FONT_VARIANTS],
            "originality_min": scale.originality_min(), "hook_reuse_max": scale.HOOK_REUSE_MAX,
            "source_gate": [{"target_over": t, "assets": a, "scenes": s} for t, a, s in scale.SOURCE_GATE],
            "policy_rules": [{"code": r["code"], "severity": r["severity"], "message": r["message"], "ref": r["ref"],
                              "industries": sorted(r["industries"]) if r["industries"] else None,
                              "platforms": sorted(r["platforms"])} for r in policy.RULES]}


@app.post(f"{API}/campaigns/{{cid}}/variants/generate")
def gen_variants(cid: str, data: dict | None = None):
    data = data or {}
    return pipeline.generate_variants(cid, target=data.get("target"), new_batch=bool(data.get("new_batch", False)))


def _variant_row(v: dict) -> dict:
    s = pipeline.latest_script(v["id"])
    qc = db.q1("SELECT severity, checks_json, decision FROM qc_reports WHERE variant_id=? ORDER BY created_at DESC LIMIT 1", (v["id"],))
    out = db.q1("SELECT output_uri, manifest_json FROM exports WHERE variant_id=? ORDER BY created_at DESC LIMIT 1", (v["id"],))
    job = db.q1("SELECT kind, status, progress, error_code, error_message FROM render_jobs WHERE variant_id=? AND kind IN "
                "('preview','final') ORDER BY created_at DESC LIMIT 1", (v["id"],))
    c = v["concept_json"]
    return {**v, "angle_label": creative.ANGLES.get(c.get("angle"), {}).get("label", c.get("angle")),
            "audience_label": creative.AUDIENCES.get(c.get("audience"), c.get("audience")),
            "narrative_label": creative.NARRATIVES.get(c.get("narrative"), c.get("narrative")),
            "format_label": creative.FORMATS.get(c.get("format"), c.get("format")),
            "script": {"id": s["id"], "version": s["version"], "title": s["title"], "status": s["status"], "engine": s["engine"],
                       "hook": (s["beats_json"]["beats"] or [{}])[0].get("text"),
                       "flags": len(s["beats_json"].get("flags", [])), "est_seconds": s["beats_json"].get("est_seconds")} if s else None,
            "qc": qc, "export": out, "last_job": job}


@app.get(f"{API}/campaigns/{{cid}}/variants")
def list_variants(cid: str, status: str | None = None, angle: str | None = None, q: str | None = None,
                  page: int = 1, size: int = 50):
    sql, args = "SELECT * FROM variants WHERE campaign_id=?", [cid]
    if status:
        sql += f" AND status IN ({','.join('?' * len(status.split(',')))})"
        args += status.split(",")
    if angle:
        sql += " AND json_extract(concept_json,'$.angle')=?"
        args.append(angle)
    if q:
        sql += " AND (code LIKE ? OR concept_json LIKE ?)"
        args += [f"%{q}%", f"%{q}%"]
    total = db.q1(sql.replace("SELECT *", "SELECT COUNT(*) n"), args)["n"]
    rows = db.q(sql + " ORDER BY code LIMIT ? OFFSET ?", args + [size, (page - 1) * size])
    return {"total": total, "page": page, "size": size, "items": [_variant_row(v) for v in rows]}


@app.get(f"{API}/campaigns/{{cid}}/variants.csv")
def variants_csv(cid: str):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["code", "audience", "angle", "narrative", "duration", "format", "score", "cluster", "status", "hook"])
    for v in list_variants(cid, size=10000)["items"]:
        c = v["concept_json"]
        w.writerow([v["code"], v["audience_label"], v["angle_label"], v["narrative_label"], c["duration"], v["format_label"],
                    v["score"], v["similarity_group"], v["status"], (v["script"] or {}).get("hook", "")])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename=matrix_{cid[:8]}.csv"})


@app.post(f"{API}/campaigns/{{cid}}/scripts/generate")
def gen_scripts_batch(cid: str, data: dict | None = None):
    data = data or {}
    ids = data.get("variant_ids") or [v["id"] for v in db.q("SELECT id FROM variants WHERE campaign_id=? AND status IN "
                                                             "('DRAFT','NEEDS_REVISION')", (cid,))]
    jobs = [pipeline.enqueue("script", variant_id=i, profile={"use_llm": data.get("use_llm", True)}, priority=4) for i in ids]
    return {"queued": len(jobs)}


@app.get(f"{API}/variants/compare")
def compare(a: str, b: str):
    va, vb = get_variant(a), get_variant(b)
    sa, sb_ = va["script_full"], vb["script_full"]
    ta = creative.script_text(sa["beats_json"]["beats"]) if sa else ""
    tb = creative.script_text(sb_["beats_json"]["beats"]) if sb_ else ""
    sca = [c["scene_id"] for c in (va["storyboard"] or {}).get("timeline_json", {}).get("tracks", {}).get("video", [])]
    scb = [c["scene_id"] for c in (vb["storyboard"] or {}).get("timeline_json", {}).get("tracks", {}).get("video", [])]
    struct_a = [x["type"] for x in sa["beats_json"]["beats"]] if sa else []
    struct_b = [x["type"] for x in sb_["beats_json"]["beats"]] if sb_ else []
    return {"a": va, "b": vb, "script_similarity": creative.similarity(ta, tb),
            "hook_similarity": creative.similarity((va["script"] or {}).get("hook") or "", (vb["script"] or {}).get("hook") or ""),
            "same_structure": struct_a == struct_b,
            "scene_overlap": round(len(set(sca) & set(scb)) / len(set(sca) | set(scb)), 2) if sca and scb else 0,
            "same_angle": va["concept_json"]["angle"] == vb["concept_json"]["angle"]}


@app.get(f"{API}/variants/{{vid}}")
def get_variant(vid: str):
    v = db.q1("SELECT * FROM variants WHERE id=?", (vid,))
    if not v:
        raise not_found("biến thể")
    row_ = _variant_row(v)
    row_["script_full"] = pipeline.latest_script(vid)
    row_["storyboard"] = pipeline.latest_storyboard(vid)
    row_["qc_full"] = db.q1("SELECT * FROM qc_reports WHERE variant_id=? ORDER BY created_at DESC LIMIT 1", (vid,))
    row_["approvals"] = db.q("SELECT * FROM approvals WHERE entity_id=? ORDER BY at DESC", (vid,))
    row_["jobs"] = db.q("SELECT * FROM render_jobs WHERE variant_id=? ORDER BY created_at DESC LIMIT 10", (vid,))
    row_["campaign"] = db.q1("SELECT id, name, project_id FROM campaigns WHERE id=?", (v["campaign_id"],))
    return row_


@app.get(f"{API}/variants/{{vid}}/scripts")
def script_history(vid: str):
    return db.q("SELECT * FROM scripts WHERE variant_id=? ORDER BY version DESC", (vid,))


@app.post(f"{API}/variants/{{vid}}/script")
def post_script(vid: str, sync: bool = True, use_llm: bool = True):
    if sync:
        return pipeline.generate_script(vid, use_llm)
    return pipeline.enqueue("script", variant_id=vid, profile={"use_llm": use_llm}, priority=4)


class ScriptPut(BaseModel):
    title: str | None = None
    beats: list[dict]


@app.put(f"{API}/variants/{{vid}}/script")
def put_script(vid: str, s: ScriptPut):
    return pipeline.update_script(vid, s.beats, s.title)


@app.post(f"{API}/variants/{{vid}}/script/approve")
def approve_script(vid: str, reviewer: str = "local-owner"):
    return pipeline.approve_script(vid, reviewer)


@app.post(f"{API}/variants/{{vid}}/storyboard")
def post_storyboard(vid: str):
    return pipeline.build_storyboard(vid)


@app.put(f"{API}/variants/{{vid}}/timeline")
def put_timeline(vid: str, timeline: dict):
    return pipeline.save_timeline(vid, timeline)


@app.post(f"{API}/variants/{{vid}}/voice")
def post_voice(vid: str, data: dict | None = None):
    return pipeline.enqueue("voice", variant_id=vid, profile={"voice": (data or {}).get("voice")}, priority=3)


@app.post(f"{API}/variants/{{vid}}/preview")
def post_preview(vid: str, data: dict | None = None):
    return pipeline.enqueue("preview", variant_id=vid, profile=data or {}, priority=3)


@app.post(f"{API}/variants/{{vid}}/qc")
def post_qc(vid: str):
    last = db.q1("SELECT output_uri FROM render_jobs WHERE variant_id=? AND kind='preview' AND status='COMPLETED' "
                 "ORDER BY finished_at DESC LIMIT 1", (vid,))
    res = None
    if last and last["output_uri"]:
        res = {"video": last["output_uri"], "thumbnail": str(Path(last["output_uri"]).with_suffix(".jpg"))}
    return pipeline.run_qc(vid, res)


class ApprovalIn(BaseModel):
    decision: str                     # accept | revise | reject | waive
    reason: str | None = None
    reviewer: str = "local-owner"


@app.post(f"{API}/variants/{{vid}}/approval")
def post_approval(vid: str, a: ApprovalIn):
    return pipeline.review(vid, a.decision, a.reviewer, a.reason)


@app.post(f"{API}/variants/bulk-approval")
def bulk_approval(data: dict):
    ok, errors = [], []
    for vid in data.get("variant_ids", []):
        try:
            pipeline.review(vid, data["decision"], data.get("reviewer", "local-owner"), data.get("reason"))
            ok.append(vid)
        except AppError as e:
            errors.append({"variant_id": vid, **e.to_dict()})
    return {"ok": ok, "errors": errors}


# ---------------------------------------------------------------- templates & brand (M08)
@app.get(f"{API}/templates")
def list_templates():
    return db.q("SELECT * FROM templates ORDER BY category")


@app.post(f"{API}/templates")
def create_template(data: dict):
    return db.insert("templates", {"org_id": "org-default", "name": data["name"], "category": data.get("category", "Custom"),
                                   "version": 1, "template_json": data.get("template_json", {}), "status": "draft",
                                   "created_at": db.now()})


@app.put(f"{API}/templates/{{tid}}")
def put_template(tid: str, data: dict):
    t = db.q1("SELECT * FROM templates WHERE id=?", (tid,))
    if not t:
        raise not_found("template")
    return db.update("templates", tid, {"template_json": data.get("template_json", t["template_json"]),
                                        "name": data.get("name", t["name"]), "category": data.get("category", t["category"]),
                                        "version": t["version"] + 1})


@app.post(f"{API}/campaigns/{{cid}}/template")
def apply_template(cid: str, data: dict):
    c = db.q1("SELECT * FROM campaigns WHERE id=?", (cid,))
    brief = {**(c["brief_json"] or {}), "template_id": data["template_id"]}
    db.update("campaigns", cid, {"brief_json": brief})
    return {"ok": True}


@app.get(f"{API}/brands")
def brands():
    org = db.q1("SELECT * FROM organizations WHERE id='org-default'")
    return org["brand_settings_json"]


@app.put(f"{API}/brands")
def put_brand(kit: dict):
    org = db.q1("SELECT * FROM organizations WHERE id='org-default'")
    bs = org["brand_settings_json"]
    kit.setdefault("id", f"brand-{db.new_id()[:6]}")
    kits = [k for k in bs["kits"] if k["id"] != kit["id"]] + [kit]
    bs = {**bs, "kits": kits}
    db.update("organizations", "org-default", {"brand_settings_json": bs})
    if bs.get("active") == kit["id"]:
        db.set_setting("brand_active", kit)
    return bs


@app.post(f"{API}/brands/{{bid}}/logo")
async def upload_logo(bid: str, file: UploadFile = File(...)):
    """Logo PNG/JPG cho Brand Kit — render chèn góc trên trái + thẻ kết."""
    if not (file.content_type or "").startswith("image/"):
        raise AppError("LOGO_TYPE", "Logo phải là ảnh PNG/JPG/WebP", status=415)
    org = db.q1("SELECT * FROM organizations WHERE id='org-default'")
    bs = org["brand_settings_json"]
    kit = next((k for k in bs["kits"] if k["id"] == bid), None)
    if not kit:
        raise not_found("brand kit")
    d = config.DATA_DIR / "brand"
    d.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "logo.png").suffix.lower() or ".png"
    dest = d / f"{bid}{ext}"
    dest.write_bytes(await file.read())
    kit = {**kit, "logo": str(dest)}
    bs = {**bs, "kits": [k for k in bs["kits"] if k["id"] != bid] + [kit]}
    db.update("organizations", "org-default", {"brand_settings_json": bs})
    if bs.get("active") == bid:
        db.set_setting("brand_active", kit)
    return kit


@app.post(f"{API}/brands/{{bid}}/activate")
def activate_brand(bid: str):
    org = db.q1("SELECT * FROM organizations WHERE id='org-default'")
    bs = org["brand_settings_json"]
    kit = next((k for k in bs["kits"] if k["id"] == bid), None)
    if not kit:
        raise not_found("brand kit")
    db.update("organizations", "org-default", {"brand_settings_json": {**bs, "active": bid}})
    db.set_setting("brand_active", kit)
    return {**bs, "active": bid}


# ---------------------------------------------------------------- chế độ Tin tức
from . import factory, looks, music, news  # noqa: E402

app.include_router(news.router, prefix=API)
app.include_router(music.router, prefix=API)
app.include_router(factory.router, prefix=API)
app.include_router(looks.router, prefix=API)
news.recover()
factory.start()


# ---------------------------------------------------------------- voice (M07)
@app.get(f"{API}/voice/providers")
def voice_providers():
    return {"providers": tts.providers(), "lexicon": tts.DEFAULT_LEXICON, "default": db.get_setting("voice_default"),
            "presets": tts.voice_server().get("presets") or []}


@app.post(f"{API}/voice/sample")
def voice_sample(data: dict):
    """Nghe thử một giọng dựng sẵn (câu mẫu cố định nên lần sau phát lại ngay từ bộ nhớ đệm)."""
    name = (data or {}).get("name")
    if name not in [x["name"] for x in tts.voice_server().get("presets") or []]:
        raise AppError("BAD_VOICE_NAME", "Không có giọng dựng sẵn này", status=422)
    wav, dur = tts.synth("Chào anh chị, đây là giọng đọc thử cho video của anh chị.",
                         {"provider": "vieneu_preset", "voice": name, "rate": 1.0, "lufs": db.get_setting("loudness_lufs", -16)})
    return {"path": str(wav), "duration_ms": dur, "name": name}


@app.get(f"{API}/campaigns/{{cid}}/voice")
def campaign_voice_get(cid: str):
    c = db.q1("SELECT brief_json, project_id FROM campaigns WHERE id=?", (cid,)) or not_found("chiến dịch")
    ch = (c["brief_json"] or {}).get("voice_choice") or {}
    if ch.get("mode") not in pipeline.VOICE_MODES:          # lựa chọn cũ không còn được hỗ trợ thì coi như giọng máy
        ch = {"mode": "os"}
    return {"choice": ch, "server": tts.voice_server(),
            "consent_text": pipeline.CONSENT_TEXT}


@app.post(f"{API}/campaigns/{{cid}}/voice")
def campaign_voice_set(cid: str, data: dict):
    """Chọn giọng đọc cho cả chiến dịch: giọng máy / giọng có sẵn / nhái giọng người nói trong clip.
    Giọng nhái bắt buộc xác nhận người nói đã đồng ý; đổi giọng thì các bản chưa xuất được dựng lại."""
    return pipeline.set_campaign_voice(cid, data.get("mode", "os"), bool(data.get("consent")), data.get("asset_id"),
                                       name=data.get("name"))


@app.post(f"{API}/campaigns/{{cid}}/voice/test")
def campaign_voice_test(cid: str, data: dict | None = None):
    """Nghe thử giọng chiến dịch với một câu."""
    text = ((data or {}).get("text") or "Xin chào, đây là giọng đọc thử cho video của bạn.").strip()[:300]
    settings = {"lufs": db.get_setting("loudness_lufs", -16), **(db.get_setting("voice_default", {}) or {}),
                **pipeline.campaign_voice(cid)}
    wav, dur = tts.synth(text, settings)
    return {"path": str(wav), "duration_ms": dur, "provider": settings.get("provider")}


@app.post(f"{API}/voice/preview")
def voice_preview(data: dict):
    text = (data.get("text") or "").strip()
    if not text:
        raise AppError("TEXT_EMPTY", "Nhập văn bản để nghe thử")
    wav, dur = tts.synth(text, data.get("settings") or {})
    return {"uri": str(wav), "duration_ms": dur, "waveform": media.waveform(wav, 300),
            "words": tts.word_timing({"text": text, "start_ms": 0, "end_ms": dur}),
            "normalized": tts.normalize_text(text, (data.get("settings") or {}).get("lexicon"))}


# ---------------------------------------------------------------- render queue (M09)
class BatchIn(BaseModel):
    campaign_id: str
    variant_ids: list[str] | None = None
    idempotency_key: str | None = None
    priority: int = 5
    prefix: str = ""
    gpu: bool = True
    kind: str = "final"


@app.post(f"{API}/render/batches")
def create_batch(b: BatchIn):
    if b.idempotency_key:
        ex = db.q1("SELECT * FROM render_batches WHERE idempotency_key=?", (b.idempotency_key,))
        if ex:
            return {"batch": ex, "queued": db.q1("SELECT COUNT(*) n FROM render_jobs WHERE batch_id=?", (ex["id"],))["n"],
                    "idempotent": True}
    status = "('APPROVED','FAILED')" if b.kind == "final" else "('STORYBOARD_READY','PREVIEW_READY')"
    ids = b.variant_ids or [v["id"] for v in db.q(f"SELECT id FROM variants WHERE campaign_id=? AND status IN {status}",
                                                  (b.campaign_id,))]
    blocked_orig: list[dict] = []
    if b.kind == "final":
        ok = {v["id"] for v in db.q(f"SELECT id FROM variants WHERE id IN ({','.join('?' * len(ids))}) AND status IN "
                                    "('APPROVED','FAILED','COMPLETED','RENDERING')", ids)} if ids else set()
        skipped = [i for i in ids if i not in ok]
        ids = [i for i in ids if i in ok]
        for i in list(ids):                      # cổng nguyên bản: không render final bản quá giống bản khác
            o = scale.originality_block(i)
            if o:
                blocked_orig.append({"variant_id": i, "score": o["score"], "nearest": o.get("nearest")})
                ids.remove(i)
    else:
        skipped = []
    batch = db.insert("render_batches", {"campaign_id": b.campaign_id, "idempotency_key": b.idempotency_key,
                                         "name": f"Batch {time.strftime('%d/%m %H:%M')}",
                                         "profile_json": b.model_dump(), "created_at": db.now()})
    for vid in ids:
        pipeline.enqueue(b.kind, variant_id=vid, profile={"prefix": b.prefix, "gpu": b.gpu}, priority=b.priority,
                         batch_id=batch["id"])
    return {"batch": batch, "queued": len(ids), "skipped_not_approved": len(skipped),
            "blocked_originality": blocked_orig}


@app.get(f"{API}/render/batches")
def list_batches(campaign_id: str | None = None, limit: int = 20):
    sql, args = "SELECT * FROM render_batches WHERE 1=1", []
    if campaign_id:
        sql += " AND campaign_id=?"
        args.append(campaign_id)
    out = []
    for b in db.q(sql + " ORDER BY created_at DESC LIMIT ?", args + [limit]):
        st = {r["status"]: r["n"] for r in db.q("SELECT status, COUNT(*) n FROM render_jobs WHERE batch_id=? GROUP BY status", (b["id"],))}
        out.append({**b, "jobs": st, "total": sum(st.values())})
    return out


@app.post(f"{API}/render/batches/{{bid}}/actions")
def batch_action(bid: str, data: dict):
    """Tạm dừng / tiếp tục / huỷ cả lô (GĐ2)."""
    a = data.get("action")
    t = {"pause": ("PAUSED", ("PENDING", "RETRY_WAIT", "PREPARING", "RENDERING")),
         "resume": ("PENDING", ("PAUSED",)),
         "retry": ("PENDING", ("FAILED", "CANCELLED")),
         "cancel": ("CANCELLED", ("PENDING", "RETRY_WAIT", "PREPARING", "RENDERING", "PAUSED"))}.get(a)
    if not t:
        raise AppError("BAD_ACTION", "Hành động không hợp lệ", status=422)
    to, froms = t
    n = db.conn().execute(f"UPDATE render_jobs SET status=?, updated_at=? WHERE batch_id=? AND status IN "
                          f"({','.join('?' * len(froms))})", [to, db.now(), bid, *froms]).rowcount
    return {"batch_id": bid, "action": a, "changed": n}


@app.get(f"{API}/render/jobs")
def render_jobs(status: str | None = None, kind: str | None = None, q: str | None = None, page: int = 1, size: int = 20,
                variant_id: str | None = None, campaign_id: str | None = None):
    sql = ("SELECT j.*, v.code, json_extract(v.concept_json,'$.duration') duration, c.name campaign FROM render_jobs j "
           "LEFT JOIN variants v ON v.id=j.variant_id LEFT JOIN campaigns c ON c.id=v.campaign_id WHERE 1=1")
    args: list[Any] = []
    if status:
        sql += f" AND j.status IN ({','.join('?' * len(status.split(',')))})"
        args += status.split(",")
    if kind:
        sql += f" AND j.kind IN ({','.join('?' * len(kind.split(',')))})"
        args += kind.split(",")
    if q:
        sql += " AND (j.id LIKE ? OR v.code LIKE ?)"
        args += [f"%{q}%", f"%{q}%"]
    if variant_id:
        sql += " AND j.variant_id=?"
        args.append(variant_id)
    if campaign_id:
        sql += " AND v.campaign_id=?"
        args.append(campaign_id)
    total = db.q1(f"SELECT COUNT(*) n FROM ({sql})", args)["n"]
    items = db.q(sql + " ORDER BY CASE j.status WHEN 'RENDERING' THEN 0 WHEN 'PREPARING' THEN 1 WHEN 'PENDING' THEN 2 "
                       "WHEN 'RETRY_WAIT' THEN 3 WHEN 'PAUSED' THEN 4 ELSE 5 END, j.updated_at DESC LIMIT ? OFFSET ?",
                 args + [size, (page - 1) * size])
    return {"total": total, "items": items, "stats": queue_stats()}


def queue_stats() -> dict:
    st = {r["status"]: r["n"] for r in db.q("SELECT status, COUNT(*) n FROM render_jobs GROUP BY status")}
    done = db.q("SELECT started_at, finished_at FROM render_jobs WHERE status='COMPLETED' AND kind IN ('final','preview') "
                "AND started_at IS NOT NULL ORDER BY finished_at DESC LIMIT 20")
    durs = []
    for d in done:
        try:
            from datetime import datetime
            durs.append((datetime.fromisoformat(d["finished_at"]) - datetime.fromisoformat(d["started_at"])).total_seconds())
        except (TypeError, ValueError):
            pass
    avg = sum(durs) / len(durs) if durs else None
    remaining = sum(st.get(s, 0) for s in ("PENDING", "RETRY_WAIT", "PREPARING", "RENDERING"))
    parallel = int(db.get_setting("parallel_jobs", 2) or 2)
    hourly = db.q("SELECT substr(finished_at,12,2) h, COUNT(*) n FROM render_jobs WHERE status='COMPLETED' AND "
                  "finished_at >= datetime('now','-8 hour') GROUP BY h ORDER BY h")
    errors = db.q("SELECT error_code, COUNT(*) n FROM render_jobs WHERE status IN ('FAILED','RETRY_WAIT') AND error_code IS NOT NULL "
                  "GROUP BY error_code ORDER BY n DESC LIMIT 5")
    return {"by_status": st, "total": sum(st.values()), "avg_seconds": round(avg, 1) if avg else None,
            "eta_seconds": round(avg * remaining / parallel) if avg else None, "remaining": remaining, "hourly": hourly,
            "errors": errors, "per_hour": round(3600 / avg * parallel, 1) if avg else None}


class JobAction(BaseModel):
    action: str


@app.post(f"{API}/render/jobs/{{jid}}/actions")
def job_action(jid: str, a: JobAction):
    j = db.q1("SELECT * FROM render_jobs WHERE id=?", (jid,))
    if not j:
        raise not_found("job")
    t = {"pause": ("PAUSED", ("PENDING", "RETRY_WAIT", "PREPARING", "RENDERING")),
         "resume": ("PENDING", ("PAUSED",)),
         "retry": ("PENDING", ("FAILED", "CANCELLED", "RETRY_WAIT")),
         "cancel": ("CANCELLED", ("PENDING", "RETRY_WAIT", "PREPARING", "RENDERING", "PAUSED", "FAILED"))}.get(a.action)
    if not t:
        raise AppError("BAD_ACTION", "Hành động không hợp lệ")
    if j["status"] not in t[1]:
        raise AppError("INVALID_STATE", f"Không thể {a.action} khi job đang {j['status']}", status=409)
    extra = {"attempts": 0, "error_code": None, "error_message": None, "next_attempt_at": None} if a.action == "retry" else {}
    return db.update("render_jobs", jid, {"status": t[0], "updated_at": db.now(), **extra})


@app.post(f"{API}/render/actions")
def queue_action(a: JobAction):
    c = db.conn()
    if a.action == "pause_all":
        n = c.execute("UPDATE render_jobs SET status='PAUSED', updated_at=? WHERE status IN ('PENDING','RETRY_WAIT','PREPARING',"
                      "'RENDERING')", (db.now(),)).rowcount
    elif a.action == "resume_all":
        n = c.execute("UPDATE render_jobs SET status='PENDING', updated_at=? WHERE status='PAUSED'", (db.now(),)).rowcount
    elif a.action == "retry_failed":
        n = c.execute("UPDATE render_jobs SET status='PENDING', attempts=0, error_code=NULL, error_message=NULL, updated_at=? "
                      "WHERE status='FAILED'", (db.now(),)).rowcount
    elif a.action == "clear_completed":
        n = c.execute("DELETE FROM render_jobs WHERE status IN ('COMPLETED','CANCELLED')").rowcount
    else:
        raise AppError("BAD_ACTION", "Hành động không hợp lệ")
    return {"affected": n}


@app.get(f"{API}/render/events")
async def render_events(request: Request):
    """Server-Sent Events tiến độ hàng đợi."""
    async def gen():
        last = None
        while not await request.is_disconnected():
            items = db.q("SELECT id, status, progress, kind, variant_id, error_code FROM render_jobs WHERE "
                         "updated_at >= datetime('now','-1 hour') OR status IN ('PENDING','RENDERING','PREPARING') "
                         "ORDER BY updated_at DESC LIMIT 50")
            payload = json.dumps({"jobs": items, "stats": queue_stats()["by_status"]}, ensure_ascii=False)
            if payload != last:
                yield f"data: {payload}\n\n"
                last = payload
            await asyncio.sleep(1)
    return StreamingResponse(gen(), media_type="text/event-stream")


# ---------------------------------------------------------------- library & exports (M11)
@app.get(f"{API}/library")
def library(project_id: str | None = None, q: str | None = None, status: str | None = None):
    sql = ("SELECT e.*, v.code, v.status vstatus, v.concept_json, v.campaign_id, c.name campaign, c.project_id FROM exports e "
           "JOIN variants v ON v.id=e.variant_id JOIN campaigns c ON c.id=v.campaign_id WHERE 1=1")
    args: list[Any] = []
    if project_id:
        sql += " AND c.project_id=?"
        args.append(project_id)
    if q:
        sql += " AND (v.code LIKE ? OR e.manifest_json LIKE ?)"
        args += [f"%{q}%", f"%{q}%"]
    rows = db.q(sql + " ORDER BY e.created_at DESC", args)
    seen, out = set(), []
    for r in rows:                         # bản mới nhất mỗi biến thể
        if r["variant_id"] in seen:
            continue
        seen.add(r["variant_id"])
        p = Path(r["output_uri"])
        r["exists"] = p.exists()
        r["size_bytes"] = p.stat().st_size if p.exists() else 0
        r["angle_label"] = creative.ANGLES.get((r["concept_json"] or {}).get("angle"), {}).get("label")
        out.append(r)
    return out


AD_SPECS = {   # tổng hợp từ tài liệu spec quảng cáo video (Meta Reels/Stories, TikTok In-Feed) — kiểm tra kỹ thuật, không thay nền tảng
    "generic": {"label": "Gói chung", "max_s": 600, "min_s": 1, "max_mb": 4000, "aspects": None},
    "meta_ads": {"label": "Meta Ads (Reels/Stories/Feed)", "max_s": 60, "min_s": 1, "max_mb": 4000,
                 "aspects": {"9:16", "1:1", "4:5"}, "note": "Reels/Stories khuyến nghị ≤60s, 9:16 1080×1920"},
    "tiktok_ads": {"label": "TikTok Ads (In-Feed)", "max_s": 60, "min_s": 5, "max_mb": 500, "aspects": {"9:16", "1:1", "16:9"},
                   "note": "In-Feed 5–60s, ≥540×960, ≤500MB; chữ tránh vùng UI đáy/phải"},
}


def _slug(s: str, n: int = 24) -> str:
    import unicodedata
    t = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    t = "".join(ch if ch.isalnum() else "-" for ch in t.lower()).strip("-")
    while "--" in t:
        t = t.replace("--", "-")
    return t[:n].strip("-") or "x"


def _spec_issues(preset: dict, m: dict, size_mb: float, res_w: int, res_h: int, ui_overlap: int) -> list[str]:
    issues = []
    dur = (m.get("duration_ms") or 0) / 1000
    if dur > preset["max_s"]:
        issues.append(f"dài {dur:.0f}s > {preset['max_s']}s")
    if dur < preset["min_s"]:
        issues.append(f"ngắn {dur:.0f}s < {preset['min_s']}s")
    if size_mb > preset["max_mb"]:
        issues.append(f"{size_mb:.0f}MB > {preset['max_mb']}MB")
    if preset["aspects"] and res_w and res_h:
        asp = media.aspect_label(res_w, res_h) if hasattr(media, "aspect_label") else None
        if asp and asp not in preset["aspects"]:
            issues.append(f"tỷ lệ {asp} không nằm trong {sorted(preset['aspects'])}")
    if res_h and res_h < 960:
        issues.append(f"độ phân giải {res_w}×{res_h} thấp (<960 cao)")
    if ui_overlap and preset is AD_SPECS["tiktok_ads"]:
        issues.append(f"{ui_overlap} khối chữ chạm vùng UI TikTok")
    return issues


@app.post(f"{API}/exports")
def bulk_export(data: dict):
    """M11-03 + GĐ2: gom MP4 + SRT + thumbnail + manifest; preset Ads Manager đặt tên theo quy ước, kèm ads_mapping.csv
    (ad_name, hook, góc, khán giả, UTM, caption) và kiểm tra spec. Không đăng tự động."""
    ids = data.get("variant_ids") or []
    preset_key = data.get("preset") or "generic"
    if preset_key not in AD_SPECS:
        raise AppError("BAD_PRESET", f"Preset phải là một trong {list(AD_SPECS)}", status=422)
    preset = AD_SPECS[preset_key]
    rows = [r for r in library(project_id=data.get("project_id")) if not ids or r["variant_id"] in ids]
    if not rows:
        raise AppError("NOTHING_TO_EXPORT", "Chưa có video hoàn tất để xuất")
    dest = config.OUTPUT_DIR / "exports" / time.strftime(f"{preset_key}_%Y%m%d_%H%M%S")
    dest.mkdir(parents=True, exist_ok=True)
    manifest, mapping, blocked = [], [], []
    for r in rows:
        src = Path(r["output_uri"])
        if not src.exists():
            continue
        o = scale.originality_block(r["variant_id"])
        if o:                                            # cổng nguyên bản: không đưa bản quá giống vào gói
            blocked.append({"code": r["code"], "score": o["score"], "nearest": o.get("nearest")})
            continue
        m = r["manifest_json"]
        v = db.q1("SELECT * FROM variants WHERE id=?", (r["variant_id"],))
        c = v["concept_json"]
        s = pipeline.latest_script(v["id"])
        hook = (s["beats_json"]["beats"][0]["text"] if s and s["beats_json"]["beats"] else "")
        cta = next((b.get("on_screen") or b["text"] for b in reversed(s["beats_json"]["beats"]) if b["type"] == "cta"), "") if s else ""
        camp_slug = _slug(r["campaign"], 20)
        ad_name = f"{camp_slug}_{v['code']}_{c.get('angle')}_{c.get('audience')}_{c.get('duration')}s_{_slug(hook, 28)}" \
            if preset_key != "generic" else src.stem
        for ext in (".mp4", ".srt", ".jpg", ".json"):
            f = src.with_suffix(ext)
            if f.exists():
                shutil.copy2(f, dest / (ad_name + ext))
        size_mb = src.stat().st_size / 1e6
        res_w, res_h = (int(x) for x in (m.get("resolution") or "0x0").split("x"))
        issues = _spec_issues(preset, m, size_mb, res_w, res_h, int((m.get("qc") or {}).get("tiktok_ui_overlap", 0) or 0))
        manifest.append({"variant_id": r["variant_id"], "code": r["code"], "file": ad_name + ".mp4", "srt": ad_name + ".srt",
                         "sha256": m.get("sha256"), "duration_ms": m.get("duration_ms"), "angle": r["angle_label"],
                         "caption": m.get("caption"), "disclosure_required": True, "spec_issues": "; ".join(issues)})
        brief = (db.q1("SELECT brief_json FROM campaigns WHERE id=?", (v["campaign_id"],)) or {}).get("brief_json") or {}
        landing = brief.get("landing_url") or ""
        utm = f"utm_source={{platform}}&utm_medium=paid_video&utm_campaign={camp_slug}&utm_content={v['code']}"
        mapping.append({"ad_name": ad_name, "file": ad_name + ".mp4", "code": v["code"], "batch_no": v.get("batch_no", 1),
                        "hook": hook, "angle": c.get("angle"), "audience": c.get("audience"), "narrative": c.get("narrative"),
                        "format": c.get("format"), "duration_s": c.get("duration"), "voice_rate": (c.get("voice") or {}).get("rate"),
                        "music": Path(c["music"]).stem if c.get("music") else "", "primary_text": m.get("caption") or hook,
                        "headline": cta[:40], "call_to_action": cta or "Tìm hiểu thêm",
                        "landing_url": (landing + ("&" if "?" in landing else "?") + utm) if landing else utm,
                        "ai_disclosure": "yes (AI voice)", "spec_ok": "no" if issues else "yes", "spec_issues": "; ".join(issues)})
    if not manifest:
        raise AppError("NOTHING_TO_EXPORT", "Không còn video nào đủ điều kiện xuất", details={"blocked_originality": blocked})
    (dest / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(dest / "manifest.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(manifest[0]))
        w.writeheader()
        w.writerows(manifest)
    with open(dest / "ads_mapping.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(mapping[0]))
        w.writeheader()
        w.writerows(mapping)
    (dest / "README.txt").write_text(
        f"Gói {preset['label']} — {len(manifest)} video.\n{preset.get('note', '')}\n"
        "ads_mapping.csv: mỗi dòng là một quảng cáo (ad_name, primary_text, headline, CTA, landing_url có UTM theo mã biến thể).\n"
        "Tải lên Ads Manager / TikTok Ads Manager thủ công; phần mềm không đăng tự động và không bảo đảm nền tảng chấp thuận.\n"
        "Nhập kết quả về Phân tích bằng CSV (code = mã biến thể) để sinh lô kế tiếp từ yếu tố thắng.\n", encoding="utf-8")
    db.log_activity(f"Xuất gói {preset['label']} {len(manifest)} video → {dest.name}")
    return {"folder": str(dest), "count": len(manifest), "preset": preset_key,
            "spec_issues": sum(1 for m in manifest if m["spec_issues"]), "blocked_originality": blocked}


@app.get(f"{API}/exports/presets")
def export_presets():
    return [{"id": k, **{kk: (sorted(vv) if isinstance(vv, set) else vv) for kk, vv in v.items()}} for k, v in AD_SPECS.items()]


@app.post(f"{API}/system/open-folder")
def open_folder(data: dict):
    p = Path(data.get("path") or config.OUTPUT_DIR)
    target = p if p.is_dir() else p.parent
    if not str(target.resolve()).startswith(str(config.DATA_DIR)) and not str(target.resolve()).startswith(str(config.OUTPUT_DIR)):
        raise AppError("FILE_FORBIDDEN", "Chỉ mở thư mục dữ liệu của ứng dụng", status=403)
    cmd = {"Darwin": ["open"], "Windows": ["explorer"]}.get(__import__("platform").system(), ["xdg-open"])
    subprocess.Popen(cmd + [str(target)])
    return {"ok": True}


# ---------------------------------------------------------------- metrics & analytics (M11-05..08)
@app.post(f"{API}/metrics")
def add_metric(data: dict):
    return db.insert("metrics", {"variant_id": data["variant_id"], "platform": data.get("platform", "tiktok"),
                                 "post_url": data.get("post_url"), "captured_at": data.get("captured_at") or db.now(),
                                 "views": int(data.get("views", 0)), "watch_time": float(data.get("watch_time", 0)),
                                 "hold_3s": data.get("hold_3s"), "completion": data.get("completion"), "ctr": data.get("ctr"),
                                 "conversions": data.get("conversions")})


@app.post(f"{API}/metrics/import")
async def import_metrics(file: UploadFile = File(...), campaign_id: str | None = Form(None)):
    """CSV: code,platform,date,views,watch_time,hold_3s,completion,ctr,conversions,post_url"""
    raw = (await file.read()).decode("utf-8-sig", errors="ignore")
    n, missing, ambiguous = 0, [], []
    for r in csv.DictReader(io.StringIO(raw)):
        code = (r.get("code") or "").strip()
        cands = db.q("SELECT id FROM variants WHERE code=?" + (" AND campaign_id=?" if campaign_id else ""),
                     (code, campaign_id) if campaign_id else (code,))
        if not cands:
            missing.append(code)
            continue
        if len(cands) > 1:                     # mã trùng giữa các chiến dịch: không đoán
            ambiguous.append(code)
            continue
        v = cands[0]
        add_metric({"variant_id": v["id"], "platform": r.get("platform"), "captured_at": r.get("date"),
                    "views": r.get("views") or 0, "watch_time": r.get("watch_time") or 0,
                    "hold_3s": float(r["hold_3s"]) if r.get("hold_3s") else None,
                    "completion": float(r["completion"]) if r.get("completion") else None,
                    "ctr": float(r["ctr"]) if r.get("ctr") else None,
                    "conversions": int(r["conversions"]) if r.get("conversions") else None, "post_url": r.get("post_url")})
        n += 1
    return {"imported": n, "unknown_codes": missing, "ambiguous_codes": ambiguous,
            "hint": "Chọn chiến dịch khi nhập để phân biệt mã trùng" if ambiguous else None}


@app.get(f"{API}/analytics")
def analytics(campaign_id: str | None = None, platform: str | None = None):
    where, args = "WHERE 1=1", []
    if campaign_id:
        where += " AND v.campaign_id=?"
        args.append(campaign_id)
    if platform:
        where += " AND m.platform=?"
        args.append(platform)
    base = f"FROM metrics m JOIN variants v ON v.id=m.variant_id {where}"
    tot = db.q1(f"SELECT COUNT(DISTINCT m.variant_id) published, SUM(m.views) views, AVG(m.watch_time) watch, AVG(m.ctr) ctr {base}", args)
    daily = db.q(f"SELECT substr(m.captured_at,1,10) d, SUM(m.views) views, COUNT(DISTINCT m.variant_id) posts {base} GROUP BY d ORDER BY d", args)
    by_angle = db.q(f"SELECT json_extract(v.concept_json,'$.angle') angle, SUM(m.views) views, AVG(m.watch_time) watch, "
                    f"AVG(m.ctr) ctr, COUNT(DISTINCT v.id) n {base} GROUP BY angle ORDER BY views DESC", args)
    top = db.q(f"SELECT v.id, v.code, json_extract(v.concept_json,'$.angle') angle, SUM(m.views) views, AVG(m.watch_time) watch, "
               f"AVG(m.ctr) ctr {base} GROUP BY v.id ORDER BY views DESC LIMIT 5", args)
    for r in by_angle + top:
        r["label"] = creative.ANGLES.get(r["angle"], {}).get("label", r["angle"])
    return {"totals": tot, "daily": daily, "by_angle": by_angle, "top": top,
            "note": "Tương quan ≠ nhân quả; số liệu do người dùng nhập, không suy đoán thuật toán nền tảng."}


# ---------------------------------------------------------------- frontend tĩnh (bản build)
DIST = config.ROOT / "apps" / "desktop" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="static")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (DIST / path).resolve()
        ok = bool(path) and f.is_relative_to(DIST.resolve()) and f.is_file()      # không cho ../ thoát khỏi thư mục giao diện
        return FileResponse(f if ok else DIST / "index.html")


# ---------------------------------------------------------------- bộ tự chạy nền (khởi động sau khi mọi hàm đã sẵn sàng)
if "pytest" not in __import__("sys").modules and __import__("os").environ.get("AVF_AUTOPILOT", "1") == "1":
    threading.Thread(target=_autopilot_loop, daemon=True, name="autopilot").start()
