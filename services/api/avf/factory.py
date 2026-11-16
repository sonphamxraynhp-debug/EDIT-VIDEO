"""Sản xuất hàng loạt cho chế độ Tin tức / Bán hàng: thư viện sản phẩm, bộ kênh, nhập từ bảng tính, hàng đợi chạy nền.

- Sản phẩm: lưu một lần (mô tả, điểm bán hàng, giá, link, hình) ở data/products/<id>/, dùng lại cho nhiều video.
- Bộ kênh: tên kênh, màu, kiểu mở đầu, giọng, nhạc, nền tảng lưu thành một bộ, áp vào tin bằng một lần chọn.
- Nhập bảng: mỗi dòng CSV/XLSX thành một sản phẩm + video (hoặc một tin), hình lấy từ thư mục trên máy.
- Hàng đợi: một luồng chạy nền lần lượt viết lời rồi dựng; tắt app giữa chừng thì lần mở sau chạy tiếp.
"""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
import threading
import time
import unicodedata
import uuid
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response

from . import config, media, modes, news
from .errors import AppError

router = APIRouter()
PRODUCTS_DIR = config.DATA_DIR / "products"
PROFILES_FILE = news.NEWS_DIR / "profiles.json"
QUEUE_FILE = news.NEWS_DIR / "queue.json"
PRODUCT_KEYS = ("name", "description", "points", "price", "offer", "link", "platform")
PROFILE_KEYS = ("channel", "category", "credit", "theme", "style", "voice", "music", "music_mood", "platform", "cta_text")
# các góc nội dung để một sản phẩm ra nhiều video khác ý nhau
ANGLES = ("Nỗi khó chịu người dùng đang gặp và cách sản phẩm giải quyết", "Ba lý do đáng cân nhắc sản phẩm này",
          "Một tình huống dùng sản phẩm trong đời thường", "Giải đáp băn khoăn thường gặp trước khi mua",
          "Sản phẩm này hợp với ai và không hợp với ai")
