"""Thư viện nhạc nền: danh mục bài đã soát giấy phép (music_catalog.json), tải về theo nút bấm, kèm nhạc người dùng tự thêm.

File nhạc không nằm trong mã nguồn: app tải từ đúng nguồn gốc của từng bài vào data/music/ rồi ghi LICENSES.txt
(giấy phép + dòng ghi công của từng bài). Tên file: <tâm trạng>__<mã bài>.<đuôi>; thông tin bài nằm ở index.json.
"""
from __future__ import annotations

import json
import re
import shutil
import threading
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, File, UploadFile

from . import media
from .errors import AppError
from .scale import MUSIC_DIR

router = APIRouter()
CATALOG_FILE = Path(__file__).with_name("music_catalog.json")
INDEX = MUSIC_DIR / "index.json"
MOODS = {"news": "Tin tức", "emotional": "Cảm động", "upbeat": "Vui tươi", "dramatic": "Kịch tính",
         "inspirational": "Truyền cảm hứng", "calm": "Nhẹ nhàng", "corporate": "Doanh nghiệp", "funny": "Hài hước",
         "mine": "Nhạc của tôi"}
AUDIO_EXT = (".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg")
MAX_BYTES = 40 * 1024 * 1024
_state = {"running": False, "done": 0, "total": 0, "errors": [], "current": None}
_lock = threading.Lock()


def catalog() -> list[dict]:
    try:
        items = json.loads(CATALOG_FILE.read_text("utf-8"))["tracks"]
    except (OSError, ValueError, KeyError):
        return []
    return [t for t in items if t.get("id") and str(t.get("url", "")).startswith("https://") and t.get("mood") in MOODS]


