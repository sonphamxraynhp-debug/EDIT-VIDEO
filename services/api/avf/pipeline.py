"""Pipeline A–D: nghiệp vụ dùng chung cho API và worker. Mọi thao tác chậm chạy qua hàng đợi jobs."""
from __future__ import annotations

import json
import re
import shutil
import time
import unicodedata
from collections import Counter
from pathlib import Path

from . import ai, config, creative, db, media, policy, render, scale, system, tts
from .errors import AppError, not_found

# ---------------------------------------------------------------- state machine (mục 5.1)
VARIANT_FLOW = {
    "DRAFT": {"SCRIPT_READY", "REJECTED"},
    "SCRIPT_READY": {"SCRIPT_APPROVED", "NEEDS_REVISION", "REJECTED", "SCRIPT_READY"},
    "SCRIPT_APPROVED": {"STORYBOARD_READY", "NEEDS_REVISION", "SCRIPT_READY"},
    "STORYBOARD_READY": {"PREVIEW_READY", "STORYBOARD_READY", "NEEDS_REVISION", "SCRIPT_READY", "FAILED"},
    "PREVIEW_READY": {"QC_PENDING", "STORYBOARD_READY", "PREVIEW_READY", "SCRIPT_READY"},
    "QC_PENDING": {"APPROVED", "NEEDS_REVISION", "REJECTED", "QC_PENDING", "PREVIEW_READY", "STORYBOARD_READY"},
    "APPROVED": {"RENDERING", "NEEDS_REVISION"},
    "RENDERING": {"COMPLETED", "FAILED", "APPROVED"},
    "COMPLETED": {"RENDERING", "NEEDS_REVISION"},
    "NEEDS_REVISION": {"SCRIPT_READY", "STORYBOARD_READY", "REJECTED"},
    "REJECTED": {"DRAFT", "NEEDS_REVISION"},
    "FAILED": {"APPROVED", "STORYBOARD_READY", "NEEDS_REVISION"},
}


def transition(variant_id: str, to: str, *, reviewer: str | None = None, reason: str | None = None) -> dict:
    v = db.q1("SELECT * FROM variants WHERE id=?", (variant_id,))
    if not v:
        raise not_found("biến thể")
    if to not in VARIANT_FLOW.get(v["status"], set()):
        raise AppError("INVALID_TRANSITION", f"Không thể chuyển {v['status']} → {to}", status=409)
    if v["status"] == "QC_PENDING" and to == "APPROVED":
        user = db.q1("SELECT role FROM users WHERE id=?", (reviewer,)) if reviewer else None
        if not user or user["role"] not in ("owner", "reviewer"):
            raise AppError("FORBIDDEN", "Chỉ Reviewer/Owner được duyệt QC", status=403)
    db.update("variants", variant_id, {"status": to, "updated_at": db.now()})
    if reviewer or reason:
        db.insert("approvals", {"entity_type": "variant", "entity_id": variant_id, "reviewer_id": reviewer,
                                "decision": to, "reason": reason, "at": db.now()})
    return db.q1("SELECT * FROM variants WHERE id=?", (variant_id,))


# ---------------------------------------------------------------- jobs (queue persist SQLite)
def enqueue(kind: str, *, variant_id: str | None = None, profile: dict | None = None, priority: int = 5,
            batch_id: str | None = None) -> dict:
    if variant_id:        # bấm đúp hay hai nguồn cùng gọi: dùng lại job đang chờ/chạy, không dựng trùng một video
        ex = db.q1("SELECT * FROM render_jobs WHERE variant_id=? AND kind=? AND status IN ('PENDING','RETRY_WAIT') "
                   "ORDER BY created_at DESC LIMIT 1", (variant_id, kind))   # job đã chạy rồi thì dữ liệu của nó có thể đã cũ
        if ex:
            return ex
    return db.insert("render_jobs", {"variant_id": variant_id, "kind": kind, "profile_json": profile or {},
                                     "priority": priority, "batch_id": batch_id, "status": "PENDING",
                                     "created_at": db.now(), "updated_at": db.now()})