MAX_ROWS = 200
_lock = threading.Lock()


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def _read(path: Path, default):
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, ValueError):
        return default


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------- sản phẩm
def _pdir(pid: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{12}", pid or ""):
        raise AppError("NOT_FOUND", "Không tìm thấy sản phẩm", status=404)
    return PRODUCTS_DIR / pid


def product(pid: str) -> dict:
    f = _pdir(pid) / "product.json"
    if not f.is_file():
        raise AppError("NOT_FOUND", "Không tìm thấy sản phẩm", status=404)
    return json.loads(f.read_text("utf-8"))


def _clean_product(p: dict) -> dict:
    for k in PRODUCT_KEYS:
        p[k] = str(p.get(k) or "").strip()[: 4000 if k in ("description", "points") else 500]
    if p["platform"] not in news.PLATFORMS:
        p["platform"] = "tiktok"
    return p


def save_product(p: dict) -> dict:
    p["updated_at"] = _now()
    with _lock:
        _write(_pdir(p["id"]) / "product.json", p)
    return p


def create_product(data: dict) -> dict:
    p = _clean_product({"id": uuid.uuid4().hex[:12], "created_at": _now(), "media": [], **{k: (data or {}).get(k) for k in PRODUCT_KEYS}})
    if not p["name"]:
        raise AppError("BAD_INPUT", "Sản phẩm cần có tên", status=422)
    return save_product(p)


def products() -> list[dict]:
    out = [_read(f, None) for f in PRODUCTS_DIR.glob("*/product.json")] if PRODUCTS_DIR.exists() else []
    return sorted([x for x in out if x], key=lambda x: x.get("updated_at") or "", reverse=True)


def add_media(target_dir: Path, src: Path, name: str) -> dict:
    """Chép một ảnh/video vào thư mục media của sản phẩm hoặc tin và trả về bản ghi media."""
    kind = media.media_type_of(name)
    if kind not in ("video", "image"):
        raise AppError("ASSET_UNSUPPORTED", "Chỉ nhận ảnh và video", status=422)
    target_dir.mkdir(parents=True, exist_ok=True)
    mid = uuid.uuid4().hex[:8]
    dst = target_dir / f"{mid}{Path(name).suffix.lower()}"
    shutil.copyfile(src, dst)
    try:
        meta = media.probe(dst)
    except AppError:
        dst.unlink(missing_ok=True)
        raise
    return {"id": mid, "name": name, "path": str(dst), "type": kind, "duration_ms": meta.get("duration_ms") or 0,
            "has_audio": bool(meta.get("audio_codec")) and kind == "video", "width": meta.get("width"), "height": meta.get("height")}


def folder_media(folder: str) -> list[Path]:
    """Ảnh và video trong một thư mục trên máy (không đi vào thư mục con), xếp theo tên, tối đa MAX_MEDIA file."""
    d = Path(folder).expanduser()
    if not d.is_dir():
        raise AppError("BAD_INPUT", f"Không thấy thư mục hình: {folder}", status=422)
    files = [f for f in sorted(d.iterdir()) if f.is_file() and not f.name.startswith(".") and media.media_type_of(f.name) in ("video", "image")]
    return files[: news.MAX_MEDIA]


def source_text(p: dict) -> str:
    parts = [f"Sản phẩm: {p['name']}", p["description"]]
    if p["points"]:
        parts.append("Điểm nổi bật:\n" + p["points"])
    if p["price"]:
        parts.append(f"Giá: {p['price']}")
    if p["offer"]:
        parts.append(f"Ưu đãi: {p['offer']}")
    return "\n".join(x for x in parts if x)


def videos_from_product(pid: str, count: int = 1, profile_id: str | None = None) -> list[dict]:
    """Tạo `count` bản nháp video bán hàng từ một sản phẩm, mỗi bản một góc nội dung. Hình dùng chung với sản phẩm."""
    p = product(pid)
    if not p["media"]:
        raise AppError("NEWS_NO_MEDIA", "Sản phẩm chưa có ảnh hoặc video", status=422)
    prof = profile(profile_id) if profile_id else {}
    out = []
    for i in range(max(1, min(len(ANGLES), int(count)))):
        item = news.create({"kind": "sale", "source_text": source_text(p), "price": p["price"], "offer": p["offer"],
                            "link": p["link"], "platform": p["platform"], "category": "GỢI Ý", "date_label": "",
                            "angle": ANGLES[i] if count > 1 else "", **{k: prof[k] for k in PROFILE_KEYS if prof.get(k) not in (None, "")}})
        item.update(product_id=pid, product_name=p["name"], profile_id=prof.get("id"),
                    media=[{**m, "shared": True} for m in p["media"]])
        out.append(news.save(item))
    return out


# ---------------------------------------------------------------- bộ kênh
def profiles() -> list[dict]:
    return _read(PROFILES_FILE, [])


def profile(pid: str) -> dict:
    for p in profiles():
        if p["id"] == pid:
            return p
    raise AppError("NOT_FOUND", "Không tìm thấy bộ kênh", status=404)


def save_profile(data: dict, pid: str | None = None) -> dict:
    name = str((data or {}).get("name") or "").strip()[:80]
    if not name:
        raise AppError("BAD_INPUT", "Bộ kênh cần có tên", status=422)
    probe = news._clean({**{k: "" for k in news.EDITABLE}, **{k: data.get(k) for k in PROFILE_KEYS}, "voice": data.get("voice") or {}})
    row = {"id": pid or uuid.uuid4().hex[:12], "name": name, **{k: probe[k] for k in PROFILE_KEYS}, "updated_at": _now()}
    with _lock:
        rows = [p for p in profiles() if p["id"] != row["id"]]
        if pid and len(rows) == len(profiles()):
            raise AppError("NOT_FOUND", "Không tìm thấy bộ kênh", status=404)
        _write(PROFILES_FILE, rows + [row])
    return row


def apply_profile(nid: str, pid: str) -> dict:
    item, prof = news.load(nid), profile(pid)
    item.update({k: prof[k] for k in PROFILE_KEYS if k != "cta_text" or prof.get("cta_text")}, profile_id=pid)
    return news.save(news._clean(item))


# ---------------------------------------------------------------- hàng đợi
_queue_lock = threading.Lock()
_worker: threading.Thread | None = None


def queue() -> dict:
    q = _read(QUEUE_FILE, {})
    return {"paused": bool(q.get("paused")), "jobs": q.get("jobs") or []}


def _save_queue(q: dict) -> None:
    _write(QUEUE_FILE, q)


def enqueue(nids: list[str], variants: int = 1) -> list[dict]:
    """Xếp các tin vào hàng đợi: máy tự viết lời nếu chưa có, rồi dựng 1 video hoặc `variants` biến thể."""
    added = []
    with _queue_lock:
        q = queue()
        busy = {j["nid"] for j in q["jobs"] if j["status"] in ("waiting", "running")}
        for nid in nids:
            item = news.load(nid)
            if nid in busy:
                continue
            job = {"id": uuid.uuid4().hex[:10], "nid": nid, "title": item.get("product_name") or item.get("headline") or "Tin chưa có tiêu đề",
                   "variants": max(1, min(news.MAX_VARIANTS, int(variants or 1))), "status": "waiting", "error": None,
                   "created_at": _now(), "finished_at": None}
            q["jobs"].append(job)
            added.append(job)
            busy.add(nid)
        _save_queue(q)
    return added


def _set_job(jid: str, **kw) -> None:
    with _queue_lock:
        q = queue()
        for j in q["jobs"]:
            if j["id"] == jid:
                j.update(kw)
        _save_queue(q)


def run_job(job: dict) -> None:
    nid = job["nid"]
    with news._render_lock:
        item = news.load(nid)
        needs = modes.needs_script(item) if item.get("kind") in news.MODE_KINDS else not item["body"] or not (item["hook"] or item["headline"])
        if needs:
            news._patch(nid, stage="Đang viết lời")
            item = news.write_script(nid)
        if item.get("kind") == "clips":
            item = modes.make_clips(nid, None, "draft")
            bad = [v for v in item["variants"] if v["status"] != "done"]
            if bad:
                raise AppError("NEWS_RENDER_FAILED", f"{len(bad)}/{len(item['variants'])} clip không dựng được: {bad[0].get('error') or ''}"[:300])
        elif job["variants"] >= 2:
            item = news.make_variants(nid, job["variants"], False, "done" if item.get("output") else "draft")
            bad = [v for v in item["variants"] if v["status"] != "done"]
            if bad:
                raise AppError("NEWS_RENDER_FAILED", f"{len(bad)}/{len(item['variants'])} bản không dựng được: {bad[0].get('error') or ''}"[:300])
        else:
            news.render(nid)


def _loop() -> None:
    while True:
        time.sleep(1.5)
        try:
            q = queue()
            job = None if q["paused"] else next((j for j in q["jobs"] if j["status"] == "waiting"), None)
            if not job:
                continue
            _set_job(job["id"], status="running", error=None)
            try:
                run_job(job)
                _set_job(job["id"], status="done", finished_at=_now())
            except Exception as e:  # noqa: BLE001 — một việc hỏng không dừng cả hàng đợi
                msg = getattr(e, "message", None) or str(e)
                try:
                    news._patch(job["nid"], status="failed", stage=None, error=msg[:300])
                except AppError:
                    pass                  # tin đã bị xoá trong lúc chờ
                _set_job(job["id"], status="failed", error=msg[:300], finished_at=_now())
        except Exception:  # noqa: BLE001 — luồng nền không được chết
            time.sleep(5)


def start() -> None:
    """Gọi lúc mở app: việc đang chạy dở được trả về hàng chờ, rồi bật luồng chạy nền."""
    global _worker
    with _queue_lock:
        q = queue()
        if any(j["status"] == "running" for j in q["jobs"]):
            for j in q["jobs"]:
                if j["status"] == "running":
                    j["status"] = "waiting"
            _save_queue(q)
    if _worker is None or not _worker.is_alive():
        _worker = threading.Thread(target=_loop, daemon=True, name="news-queue")
        _worker.start()


# ---------------------------------------------------------------- nhập bảng tính
COLUMNS = {
    "name": ("ten", "ten san pham", "san pham", "tieu de", "name"),
    "description": ("mo ta", "noi dung", "description"),
    "points": ("diem noi bat", "diem ban hang", "points"),
    "price": ("gia", "price"),
    "offer": ("uu dai", "khuyen mai", "offer"),
    "link": ("link", "duong dan", "link affiliate"),
    "folder": ("thu muc hinh", "thu muc", "hinh", "folder"),
    "kind": ("loai", "kind"),
    "variants": ("so ban", "bien the", "variants"),
    "platform": ("nen tang", "platform"),
}
TEMPLATE = ("Tên,Mô tả,Điểm nổi bật,Giá,Ưu đãi,Link,Thư mục hình,Loại,Số bản,Nền tảng\r\n"
            "Tên sản phẩm của bạn,Mô tả ngắn về sản phẩm: dùng để làm gì và cho ai,\"Điểm 1; Điểm 2; Điểm 3\",199.000đ,"
            "Miễn phí vận chuyển,https://duong-dan-cua-ban,/Users/ten-ban/Pictures/san-pham-1,bán hàng,3,tiktok\r\n"
            "Tiêu đề một tin,Dán nội dung tin vào đây,,,,,/Users/ten-ban/Pictures/tin-1,tin tức,1,\r\n")


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s or "").replace("đ", "d").replace("Đ", "D"))
    return re.sub(r"\s+", " ", "".join(c for c in s if unicodedata.category(c) != "Mn").lower().strip())