def index() -> dict:
    try:
        return json.loads(INDEX.read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def _save_index(idx: dict) -> None:
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    tmp = INDEX.with_suffix(".tmp")
    tmp.write_text(json.dumps(idx, ensure_ascii=False, indent=1), "utf-8")
    tmp.replace(INDEX)
    lines = ["Giấy phép các bài nhạc trong thư mục này. Bài có dòng ghi công thì phải ghi công khi đăng video.", ""]
    for name, t in sorted(idx.items()):
        lines += [f"{name}", f"  Bài: {t.get('title')} — {t.get('artist') or 'không rõ tác giả'}", f"  Giấy phép: {t.get('licence')}",
                  f"  Ghi công: {t.get('attribution') or 'không bắt buộc'}", f"  Nguồn: {t.get('source_page') or t.get('url') or 'người dùng tự thêm'}", ""]
    (MUSIC_DIR / "LICENSES.txt").write_text("\n".join(lines), "utf-8")


def library() -> list[dict]:
    """Các bài đang có trên máy, kèm tâm trạng và giấy phép (bài lạ thả tay vào thư mục vẫn được nhận)."""
    if not MUSIC_DIR.exists():
        return []
    idx = index()
    lic = (MUSIC_DIR / "LICENSES.txt").exists() or (MUSIC_DIR / "LICENSE.txt").exists()
    out = []
    for p in sorted(MUSIC_DIR.iterdir()):
        if p.suffix.lower() not in AUDIO_EXT:
            continue
        t = idx.get(p.name) or {}
        out.append({"path": str(p), "name": t.get("title") or p.stem, "file": p.name, "mood": t.get("mood") or "mine",
                    "artist": t.get("artist"), "licence": t.get("licence"), "attribution": t.get("attribution"),
                    "duration_s": t.get("duration_s"), "licensed": lic and bool(t.get("licence"))})
    return out


def _target(t: dict) -> Path:
    ext = Path(urlparse(t["url"]).path).suffix.lower()
    return MUSIC_DIR / f"{t['mood']}__{re.sub(r'[^a-z0-9_-]', '', t['id'].lower())}{ext if ext in AUDIO_EXT else '.mp3'}"


def _fetch(t: dict) -> None:
    dst = _target(t)
    tmp = dst.with_suffix(dst.suffix + ".part")
    req = urllib.request.Request(t["url"], headers={"User-Agent": "AIVideoFactory/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r, tmp.open("wb") as f:
        if urlparse(r.geturl()).scheme != "https":
            raise ValueError("nguồn chuyển hướng sang kết nối không an toàn")
        n = 0
        while chunk := r.read(1 << 16):
            n += len(chunk)
            if n > MAX_BYTES:
                raise ValueError("file lớn bất thường")
            f.write(chunk)
    meta = media.probe(tmp)                     # phải là file âm thanh thật, không phải trang báo lỗi
    if not meta.get("audio_codec") or meta.get("video_codec") not in (None, "mjpeg", "png"):
        tmp.unlink(missing_ok=True)
        raise ValueError("file tải về không phải âm thanh")
    tmp.replace(dst)
    with _lock:
        idx = index()
        idx[dst.name] = {k: t.get(k) for k in ("id", "title", "artist", "mood", "licence", "attribution", "source_page", "url")}
        idx[dst.name]["duration_s"] = round(meta["duration_ms"] / 1000)
        _save_index(idx)


def _download(tracks: list[dict]) -> None:
    try:
        for t in tracks:
            _state["current"] = t["title"]
            try:
                _fetch(t)
            except Exception as e:  # noqa: BLE001 — một bài hỏng không dừng cả lượt tải
                _target(t).with_suffix(_target(t).suffix + ".part").unlink(missing_ok=True)
                _state["errors"].append({"title": t["title"], "error": str(e)[:160]})
            _state["done"] += 1
    finally:
        _state.update(running=False, current=None)


# ---------------------------------------------------------------- API
@router.get("/music")
def api_music():
    have = {x["file"] for x in library()}
    cat = [{**t, "installed": _target(t).name in have, "path": str(_target(t)) if _target(t).name in have else None} for t in catalog()]
    mine = [x for x in library() if x["mood"] == "mine" or x["file"] not in {_target(t).name for t in catalog()}]
    return {"moods": MOODS, "catalog": cat, "mine": mine, "state": _state, "dir": str(MUSIC_DIR),
            "missing_bytes": sum(int(t.get("bytes") or 0) for t in cat if not t["installed"])}


@router.post("/music/download")
def api_download(data: dict | None = None):
    """Tải các bài chưa có: tất cả, theo tâm trạng (mood) hoặc theo danh sách mã bài (ids)."""
    data = data or {}
    if _state["running"]:
        return _state
    have = {x["file"] for x in library()}
    want = [t for t in catalog() if _target(t).name not in have
            and (not data.get("mood") or t["mood"] == data["mood"]) and (not data.get("ids") or t["id"] in data["ids"])]
    if not want:
        return {**_state, "total": 0, "done": 0}
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    _state.update(running=True, done=0, total=len(want), errors=[], current=None)
    threading.Thread(target=_download, args=(want,), daemon=True, name="music-download").start()
    return _state


@router.post("/music/upload")
async def api_upload(file: UploadFile = File(...)):
    """Người dùng tự thêm nhạc của mình (tự chịu trách nhiệm về quyền sử dụng)."""
    name = Path(file.filename or "nhac").name
    ext = Path(name).suffix.lower()
    if ext not in AUDIO_EXT:
        raise AppError("ASSET_UNSUPPORTED", "Chỉ nhận file nhạc MP3, WAV, M4A, AAC, FLAC, OGG", status=422)
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    dst = MUSIC_DIR / f"mine__{uuid.uuid4().hex[:8]}{ext}"
    with dst.open("wb") as f:
        shutil.copyfileobj(file.file, f, 1 << 20)
    try:
        meta = media.probe(dst)
        if not meta.get("audio_codec"):
            raise AppError("ASSET_UNSUPPORTED", "File này không có âm thanh", status=422)
    except AppError:
        dst.unlink(missing_ok=True)
        raise
    with _lock:
        idx = index()
        idx[dst.name] = {"title": Path(name).stem[:80], "mood": "mine", "duration_s": round(meta["duration_ms"] / 1000),
                         "licence": "Người dùng tự thêm, tự chịu trách nhiệm về quyền sử dụng", "attribution": None}
        _save_index(idx)
    return {"ok": True, "file": dst.name}


@router.delete("/music/{file}")
def api_delete(file: str):
    p = MUSIC_DIR / Path(file).name
    if p.suffix.lower() not in AUDIO_EXT or not p.is_file():
        raise AppError("NOT_FOUND", "Không tìm thấy bài nhạc", status=404)
    p.unlink()
    with _lock:
        idx = index()
        idx.pop(p.name, None)
        _save_index(idx)
    return {"ok": True}