# ---------------------------------------------------------------- Pipeline A: ingest
def import_file(project_id: str, src: Path, original_name: str, *, copy: bool = True, rights: str = "own_footage",
                tags: list[str] | None = None, allow_duplicate: bool = False) -> dict:
    if not db.q1("SELECT id FROM projects WHERE id=?", (project_id,)):
        raise not_found("dự án")
    mtype = media.media_type_of(original_name)
    digest = media.sha256_file(src)
    dup = db.q1("SELECT * FROM assets WHERE project_id=? AND sha256=?", (project_id, digest))
    if dup and not allow_duplicate:
        raise AppError("ASSET_DUPLICATE", f"File trùng với “{dup['file_name']}” đã nhập", status=409,
                       details={"asset_id": dup["id"]}, hint="Bỏ qua hoặc xác nhận nhập lại.")
    if media.disk_free_gb() < config.MIN_FREE_DISK_GB:
        raise AppError("DISK_LOW", "Không đủ dung lượng trống để nhập", hint="Dọn bớt cache hoặc đổi thư mục dữ liệu.")
    asset_id = db.new_id()
    dest_dir = config.MEDIA_DIR / project_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{asset_id}{Path(original_name).suffix.lower()}"
    if copy:
        shutil.copy2(src, dest)
    else:
        dest = src
    meta: dict = {}
    if mtype in ("video", "audio", "image"):
        try:
            meta = media.probe(dest)
        except AppError:
            if copy:
                dest.unlink(missing_ok=True)
            raise
    thumb = None
    if mtype in ("video", "image"):
        t = media.make_thumbnail(dest, config.PROXY_DIR / asset_id / "thumb.jpg",
                                 at_ms=min(1000, meta.get("duration_ms", 0) // 2) if mtype == "video" else 0)
        thumb = str(t) if t else None
    meta["thumbnail"] = thumb
    asset = db.insert("assets", {"id": asset_id, "project_id": project_id, "uri": str(dest), "original_uri": original_name,
                                 "file_name": original_name, "sha256": digest, "media_type": mtype, "meta_json": meta,
                                 "tags_json": tags or [], "rights": rights, "status": "imported", "created_at": db.now()})
    db.log_activity(f"Đã nhập {original_name}", project_id)
    if mtype == "video":
        enqueue("proxy", profile={"asset_id": asset_id}, priority=3)
    return asset


def merge_asset_meta(asset_id: str, patch: dict, status: str | None = None) -> dict:
    """Đọc lại meta mới nhất rồi trộn — tránh job proxy/analysis chạy song song ghi đè nhau."""
    with db.tx() as c:
        cur = db.row(c.execute("SELECT meta_json FROM assets WHERE id=?", (asset_id,)).fetchone())
        meta = {**(cur["meta_json"] if cur else {}), **patch}
        c.execute("UPDATE assets SET meta_json=?" + (", status=?" if status else "") + " WHERE id=?",
                  [json.dumps(meta, ensure_ascii=False)] + ([status] if status else []) + [asset_id])
    return meta


def job_proxy(job: dict, progress) -> dict:
    a = db.q1("SELECT * FROM assets WHERE id=?", (job["profile_json"]["asset_id"],))
    if not a:
        raise not_found("asset")
    src = Path(a["uri"])
    out_dir = config.PROXY_DIR / a["id"]
    proxy = media.make_proxy(src, out_dir / "proxy.mp4")
    progress(0.7)
    wf = media.waveform(src) if a["meta_json"].get("audio_codec") else []
    cur = db.q1("SELECT status FROM assets WHERE id=?", (a["id"],))
    meta = merge_asset_meta(a["id"], {"proxy": str(proxy) if proxy else None, "waveform": wf},
                            None if cur and cur["status"] == "analyzed" else "ready")
    return {"proxy": meta["proxy"]}


def job_analysis(job: dict, progress) -> dict:
    """M03: scene detect → keyframe → chất lượng → OCR → ASR → gắn nhãn đề xuất."""
    opts = job["profile_json"]
    a = db.q1("SELECT * FROM assets WHERE id=?", (opts["asset_id"],))
    if not a or a["media_type"] != "video":
        raise AppError("ANALYSIS_INPUT", "Chỉ phân tích được video", retryable=False)
    src = Path(a["uri"])
    dur = a["meta_json"].get("duration_ms", 0)
    stages: dict = {}
    progress(0.05)
    bounds = media.detect_scenes(src, dur, threshold=float(opts.get("threshold", 0.3)))
    stages["scene_detect"] = len(bounds)
    progress(0.25)
    # cảnh người dùng đã duyệt/sửa nhãn: nếu ranh giới mới gần như trùng thì giữ id, nhãn và trạng thái duyệt
    reviewed = db.q("SELECT * FROM scenes WHERE asset_id=? AND locked=0 AND review!='pending'", (a["id"],))
    db.conn().execute("DELETE FROM scenes WHERE asset_id=? AND locked=0", (a["id"],))
    locked = db.q("SELECT * FROM scenes WHERE asset_id=? AND locked=1", (a["id"],))
    ocr_on = opts.get("ocr", True)
    scenes = []
    for i, (s, e) in enumerate(bounds):
        if any(not (e <= l["start_ms"] or s >= l["end_ms"]) for l in locked):
            continue
        kf = media.make_thumbnail(src, config.PROXY_DIR / a["id"] / f"scene_{i:03d}.jpg", at_ms=(s + e) // 2)
        q = media.frame_stats(src, s, e) if opts.get("quality", True) else {}
        text = media.ocr_image(kf) if ocr_on and kf else ""
        tags = suggest_tags(i, len(bounds), q, text)
        row = {"asset_id": a["id"], "idx": i, "start_ms": s, "end_ms": e,
               "label": tags["label"], "tags_json": tags["tags"],
               "quality_json": {**q, "confidence": tags["confidence"]},
               "keyframe": str(kf) if kf else None, "ocr_text": text}
        prev = next((r for r in reviewed if abs(r["start_ms"] - s) <= 250 and abs(r["end_ms"] - e) <= 250), None)
        if prev:
            reviewed.remove(prev)
            row.update({"id": prev["id"], "label": prev["label"], "tags_json": prev["tags_json"], "review": prev["review"]})
        scenes.append(db.insert("scenes", row))
        progress(0.25 + 0.45 * (i + 1) / len(bounds))
    stages["keyframes"] = len(scenes)
    audio = media.audio_levels(src)
    stages["audio"] = audio
    if opts.get("asr", True) and audio.get("has_audio") and not audio.get("silent"):
        try:
            work = config.WORK_DIR / f"asr_{a['id']}"
            work.mkdir(parents=True, exist_ok=True)
            segs = media.transcribe(src, work)
            db.conn().execute("DELETE FROM transcript_segments WHERE asset_id=?", (a["id"],))
            for sg in segs:
                db.insert("transcript_segments", {"asset_id": a["id"], **sg})
            stages["asr"] = len(segs)
            stages["asr_model"] = media.find_whisper_model().name
        except AppError as e:
            stages["asr"] = {"skipped": e.code, "message": e.message, "hint": e.hint}
    progress(0.95)
    merge_asset_meta(a["id"], {"analysis": stages}, "analyzed")
    db.log_activity(f"Phân tích xong {a['file_name']}: {len(scenes)} cảnh", a["project_id"])
    return stages


def suggest_tags(i: int, n: int, q: dict, ocr: str) -> dict:
    """Gợi ý nhãn shot có confidence thấp — người dùng phải xác nhận (M03-05/M03-08)."""
    tags, label = [], "Cảnh sản phẩm"
    if i == 0:
        tags += ["packshot", "close_up"]
        label = "Mở đầu / cận cảnh"
    elif i == n - 1:
        tags += ["cta", "packshot"]
        label = "Cảnh kết thúc"
    else:
        tags += ["demonstration", "hand"] if q.get("motion", 0) > 4 else ["close_up", "face"]
        label = "Thao tác / demo" if "demonstration" in tags else "Cận cảnh / người dùng"
    if ocr:
        tags.append("packaging")
    return {"tags": sorted(set(tags)), "label": label, "confidence": 0.45}


# ---------------------------------------------------------------- Product Brain
def product_bundle(product_id: str) -> dict:
    p = db.q1("SELECT * FROM products WHERE id=?", (product_id,))
    if not p:
        raise not_found("sản phẩm")
    return {"product": p,
            "claims": db.q("SELECT * FROM claims WHERE product_id=? ORDER BY created_at", (product_id,)),
            "evidence": db.q("SELECT * FROM evidence WHERE product_id=? ORDER BY created_at", (product_id,)),
            "faqs": db.q("SELECT * FROM faqs WHERE product_id=? ORDER BY created_at", (product_id,))}


CLIP_FIELDS = ("short_description", "usp", "usage", "audience", "price", "allowed_cta")
NUM_WORDS = {"một", "hai", "ba", "bốn", "tư", "năm", "lăm", "sáu", "bảy", "tám", "chín", "mười", "mươi", "trăm", "nghìn",
             "ngàn", "triệu", "tỷ", "tỉ", "rưỡi"}


GLUE_WORDS = {"va", "voi", "co", "cho", "cua", "la", "duoc", "nhung", "cac", "de", "trong", "nay", "ve", "tu", "khi", "se"}
CLIP_GROUND_MIN = 1.0     # mọi chữ của câu phải có gốc trong lời thoại/chữ trên hình gốc (so theo cách đọc gần âm)


def _phon(word: str) -> str:
    """Khoá đọc gần âm: bỏ dấu, gộp các cặp ASR hay nghe nhầm (tr/ch, gi/d/r, s/x, l/n) để "trợ lý" ≈ "chợ ly"."""
    w = unicodedata.normalize("NFD", word.lower().replace("đ", "d"))
    w = "".join(ch for ch in w if unicodedata.category(ch) != "Mn" and ch.isalnum())
    for a, b2 in (("tr", "ch"), ("gi", "d"), ("r", "d"), ("s", "x"), ("l", "n")):
        if w.startswith(a):
            w = b2 + w[len(a):]
            break
    return w


def _close(a: str, b2: str) -> bool:
    if a == b2:
        return True
    if len(a) < 3 or abs(len(a) - len(b2)) > 1:
        return False
    if len(a) == len(b2):
        return sum(x != y for x, y in zip(a, b2)) <= 1
    short, long_ = (a, b2) if len(a) < len(b2) else (b2, a)
    return any(long_[:i] + long_[i + 1:] == short for i in range(len(long_)))


def _ground_ratio(text: str, keys: set[str]) -> float:
    """Tỷ lệ chữ trong câu có gốc ở lời gốc của clip. Chặn trường hợp AI "sửa" cụm nghe không rõ thành ý mới
    (vd. "vô má buổi" → "miễn phí")."""
    words = [_phon(w) for w in text.split()]
    words = [w for w in words if w and w not in GLUE_WORDS]
    if not words:
        return 0.0
    return sum(1 for w in words if w in keys or any(_close(w, k) for k in keys)) / len(words)


def _numbers(text: str) -> set[str]:
    """Con số trong câu (chữ số + số đọc bằng chữ) — để phát hiện AI sửa/thêm số so với lời gốc."""
    words = creative.norm(text).replace(",", " ").replace(".", " ").split()
    return {w for w in words if w in NUM_WORDS or any(ch.isdigit() for ch in w)}


def _clip_sources(project_id: str) -> list[dict]:
    """Lời thoại (ASR) + chữ trên hình (OCR) của từng video trong dự án, chia thành các đoạn để đối chiếu trích dẫn."""
    out = []
    for a in db.q("SELECT id, file_name, uri FROM assets WHERE project_id=? AND media_type='video' ORDER BY created_at",
                  (project_id,)):
        speech = [s["text"].strip() for s in db.q("SELECT text FROM transcript_segments WHERE asset_id=? ORDER BY start_ms",
                                                  (a["id"],)) if s["text"].strip()]
        ocr = list(dict.fromkeys(s["ocr_text"].strip() for s in db.q("SELECT ocr_text FROM scenes WHERE asset_id=? ORDER BY idx",
                                                                      (a["id"],)) if (s["ocr_text"] or "").strip()))
        if speech or ocr:
            raw = " ".join(speech + ocr)
            out.append({**a, "speech": speech, "raw_speech": speech, "ocr": ocr, "raw_nums": _numbers(raw),
                        "raw_keys": {_phon(w) for w in raw.split()} - {""}})
    return out


def _fix_asr(srcs: list[dict], product_name: str) -> None:
    """Lượt LLM riêng chỉ sửa chữ nghe nhầm của ASR (gộp vào lượt trích thông tin thì model 8B bỏ qua)."""
    for s in srcs:
        if not s["speech"]:
            continue
        n = len(s["speech"])

        def valid(o: dict) -> dict:
            if not isinstance(o.get("fixed"), list) or len(o["fixed"]) != n:
                raise ValueError("sai số đoạn")
            return o
        try:
            r = ai.generate_json(
                "Bạn sửa bản nhận giọng nói tự động tiếng Việt. Máy hay nghe nhầm chữ gần âm: sai dấu thanh, nhầm phụ âm đầu "
                "(tr/ch, s/x, d/gi/r, l/n), từ tiếng Anh bị phiên âm (vd. 'ai' → 'AI', 'phây búc' → 'Facebook'). "
                "Sửa chính tả và chữ nghe nhầm theo ngữ cảnh. Chữ nào không chắc thì giữ nguyên, không đoán. "
                "Giữ nguyên ý và số đoạn, không thêm thông tin. Trả JSON.",
                f"SẢN PHẨM: {product_name}\nCÁC ĐOẠN:\n" + "\n".join(f"{i}. {t}" for i, t in enumerate(s["speech"])) +
                '\nTrả JSON {"fixed":[str]} cùng số phần tử, đúng thứ tự.', valid, temperature=0.1)
            s["speech"] = [str(x).strip() or s["speech"][i] for i, x in enumerate(r["fixed"])]
        except RuntimeError:
            pass   # sửa không được thì dùng bản gốc


def _claim_risky(text: str, blocked: list[str], industry: str) -> str | None:
    low = creative.norm(text)
    for p in creative.RISKY_PHRASES + blocked:
        if creative.norm(p).strip() and creative.norm(p).strip() in low:
            return f"có cụm từ rủi ro “{p}”"
    crit = [f for f in policy.check_policy([{"text": text}], industry) if f["severity"] == "critical"]
    return crit[0]["message"] if crit else None


_FILE_NAME_RE = re.compile(r"^(?:[0-9a-f]{8}-[0-9a-f-]{20,}|(?:img|vid|mov|mvi|dsc|pxl|video|clip|screen ?recording|"
                           r"untitled|[0-9]{6,})[ _\-]*[0-9_\- ()]*|[0-9a-f_\-]{12,})$", re.I)
NAME_FALLBACK = "sản phẩm này"


def name_is_auto(name: str, project_id: str) -> bool:
    """Tên lấy từ tên file (IMG_7019, mã UUID của iPhone…) chứ không phải người đặt → AI được đặt lại theo nội dung clip."""
    n = (name or "").strip()
    if not n or n == NAME_FALLBACK or _FILE_NAME_RE.match(n):
        return True
    stems = {Path(a["file_name"]).stem.strip().lower() for a in
             db.q("SELECT file_name FROM assets WHERE project_id=?", (project_id,))}
    return n.lower() in stems


def _rename_from_clip(p: dict, new: str) -> None:
    """Đổi tên sản phẩm; dự án và chiến dịch đang mang tên file thì đổi theo."""
    db.update("products", p["id"], {"name": new})
    proj = db.q1("SELECT id, name FROM projects WHERE id=?", (p["project_id"],))
    if proj and name_is_auto(proj["name"], proj["id"]):
        title = new if new != NAME_FALLBACK else time.strftime("Video %d-%m %Hh%M")        # giờ máy, không có ký tự cấm trong tên thư mục
        db.update("projects", proj["id"], {"name": title})
        db.conn().execute("UPDATE campaigns SET name=? WHERE project_id=? AND name=?", (title, proj["id"], proj["name"]))
        db.conn().commit()


def product_from_clips(product_id: str) -> dict:
    """AI đọc lời thoại + chữ trên hình của các clip → điền hồ sơ sản phẩm và các câu được phép nói.
    Câu nào trích đúng lời trong clip và không dính cụm từ rủi ro thì tự xác nhận, căn cứ là chính clip đó;
    câu AI suy ra mà không thấy trong clip, hoặc có rủi ro, để ở trạng thái chờ người xem."""
    b = product_bundle(product_id)
    p = b["product"]
    srcs = _clip_sources(p["project_id"])
    if sum(len(" ".join(s["speech"] + s["ocr"])) for s in srcs) < 20:
        raise AppError("NO_CLIP_TEXT", "Clip chưa có lời thoại hay chữ trên hình để AI đọc", status=422,
                       hint="Clip cần có người nói hoặc chữ rõ ràng. Nếu clip có tiếng mà vẫn báo lỗi: phân tích lại video "
                            "ở bước 1, hoặc chọn cách Điền tay.")
    attrs = dict(p["attributes_json"] or {})
    # Đọc lại: thay kết quả AI lần trước (câu AI tạo + mục AI điền), giữ nguyên những gì người dùng tự nhập
    old_ids = attrs.get("clip_claim_ids") or []
    b["claims"] = [c for c in b["claims"] if c["id"] not in old_ids]
    for k in attrs.get("clip_fields") or []:
        attrs.pop(k, None)
    blocked = [x for x in (attrs.get("blocked_phrases") or []) if isinstance(x, str)]
    industry = policy.detect_industry(p)
    auto_name = bool(attrs.get("name_auto")) or name_is_auto(p["name"], p["project_id"])
    if ai.llm_available():
        _fix_asr(srcs, "(chưa rõ)" if auto_name else p["name"])
    text_block = "\n\n".join(f"VIDEO {i + 1} ({s['file_name']}):\nLỜI THOẠI: {' '.join(s['speech']) or '(không có)'}\n"
                             f"CHỮ TRÊN HÌNH: {' | '.join(s['ocr']) or '(không có)'}" for i, s in enumerate(srcs))
    if ai.llm_available():
        def valid(o: dict) -> dict:
            if not isinstance(o.get("claims"), list):
                raise ValueError("thiếu claims")
            return o
        draft = ai.generate_json(
            "Bạn đọc lời thoại và chữ trên hình của video quay thật để lập hồ sơ sản phẩm tiếng Việt. "
            "CHỈ dùng thông tin có trong nội dung được cung cấp, không suy đoán, không thêm số liệu. "
            "Lời thoại đã được sửa chính tả từ bản nhận giọng; cụm nào vô nghĩa hoặc không rõ nghĩa thì bỏ qua, không dùng. "
            "Mỗi câu trong claims phải kèm quote là đoạn nguyên văn lấy từ lời thoại hoặc chữ trên hình. "
            "Không đưa vào claims các câu hứa kết quả, so sánh nhất, cam kết thu nhập hay công dụng y khoa. Trả JSON.",
            (f"TÊN SẢN PHẨM: {p['name']}" if not auto_name else "TÊN SẢN PHẨM: chưa có, hãy điền vào trường name tên sản phẩm, "
             "dịch vụ hoặc chương trình được giới thiệu trong video (tối đa 6 từ, lấy đúng chữ trong nội dung)") +
            f"\n\n{text_block[:6000]}\n\nTrả JSON {{\"name\":str,\"short_description\":str,\"usp\":str,"
            f"\"usage\":str,\"audience\":str,\"price\":str,\"allowed_cta\":str,"
            f"\"claims\":[{{\"text\":str,\"quote\":str}}]}}. Trường nào không có trong nội dung thì để chuỗi rỗng.",
            valid, temperature=0.2)
    else:   # không có LLM: dùng nguyên văn từng câu nói làm câu được phép nói
        draft = {"claims": [{"text": t, "quote": t} for s in srcs for t in s["speech"] if len(t) >= 15][:8]}

    if old_ids:           # xoá kết quả AI lần trước sau khi lượt đọc mới đã xong (AI lỗi giữa chừng thì không mất câu cũ)
        db.conn().execute(f"DELETE FROM claims WHERE id IN ({','.join('?' * len(old_ids))})", old_ids)
    filled, all_keys = [], set().union(*(s["raw_keys"] for s in srcs))
    all_nums = set().union(*(s["raw_nums"] for s in srcs))
    if auto_name:
        new = re.sub(r"\s+", " ", str(draft.get("name") or "")).strip(" .,:;\"'“”")
        if not (3 <= len(new) <= 60 and len(new.split()) <= 8 and _ground_ratio(new, all_keys) >= CLIP_GROUND_MIN):
            new = NAME_FALLBACK        # không có tên chắc chắn trong clip → gọi chung, không để mã file lên video
        if new != p["name"]:
            _rename_from_clip(p, new)
            p["name"] = new
        attrs["name_auto"] = True
    for k in CLIP_FIELDS:
        v = str(draft.get(k) or "").strip()
        # mục thông tin cũng phải có gốc trong clip; không có thì để trống cho người tự điền
        if v and (_ground_ratio(v, all_keys) < CLIP_GROUND_MIN or _numbers(v) - all_nums):
            continue
        if v and not str(attrs.get(k) or "").strip():
            attrs[k] = v
            filled.append(k)
    attrs["source"] = "clip"
    attrs["clip_fields"] = filled

    existing = [c["text"] for c in b["claims"]]
    ev_by_asset = {e["source_uri"]: e for e in b["evidence"] if e["kind"] == "VIDEO"}
    approved = review = 0
    new_ids: list[str] = []
    for c in draft.get("claims", [])[:12]:
        text, quote = str(c.get("text") or "").strip(), str(c.get("quote") or "").strip()
        if len(text) < 6 or any(creative.similarity(text, x) > 0.8 for x in existing):
            continue
        existing.append(text)
        best, src = 0.0, None
        for s in srcs:
            sc = _ground_ratio(text, s["raw_keys"])
            if sc > best:
                best, src = sc, s
        grounded = src is not None and best >= CLIP_GROUND_MIN
        risk = _claim_risky(text, blocked, industry)
        # Con số không có trong lời gốc của clip (AI sửa nhầm/thêm số) thì người phải xác nhận
        num_changed = bool(_numbers(text) - (src["raw_nums"] if src else set()))
        ev_id = None
        if grounded:
            ev = ev_by_asset.get(src["uri"])
            if not ev:
                ev = db.insert("evidence", {"product_id": product_id, "title": f"Lời thoại trong video {src['file_name']}",
                                            "kind": "VIDEO", "source_uri": src["uri"],
                                            "excerpt": " ".join(src["raw_speech"] + src["ocr"])[:800], "status": "checked",
                                            "created_at": db.now()})
                ev_by_asset[src["uri"]] = ev
            ev_id = ev["id"]
        ok = grounded and not risk and not num_changed
        row = db.insert("claims", {"product_id": product_id, "text": text, "status": "approved" if ok else "needs_review",
                                   "risk_level": "high" if risk else "low" if ok else "medium",
                                   "evidence_id": ev_id, "created_at": db.now()})
        new_ids.append(row["id"])
        approved += ok
        review += not ok
    attrs["clip_claim_ids"] = new_ids
    db.update("products", product_id, {"attributes_json": attrs, "updated_at": db.now()})
    db.log_activity(f"AI đọc clip lập hồ sơ {p['name']}: {approved} câu tự xác nhận, {review} câu chờ xem",
                    p["project_id"])
    return {"filled": filled, "approved": approved, "needs_review": review, "videos": len(srcs),
            "engine": "llm" if ai.llm_available() else "verbatim"}


def lock_product(product_id: str) -> dict:
    """M02-08: khoá phiên bản khi generate batch, lưu snapshot để so sánh thay đổi."""
    b = product_bundle(product_id)
    p = b["product"]
    db.insert("product_versions", {"product_id": product_id, "version": p["version"],
                                   "data_json": {k: v for k, v in b.items()}, "created_at": db.now()})
    return db.update("products", product_id, {"locked": 1, "status": "approved", "updated_at": db.now()})


def audit_product(product_id: str) -> dict:
    b = product_bundle(product_id)
    claims = b["claims"]
    no_evidence = [c for c in claims if c["status"] == "approved" and not c["evidence_id"]]
    return {
        "sourced": sum(1 for c in claims if c["evidence_id"]),
        "missing_evidence": len(no_evidence) + sum(1 for c in claims if c["status"] == "needs_review" and not c["evidence_id"]),
        "blocked_phrases": len((b["product"]["attributes_json"] or {}).get("blocked_phrases", [])),
        "pending_review": sum(1 for c in claims if c["status"] == "needs_review"),
        "approved": sum(1 for c in claims if c["status"] == "approved"),
        "prohibited": sum(1 for c in claims if c["status"] in ("prohibited", "expired")),
        "evidence": len(b["evidence"]),
    }


# ---------------------------------------------------------------- Pipeline B: creative
def blocked_phrases(product: dict | None) -> list[str]:
    brand = db.get_setting("brand_active", {}) or {}
    return list((product["attributes_json"] or {}).get("blocked_phrases", []) if product else []) + list(brand.get("blocked", []))


def campaign_context(campaign_id: str) -> dict:
    c = db.q1("SELECT * FROM campaigns WHERE id=?", (campaign_id,))
    if not c:
        raise not_found("chiến dịch")
    brief = c["brief_json"] or {}
    product_id = brief.get("product_id") or (db.q1("SELECT id FROM products WHERE project_id=? ORDER BY created_at LIMIT 1",
                                                   (c["project_id"],)) or {}).get("id")
    scenes = db.q("SELECT s.* FROM scenes s JOIN assets a ON a.id=s.asset_id WHERE a.project_id=? "
                  "AND s.review!='rejected' ORDER BY a.created_at, s.idx", (c["project_id"],))
    bundle = product_bundle(product_id) if product_id else {"product": None, "claims": [], "evidence": [], "faqs": []}
    return {"campaign": c, "brief": brief, "scenes": scenes, **bundle,
            "industry": policy.detect_industry(bundle["product"], brief),
            "platforms": set(brief.get("platforms") or ["meta", "tiktok"])}


def all_flags(beats: list[dict], ctx: dict) -> list[dict]:
    """Claim gate + cổng chính sách quảng cáo, cùng một danh sách cờ."""
    return creative.check_script_claims(beats, ctx["claims"], blocked_phrases(ctx["product"])) + \
        policy.check_policy(beats, ctx["industry"], ctx["platforms"])


def generate_variants(campaign_id: str, target: int | None = None, weights: dict | None = None,
                      preferred_hooks: list[str] | None = None, new_batch: bool = False) -> dict:
    ctx = campaign_context(campaign_id)
    c = ctx["campaign"]
    if ctx["product"] is None:
        raise AppError("PRODUCT_MISSING", "Chiến dịch chưa gắn Product Brain", hint="Tạo hồ sơ sản phẩm trước.")
    target = int(target or c["target_count"])
    warnings = scale.check_source_gate(scale.source_stats(c["project_id"]), target, ctx["brief"])   # cổng đa dạng nguồn
    seed = int(ctx["brief"].get("seed", 42)) + (db.q1("SELECT COALESCE(MAX(batch_no),0) b FROM variants WHERE campaign_id=?",
                                                       (campaign_id,))["b"] if new_batch else 0)
    plan = creative.plan_matrix(ctx["brief"], ctx["scenes"], ctx["claims"], target, seed=seed, weights=weights)
    if not new_batch:
        db.conn().execute("DELETE FROM variants WHERE campaign_id=? AND status IN ('DRAFT','REJECTED')", (campaign_id,))
    batch_no = (db.q1("SELECT COALESCE(MAX(batch_no),0) b FROM variants WHERE campaign_id=?", (campaign_id,))["b"] or 0) + 1 \
        if new_batch else 1
    existing = db.q1("SELECT COALESCE(MAX(CAST(substr(code,3) AS INTEGER)),0) n FROM variants WHERE campaign_id=?",
                     (campaign_id,))["n"]
    created = []
    for i, concept in enumerate(plan["chosen"], start=existing + 1):
        concept = scale.decorate_concept(concept, i, ctx["brief"])
        created.append(db.insert("variants", {
            "campaign_id": campaign_id, "code": f"V-{i:04d}", "concept_json": concept, "score": concept["score"],
            "feasible": 1, "status": "DRAFT", "seed": 1000 + i, "batch_no": batch_no,
            "created_at": db.now(), "updated_at": db.now()}))
    groups = creative.cluster([(v["id"], creative.concept_text(v["concept_json"])) for v in created], threshold=0.85)
    for v in created:
        db.update("variants", v["id"], {"similarity_group": groups[v["id"]]})
    lock_product(ctx["product"]["id"])
    stats = {k: v for k, v in plan.items() if k not in ("chosen", "proposals")}
    db.update("campaigns", campaign_id, {"status": "planned", "product_version": ctx["product"]["version"],
                                         "brief_json": {**ctx["brief"], "preferred_hooks": preferred_hooks or [],
                                                        "last_plan": {**stats, "created": len(created), "batch_no": batch_no,
                                                                      "warnings": warnings, "at": db.now()}}})
    db.log_activity(f"Lập ma trận {len(created)} biến thể (lô {batch_no}) cho {c['name']}", c["project_id"])
    return {**stats, "created": len(created), "batch_no": batch_no, "warnings": warnings}


def generate_script(variant_id: str, use_llm: bool = True) -> dict:
    v = db.q1("SELECT * FROM variants WHERE id=?", (variant_id,))
    if not v:
        raise not_found("biến thể")
    ctx = campaign_context(v["campaign_id"])
    concept = v["concept_json"]
    approved_ids = {c["id"] for c in ctx["claims"] if c["status"] == "approved"}
    faq = [{"q": f["q"], "a": f["a"]} for f in ctx["faqs"]]
    engine = "template"
    script = None
    blocked = blocked_phrases(ctx["product"])
    hook = scale.pick_hook(v["campaign_id"], concept.get("angle"), v["seed"], ctx["brief"].get("preferred_hooks"))

    def validate(o: dict) -> dict:
        s = creative.validate_script(o, approved_ids)
        if hook:
            s["beats"][0] = {**s["beats"][0], "type": "hook", "text": hook["text"]}
        crit = [f for f in all_flags(s["beats"], ctx) if f["severity"] == "critical"]
        if crit:                        # bắt LLM sinh lại; hết lượt thì rơi về template engine
            raise ValueError("gate: " + crit[0]["message"])
        return s

    if use_llm and ai.llm_available():
        try:
            prompt = creative.build_script_prompt(ctx["product"], ctx["claims"], concept, faq)
            if hook:
                prompt += f"\n\nHOOK BẮT BUỘC (beat đầu tiên phải dùng đúng câu này): \"{hook['text']}\""
            script = ai.generate_json(creative.SCRIPT_SYSTEM, prompt, validate, seed=v["seed"])
            engine = f"ollama:{config.OLLAMA_MODEL}"
        except RuntimeError as e:
            db.log_activity(f"LLM lỗi schema cho {v['code']}, dùng template engine: {str(e)[:80]}",
                            ctx["campaign"]["project_id"], "warning")
    if script is None:
        script = creative.template_script(ctx["product"], ctx["claims"], concept, faq, v["seed"])
        if hook:
            script["beats"][0] = {**script["beats"][0], "type": "hook", "text": hook["text"]}
    beats = creative.timing(script["beats"])
    flags = all_flags(beats, ctx)
    if hook:
        if v.get("hook_id") != hook["id"]:
            scale.mark_hook_used(hook["id"], variant_id)
    elif db.q1("SELECT COUNT(*) n FROM hooks WHERE campaign_id=? AND status='active'", (v["campaign_id"],))["n"]:
        flags.append({"beat": 0, "code": "HOOK-POOL-LOW", "severity": "warning",
                      "message": "Thư viện hook đã dùng hết lượt — hook này do LLM viết tự do, nên sinh thêm hook"})
    total = beats[-1]["end"] if beats else 0
    if total > concept["duration"] * 1.25:
        flags.append({"beat": None, "code": "WARN-LENGTH", "severity": "warning",
                      "message": f"Kịch bản ~{total:.0f}s dài hơn mục tiêu {concept['duration']}s"})
    ver = (db.q1("SELECT MAX(version) m FROM scripts WHERE variant_id=?", (variant_id,))["m"] or 0) + 1
    s = db.insert("scripts", {"variant_id": variant_id, "version": ver, "title": script["title"],
                              "beats_json": {"hooks": script["hooks"], "beats": beats, "flags": flags,
                                             "est_seconds": total}, "engine": engine,
                              "status": "blocked" if any(f["severity"] == "critical" for f in flags) else "draft",
                              "created_at": db.now()})
    if v["status"] in ("DRAFT", "SCRIPT_READY", "NEEDS_REVISION", "SCRIPT_APPROVED", "STORYBOARD_READY", "PREVIEW_READY"):
        db.update("variants", variant_id, {"status": "SCRIPT_READY", "updated_at": db.now()})
    update_uniqueness(v["campaign_id"], variant_id)
    return s


def update_script(variant_id: str, beats: list[dict], title: str | None) -> dict:
    v = db.q1("SELECT * FROM variants WHERE id=?", (variant_id,))
    if not v:
        raise not_found("biến thể")
    ctx = campaign_context(v["campaign_id"])
    beats = creative.timing([{k: b.get(k) for k in ("type", "text", "on_screen", "visual", "claim_ids", "shot_tags")}
                             for b in beats])
    flags = all_flags(beats, ctx)
    last = latest_script(variant_id)
    ver = (last["version"] if last else 0) + 1
    s = db.insert("scripts", {"variant_id": variant_id, "version": ver, "title": title or (last or {}).get("title"),
                              "beats_json": {"hooks": (last or {}).get("beats_json", {}).get("hooks", []), "beats": beats,
                                             "flags": flags, "est_seconds": beats[-1]["end"] if beats else 0},
                              "engine": "manual",
                              "status": "blocked" if any(f["severity"] == "critical" for f in flags) else "draft",
                              "created_at": db.now()})
    if v["status"] != "SCRIPT_READY":
        try:
            transition(variant_id, "SCRIPT_READY")
        except AppError:
            # Sửa kịch bản khi đã có preview/QC (QC_PENDING, APPROVED…): đi vòng qua NEEDS_REVISION để bản sửa được duyệt
            # và dựng lại, thay vì giữ nguyên video cũ dựng từ kịch bản cũ
            try:
                transition(variant_id, "NEEDS_REVISION", reason="sửa kịch bản")
                transition(variant_id, "SCRIPT_READY", reason="sửa kịch bản")
            except AppError:
                pass
    update_uniqueness(v["campaign_id"], variant_id)
    return s


def latest_script(variant_id: str) -> dict | None:
    return db.q1("SELECT * FROM scripts WHERE variant_id=? ORDER BY version DESC LIMIT 1", (variant_id,))


def latest_storyboard(variant_id: str) -> dict | None:
    return db.q1("SELECT * FROM storyboards WHERE variant_id=? ORDER BY version DESC LIMIT 1", (variant_id,))


def current_flags(variant_id: str, s: dict | None = None) -> list[dict]:
    """Kiểm lại claim theo registry hiện hành (claim có thể bị đổi trạng thái sau khi sinh kịch bản)."""
    s = s or latest_script(variant_id)
    v = db.q1("SELECT campaign_id FROM variants WHERE id=?", (variant_id,))
    ctx = campaign_context(v["campaign_id"])
    flags = all_flags(s["beats_json"]["beats"], ctx)
    if flags != s["beats_json"].get("flags"):
        db.update("scripts", s["id"], {"beats_json": {**s["beats_json"], "flags": flags}})
    return flags


def approve_script(variant_id: str, reviewer: str | None) -> dict:
    s = latest_script(variant_id)
    if not s:
        raise AppError("SCRIPT_MISSING", "Chưa có kịch bản")
    crit = [f for f in current_flags(variant_id, s) if f["severity"] == "critical"]
    if crit:
        raise AppError("BLOCK-01", "Kịch bản còn claim chưa chứng minh/bị cấm — không thể duyệt",
                       details={"flags": crit}, status=409, hint="Sửa câu bị gắn cờ hoặc bổ sung bằng chứng.")
    db.update("scripts", s["id"], {"status": "approved"})
    return transition(variant_id, "SCRIPT_APPROVED", reviewer=reviewer, reason="script approved")


def update_uniqueness(campaign_id: str, variant_id: str | None = None) -> None:
    """M10-01/04: so sánh ngữ nghĩa kịch bản giữa các biến thể + gom cụm.
    Có variant_id → chỉ so bản đó với phần còn lại (O(n), cần cho lô 1000); không có → tính lại toàn bộ."""
    vs = db.q("SELECT id, uniqueness_json FROM variants WHERE campaign_id=?", (campaign_id,))
    texts = []
    for v in vs:
        s = latest_script(v["id"])
        if s:
            texts.append((v["id"], creative.script_text(s["beats_json"]["beats"])))
    if variant_id:
        mine = next((t for vid, t in texts if vid == variant_id), None)
        if mine is None:
            return
        best = (0.0, None)
        cur = {v["id"]: (v["uniqueness_json"] or {}) for v in vs}
        for vid2, t2 in texts:
            if vid2 == variant_id:
                continue
            sim = creative.similarity(mine, t2)
            if sim > best[0]:
                best = (sim, vid2)
            if sim > cur[vid2].get("max_similarity", 0):
                db.update("variants", vid2, {"uniqueness_json": {**cur[vid2], "max_similarity": sim, "nearest": variant_id}})
        db.update("variants", variant_id, {"uniqueness_json": {"max_similarity": best[0], "nearest": best[1]}})
        return
    for vid, t in texts:
        sims = sorted(((creative.similarity(t, t2), vid2) for vid2, t2 in texts if vid2 != vid), reverse=True)
        top = sims[0] if sims else (0, None)
        db.update("variants", vid, {"uniqueness_json": {"max_similarity": top[0], "nearest": top[1]}})
    groups = creative.cluster(texts, threshold=0.6)
    for vid, g in groups.items():
        db.update("variants", vid, {"similarity_group": g})


# ---------------------------------------------------------------- Pipeline C: storyboard / voice / preview
def campaign_canvas(campaign: dict) -> dict:
    aspect = (campaign["brief_json"] or {}).get("aspect", "9:16")
    w, h = render.CANVAS.get(aspect, (1080, 1920))
    return {"aspect": aspect, "width": w, "height": h, "fps": 30}


def pick_template(campaign: dict, concept: dict) -> dict:
    tid = (campaign["brief_json"] or {}).get("template_id")
    t = db.q1("SELECT * FROM templates WHERE id=?", (tid,)) if tid else None
    if not t:
        cat = {"how_to": "Tutorial", "faq": "FAQ", "demo": "Demonstration", "comparison": "Comparison",
               "brand_story": "Story", "feature": "Feature Spotlight", "checklist": "Checklist", "qa": "FAQ",
               "mistakes": "Explainer", "tips": "Tutorial"}.get(concept.get("angle"), "Product Review")
        t = db.q1("SELECT * FROM templates WHERE category=? ORDER BY version DESC LIMIT 1", (cat,)) or \
            db.q1("SELECT * FROM templates LIMIT 1")
    return {**t["template_json"], "id": t["id"], "version": t["version"]} if t else {}


def build_storyboard(variant_id: str) -> dict:
    v = db.q1("SELECT * FROM variants WHERE id=?", (variant_id,))
    s = latest_script(variant_id)
    if not v or not s:
        raise AppError("SCRIPT_MISSING", "Cần kịch bản trước khi dựng storyboard")
    if v["status"] not in ("SCRIPT_APPROVED", "STORYBOARD_READY", "PREVIEW_READY", "QC_PENDING", "FAILED", "NEEDS_REVISION"):
        raise AppError("SCRIPT_NOT_APPROVED", "Kịch bản cần được duyệt trước khi dựng storyboard", status=409)
    ctx = campaign_context(v["campaign_id"])
    beats = s["beats_json"]["beats"]
    usage = Counter()                       # cảnh đã dùng ở các bản khác → ưu tiên cảnh khác (đa dạng hình)
    for o in db.q("SELECT id FROM variants WHERE campaign_id=? AND id!=?", (v["campaign_id"], variant_id)):
        osb = latest_storyboard(o["id"])
        if osb:
            usage.update(c.get("scene_id") for c in osb["timeline_json"]["tracks"]["video"] if c.get("scene_id"))
    assignments, gaps = creative.match_scenes(beats, ctx["scenes"], usage, v["seed"])
    template = pick_template(ctx["campaign"], v["concept_json"])
    timeline = creative.build_timeline(beats, assignments, {sc["id"]: sc for sc in ctx["scenes"]},
                                       campaign_canvas(ctx["campaign"]), template, None, v["seed"], v["concept_json"])
    timeline["gaps"] = gaps
    timeline["script_version"] = s["version"]
    ver = ((latest_storyboard(variant_id) or {}).get("version") or 0) + 1
    sb = db.insert("storyboards", {"variant_id": variant_id, "version": ver, "timeline_json": timeline,
                                   "status": "draft", "created_at": db.now()})
    if v["status"] != "STORYBOARD_READY":
        transition(variant_id, "STORYBOARD_READY")
    return sb


def save_timeline(variant_id: str, timeline: dict) -> dict:
    if timeline.get("schema") != "avf.timeline/1" or "tracks" not in timeline:
        raise AppError("TIMELINE_SCHEMA", "Timeline JSON không đúng schema avf.timeline/1")
    ver = ((latest_storyboard(variant_id) or {}).get("version") or 0) + 1
    return db.insert("storyboards", {"variant_id": variant_id, "version": ver, "timeline_json": timeline,
                                     "status": "edited", "created_at": db.now()})


def job_voice(job: dict, progress) -> dict:
    vid = job["variant_id"]
    s = latest_script(vid)
    sb = latest_storyboard(vid)
    if not s or not sb:
        raise AppError("STORYBOARD_MISSING", "Cần storyboard trước khi tạo giọng đọc", retryable=False)
    v = db.q1("SELECT concept_json, campaign_id FROM variants WHERE id=?", (vid,))
    settings = {"lufs": db.get_setting("loudness_lufs", -16),
                **(db.get_setting("voice_default", {}) or {}),
                **((v or {}).get("concept_json", {}).get("voice") or {}),          # biến số giọng/tốc độ theo concept
                **campaign_voice((v or {}).get("campaign_id")),                     # giọng chiến dịch chọn (có sẵn / nhái)
                **(job["profile_json"].get("voice") or {})}
    try:
        timing, full = tts.synth_beats(s["beats_json"]["beats"], settings)
    except AppError as e:
        if e.code != "VOICE_SERVER_OFFLINE":
            raise
        # bộ giọng nhái không chạy: đọc tạm bằng giọng máy để video vẫn ra, ghi lại để người dùng biết
        settings = {"lufs": settings.get("lufs", -16), **(db.get_setting("voice_default", {}) or {}),
                    **((v or {}).get("concept_json", {}).get("voice") or {})}
        timing, full = tts.synth_beats(s["beats_json"]["beats"], settings)
        db.log_activity("Bộ giọng nhái không chạy nên video được đọc bằng giọng máy. Mở lại app rồi đổi giọng để dựng lại.",
                        None, "warning")
    progress(0.9)
    tl = sb["timeline_json"]
    tl["tracks"]["voice"] = timing
    tl["tracks"]["voice_mix"] = str(full)
    for k, clip in enumerate(tl["tracks"]["video"]):        # đồng bộ cảnh theo giọng thật (theo beat)
        i = clip.get("beat", k)
        if i < len(timing):
            clip["start_ms"], clip["end_ms"] = timing[i]["start_ms"], timing[i]["end_ms"] + (180 if i < len(timing) - 1 else 400)
            sc = db.q1("SELECT * FROM scenes WHERE id=?", (clip["scene_id"],))
            if sc:
                clip["loop"] = (sc["end_ms"] - sc["start_ms"]) < (clip["end_ms"] - clip["start_ms"])
    for k, cap in enumerate(tl["tracks"]["captions"]):
        i = cap.get("beat", k)
        if i < len(timing):
            cap["start_ms"], cap["end_ms"] = timing[i]["start_ms"], timing[i]["end_ms"]
            cap["words"] = tts.word_timing(timing[i])
    for t in tl["tracks"]["titles"]:
        i = t.get("beat")
        if i is not None and i < len(timing):
            t["start_ms"] = timing[i]["start_ms"]
            t["end_ms"] = min(timing[i]["end_ms"], t["start_ms"] + 2500)
    tl["duration_ms"] = (timing[-1]["end_ms"] + 400) if timing else tl["duration_ms"]
    db.insert("voice_jobs", {"script_id": s["id"], "text": creative.script_text(s["beats_json"]["beats"]),
                             "voice_settings_json": settings, "output_uri": str(full),
                             "duration_ms": tl["duration_ms"], "status": "completed", "created_at": db.now()})
    save_timeline(vid, tl)
    return {"voice": str(full), "duration_ms": tl["duration_ms"]}


def _asset_paths(timeline: dict) -> dict[str, Path]:
    ids = {c["asset_id"] for c in timeline["tracks"]["video"]} | \
          {c["alt"]["asset_id"] for c in timeline["tracks"]["video"] if c.get("alt")}
    return {a["id"]: Path(a["uri"]) for a in db.q(f"SELECT id, uri FROM assets WHERE id IN ({','.join('?' * len(ids))})",
                                                    list(ids))} if ids else {}


def safe_name(name: str) -> str:
    """Tên thư mục hợp lệ trên cả Windows (cấm <>:"/\\|?*) lẫn macOS."""
    out = "".join("-" if ch in '<>:"/\\|?*' or ord(ch) < 32 else ch for ch in name).strip(" .")
    return out or "misc"


def render_look(tmpl: dict, brand: dict, tl_style: dict) -> dict:
    """Phong cách edit cho một lần dựng: chọn riêng cho video > mặc định người dùng lưu > kiểu phụ đề của template."""
    from . import looks
    chosen = {**looks.default_look(), **(tl_style.get("look") or {})}
    if not chosen.get("caption"):
        preset = brand.get("caption", {}).get("preset") or tmpl.get("caption", {}).get("preset")
        if preset in looks.CAPTION_STYLES or preset in looks.LEGACY_CAPTION:
            chosen["caption"] = preset if preset in looks.CAPTION_STYLES else looks.LEGACY_CAPTION[preset]
            chosen.setdefault("font", looks.CAPTION_STYLES[chosen["caption"]]["font"])
    return looks.resolve(chosen)


def job_render(job: dict, progress, should_stop) -> dict:
    vid = job["variant_id"]
    v = db.q1("SELECT * FROM variants WHERE id=?", (vid,))
    sb = latest_storyboard(vid)
    if not v or not sb:
        raise AppError("STORYBOARD_MISSING", "Thiếu storyboard", retryable=False)
    kind = job["kind"]
    if kind == "final" and v["status"] not in ("APPROVED", "RENDERING", "COMPLETED", "FAILED"):
        raise AppError("NOT_APPROVED", "Render final chỉ nhận biến thể APPROVED", retryable=False)
    tl = sb["timeline_json"]
    vm = tl["tracks"].get("voice_mix")
    if not vm or not Path(vm).exists():                # chưa có giọng, hoặc file giọng đã bị dọn cache
        job_voice({**job, "profile_json": job["profile_json"]}, lambda p: progress(0.1 * p))
        tl = latest_storyboard(vid)["timeline_json"]
    tmpl = pick_template(db.q1("SELECT * FROM campaigns WHERE id=?", (v["campaign_id"],)), v["concept_json"])
    brand = db.get_setting("brand_active", {}) or {}
    camp = db.q1("SELECT * FROM campaigns WHERE id=?", (v["campaign_id"],))
    brief = (camp or {}).get("brief_json") or {}
    tl_style = tl.get("style") or {}
    style = {"caption": {**tmpl.get("caption", {}), **brand.get("caption", {}),
                         "highlight_words": job["profile_json"].get("highlight_words")
                         or brand.get("caption", {}).get("highlight_words", [])},
             "accent": brand.get("primary", tmpl.get("accent", "#7B56FF")), "dark": brand.get("dark", "#1B2440"),
             "font": scale.FONT_VARIANTS[tl_style.get("font", 0) % len(scale.FONT_VARIANTS)],
             "look": render_look(tmpl, brand, tl_style),
             "caption_position": tl_style.get("caption_position", "low"),
             "tiktok_safe": "tiktok" in (brief.get("platforms") or ["meta", "tiktok"]),
             "logo": brand.get("logo") if brand.get("logo") and Path(str(brand.get("logo"))).exists() else None,
             "outro": {"text": brand.get("outro_text") or (brand.get("cta") or ["Tìm hiểu thêm"])[0],
                       "enabled": bool(brand.get("outro", True))}}
    style["font"] = f"font:{style['look']['font']}"
    out_dir = config.OUTPUT_DIR / safe_name(camp["name"] if camp else "misc") / kind
    out_dir.mkdir(parents=True, exist_ok=True)
    prefix = job["profile_json"].get("prefix", "")
    out = out_dir / f"{prefix}{v['code']}.mp4"
    if kind == "final":
        if v["status"] == "FAILED":
            transition(vid, "APPROVED")
        if v["status"] != "RENDERING":                 # resume sau crash: giữ RENDERING
            transition(vid, "RENDERING")
    gpu = job["profile_json"].get("gpu", True) and bool(db.get_setting("gpu_accel", True))
    enc = system.best_encoder(gpu) if kind == "final" else "libx264"
    try:
        res = render.render_timeline(tl, _asset_paths(tl), out, config.WORK_DIR / job["id"], kind, style, enc,
                                     on_progress=lambda p: progress(0.1 + 0.85 * p), should_stop=should_stop)
    except AppError as e:
        if e.code == "FFMPEG_FAILED" and enc != "libx264":                  # GPU fail → CPU
            res = render.render_timeline(tl, _asset_paths(tl), out, config.WORK_DIR / job["id"], kind, style, "libx264",
                                         on_progress=lambda p: progress(0.1 + 0.85 * p), should_stop=should_stop)
            res["encoder_fallback"] = True
        else:
            if kind == "final":
                # dừng/huỷ: trả về APPROVED để tiếp tục được; lỗi thật mới là FAILED
                transition(vid, "APPROVED" if e.code == "RENDER_CANCELLED" else "FAILED")
            raise
    except Exception:
        if kind == "final":
            _fail_final(vid)
        raise
    shutil.rmtree(config.WORK_DIR / job["id"], ignore_errors=True)
    res["encoder"] = enc
    if kind == "preview":
        if v["status"] in ("STORYBOARD_READY", "PREVIEW_READY"):
            transition(vid, "PREVIEW_READY")
        run_qc(vid, res)
    else:
        try:
            res["qc"] = technical_qc(Path(res["video"]))
            manifest = build_manifest(v, res, sb, tmpl)
            Path(res["video"]).with_suffix(".json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            db.insert("exports", {"render_job_id": job["id"], "variant_id": vid, "output_uri": res["video"],
                                  "manifest_json": manifest, "created_at": db.now()})
            transition(vid, "COMPLETED")
        except Exception:
            _fail_final(vid)
            raise
    return res


def _fail_final(vid: str) -> None:
    """Xuất bản final hỏng ở bất kỳ khâu nào: đưa về FAILED để nút “Xuất lại” dùng được, không kẹt ở RENDERING."""
    try:
        if (db.q1("SELECT status FROM variants WHERE id=?", (vid,)) or {}).get("status") == "RENDERING":
            transition(vid, "FAILED")
    except AppError:
        pass


def build_manifest(v: dict, res: dict, sb: dict, tmpl: dict) -> dict:
    s = latest_script(v["id"])
    return {"variant_id": v["id"], "code": v["code"], "video": res["video"], "srt": res["srt"],
            "thumbnail": res.get("thumbnail"), "sha256": media.sha256_file(Path(res["video"])),
            "duration_ms": res["duration_ms"], "resolution": f"{res['width']}x{res['height']}",
            "encoder": res.get("encoder"), "concept": v["concept_json"], "script_version": s["version"] if s else None,
            "script_engine": s["engine"] if s else None, "storyboard_version": sb["version"],
            "template": {"id": tmpl.get("id"), "version": tmpl.get("version")}, "seed": v["seed"],
            "caption": s["title"] if s else "", "synthetic_media": {"ai_voice": True, "disclosure_required": True},
            "created_at": db.now()}


# ---------------------------------------------------------------- M10: QC
def technical_qc(video: Path) -> dict:
    blacks = media.black_frames(video)
    frozen = media.frozen_frames(video)
    audio = media.audio_levels(video)
    return {"black_frames": blacks, "frozen_frames": frozen, "audio": audio}


def run_qc(variant_id: str, render_res: dict | None = None) -> dict:
    v = db.q1("SELECT * FROM variants WHERE id=?", (variant_id,))
    s = latest_script(variant_id)
    sb = latest_storyboard(variant_id)
    if not v or not s or not sb:
        raise AppError("QC_INPUT", "Cần kịch bản + storyboard + preview để QC")
    ctx = campaign_context(v["campaign_id"])
    checks: dict = {}
    flags = current_flags(variant_id, s)
    claim_flags = [f for f in flags if not f["code"].startswith("POLICY-")]
    policy_flags = [f for f in flags if f["code"].startswith("POLICY-")]
    checks["claim"] = {"status": "fail" if any(f["severity"] == "critical" for f in claim_flags) else
                       "warn" if claim_flags else "pass", "flags": claim_flags}
    checks["policy"] = {"status": "fail" if any(f["severity"] == "critical" for f in policy_flags) else
                        "warn" if policy_flags else "pass", "flags": policy_flags,
                        "industry": ctx["industry"], "platforms": sorted(ctx["platforms"])}
    orig = scale.update_originality(v["campaign_id"]).get(variant_id) if \
        db.q1("SELECT COUNT(*) n FROM variants WHERE campaign_id=?", (v["campaign_id"],))["n"] <= 60 else \
        scale.originality_for(variant_id)
    checks["originality"] = {**(orig or {}), "status": "pass" if not orig else "fail" if not orig.get("pass") else
                             "warn" if orig["score"] < scale.originality_min() + 0.15 else "pass"}
    music = sb["timeline_json"].get("tracks", {}).get("music_mix")
    if music:
        lic = any(Path(music).parent.joinpath(n).exists() for n in ("LICENSE.txt", "LICENSES.txt", "license.txt"))
        checks["music_license"] = {"status": "pass" if lic else "warn", "file": Path(music).name,
                                   "message": None if lic else "Thư mục nhạc chưa có LICENSE.txt — xác nhận quyền dùng thương mại"}
    uq = v["uniqueness_json"] or {}
    checks["script_similarity"] = {"value": uq.get("max_similarity", 0), "nearest": uq.get("nearest"),
                                   "status": "warn" if uq.get("max_similarity", 0) >= 0.6 else "pass"}
    # scene overlap: tỷ lệ cảnh trùng với biến thể gần nhất (M10-02)
    my_scenes = [c["scene_id"] for c in sb["timeline_json"]["tracks"]["video"]]
    overlap = 0.0
    order_same = False
    for other in db.q("SELECT id FROM variants WHERE campaign_id=? AND id!=?", (v["campaign_id"], variant_id)):
        osb = latest_storyboard(other["id"])
        if not osb:
            continue
        o = [c["scene_id"] for c in osb["timeline_json"]["tracks"]["video"]]
        if my_scenes and o:
            ov = len(set(my_scenes) & set(o)) / len(set(my_scenes) | set(o))
            if ov > overlap:
                overlap, order_same = ov, my_scenes == o
    checks["visual_reuse"] = {"value": round(overlap, 2), "same_order": order_same,
                              "status": "warn" if overlap > 0.7 or order_same else "pass"}
    gaps = sb["timeline_json"].get("gaps", [])
    checks["footage"] = {"gaps": gaps, "status": "fail" if any(g["code"] == "BLOCK-03" for g in gaps) else
                         "warn" if gaps else "pass"}
    rights_bad = [a for a in db.q("SELECT file_name, rights FROM assets WHERE project_id=?", (ctx["campaign"]["project_id"],))
                  if a["rights"] in ("unknown", "missing")]
    checks["rights"] = {"status": "fail" if rights_bad else "pass", "assets": rights_bad}
    if render_res and Path(render_res["video"]).exists():
        tq = technical_qc(Path(render_res["video"]))
        checks["technical"] = {**tq, "caption_overflow": render_res.get("caption_overflow", 0),
                               "status": "fail" if tq["black_frames"] or tq["audio"].get("clipping") or not tq["audio"].get("has_audio")
                               else "warn" if tq["frozen_frames"] or render_res.get("caption_overflow") else "pass"}
        ui = render_res.get("tiktok_ui_overlap", 0)
        checks["safe_zone"] = {"status": "warn" if ui else "pass", "tiktok_ui_overlap": ui,
                               "message": f"{ui} khối chữ chạm vùng UI TikTok (đáy 26%, phải 14%)" if ui else None}
        checks["preview"] = {"video": render_res["video"], "thumbnail": render_res.get("thumbnail")}
    checks["disclosure"] = {"status": "warn", "message": "WARN-03: Có giọng AI tổng hợp – xét nhãn disclosure khi đăng"}
    sev = "critical" if any(c.get("status") == "fail" for c in checks.values() if isinstance(c, dict)) else \
          "warning" if any(c.get("status") == "warn" for c in checks.values() if isinstance(c, dict)) else "ok"
    rep = db.insert("qc_reports", {"variant_id": variant_id, "checks_json": checks, "severity": sev,
                                   "decision": None, "created_at": db.now()})
    if v["status"] == "PREVIEW_READY":
        transition(variant_id, "QC_PENDING")
    return rep


def refresh_originality(campaign_id: str) -> None:
    """Tính lại điểm nguyên bản (bỏ qua bản đã loại) và cập nhật vào báo cáo kiểm tra mới nhất của từng bản,
    để loại một bản trong cặp trùng nhau thì bản còn lại dùng được ngay."""
    for vid, orig in scale.update_originality(campaign_id).items():
        rep = db.q1("SELECT id, checks_json FROM qc_reports WHERE variant_id=? ORDER BY created_at DESC LIMIT 1", (vid,))
        if not rep:
            continue
        checks = rep["checks_json"]
        checks["originality"] = {**orig, "status": "fail" if not orig.get("pass") else
                                 "warn" if orig["score"] < scale.originality_min() + 0.15 else "pass"}
        sev = "critical" if any(c.get("status") == "fail" for c in checks.values() if isinstance(c, dict)) else \
              "warning" if any(c.get("status") == "warn" for c in checks.values() if isinstance(c, dict)) else "ok"
        db.update("qc_reports", rep["id"], {"checks_json": checks, "severity": sev})


def review(variant_id: str, decision: str, reviewer: str | None, reason: str | None) -> dict:
    """M10-10: accept / revise / reject / waive-with-reason."""
    rep = db.q1("SELECT * FROM qc_reports WHERE variant_id=? ORDER BY created_at DESC LIMIT 1", (variant_id,))
    if decision in ("accept", "waive"):
        if not rep:
            raise AppError("QC_MISSING", "Chưa có báo cáo QC", status=409)
        if rep["checks_json"]["claim"]["status"] == "fail":
            raise AppError("BLOCK-01", "Video có lỗi claim nghiêm trọng – không thể duyệt", status=409)
        if rep["checks_json"]["rights"]["status"] == "fail":
            raise AppError("BLOCK-02", "Thiếu quyền sử dụng tư liệu – không thể duyệt", status=409)
        if rep["checks_json"].get("policy", {}).get("status") == "fail":
            raise AppError("BLOCK-05", "Vi phạm chính sách quảng cáo Meta/TikTok – không thể duyệt", status=409,
                           details={"flags": rep["checks_json"]["policy"]["flags"]})
        og = rep["checks_json"].get("originality", {})
        if og.get("status") == "fail":
            raise AppError("BLOCK-04", f"Điểm nguyên bản {og.get('score')} dưới ngưỡng {og.get('min')} – quá giống bản "
                           f"{og.get('nearest', '')[:8]}; sửa hook/cảnh/giọng rồi QC lại", status=409, details=og)
        if rep["severity"] == "critical" and decision != "waive":
            raise AppError("QC_CRITICAL", "QC còn lỗi nghiêm trọng; cần sửa hoặc waive kèm lý do", status=409)
        if decision == "waive" and not (reason or "").strip():
            raise AppError("REASON_REQUIRED", "Waive cần ghi lý do", status=422)
        db.update("qc_reports", rep["id"], {"decision": decision})
        return transition(variant_id, "APPROVED", reviewer=reviewer, reason=reason or decision)
    if decision == "revise":
        return transition(variant_id, "NEEDS_REVISION", reviewer=reviewer, reason=reason)
    if decision == "reject":
        res = transition(variant_id, "REJECTED", reviewer=reviewer, reason=reason)
        refresh_originality(res["campaign_id"])
        return res
    raise AppError("BAD_DECISION", "Quyết định không hợp lệ", status=422)


# ---------------------------------------------------------------- chế độ AI: tự chạy từng bước của luồng Tạo video
_AUTO_LOCKS: dict[str, "threading.Lock"] = {}
_AUTO_LAST: dict[str, dict] = {}          # kết quả lượt gần nhất của từng dự án
AUTO_SCRIPT_RETRY = 1     # kịch bản dính cờ nghiêm trọng thì cho AI viết lại tối đa ngần này lần trước khi nhờ người


def auto_advance(project_id: str) -> dict:
    """Chế độ AI: làm bước kế tiếp có thể làm ngay (gọi lặp lại từ giao diện, an toàn khi gọi chồng).
    Tự làm tới khi có bản xem thử; chọn video nào dùng và xuất bản final vẫn do người quyết."""
    import threading
    lock = _AUTO_LOCKS.setdefault(project_id, threading.Lock())
    if not lock.acquire(blocking=False):
        # đang có lượt khác chạy (bộ tự chạy nền hoặc tab khác): trả trạng thái gần nhất để giao diện vẫn hiển thị đúng
        return {**_AUTO_LAST.get(project_id, {"stage": "busy"}), "busy": True}
    try:
        res = _auto_step(project_id)
        _AUTO_LAST[project_id] = res
        return res
    finally:
        lock.release()


def _auto_step(pid: str) -> dict:
    proj = db.q1("SELECT * FROM projects WHERE id=?", (pid,)) or {}
    target = int((proj.get("settings_json") or {}).get("target_count") or 6)
    assets = db.q("SELECT id FROM assets WHERE project_id=? AND media_type='video'", (pid,))
    if not assets:
        return {"stage": "need_video"}
    for a in assets:
        job = db.q1("SELECT status FROM render_jobs WHERE kind='analysis' AND json_extract(profile_json,'$.asset_id')=? "
                    "ORDER BY created_at DESC LIMIT 1", (a["id"],))
        if not job:
            enqueue("analysis", profile={"asset_id": a["id"]}, priority=2)
            return {"stage": "analyzing"}
        if job["status"] in ("PENDING", "PREPARING", "RENDERING", "VERIFYING", "RETRY_WAIT"):
            return {"stage": "analyzing"}
    failed = _failed_analysis(pid)
    if failed and len(failed) == len(assets):       # còn clip phân tích được thì vẫn chạy tiếp bằng các clip đó
        return {"stage": "analysis_failed", "message": failed[0]["message"], "files": [f["file_name"] for f in failed]}
    prod = db.q1("SELECT * FROM products WHERE project_id=? ORDER BY created_at LIMIT 1", (pid,))
    camp = db.q1("SELECT * FROM campaigns WHERE project_id=? ORDER BY created_at LIMIT 1", (pid,))
    if not camp:
        return {"stage": "error", "message": "Dự án thiếu chiến dịch. Hãy tạo dự án mới từ màn Bắt đầu."}
    if not prod:                                    # dự án tạo từ màn Dự án không kèm sản phẩm → tự tạo, AI đặt tên theo clip
        prod = db.insert("products", {"project_id": pid, "name": NAME_FALLBACK, "attributes_json": {"name_auto": True},
                                      "created_at": db.now(), "updated_at": db.now()})
    attrs = prod["attributes_json"] or {}
    n_ok = db.q1("SELECT COUNT(*) n FROM claims WHERE product_id=? AND status='approved'", (prod["id"],))["n"]
    if not attrs.get("clip_read") and (n_ok == 0 or attrs.get("clip_reread")):
        _AUTO_LAST[pid] = {"stage": "reading"}          # bước này AI chạy 1–2 phút, lượt hỏi chen vào thấy đúng tên bước
        try:
            res = product_from_clips(prod["id"])
        except AppError as e:
            if e.code != "NO_CLIP_TEXT":
                raise
            res = {"approved": 0, "no_text": True}
        attrs = (db.q1("SELECT attributes_json FROM products WHERE id=?", (prod["id"],))["attributes_json"] or {})
        attrs["clip_read"] = True
        attrs.pop("clip_reread", None)
        db.update("products", prod["id"], {"attributes_json": attrs})
        return {"stage": "reading", "result": res}
    if n_ok == 0:
        return {"stage": "need_claims"}   # clip không có lời hoặc AI không trích được câu chắc chắn → người bổ sung

    voice_warn = project_voice_pref(pid, camp["id"])
    variants = db.q("SELECT * FROM variants WHERE campaign_id=?", (camp["id"],))
    if not variants or (camp["brief_json"] or {}).get("regen"):
        ctx = campaign_context(camp["id"])
        tags = creative.scene_tag_counts(ctx["scenes"])
        angles = [k for k, a in creative.ANGLES.items() if not [t for t in a["needs"] if not tags[t]]]
        stats = scale.source_stats(pid)
        while target > 3:                  # thiếu nguồn thì tự giảm số bản cho vừa cổng đa dạng nguồn
            need_a, need_s = scale.source_requirement(target)
            if stats["assets"] >= need_a and stats["scenes"] >= need_s:
                break
            target = max(3, target // 2)
        brief = {**{k: v for k, v in (camp["brief_json"] or {}).items() if k != "regen"}, "product_id": prod["id"],
                 "creative_angles": angles,
                 "durations_sec": (camp["brief_json"] or {}).get("durations_sec_auto") or [15, 30],
                 "formats": ["full", "packshot_text", "split", "pip"]}
        db.update("campaigns", camp["id"], {"brief_json": brief, "target_count": target})
        res = generate_variants(camp["id"], target=target)
        for v in db.q("SELECT id FROM variants WHERE campaign_id=? AND status='DRAFT'", (camp["id"],)):
            enqueue("script", variant_id=v["id"], profile={"use_llm": ai.llm_available()}, priority=4)
        return {"stage": "writing", "created": res.get("created")}

    need_you = 0
    stuck: list[dict] = []
    for v in variants:
        if v["status"] != "SCRIPT_READY":
            msg = _heal_variant(v)
            if msg:
                stuck.append({"code": v["code"], "message": msg})
            continue
        s = latest_script(v["id"])
        if not s:
            continue
        if s["engine"] == "manual" and s["status"] == "blocked":
            need_you += 1                  # người đã sửa tay nhưng còn lỗi → không tự đè
            continue
        crit = [f for f in current_flags(v["id"], s) if f["severity"] == "critical"]
        if crit:
            if s["version"] <= AUTO_SCRIPT_RETRY and s["engine"] != "manual":
                if not db.q1("SELECT 1 FROM render_jobs WHERE variant_id=? AND kind='script' AND status IN "
                             "('PENDING','PREPARING','RENDERING')", (v["id"],)):
                    enqueue("script", variant_id=v["id"], profile={"use_llm": ai.llm_available()}, priority=4)
            else:
                need_you += 1
            continue
        try:
            approve_script(v["id"], "ai-autopilot")
            build_storyboard(v["id"])
            enqueue("preview", variant_id=v["id"], profile={}, priority=3)
        except AppError:
            need_you += 1
    by = Counter(v["status"] for v in db.q("SELECT status FROM variants WHERE campaign_id=?", (camp["id"],)))
    busy = db.q1("SELECT COUNT(*) n FROM render_jobs j JOIN variants v ON v.id=j.variant_id WHERE v.campaign_id=? AND "
                 "j.status IN ('PENDING','PREPARING','RENDERING','VERIFYING','RETRY_WAIT')", (camp["id"],))["n"]
    finals = db.q1("SELECT COUNT(*) n FROM render_jobs j JOIN variants v ON v.id=j.variant_id WHERE v.campaign_id=? AND "
                   "j.kind='final' AND j.status IN ('PENDING','PREPARING','RENDERING','VERIFYING','RETRY_WAIT')", (camp["id"],))["n"]
    stage = "writing" if by.get("DRAFT") else "exporting" if finals or by.get("RENDERING") else "rendering" if busy else "review"
    if by.get("COMPLETED") and not busy and not by.get("APPROVED"):
        stage = "done"
    return {"stage": stage, "need_you": need_you, "variants": dict(by), "voice_warning": voice_warn, "stuck": stuck}


AUTO_JOB_RETRY = 2        # số job hỏng liên tiếp (mỗi job đã tự thử 3 lần) trước khi báo người dùng


def _heal_variant(v: dict) -> str | None:
    """Đưa biến thể đang kẹt giữa chừng đi tiếp (máy tắt giữa lúc chạy, job hỏng, hồ sơ vừa đổi).
    Trả về thông báo lỗi khi đã thử lại đủ số lần mà vẫn hỏng."""
    vid, st = v["id"], v["status"]
    kind = {"DRAFT": "script", "STORYBOARD_READY": "preview"}.get(st)
    try:
        if st == "NEEDS_REVISION" and latest_script(vid):
            transition(vid, "SCRIPT_READY", reason="AI kiểm tra lại sau khi nội dung thay đổi")
        elif st == "SCRIPT_APPROVED":
            build_storyboard(vid)
            enqueue("preview", variant_id=vid, profile={}, priority=3)
        elif kind:
            jobs = db.q("SELECT status, error_message FROM render_jobs WHERE variant_id=? AND kind=? ORDER BY created_at DESC "
                        "LIMIT ?", (vid, kind, AUTO_JOB_RETRY))
            if any(j["status"] in ("PENDING", "PREPARING", "RENDERING", "VERIFYING", "RETRY_WAIT", "PAUSED") for j in jobs):
                return None
            if len(jobs) >= AUTO_JOB_RETRY and all(j["status"] == "FAILED" for j in jobs):
                return jobs[0]["error_message"] or "Máy xử lý bản này bị lỗi"
            if not jobs or jobs[0]["status"] in ("FAILED", "CANCELLED") or (st == "DRAFT" and jobs[0]["status"] == "COMPLETED"):
                enqueue(kind, variant_id=vid, profile={"use_llm": ai.llm_available()} if kind == "script" else {},
                        priority=4 if kind == "script" else 3)
    except AppError as e:
        return e.message
    return None


def _failed_analysis(pid: str) -> list[dict]:
    out = []
    for a in db.q("SELECT id, file_name FROM assets WHERE project_id=? AND media_type='video'", (pid,)):
        j = db.q1("SELECT status, error_message FROM render_jobs WHERE kind='analysis' AND "
                  "json_extract(profile_json,'$.asset_id')=? ORDER BY created_at DESC LIMIT 1", (a["id"],))
        if j and j["status"] == "FAILED":
            out.append({"file_name": a["file_name"], "message": j["error_message"] or "Không phân tích được video"})
    return out


def asr_state(pid: str) -> dict:
    """Model nghe đang dùng có đủ chính xác không, và dự án có clip nào nghe bằng model yếu hơn model hiện có không."""
    cur = media.find_whisper_model()
    stale = 0
    for a in db.q("SELECT meta_json FROM assets WHERE project_id=? AND media_type='video'", (pid,)):
        an = (a["meta_json"] or {}).get("analysis") or {}
        if isinstance(an.get("asr"), int) and cur and an.get("asr_model", "ggml-base.bin") != cur.name:
            stale += 1
    return {"installed": bool(cur) and media.tool_available(config.WHISPER_CLI), "accurate": media.whisper_is_accurate(),
            "model": cur.name if cur else None, "stale": stale if media.whisper_is_accurate() else 0}


def redo_from_clips(pid: str) -> dict:
    """Nghe lại clip, lập lại hồ sơ và làm lại các bản chưa xuất. Bản đã xuất và nội dung người tự nhập được giữ."""
    busy = ("PENDING", "PREPARING", "RENDERING", "VERIFYING", "RETRY_WAIT")
    camp = db.q1("SELECT id FROM campaigns WHERE project_id=? ORDER BY created_at LIMIT 1", (pid,))
    removed = 0
    if camp:
        full = db.q1("SELECT brief_json FROM campaigns WHERE id=?", (camp["id"],))
        db.update("campaigns", camp["id"], {"brief_json": {**(full["brief_json"] or {}), "regen": True}})
        c = db.conn()
        c.execute(f"UPDATE render_jobs SET status='CANCELLED', updated_at=? WHERE status IN ({','.join('?' * len(busy))}) AND "
                  "variant_id IN (SELECT id FROM variants WHERE campaign_id=?)", (db.now(), *busy, camp["id"]))
        removed = c.execute("DELETE FROM variants WHERE campaign_id=? AND status NOT IN ('COMPLETED','RENDERING')",
                            (camp["id"],)).rowcount
        c.commit()
    prod = db.q1("SELECT * FROM products WHERE project_id=? ORDER BY created_at LIMIT 1", (pid,))
    if prod:
        attrs = dict(prod["attributes_json"] or {})
        attrs.pop("clip_read", None)
        attrs["clip_reread"] = True
        db.update("products", prod["id"], {"attributes_json": attrs})
    n = 0
    for a in db.q("SELECT id FROM assets WHERE project_id=? AND media_type='video'", (pid,)):
        if not db.q1(f"SELECT 1 FROM render_jobs WHERE kind='analysis' AND json_extract(profile_json,'$.asset_id')=? AND "
                     f"status IN ({','.join('?' * len(busy))})", (a["id"], *busy)):
            enqueue("analysis", profile={"asset_id": a["id"]}, priority=2)
            n += 1
    db.log_activity(f"Làm lại bằng AI: nghe lại {n} clip, bỏ {removed} bản chưa xuất", pid)
    return {"reanalyzing": n, "removed_variants": removed}


# ---------------------------------------------------------------- giọng chiến dịch: giọng máy / giọng có sẵn / nhái giọng trong clip
VOICE_MODES = ("os", "preset", "clone")
CONSENT_MODES = ("clone",)          # giọng dựng sẵn không phải giọng nhái nên không cần xác nhận đồng ý
CONSENT_TEXT = {
    "clone": "Người nói trong clip đã đồng ý cho dùng giọng của họ để tạo giọng AI; video sẽ ghi rõ có dùng giọng AI.",
}


def campaign_voice(campaign_id: str | None) -> dict:
    """Ghi đè provider/voice theo lựa chọn của chiến dịch; giữ tốc độ đọc của từng biến thể để các bản vẫn khác nhau."""
    if not campaign_id:
        return {}
    c = db.q1("SELECT brief_json FROM campaigns WHERE id=?", (campaign_id,))
    ch = ((c or {}).get("brief_json") or {}).get("voice_choice") or {}
    if ch.get("mode") == "clone" and ch.get("ref") and (ch.get("consent") or {}).get("ok"):
        return {"provider": "vieneu_clone", "voice": ch["ref"]}
    if ch.get("mode") == "preset" and ch.get("name"):
        return {"provider": "vieneu_preset", "voice": ch["name"]}
    return {}


def _best_speech_asset(project_id: str) -> dict | None:
    return db.q1("SELECT a.*, (SELECT COALESCE(SUM(LENGTH(t.text)),0) FROM transcript_segments t WHERE t.asset_id=a.id) n "
                 "FROM assets a WHERE a.project_id=? AND a.media_type='video' ORDER BY n DESC LIMIT 1", (project_id,))


def set_campaign_voice(campaign_id: str, mode: str, consent: bool, asset_id: str | None = None,
                       by: str = "local-owner", revoice: bool = True, name: str | None = None) -> dict:
    c = db.q1("SELECT * FROM campaigns WHERE id=?", (campaign_id,))
    if not c:
        raise not_found("chiến dịch")
    if mode not in VOICE_MODES:
        raise AppError("BAD_VOICE_MODE", f"Chế độ giọng phải là một trong {VOICE_MODES}", status=422)
    choice: dict = {"mode": mode}
    if mode == "preset":
        vs = tts.voice_server()
        if not vs.get("ready"):
            raise AppError("VOICE_SERVER_OFFLINE", "Máy chủ giọng chưa chạy", status=503,
                           hint="Cài một lần bằng scripts/setup-voice.sh rồi mở lại app bằng scripts/start.sh.")
        pv = next((x for x in vs.get("presets") or [] if x["name"] == name), None)
        if not pv:
            raise AppError("BAD_VOICE_NAME", "Không có giọng dựng sẵn này", status=422, hint="Chọn một giọng trong danh sách.")
        choice.update(pv)
    elif mode != "os":
        if not consent:
            raise AppError("CONSENT_REQUIRED", "Cần xác nhận người nói đã đồng ý trước khi dùng giọng nhái", status=422,
                           hint=CONSENT_TEXT[mode])
        vs = tts.voice_server()
        if not vs.get("ready"):
            raise AppError("VOICE_SERVER_OFFLINE", "Máy chủ giọng nhái chưa chạy", status=503,
                           hint="Cài một lần bằng scripts/setup-voice.sh rồi mở lại app bằng scripts/start.sh.")
        choice["consent"] = {"ok": True, "by": by, "at": db.now(), "text": CONSENT_TEXT[mode]}
    if mode == "clone":
        a = db.q1("SELECT * FROM assets WHERE id=?", (asset_id,)) if asset_id else _best_speech_asset(c["project_id"])
        if not a:
            raise AppError("NO_SOURCE_VIDEO", "Chưa có video nguồn để lấy mẫu giọng", status=422)
        wins = [[s["start_ms"], s["end_ms"]] for s in db.q("SELECT start_ms, end_ms FROM transcript_segments WHERE asset_id=? "
                                                            "ORDER BY start_ms", (a["id"],))]
        out = config.DATA_DIR / "voice_refs" / f"{a['id']}.wav"
        res = tts.voice_call("/prepare", {"audio": a["uri"], "out": str(out), "windows": wins}, timeout=300)
        # đổi tên theo đoạn đã chọn để cache giọng không dùng nhầm mẫu cũ khi lấy lại mẫu
        ref = out.with_name(f"{a['id']}_{res['start_ms']}_{res['end_ms']}.wav")
        Path(res["ref"]).replace(ref)
        choice.update({"asset_id": a["id"], "file_name": a["file_name"], "ref": str(ref), "start_ms": res["start_ms"],
                       "end_ms": res["end_ms"], "quality": {k: res.get(k) for k in ("speech", "snr_db", "loud_db")}})
    brief = {**(c["brief_json"] or {}), "voice_choice": choice}
    db.update("campaigns", campaign_id, {"brief_json": brief})
    db.log_activity(f"Đổi giọng đọc chiến dịch sang {choice.get('name') or mode}"
                    + (f" (đã xác nhận đồng ý: {by})" if mode in CONSENT_MODES else ""),
                    c["project_id"])
    return {"voice_choice": choice, "revoiced": _revoice(campaign_id) if revoice else 0}


def _revoice(campaign_id: str) -> int:
    """Dựng lại bản xem thử bằng giọng mới cho các bản chưa xuất (bản đã duyệt quay về chờ chọn lại)."""
    n = 0
    for v in db.q("SELECT id, status FROM variants WHERE campaign_id=? AND status IN "
                  "('STORYBOARD_READY','PREVIEW_READY','QC_PENDING','APPROVED','FAILED')", (campaign_id,)):
        sb = latest_storyboard(v["id"])
        if not sb:
            continue
        tl = sb["timeline_json"]
        tl["tracks"]["voice_mix"] = None
        tl["tracks"]["voice"] = []
        try:
            if v["status"] in ("APPROVED", "FAILED"):
                transition(v["id"], "NEEDS_REVISION", reason="đổi giọng đọc")
                transition(v["id"], "STORYBOARD_READY", reason="đổi giọng đọc")
        except AppError:
            continue
        save_timeline(v["id"], tl)
        enqueue("preview", variant_id=v["id"], profile={}, priority=3)
        n += 1
    return n


def project_voice_pref(project_id: str, campaign_id: str) -> str | None:
    """Chế độ AI: giọng chọn lúc tạo dự án được áp vào chiến dịch sau khi đã phân tích clip (cần lời thoại để lấy mẫu)."""
    proj = db.q1("SELECT settings_json FROM projects WHERE id=?", (project_id,)) or {}
    pref = (proj.get("settings_json") or {}).get("voice_pref") or {}
    c = db.q1("SELECT brief_json FROM campaigns WHERE id=?", (campaign_id,)) or {}
    if pref.get("mode") in ("clone", "preset") and not (c.get("brief_json") or {}).get("voice_choice"):
        try:
            set_campaign_voice(campaign_id, pref["mode"], bool(pref.get("consent")), name=pref.get("name"))
        except AppError as e:
            brief = {**(c.get("brief_json") or {}), "voice_choice": {"mode": "os", "fallback_from": pref["mode"], "error": e.message}}
            db.update("campaigns", campaign_id, {"brief_json": brief})
            return e.message
    fb = ((c.get("brief_json") or {}).get("voice_choice") or {})
    if fb.get("fallback_from"):
        return f"Chưa dùng được giọng đã chọn nên máy đọc bằng giọng máy ({fb.get('error')}). Đổi lại ở mục Giọng đọc khi sẵn sàng."
    return None