def _xlsx_rows(data: bytes) -> list[list[str]]:
    """Đọc trang tính đầu tiên của file .xlsx bằng thư viện chuẩn (không cần openpyxl)."""
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ElementTree.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
                shared.append("".join(t.text or "" for t in si.iter("{%s}t" % ns["m"])))
        sheet = sorted(n for n in z.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n))[0]
        rows = []
        for r in ElementTree.fromstring(z.read(sheet)).iter("{%s}row" % ns["m"]):
            cells: dict[int, str] = {}
            for c in r.findall("m:c", ns):
                col = 0
                for ch in re.match(r"[A-Z]+", c.get("r") or "A").group():
                    col = col * 26 + ord(ch) - 64
                v, t = c.find("m:v", ns), c.get("t")
                if t == "s" and v is not None:
                    text = shared[int(v.text)]
                elif t == "inlineStr":
                    text = "".join(x.text or "" for x in c.iter("{%s}t" % ns["m"]))
                else:
                    text = (v.text if v is not None else "") or ""
                    if re.fullmatch(r"-?\d+\.0+", text):
                        text = text.split(".")[0]
                cells[col - 1] = text
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
        return rows


def parse_table(name: str, data: bytes) -> list[dict]:
    """Bảng CSV/XLSX → danh sách dòng đã gán đúng cột (nhận tên cột tiếng Việt có dấu hoặc không dấu)."""
    if name.lower().endswith(".xlsx"):
        try:
            rows = _xlsx_rows(data)
        except (zipfile.BadZipFile, KeyError, IndexError, ElementTree.ParseError):
            raise AppError("BAD_INPUT", "Không đọc được file Excel này", status=422, hint="Lưu lại dạng .xlsx hoặc .csv rồi thử lại.") from None
    else:
        text = data.decode("utf-8-sig", errors="replace")
        delim = ";" if text.split("\n", 1)[0].count(";") > text.split("\n", 1)[0].count(",") else ","
        rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    rows = [r for r in rows if any(str(c).strip() for c in r)]
    if len(rows) < 2:
        raise AppError("BAD_INPUT", "Bảng chưa có dòng dữ liệu nào", status=422)
    head = [_norm(c) for c in rows[0]]
    col = {key: next((i for i, h in enumerate(head) if h in names), None) for key, names in COLUMNS.items()}
    if col["name"] is None:
        raise AppError("BAD_INPUT", "Bảng thiếu cột Tên", status=422, hint="Tải file mẫu để xem đúng tên các cột.")
    out = []
    for r in rows[1: MAX_ROWS + 1]:
        out.append({k: (str(r[i]).strip() if i is not None and i < len(r) else "") for k, i in col.items()})
    return out


def import_rows(rows: list[dict], profile_id: str | None = None, default_variants: int = 1, do_enqueue: bool = True) -> dict:
    """Mỗi dòng thành một sản phẩm + video bán hàng, hoặc một tin. Dòng lỗi được ghi lại, không dừng cả bảng."""
    prof = profile(profile_id) if profile_id else {}
    made, errors, nids = [], [], []
    for n, r in enumerate(rows, start=2):
        try:
            if not r["name"]:
                raise AppError("BAD_INPUT", "thiếu tên", status=422)
            files = folder_media(r["folder"]) if r["folder"] else []
            if not files:
                raise AppError("BAD_INPUT", "thiếu thư mục hình hoặc thư mục không có ảnh, video", status=422)
            is_news = _norm(r["kind"]) in ("tin tuc", "tin", "news")
            try:
                variants = max(1, min(news.MAX_VARIANTS, int(float(r["variants"])))) if r["variants"] else default_variants
            except ValueError:
                variants = default_variants
            if is_news:
                item = news.create({"source_text": f"{r['name']}\n{r['description']}".strip(), "link": r["link"],
                                    **{k: prof[k] for k in PROFILE_KEYS if prof.get(k) not in (None, "")}})
                item["media"] = [add_media(news._dir(item["id"]) / "media", f, f.name) for f in files]
                item["profile_id"] = prof.get("id")
                item = news.save(item)
            else:
                plat = next((k for k, v in news.PLATFORMS.items() if _norm(r["platform"]) in (k, _norm(v["name"]))), prof.get("platform") or "tiktok")
                p = create_product({**{k: r.get(k, "") for k in PRODUCT_KEYS}, "points": r["points"].replace(";", "\n"), "platform": plat})
                p["media"] = [add_media(_pdir(p["id"]) / "media", f, f.name) for f in files]
                save_product(p)
                item = videos_from_product(p["id"], 1, profile_id)[0]
            nids.append((item["id"], variants))
            made.append({"row": n, "name": r["name"], "nid": item["id"], "kind": item["kind"], "media": len(item["media"]), "variants": variants})
        except AppError as e:
            errors.append({"row": n, "name": r.get("name") or "", "error": e.message})
        except Exception as e:  # noqa: BLE001
            errors.append({"row": n, "name": r.get("name") or "", "error": str(e)[:200]})
    if do_enqueue:
        for nid, variants in nids:
            enqueue([nid], variants)
    return {"created": made, "errors": errors, "queued": do_enqueue and len(nids) or 0}


# ---------------------------------------------------------------- API
@router.get("/factory")
def api_overview():
    return {"products": products(), "profiles": profiles(), "queue": queue(), "angles": ANGLES,
            "platforms": {k: v["name"] for k, v in news.PLATFORMS.items()}}


@router.post("/factory/products")
def api_product_create(data: dict):
    return create_product(data)


@router.put("/factory/products/{pid}")
def api_product_update(pid: str, data: dict):
    p = product(pid)
    p.update({k: v for k, v in data.items() if k in PRODUCT_KEYS})
    if not str(p.get("name") or "").strip():
        raise AppError("BAD_INPUT", "Sản phẩm cần có tên", status=422)
    return save_product(_clean_product(p))


@router.delete("/factory/products/{pid}")
def api_product_delete(pid: str):
    product(pid)
    used = [it["id"] for it in news.list_items() if it.get("product_id") == pid]
    if used:
        raise AppError("PRODUCT_IN_USE", f"Sản phẩm đang được {len(used)} video dùng hình", status=409,
                       hint="Xoá các video đó ở mục Tin tức trước, rồi xoá sản phẩm.")
    shutil.rmtree(_pdir(pid), ignore_errors=True)
    return {"ok": True}


@router.post("/factory/products/{pid}/media")
async def api_product_media(pid: str, file: UploadFile = File(...)):
    p = product(pid)
    if len(p["media"]) >= news.MAX_MEDIA:
        raise AppError("NEWS_TOO_MANY", f"Mỗi sản phẩm tối đa {news.MAX_MEDIA} ảnh và video", status=422)
    name = Path(file.filename or "file").name
    tmp = _pdir(pid) / f"up-{uuid.uuid4().hex[:6]}{Path(name).suffix.lower()}"
    with tmp.open("wb") as f:
        shutil.copyfileobj(file.file, f, 1 << 20)
    try:
        m = add_media(_pdir(pid) / "media", tmp, name)
    finally:
        tmp.unlink(missing_ok=True)
    p = product(pid)
    p["media"].append(m)
    return save_product(p)


@router.delete("/factory/products/{pid}/media/{mid}")
def api_product_media_delete(pid: str, mid: str):
    p = product(pid)
    if any(m.get("id") == mid for it in news.list_items() if it.get("product_id") == pid for m in it["media"]):
        raise AppError("PRODUCT_IN_USE", "Hình này đang được một video dùng", status=409)
    for m in [x for x in p["media"] if x["id"] == mid]:
        Path(m["path"]).unlink(missing_ok=True)
    p["media"] = [x for x in p["media"] if x["id"] != mid]
    return save_product(p)


@router.post("/factory/products/{pid}/videos")
def api_product_videos(pid: str, data: dict | None = None):
    """{count: số video khác góc nội dung, variants: số biến thể mỗi video, profile_id, enqueue}."""
    data = data or {}
    items = videos_from_product(pid, int(data.get("count") or 1), data.get("profile_id") or None)
    if data.get("enqueue", True):
        enqueue([it["id"] for it in items], int(data.get("variants") or 1))
    return {"items": items}


@router.post("/factory/profiles")
def api_profile_create(data: dict):
    return save_profile(data)


@router.post("/factory/profiles/from/{nid}")
def api_profile_from(nid: str, data: dict):
    item = news.load(nid)
    return save_profile({**{k: item.get(k) for k in PROFILE_KEYS}, "name": data.get("name")})


@router.put("/factory/profiles/{pid}")
def api_profile_update(pid: str, data: dict):
    return save_profile({**profile(pid), **data}, pid)


@router.delete("/factory/profiles/{pid}")
def api_profile_delete(pid: str):
    profile(pid)
    with _lock:
        _write(PROFILES_FILE, [p for p in profiles() if p["id"] != pid])
    return {"ok": True}


@router.post("/news/{nid}/profile/{pid}")
def api_profile_apply(nid: str, pid: str):
    return apply_profile(nid, pid)


@router.post("/factory/queue")
def api_enqueue(data: dict):
    """{ids: [mã tin], variants: 1..6}."""
    return {"added": enqueue([str(x) for x in data.get("ids") or []], int(data.get("variants") or 1)), "queue": queue()}


@router.post("/factory/queue/{action}")
def api_queue_action(action: str):
    """pause | resume | retry (chạy lại việc lỗi) | clear (dọn việc đã xong và việc lỗi)."""
    with _queue_lock:
        q = queue()
        if action in ("pause", "resume"):
            q["paused"] = action == "pause"
        elif action == "retry":
            for j in q["jobs"]:
                if j["status"] == "failed":
                    j.update(status="waiting", error=None, finished_at=None)
        elif action == "clear":
            q["jobs"] = [j for j in q["jobs"] if j["status"] in ("waiting", "running")]
        else:
            raise AppError("BAD_INPUT", "Thao tác không hợp lệ", status=422)
        _save_queue(q)
    return q


@router.delete("/factory/queue/{jid}")
def api_queue_remove(jid: str):
    with _queue_lock:
        q = queue()
        q["jobs"] = [j for j in q["jobs"] if j["id"] != jid or j["status"] == "running"]
        _save_queue(q)
    return q


@router.get("/factory/import/template")
def api_template():
    return Response("\ufeff" + TEMPLATE, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="mau-nhap-hang-loat.csv"'})


@router.post("/factory/import")
async def api_import(file: UploadFile = File(...), profile_id: str = Form(""), variants: int = Form(1), enqueue_now: bool = Form(True)):
    name = Path(file.filename or "bang.csv").name
    if not name.lower().endswith((".csv", ".xlsx")):
        raise AppError("BAD_INPUT", "Chỉ nhận file .csv hoặc .xlsx", status=422)
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise AppError("BAD_INPUT", "File bảng lớn bất thường", status=422)
    return import_rows(parse_table(name, data), profile_id or None, max(1, min(news.MAX_VARIANTS, variants)), enqueue_now)
