"""Chế độ Tin tức: từ nội dung tin + ảnh/video → video dọc kiểu kênh tin.

Hai bố cục (đo từ video tin tức mẫu):
  A. Mở đầu: hình ở nửa trên, nửa dưới là vùng chữ màu có nhãn chuyên mục, ngày đăng và tiêu đề; giọng đọc tiêu đề.
  B. Thân bài: hình rõ nét ở giữa trên nền là chính hình đó làm mờ; giọng đọc kể chi tiết. Không phụ đề.
Toàn bộ lời do giọng AI đọc: tiếng gốc của clip bị tắt hẳn, không trộn dưới giọng đọc. Người dùng có thể tự bật
một đoạn nhả tiếng gốc giữa A và B (mặc định tắt). Mỗi tin lưu thành một thư mục trong data/news/<id>/.

Nhạc nền "auto": đoán tâm trạng của tin (AI lúc viết lời, không có thì theo từ khoá) rồi lấy một bài cùng tâm trạng
trong thư viện nhạc. Biến thể: từ một tin dựng nhiều bản khác tiêu đề, màu, kiểu mở đầu, hình mở đầu và bài nhạc.
"""
from __future__ import annotations

import hashlib
import json
import random
import re
import shutil
import threading
import time
import unicodedata
import uuid
from pathlib import Path

from fastapi import APIRouter, File, UploadFile
from PIL import Image, ImageDraw, ImageFont

from . import ai, config, media, music, scale, tts
from .errors import AppError

router = APIRouter()
NEWS_DIR = config.DATA_DIR / "news"
OUT_DIR = config.OUTPUT_DIR / "tin-tuc"
W, H = 1080, 1920
PANEL_Y = 1000            # mép trên vùng chữ màu ở bố cục A
FG_Y, FG_H = 400, 1120    # khung hình rõ nét ở bố cục B
THEMES = {
    "green": {"name": "Xanh lá", "top": "#47B36F", "bottom": "#18723D"},
    "red": {"name": "Đỏ", "top": "#E5484D", "bottom": "#8C1D22"},
    "orange": {"name": "Cam", "top": "#F97316", "bottom": "#B4470B"},
    "navy": {"name": "Xanh navy", "top": "#2B5FD9", "bottom": "#0F2A4A"},
    "black": {"name": "Đen", "top": "#3A3F4B", "bottom": "#0B0D12"},
}
# phông hẹp đậm (đường dẫn, chỉ số trong bộ .ttc); chỉ dùng phông nào có đủ dấu tiếng Việt
FONT_NARROW = [("/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf", 0), ("/System/Library/Fonts/HelveticaNeue.ttc", 4),
               ("C:/Windows/Fonts/bahnschrift.ttf", 0), ("C:/Windows/Fonts/arialnb.ttf", 0),
               ("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf", 0)]
_font_pick: tuple[str, int] | None = None
STYLES = {"panel": "Vùng chữ màu", "overlay": "Chữ trên hình"}      # kiểu phần mở đầu
EDITABLE = ("headline", "hook", "body", "source_text", "category", "channel", "credit", "date_label", "theme", "voice",
            "music", "raw_gap_s", "style", "music_mood", "kind", "cta_text", "price", "offer", "link", "platform",
            "caption", "hashtags", "angle", "subs", "cut_silence", "speak", "clip_count", "clip_len", "sub_fixes",
            "look", "cap_style", "font")
# hai chế độ gốc dựng ở file này; bốn chế độ sau dựng ở modes.py (dùng chung kho tin, hàng đợi, nhạc, sổ kết quả)
KINDS = {"news": "Tin tức", "sale": "Bán hàng", "review": "Review người thật", "clips": "Cắt video dài",
         "story": "Kể chuyện bằng ảnh", "quote": "Trích dẫn"}
MODE_KINDS = ("review", "clips", "story", "quote")
# nền tảng đăng video bán hàng: câu kêu gọi mặc định khác nhau vì chỗ đặt link mỗi nơi một kiểu
PLATFORMS = {
    "tiktok": {"name": "TikTok Shop", "cta": "Bấm vào giỏ hàng ở góc trái màn hình để xem chi tiết."},
    "shopee": {"name": "Shopee Video", "cta": "Bấm vào sản phẩm ngay bên dưới video để xem chi tiết."},
    "facebook": {"name": "Facebook Reels", "cta": "Xem đường dẫn ở phần bình luận để biết thêm chi tiết."},
    "other": {"name": "Nền tảng khác", "cta": "Xem đường dẫn ở phần mô tả để biết thêm chi tiết."},
}
RATES = (1.0, 1.04, 0.97, 1.06, 0.98, 1.02)      # nhịp đọc của từng biến thể
MAX_MEDIA = 12
MAX_VARIANTS = 6
NEWS_MOODS = ("news", "dramatic", "emotional", "inspirational", "upbeat", "calm", "corporate", "funny")
# đoán tâm trạng theo từ khoá khi không có AI; xét theo thứ tự, không khớp gì thì là "news"
MOOD_WORDS = (
    ("emotional", ("qua đời", "từ trần", "thương tâm", "xúc động", "mồ côi", "hoàn cảnh", "nghẹn ngào", "tiễn biệt")),
    ("dramatic", ("tai nạn", "cháy", "nổ", "bão", "lũ", "sạt lở", "bắt giữ", "truy nã", "vụ án", "khẩn cấp", "cảnh báo",
                  "tử vong", "lừa đảo")),
    ("inspirational", ("vô địch", "kỷ lục", "vượt khó", "huy chương", "giải thưởng", "thủ khoa", "truyền cảm hứng")),
    ("funny", ("hài hước", "bật cười", "đáng yêu", "dở khóc dở cười")),
    ("corporate", ("doanh nghiệp", "ra mắt", "sản phẩm", "công nghệ", "thị trường", "doanh thu", "đầu tư", "trí tuệ nhân tạo")),
    ("upbeat", ("lễ hội", "khai trương", "du lịch", "ẩm thực", "ca nhạc")),
)
_render_lock = threading.Lock()
_io_lock = threading.Lock()


# ---------------------------------------------------------------- lưu trữ
def _dir(nid: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{12}", nid or ""):
        raise AppError("NOT_FOUND", "Không tìm thấy tin", status=404)
    return NEWS_DIR / nid


def load(nid: str) -> dict:
    f = _dir(nid) / "item.json"
    if not f.is_file():
        raise AppError("NOT_FOUND", "Không tìm thấy tin", status=404)
    return json.loads(f.read_text("utf-8"))


def save(item: dict) -> dict:
    item["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    d = _dir(item["id"])
    d.mkdir(parents=True, exist_ok=True)
    with _io_lock:
        tmp = d / "item.json.tmp"
        tmp.write_text(json.dumps(item, ensure_ascii=False, indent=1), "utf-8")
        tmp.replace(d / "item.json")
    return item


def _patch(nid: str, **kw) -> dict:
    item = load(nid)
    item.update(kw)
    return save(item)


def create(data: dict) -> dict:
    vs = tts.voice_server()
    names = [x["name"] for x in vs.get("presets") or []]
    item = {
        "id": uuid.uuid4().hex[:12], "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "status": "draft", "progress": 0,
        "headline": "", "hook": "", "body": "", "source_text": "", "category": "TIN TỨC", "channel": "", "credit": "",
        "date_label": time.strftime("%d/%m/%Y"), "theme": "green", "style": "panel", "raw_gap_s": 0,
        "music": "auto", "music_mood": None, "variants": [], "kind": "news", "platform": "tiktok", "cta_text": "",
        "price": "", "offer": "", "link": "", "caption": "", "hashtags": "", "angle": "",
        "subs": True, "cut_silence": True, "speak": False, "clip_count": 5, "clip_len": 45,
        "voice": {"mode": "preset", "name": "Mai Anh" if "Mai Anh" in names else names[0]} if names else {"mode": "os"},
        "media": [], "output": None, "error": None, "warning": None,
    }
    return save(_clean({**item, **{k: v for k, v in (data or {}).items() if k in EDITABLE}}))


def _clean(item: dict) -> dict:
    for k in ("headline", "hook", "body", "source_text", "category", "channel", "credit", "date_label", "cta_text", "price",
              "offer", "link", "caption", "hashtags", "angle"):
        item[k] = str(item.get(k) or "").strip()[: 6000 if k in ("body", "source_text") else 2000 if k in ("caption", "link") else 400]
    if item.get("kind") not in KINDS:
        item["kind"] = "news"
    if item.get("platform") not in PLATFORMS:
        item["platform"] = "tiktok"
    item["sub_fixes"] = str(item.get("sub_fixes") or "")[:2000]
    from . import looks
    for k, table in (("look", looks.EDIT_STYLES), ("cap_style", looks.CAPTION_STYLES), ("font", looks.FONTS)):
        if item.get(k) not in table:
            item[k] = ""                                   # trống = theo mặc định người dùng đã lưu
    item["subs"], item["cut_silence"], item["speak"] = item.get("subs") is not False, item.get("cut_silence") is not False, item.get("speak") is True
    try:
        item["clip_count"] = max(1, min(10, int(item.get("clip_count") or 5)))
        item["clip_len"] = min((30, 45, 60), key=lambda x: abs(x - int(item.get("clip_len") or 45)))
    except (TypeError, ValueError):
        item["clip_count"], item["clip_len"] = 5, 45
    if item.get("theme") not in THEMES:
        item["theme"] = "green"
    item["raw_gap_s"] = max(0, min(20, int(float(item.get("raw_gap_s") or 0))))
    v = item.get("voice") or {}
    item["voice"] = {"mode": "preset", "name": str(v.get("name"))} if v.get("mode") == "preset" and v.get("name") else {"mode": "os"}
    if item.get("style") not in STYLES:
        item["style"] = "panel"
    if item.get("music_mood") not in NEWS_MOODS:
        item["music_mood"] = None          # None = để máy tự đoán
    if item.get("music") and item["music"] != "auto" and item["music"] not in [m["path"] for m in scale.music_library()]:
        item["music"] = None
    return item


# ---------------------------------------------------------------- nhạc tự động
def mood_of(item: dict) -> str:
    """Tâm trạng nhạc của tin: người dùng chọn > AI đoán lúc viết lời > từ khoá > "news"."""
    if item.get("music_mood") in NEWS_MOODS:
        return item["music_mood"]
    if item.get("mood_ai") in NEWS_MOODS:
        return item["mood_ai"]
    text = " ".join(str(item.get(k) or "") for k in ("headline", "hook", "body", "source_text")).lower()
    for mood, words in MOOD_WORDS:
        if any(w in text for w in words):
            return mood
    return "news"


def pick_music(item: dict) -> dict | None:
    """Bài nhạc dùng cho tin. "auto": bài cùng tâm trạng, mỗi biến thể một bài khác; thiếu thì lùi về nhóm Tin tức."""
    m = item.get("music")
    if not m:
        return None
    lib = scale.music_library()
    if m != "auto":
        return next((x for x in lib if x["path"] == m), None)
    mood = mood_of(item)
    pool = [x for x in lib if x["mood"] == mood] or [x for x in lib if x["mood"] == "news"] or \
           [x for x in lib if x["mood"] in ("corporate", "calm")]
    if not pool:
        return None
    seed = int(hashlib.sha1(item["id"].encode()).hexdigest()[:8], 16)
    return pool[(seed + int(item.get("variant_k") or 0)) % len(pool)]


def list_items() -> list[dict]:
    out = []
    for f in NEWS_DIR.glob("*/item.json") if NEWS_DIR.exists() else []:
        try:
            out.append(json.loads(f.read_text("utf-8")))
        except (OSError, ValueError):
            continue
    return sorted(out, key=lambda x: x.get("updated_at") or "", reverse=True)


# ---------------------------------------------------------------- viết lời
def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?…])\s+|\n+", text or "") if len(s.strip()) > 2]


def _source_text(item: dict) -> str:
    if item["source_text"]:
        return item["source_text"]
    for m in item["media"]:           # không dán nội dung: nghe lời trong clip đầu tiên có tiếng
        if m["type"] == "video" and m.get("has_audio"):
            work = _dir(item["id"]) / "work"
            work.mkdir(exist_ok=True)
            text = " ".join(s["text"] for s in media.transcribe(Path(m["path"]), work))
            if len(text) > 40:
                return text
    raise AppError("NEWS_NO_SOURCE", "Chưa có nội dung tin để viết lời", status=422,
                   hint="Dán nội dung tin vào ô Nội dung, hoặc thả một clip có người nói.")


SYSTEM_NEWS = ("Bạn là biên tập viên video tin tức ngắn tiếng Việt. Chỉ dùng thông tin có trong nội dung được đưa, "
               "không thêm tên người, con số, địa danh hay chi tiết nào không có trong đó. Trả về JSON.")
SYSTEM_SALE = ("Bạn là người viết lời video giới thiệu sản phẩm tiếng Việt. Chỉ dùng thông tin có trong mô tả sản phẩm được đưa. "
               "Tuyệt đối không bịa công dụng, con số, giá, ưu đãi, chứng nhận hay lời khách hàng. Không tự thêm lời khen về chất lượng, "
               "độ bền, độ an toàn, hiệu quả hay thời gian sử dụng nếu mô tả không ghi đúng điều đó. Không hứa kết quả chắc chắn, "
               "không khẳng định chữa khỏi bệnh, không chê sản phẩm khác. Trả về JSON.")
MOOD_RULE = ("- mood: không khí của video để chọn nhạc nền, đúng một trong các từ: news (thời sự trung tính), dramatic "
             "(căng thẳng, sự cố), emotional (xúc động, buồn), inspirational (vượt khó, thành tích), upbeat (vui, lễ hội), "
             "calm (nhẹ nhàng, đời sống), corporate (kinh doanh, công nghệ), funny (hài hước).\n")
CAPTION_RULE = ("- caption: 1 đến 2 câu để dán vào phần mô tả khi đăng video, không dùng hashtag trong câu.\n"
                "- hashtags: 4 đến 6 hashtag tiếng Việt không dấu viết liền, cách nhau bằng dấu cách, sát nội dung.\n")


def _script_prompt(item: dict, src: str) -> tuple[str, str]:
    if item.get("kind") == "sale":
        angle = f"Góc nội dung bắt buộc của video này: {item['angle']}.\n" if item.get("angle") else ""
        return SYSTEM_SALE, (
            "Viết lời cho video dọc giới thiệu sản phẩm dài khoảng 30 đến 45 giây từ mô tả dưới đây.\n" + angle +
            'Khuôn JSON: {"headline": "...", "hook": "...", "body": ["câu 1", ...], "caption": "...", '
            '"hashtags": "...", "mood": "..."}\n'
            "- headline: dòng chữ hiện trên màn hình lúc mở đầu, tối đa 120 ký tự, nêu đúng vấn đề người xem đang gặp "
            "hoặc lợi ích chính của sản phẩm.\n"
            "- hook: 1 đến 2 câu đọc mở đầu, cùng ý với headline, viết để đọc thành tiếng.\n"
            "- body: 4 đến 6 câu, mỗi câu dưới 28 chữ, đi theo thứ tự: vấn đề người dùng gặp, sản phẩm giải quyết thế nào, "
            "điểm đáng chú ý có trong mô tả, cách dùng hoặc ai nên dùng.\n"
            "Không viết câu kêu gọi mua hàng trong body: video đã có màn chốt riêng.\n" + CAPTION_RULE + MOOD_RULE +
            "\nMÔ TẢ SẢN PHẨM:\n" + src)
    return SYSTEM_NEWS, (
        "Viết lời cho video tin dọc khoảng 45 đến 60 giây từ nội dung dưới đây.\n"
        'Khuôn JSON: {"headline": "...", "hook": "...", "body": ["câu 1", "câu 2", ...], "caption": "...", "hashtags": "...", '
        '"mood": "..."}\n'
        "- headline: tiêu đề hiện trên màn hình, 1 đến 2 câu, tối đa 200 ký tự, nêu đúng điều đáng chú ý nhất.\n"
        "- hook: 2 câu đọc mở đầu, cùng ý với headline, viết để đọc thành tiếng.\n"
        "- body: 4 đến 7 câu kể lại diễn biến theo thứ tự, mỗi câu dưới 30 chữ, câu cuối là một câu kết nhẹ nhàng. "
        "Giọng kể khách quan, không giật gân, không suy diễn.\n" + CAPTION_RULE + MOOD_RULE + "\nNỘI DUNG:\n" + src)


def new_numbers(text: str, source: str) -> list[str]:
    """Các con số xuất hiện trong lời AI viết mà không có trong nội dung gốc (dấu hiệu AI tự bịa số liệu)."""
    def nums(t):
        return {re.sub(r"[.,\s]", "", n) for n in re.findall(r"\d[\d.,]*", str(t or ""))}
    words = {"một": "1", "hai": "2", "ba": "3", "bốn": "4", "năm": "5", "sáu": "6", "bảy": "7", "tám": "8", "chín": "9", "mười": "10"}
    known = nums(source) | {v for k, v in words.items() if re.search(rf"\b{k}\b", str(source or "").lower())}
    return sorted(n for n in nums(text) if n and n not in known)


_VI_SYLLABLE = re.compile(r"(ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnpqrstvx])?[aeiouy]{1,3}(ch|ng|nh|[cmnpt])?")


def foreign_words(text: str, source: str) -> list[str]:
    """Từ không dấu, không mang dáng âm tiết tiếng Việt và không có trong lời gốc: dấu hiệu AI tự dịch thuật ngữ sang
    tiếng nước ngoài (ví dụ "máy ghi âm" thành "recorder"). Từ nước ngoài người dùng đã viết sẵn trong lời thì được giữ."""
    known = set(re.findall(r"[a-z]+", str(source or "").lower()))
    out = []
    for w in re.findall(r"(?<![\w])[A-Za-z]{3,}(?![\w])", str(text or "")):
        lw = w.lower()
        if lw not in known and not _VI_SYLLABLE.fullmatch(lw) and lw not in out:
            out.append(lw)
    return out


def _hashtags(text: str) -> str:
    """Chuẩn hoá hashtag: mỗi thẻ viết liền, không dấu, chữ thường; tối đa 8 thẻ. "#bình giữ nhiệt #inox" → "#binhgiunhiet #inox"."""
    text = str(text or "")
    raw = text.split("#") if "#" in text else re.split(r"[\s,;]+", text)
    tags = []
    for t in raw:
        t = unicodedata.normalize("NFD", t.replace("đ", "d").replace("Đ", "D"))
        t = re.sub(r"[^a-z0-9]", "", "".join(c for c in t if unicodedata.category(c) != "Mn").lower())
        if 2 <= len(t) <= 30 and "#" + t not in tags:
            tags.append("#" + t)
    return " ".join(tags[:8])


def write_script(nid: str) -> dict:
    item = load(nid)
    if item.get("kind") in MODE_KINDS:
        from . import modes
        return _patch(nid, **modes.write(item), status="draft", error=None)
    src = _source_text(item)[:5000]
    engine = "mau"
    headline, hook, body, extra = "", "", [], {}
    if ai.llm_available():
        def ok(o):
            h, k, b = str(o["headline"]).strip(), str(o["hook"]).strip(), [str(x).strip() for x in o["body"] if str(x).strip()]
            if not (12 <= len(h) <= 240 and len(k) >= 15 and 3 <= len(b) <= 9):
                raise ValueError("sai khuôn")
            if new_numbers(" ".join([h, k, *b, str(o.get("caption") or "")]), src):
                raise ValueError("có con số không nằm trong nội dung gốc")
            return h, k, b, {x: str(o.get(x) or "").strip() for x in ("mood", "caption", "hashtags")}
        try:
            headline, hook, body, extra = ai.generate_json(*_script_prompt(item, src), ok, temperature=0.5)
            engine = "llm"
        except RuntimeError:
            pass
    if not headline:                  # không có AI: lấy nguyên văn, 2 câu đầu làm tiêu đề
        ss = _sentences(src)
        if not ss:
            raise AppError("NEWS_NO_SOURCE", "Nội dung tin quá ngắn", status=422)
        hook = " ".join(ss[:2])
        headline = hook[:220]
        body = ss[2:9] or ss[:1]
    mood = extra.get("mood", "").lower()
    return _patch(nid, headline=headline, hook=hook, body="\n".join(body), source_text=item["source_text"] or src,
                  script_engine=engine, mood_ai=mood if mood in NEWS_MOODS else None, status="draft", error=None,
                  caption=(extra.get("caption") or headline)[:2000], hashtags=_hashtags(extra.get("hashtags") or item["category"]))


def script_text(item: dict) -> str:
    """Lời hiện tại của tin đúng như người dùng đang thấy trên màn hình: tiêu đề, lời mở đầu, thân bài."""
    return "\n".join(str(item.get(k) or "").strip() for k in ("headline", "hook", "body")).strip()


def script_hash(item: dict) -> str:
    """Dấu vân tay của mọi thứ được đọc thành tiếng hoặc hiện thành chữ; dùng để biết video có còn khớp lời hiện tại không."""
    parts = [script_text(item)] + [str(item.get(k) or "") for k in ("cta_text", "price", "offer", "category", "channel", "kind", "platform")]
    return hashlib.sha1("\u241f".join(parts).encode()).hexdigest()[:16]


def cta_line(item: dict) -> str:
    """Câu kêu gọi cuối video bán hàng: người dùng tự viết, không thì lấy câu mặc định theo nền tảng."""
    return item.get("cta_text") or PLATFORMS[item.get("platform") if item.get("platform") in PLATFORMS else "tiktok"]["cta"]


def caption_text(item: dict) -> str:
    """Nội dung file chữ đi kèm video: mô tả, hashtag, đường dẫn. Dán thẳng khi đăng."""
    parts = [item.get("caption") or item.get("headline") or "", _hashtags(item.get("hashtags"))]
    if item.get("link"):
        parts.append(item["link"])
    return "\n\n".join(x for x in parts if x).strip()


# ---------------------------------------------------------------- hình chữ
def _has_vietnamese(f) -> bool:
    blank = bytes(f.getmask("\uffff"))
    return all(f.getmask(c).size[0] > 0 and bytes(f.getmask(c)) != blank for c in "ữờẩỡặƯỞ")


def _font(size: int) -> ImageFont.FreeTypeFont:
    global _font_pick
    if _font_pick is None:
        for p, i in FONT_NARROW + [(c, 0) for c in config.FONT_CANDIDATES]:
            try:
                if Path(p).exists() and _has_vietnamese(ImageFont.truetype(p, 40, index=i)):
                    _font_pick = (p, i)
                    break
            except OSError:
                continue
        else:
            _font_pick = ("", 0)
    return ImageFont.truetype(_font_pick[0], size, index=_font_pick[1]) if _font_pick[0] else ImageFont.load_default()


def _rgb(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def _wrap(d: ImageDraw.ImageDraw, text: str, f, width: int) -> list[str]:
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if d.textlength(t, font=f) <= width or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    return lines + ([cur] if cur else [])


def _shadow_text(d, xy, text, f, fill=(255, 255, 255, 255)):
    d.text((xy[0] + 2, xy[1] + 2), text, font=f, fill=(0, 0, 0, 170))
    d.text(xy, text, font=f, fill=fill)


def _tag(d, x: int, y: int, text: str, f, bg, fg=(255, 255, 255, 255), pad=(18, 9), radius=10, right: bool = False) -> int:
    tw = int(d.textlength(text, font=f))
    bw, bh = tw + pad[0] * 2, f.size + pad[1] * 2
    if right:
        x -= bw
    d.rounded_rectangle((x, y, x + bw, y + bh), radius=radius, fill=bg)
    d.text((x + pad[0], y + bh / 2 + f.size * 0.06), text, font=f, fill=fg, anchor="lm")   # canh giữa theo chiều dọc
    return bh


def overlay_a(item: dict, out: Path) -> dict:
    """Bố cục A: vùng chữ màu ở nửa dưới (mép trên hoà dần vào hình), nhãn chuyên mục, ngày đăng, tiêu đề."""
    th = THEMES[item["theme"]]
    top, bot = _rgb(th["top"]), _rgb(th["bottom"])
    overlay = item.get("style") == "overlay"
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x, ind = 56, 34 if overlay else 0
    limit = H - 300                   # chừa vùng nút và chú thích của TikTok/Reels
    head = (100 if item["category"] else 0) + (64 if item["date_label"] else 0)     # chiều cao nhãn chuyên mục + ngày đăng
    text = (item["headline"] or "").upper()
    measure = ImageDraw.Draw(im)
    size, lines, f = 86, [], _font(86)
    while size >= 44:                 # thu nhỏ chữ tới khi tiêu đề vừa vùng chữ
        f = _font(size)
        lines = _wrap(measure, text, f, W - 2 * x - ind)
        if PANEL_Y + 6 + head + len(lines) * int(size * 1.22) <= limit:
            break
        size -= 2
    lh = int(size * 1.22)
    cut = max(1, (limit - PANEL_Y - 6 - head) // lh)
    overflow = len(lines) > cut
    if overflow:
        lines = lines[:cut]
        lines[-1] = lines[-1].rstrip(".,:;") + "…"
    # kiểu chữ trên hình: khối chữ dồn xuống đáy vùng an toàn để lộ nhiều hình nhất
    y = max(PANEL_Y + 6, limit - head - len(lines) * lh) if overlay else PANEL_Y + 6
    raw = ImageDraw.Draw(im)             # vẽ thẳng giá trị điểm ảnh (không hoà màu) để tạo dải chuyển
    if overlay:                          # hình phủ kín khung, tối dần từ phía trên khối chữ xuống đáy
        y0 = y - 300
        for yy in range(y0, H):
            raw.line([(0, yy), (W, yy)], fill=(8, 10, 14, min(232, int(232 * ((yy - y0) / 380) ** 1.25))))
    else:
        fade = 110
        for yy in range(PANEL_Y - fade, H):
            t = max(0.0, (yy - PANEL_Y) / (H - PANEL_Y))
            c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
            a = 255 if yy >= PANEL_Y else int(255 * ((yy - (PANEL_Y - fade)) / fade) ** 1.6)
            raw.line([(0, yy), (W, yy)], fill=(*c, a))
        deco = Image.new("RGBA", (W, H), (0, 0, 0, 0))      # dải sáng chéo rất nhạt cho vùng màu đỡ phẳng
        dd = ImageDraw.Draw(deco)
        for k in range(7):
            x0 = -300 + k * 240
            dd.polygon([(x0, H), (x0 + 90, H), (x0 + 690, PANEL_Y), (x0 + 600, PANEL_Y)], fill=(255, 255, 255, 12))
        im = Image.alpha_composite(im, deco)
    d = ImageDraw.Draw(im, "RGBA")       # vẽ có hoà màu: nhãn bán trong không đục thủng vùng màu
    accent = (255, 255, 255) if overlay and item["theme"] == "black" else top      # nền tối thì màu đen không nổi
    if item["category"]:
        cf = _font(40)
        d.rounded_rectangle((x - 5, y - 5, x + int(d.textlength(item["category"].upper(), font=cf)) + 56 + 5, y + 40 + 28 + 5),
                            radius=38, fill=(255, 255, 255, 240))
        y += _tag(d, x, y, item["category"].upper(), cf, (*top, 255), radius=34, pad=(28, 14)) + 32
    if item["date_label"]:
        y += _tag(d, x, y, f"NGÀY ĐĂNG: {item['date_label']}", _font(28), (0, 0, 0, 80), pad=(14, 7), radius=6) + 22
    if overlay:                          # vạch màu chạy dọc bên trái tiêu đề thay cho vùng màu
        d.rounded_rectangle((x, y + 4, x + 12, y + len(lines) * lh - int(size * 0.2)), radius=6, fill=(*accent, 255))
    for ln in lines:
        _shadow_text(d, (x + ind, y), ln, f)
        y += lh
    if item["credit"]:
        _shadow_text(d, (56, 150), item["credit"].upper(), _font(30))
    im.save(out)
    return {"font": size, "lines": len(lines), "overflow": overflow}


def overlay_b(item: dict, out: Path) -> None:
    """Bố cục B: tên kênh góc trên phải, ghi nguồn góc trên trái, ngày đăng dưới khung hình."""
    th = THEMES[item["theme"]]
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if item["credit"]:
        _shadow_text(d, (56, 150), item["credit"].upper(), _font(30))
    if item["channel"]:
        _tag(d, W - 56, 136, item["channel"].upper(), _font(40), (*_rgb(th["top"]), 255), radius=10, pad=(22, 11), right=True)
    if item["date_label"]:
        _tag(d, 56, FG_Y + FG_H + 34, f"NGÀY ĐĂNG: {item['date_label']}", _font(28), (0, 0, 0, 110), pad=(14, 7), radius=6)
    im.save(out)


def overlay_c(item: dict, out: Path) -> None:
    """Màn chốt của video bán hàng: nền là hình làm mờ tối, giữa là lời kêu gọi, giá và ưu đãi."""
    th = THEMES[item["theme"]]
    top, bot = _rgb(th["top"]), _rgb(th["bottom"])
    im = Image.new("RGBA", (W, H), (0, 0, 0, 120))
    d = ImageDraw.Draw(im, "RGBA")
    x, width = 90, W - 180
    f = _font(78)
    lines = _wrap(d, cta_line(item).upper().rstrip("."), f, width - 80)[:5]
    extras = [(item.get("price") or "").strip()[:40], (item.get("offer") or "").strip()[:80]]
    h = 70 + len(lines) * 96 + (150 if extras[0] else 0) + (len(_wrap(d, extras[1], _font(46), width - 80)) * 60 + 30 if extras[1] else 0) + 50
    y = max(420, (H - 300 - h) // 2 + 100)
    d.rounded_rectangle((x, y, x + width, y + h), radius=36, fill=(*bot, 235))
    d.rounded_rectangle((x, y, x + width, y + 16), radius=8, fill=(*top, 255))
    y += 70
    for ln in lines:
        d.text((W // 2, y + 40), ln, font=f, fill=(255, 255, 255, 255), anchor="mm")
        y += 96
    if extras[0]:
        pf = _font(96)
        tw = int(d.textlength(extras[0].upper(), font=pf))
        d.rounded_rectangle((W // 2 - tw // 2 - 36, y + 14, W // 2 + tw // 2 + 36, y + 136), radius=24, fill=(255, 255, 255, 255))
        d.text((W // 2, y + 80), extras[0].upper(), font=pf, fill=(*bot, 255), anchor="mm")
        y += 150
    if extras[1]:
        y += 20
        for ln in _wrap(d, extras[1], _font(46), width - 80):
            d.text((W // 2, y + 26), ln, font=_font(46), fill=(255, 255, 255, 235), anchor="mm")
            y += 60
    if item["channel"]:
        _tag(d, W - 56, 136, item["channel"].upper(), _font(40), (*top, 255), radius=10, pad=(22, 11), right=True)
    im.save(out)


# ---------------------------------------------------------------- dựng
def _ff(args: list[str], timeout: int = 1800) -> None:
    r = media.run([config.FFMPEG, "-y", "-v", "error", *args], timeout=timeout)
    if r.returncode != 0:
        raise AppError("NEWS_RENDER_FAILED", "FFmpeg không dựng được video tin", details={"stderr": (r.stderr or "")[-500:]})


def _cover(m: dict, w: int, h: int) -> str:
    """Chuỗi lọc đưa nguồn về đúng w×h (cắt cho đầy khung); ảnh thì thêm phóng chậm cho có chuyển động."""
    if m["type"] == "image":
        return (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
                f"zoompan=z='min(1+0.0004*on,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={w}x{h}:fps=30,setsar=1")
    return f"fps=30,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1"


def _src_args(m: dict, start: float, dur: float) -> list[str]:
    if m["type"] == "image":
        return ["-loop", "1", "-framerate", "30", "-t", f"{dur:.3f}", "-i", m["path"]]
    span = max(0.5, (m.get("duration_ms") or 0) / 1000)
    return ["-stream_loop", "-1", "-ss", f"{start % span:.3f}", "-t", f"{dur:.3f}", "-i", m["path"]]


def _segment(m: dict, start: float, dur: float, layout: str, png: Path, out: Path, style: str = "panel", fx: str = "") -> None:
    """fx: chuỗi lọc màu / hiệu ứng cắt của phong cách edit (looks.segment_vf frame_only), áp lên hình trước khi phủ chữ."""
    if layout == "A":
        fc = (f"[0:v]{_cover(m, W, H if style == 'overlay' else PANEL_Y + 40)}{fx}[v];color=c=black:s={W}x{H}:r=30:d={dur:.3f}[bg];"
              f"[bg][v]overlay=0:0:shortest=1[b];[b][1:v]overlay=0:0,format=yuv420p[o]")
    elif layout == "C":
        fc = (f"[0:v]{_cover(m, W // 2, H // 2)},boxblur=14:2,eq=brightness=-0.12,scale={W}:{H}{fx}[b];"
              f"[b][1:v]overlay=0:0,format=yuv420p[o]")
    else:
        fc = (f"[0:v]{_cover(m, W, FG_H)}{fx},split[f1][f2];"
              f"[f1]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=9:2,"
              f"eq=brightness=-0.05:saturation=1.1,scale={W}:{H}[bg];"
              f"[bg][f2]overlay=0:{FG_Y}[b];[b][1:v]overlay=0:0,format=yuv420p[o]")
    _ff([*_src_args(m, start, dur), "-loop", "1", "-i", str(png), "-filter_complex", fc, "-map", "[o]", "-t", f"{dur:.3f}",
         "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", str(out)])


def _voice_settings(item: dict) -> dict:
    base = {"lufs": -16, "rate": float(item.get("rate") or 1.0)}
    if item["voice"].get("mode") == "preset":
        return {**base, "provider": "vieneu_preset", "voice": item["voice"]["name"]}
    return {**base, **tts.default_voice()}


def _speak(sentences: list[str], settings: dict, out: Path) -> float:
    """Đọc từng câu rồi ghép lại, giữa các câu nghỉ 0,22 giây. Trả về độ dài (giây)."""
    wavs = [tts.synth(s, settings)[0] for s in sentences]
    args, fc = [], ""
    for i, w in enumerate(wavs):
        args += ["-i", str(w)]
        fc += f"[{i}:a]aresample=48000,apad=pad_dur=0.22[a{i}];"
    fc += "".join(f"[a{i}]" for i in range(len(wavs))) + f"concat=n={len(wavs)}:v=0:a=1[o]"
    _ff([*args, "-filter_complex", fc, "-map", "[o]", "-ac", "1", str(out)])
    return media.probe(out)["duration_ms"] / 1000


def plan(item: dict, hook_s: float, body_s: float, cta_s: float = 0.0) -> dict:
    """Chia thời lượng: A = lúc đọc tiêu đề; nhả tiếng gốc; B = lúc đọc thân bài; C = màn chốt (video bán hàng).
    Tin có "seed" (biến thể): thứ tự hình thân bài, độ dài từng hình và điểm bắt đầu trong clip được xáo theo seed,
    để các bản không trùng nhau từng khung hình."""
    ms = item["media"]
    first = ms[0]
    rng = random.Random(int(item["seed"])) if item.get("seed") else None
    t_a = hook_s + 0.5
    gap = float(item["raw_gap_s"]) if first["type"] == "video" and first.get("has_audio") else 0.0
    if gap and (first.get("duration_ms") or 0) / 1000 < t_a + gap:
        gap = 0.0                     # clip quá ngắn thì không nhả tiếng gốc
    t_b = body_s + 0.8
    n = max(1, min(len(ms), int(t_b // 3.5) or 1))          # mỗi hình hiện ít nhất khoảng 3,5 giây
    rest = ms[1:]
    if rng:
        rng.shuffle(rest)
    order = ([first] + rest)[:n]
    weights = [rng.uniform(0.8, 1.25) for _ in order] if rng else [1.0] * len(order)
    segs = [{"media": first, "start": 0.0, "dur": t_a, "layout": "A"}]
    for i, m in enumerate(order):
        dur = t_b * weights[i] / sum(weights)
        start = t_a if i == 0 else 0.0
        if rng and i and m["type"] == "video":
            start = rng.uniform(0, max(0.0, (m.get("duration_ms") or 0) / 1000 - dur))
        segs.append({"media": m, "start": start, "dur": dur + (gap if i == 0 else 0.0), "layout": "B"})
    t_c = cta_s + 1.0 if cta_s else 0.0
    if t_c:
        segs.append({"media": first, "start": 0.0, "dur": t_c, "layout": "C"})
    return {"t_a": t_a, "gap": gap, "t_b": t_b, "t_c": t_c, "total": t_a + gap + t_b + t_c, "segs": segs}


def _build(item: dict, work: Path, out: Path, thumb: Path, on, cache: Path | None = None) -> dict:
    """Dựng một video từ một bản tin (hoặc một biến thể của nó). on(phần trăm, tên bước) để báo tiến độ.
    cache: thư mục giữ lại file đọc thân bài, các biến thể cùng giọng khỏi phải đọc lại."""
    if item.get("kind") in MODE_KINDS:
        from . import modes
        if item["kind"] == "clips":
            raise AppError("BAD_INPUT", "Chế độ cắt video dài dựng theo lô clip, không dựng một video", status=422)
        return modes.BUILDERS[item["kind"]](item, work, out, thumb, on)
    if not item["media"]:
        raise AppError("NEWS_NO_MEDIA", "Cần ít nhất một ảnh hoặc video", status=422)
    hook = _sentences(item["hook"] or item["headline"])
    body = _sentences(item["body"])
    if not hook or not body:
        raise AppError("NEWS_NO_SCRIPT", "Chưa có lời đọc", status=422, hint="Bấm “AI viết lời” hoặc tự nhập tiêu đề và lời đọc.")
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    warning = None
    settings = _voice_settings(item)
    on(5, "Đang đọc lời")
    try:
        hook_s = _speak(hook, settings, work / "hook.wav")
    except AppError as e:
        if e.code != "VOICE_SERVER_OFFLINE":
            raise
        settings = {"lufs": -16, "rate": 1.0, **tts.default_voice()}
        warning = "Bộ giọng chưa chạy nên video được đọc bằng giọng máy."
        hook_s = _speak(hook, settings, work / "hook.wav")
    body_wav = work / "body.wav"
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha1(json.dumps([settings, body], ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()[:12]
        body_wav = cache / f"body-{key}.wav"
    body_s = media.probe(body_wav)["duration_ms"] / 1000 if body_wav.is_file() else _speak(body, settings, body_wav)
    cta_s = _speak(_sentences(cta_line(item)) or [cta_line(item)], settings, work / "cta.wav") if item.get("kind") == "sale" else 0.0
    p = plan(item, hook_s, body_s, cta_s)
    on(30, "Đang dựng hình")
    style = item.get("style") or "panel"
    from . import looks
    look = looks.item_look(item)
    info = overlay_a(item, work / "a.png")
    overlay_b(item, work / "b.png")
    if cta_s:
        overlay_c(item, work / "c.png")
    parts = []
    for i, s in enumerate(p["segs"]):
        seg = work / f"seg{i}.mp4"
        _segment(s["media"], s["start"], s["dur"], s["layout"], work / f"{s['layout'].lower()}.png", seg, style,
                 looks.segment_vf(look, i, W, H, frame_only=True))
        parts.append(seg)
        on(30 + int(45 * (i + 1) / len(p["segs"])), None)
    (work / "list.txt").write_text("".join(f"file '{x.name}'\n" for x in parts), "utf-8")
    _ff(["-f", "concat", "-safe", "0", "-i", str(work / "list.txt"), "-c", "copy", str(work / "video.mp4")])
    on(80, "Đang trộn âm thanh")
    total, t_a, gap = p["total"], p["t_a"], p["gap"]
    args = ["-i", str(work / "hook.wav"), "-i", str(body_wav)]
    fc = f"[0:a]adelay=250:all=1[h];[1:a]adelay={int((t_a + gap) * 1000) + 300}:all=1[b];"
    mix = "[h][b]"
    first = item["media"][0]
    if gap:      # tiếng gốc chỉ phát trong đoạn người dùng chủ động bật; lúc giọng AI đọc thì tắt hẳn để không lẫn tiếng người
        args += ["-stream_loop", "-1", "-i", first["path"]]
        a0, a1 = t_a + 0.15, t_a + gap - 0.15
        fc += (f"[{args.count('-i') - 1}:a]aresample=48000,atrim={a0:.2f}:{a1:.2f},asetpts=PTS-STARTPTS,"
               f"afade=t=in:d=0.25,afade=t=out:st={max(0.0, a1 - a0 - 0.3):.2f}:d=0.3,adelay={int(a0 * 1000)}:all=1[s];")
        mix += "[s]"
    if cta_s:
        args += ["-i", str(work / "cta.wav")]
        fc += f"[{args.count('-i') - 1}:a]adelay={int((t_a + gap + p['t_b']) * 1000) + 350}:all=1[c];"
        mix += "[c]"
    track = pick_music(item)
    if track and not Path(track["path"]).is_file():
        track = None
    if item.get("music") == "auto" and not track:
        warning = warning or "Thư viện nhạc chưa có bài nào nên video không có nhạc nền. Vào Thư viện nhạc để tải."
    if track:
        args += ["-stream_loop", "-1", "-i", track["path"]]
        idx = args.count("-i") - 1
        fc += (f"[{idx}:a]aresample=48000,atrim=0:{total:.2f},volume=0.11,afade=t=in:d=0.6,"
               f"afade=t=out:st={max(0, total - 1.2):.2f}:d=1.2[m];")
        mix += "[m]"
    fc += f"{mix}amix=inputs={mix.count('[')}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:{total:.2f}[o]"
    _ff([*args, "-filter_complex", fc, "-map", "[o]", "-ar", "48000", "-ac", "2", str(work / "audio.wav")])
    out.parent.mkdir(parents=True, exist_ok=True)
    _ff(["-i", str(work / "video.mp4"), "-i", str(work / "audio.wav"), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
         "-movflags", "+faststart", "-shortest", str(out)])
    thumb.parent.mkdir(parents=True, exist_ok=True)
    _ff(["-ss", "1", "-i", str(out), "-frames:v", "1", "-vf", "scale=360:-2", str(thumb)])
    shutil.rmtree(work, ignore_errors=True)
    caption = caption_text(item)
    out.with_suffix(".txt").write_text(caption + "\n", "utf-8")       # file chữ đi kèm: dán khi đăng
    voice = settings.get("voice") if settings.get("provider") == "vieneu_preset" else "Giọng máy"
    return {"path": str(out), "thumb": str(thumb), "duration_ms": int(total * 1000), "headline_fit": info, "warning": warning,
            "caption": caption, "caption_file": str(out.with_suffix(".txt")), "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "script_hash": script_hash(item),
            "formula": {"kind": item.get("kind") or "news", "theme": item["theme"], "style": style, "voice": voice,
                        "mood": track["mood"] if track else "none", "platform": item.get("platform") if item.get("kind") == "sale" else None},
            "music": {"name": track["name"], "mood": track["mood"], "auto": item.get("music") == "auto"} if track else None,
            "layout": {"a_s": round(t_a, 1), "raw_s": round(gap, 1), "b_s": round(p["t_b"], 1), "c_s": round(p["t_c"], 1),
                       "shots": len([x for x in p["segs"] if x["layout"] == "B"])}}


def _out_name(item: dict, suffix: str = "") -> Path:
    name = re.sub(r"[^\w\- ]+", "", (item["headline"] or "tin")[:50], flags=re.UNICODE).strip().replace(" ", "-") or "tin"
    return OUT_DIR / f"{name}-{item['id'][:6]}{suffix}.mp4"


def render(nid: str) -> dict:
    item = load(nid)
    if item.get("kind") == "clips":
        from . import modes
        return modes.make_clips(nid, None, "done" if item.get("variants") else "draft")
    _patch(nid, status="rendering", progress=2, error=None)
    res = _build(item, _dir(nid) / "work", _out_name(item), _dir(nid) / "thumb.jpg",
                 lambda p, stage: _patch(nid, progress=p, **({"stage": stage} if stage else {})))
    return _patch(nid, status="done", progress=100, stage=None, warning=res.pop("warning"), output=res)


# ---------------------------------------------------------------- biến thể
def alt_headlines(item: dict, n: int) -> list[dict]:
    """n bộ lời khác cho cùng một tin: tiêu đề + lời mở đầu khác góc nhìn, thân bài viết lại bằng câu chữ khác.
    Không có AI thì trả về rỗng (các bản dùng chung lời, chỉ khác hình, màu, nhạc, nhịp)."""
    if n <= 0 or not ai.llm_available():
        return []
    # Nguồn duy nhất là lời người dùng đã duyệt (tiêu đề, mở đầu, thân bài), KHÔNG phải nội dung gốc: nội dung gốc có thể
    # là lời bóc băng còn sai tên riêng, sai từ mà người dùng đã sửa tay trong lời; lấy lại từ đó là đọc lại lỗi cũ.
    src = script_text(item)[:4000]
    facts = " ".join([src, str(item.get("price") or ""), str(item.get("offer") or "")])

    def ok(o):
        out = []
        for x in o["variants"]:
            h, k = str(x["headline"]).strip(), str(x["hook"]).strip()
            if 12 <= len(h) <= 240 and len(k) >= 15 and h.lower() != item["headline"].strip().lower() \
                    and not new_numbers(h + " " + k, facts) and not foreign_words(h + " " + k, facts):   # có con số lạ hoặc từ tự dịch thì bỏ
                out.append({"headline": h, "hook": k, "body": "",
                            "caption": str(x.get("caption") or "").strip()[:2000]})
        if not out:
            raise ValueError("không có tiêu đề hợp lệ")
        return out[:n]
    try:
        return ai.generate_json(
            SYSTEM_SALE if item.get("kind") == "sale" else SYSTEM_NEWS,
            f"Lời video dưới đây đã được người biên tập duyệt. Viết thêm {n} cách mở đầu KHÁC cho cùng video này, mỗi cách một góc nhìn riêng "
            "(ví dụ: nêu con số nổi bật, đặt câu hỏi, nói về hệ quả, nói về con người trong tin).\n"
            'Khuôn JSON: {"variants": [{"headline": "...", "hook": "...", "caption": "..."}, ...]}\n'
            "- headline: tiêu đề hiện trên màn hình, 1 đến 2 câu, tối đa 200 ký tự.\n"
            "- hook: 2 câu đọc mở đầu cùng ý với headline, viết để đọc thành tiếng.\n"
            "- caption: 1 đến 2 câu mô tả để dán khi đăng, khác câu chữ với các bản còn lại.\n"
            "Chỉ dùng thông tin có trong lời đã duyệt. Viết tên người, tên sản phẩm, tên thiết bị và thuật ngữ ĐÚNG TỪNG CHỮ "
            "như trong lời đã duyệt, không đổi sang cách viết khác. Khách quan, không giật gân, không suy diễn, "
            "không nêu con số nào ngoài con số có trong lời đã duyệt, không trùng ý với tiêu đề đã có.\n\n"
            f"TIÊU ĐỀ ĐÃ CÓ: {item['headline']}\n\nLỜI ĐÃ DUYỆT:\n{src}", ok, temperature=0.8)
    except RuntimeError:
        return []


def rewrite_body(item: dict, k: int) -> str:
    """Viết lại lời thân bài bằng câu chữ khác cho biến thể thứ k, giữ đúng ý và số câu. Không được thì trả về rỗng."""
    lines = _sentences(item["body"])
    if not lines or not ai.llm_available():
        return ""

    def ok(o):
        b = o["body"]
        b = [str(x).strip() for x in b if str(x).strip()] if isinstance(b, list) else _sentences(str(b))
        if len(b) != len(lines) or any(len(x) > 260 for x in b) or new_numbers(" ".join(b), item["body"]) \
                or foreign_words(" ".join(b), item["body"]) or sum(x.lower() == y.lower() for x, y in zip(b, lines)) > len(lines) // 2:
            raise ValueError("viết lại chưa đạt")
        return "\n".join(b)
    try:
        return ai.generate_json(
            "Bạn là biên tập viên tiếng Việt. Việc của bạn là diễn đạt lại câu cho khác chữ mà giữ nguyên ý. Không thêm thông tin, "
            "con số, lời khen hay chi tiết nào không có trong câu gốc. Trả về JSON.",
            f"Viết lại {len(lines)} câu dưới đây, mỗi câu thành đúng một câu mới khác cách diễn đạt, giữ nguyên ý và thứ tự. "
            "Đổi cấu trúc câu và từ ngữ thông thường, không đổi nội dung. Tên người, tên sản phẩm, tên thiết bị và thuật ngữ "
            "phải giữ ĐÚNG TỪNG CHỮ như câu gốc. Viết hoàn toàn bằng tiếng Việt, không dịch từ nào sang tiếng Anh.\n"
            'Khuôn JSON: {"body": ["câu 1 viết lại", "câu 2 viết lại", ...]}\n\n' + "\n".join(f"{i + 1}. {x}" for i, x in enumerate(lines)),
            ok, temperature=0.7, seed=100 + k, timeout=240)
    except RuntimeError:
        return ""


def variant_specs(item: dict, count: int, alts: list[dict], voices: list[str], vary_voice: bool = False,
                  order: dict | None = None) -> list[dict]:
    """Công thức từng biến thể. Bản 1 giữ đúng lựa chọn của người dùng; các bản sau đổi lời (tiêu đề, mở đầu, thân bài),
    màu, kiểu mở đầu, hình mở đầu, thứ tự và độ dài hình, nhịp đọc; nhạc tự động thì mỗi bản một bài.
    Giọng chỉ đổi khi người dùng bật. order: thứ tự ưu tiên màu/kiểu rút từ sổ kết quả (công thức thắng lên trước)."""
    def ring(all_keys, cur, pref):
        rest = [x for x in (pref or []) if x in all_keys and x != cur]
        return [cur] + rest + [x for x in all_keys[all_keys.index(cur) + 1:] + all_keys[:all_keys.index(cur)] if x not in rest]
    themes = ring(list(THEMES), item["theme"], (order or {}).get("theme"))
    styles = ring(list(STYLES), item.get("style") or "panel", (order or {}).get("style"))
    ms = item["media"]
    v0 = item["voice"].get("name") if item["voice"].get("mode") == "preset" else None
    out = []
    for k in range(max(1, min(MAX_VARIANTS, count))):
        alt = alts[k - 1] if 0 < k <= len(alts) else {}
        r = k % len(ms) if ms else 0
        voice = item["voice"]
        if vary_voice and v0 in voices and len(voices) > 1:
            voice = {"mode": "preset", "name": voices[(voices.index(v0) + k) % len(voices)]}
        out.append({"k": k, "headline": alt.get("headline") or item["headline"], "hook": alt.get("hook") or item["hook"],
                    "body": alt.get("body") or item["body"], "caption": alt.get("caption") or item.get("caption") or "",
                    "theme": themes[k % len(themes)], "style": styles[k % len(styles)],
                    "media": ms[r:] + ms[:r], "voice": voice, "variant_k": k, "seed": k, "rate": RATES[k % len(RATES)]})
    return out


def make_variants(nid: str, count: int, vary_voice: bool = False, prev_status: str = "draft") -> dict:
    item = load(nid)
    if item.get("kind") == "clips":
        from . import modes
        return modes.make_clips(nid, count, prev_status)
    simple = item.get("kind") in MODE_KINDS      # các chế độ này không viết lại lời: biến thể chỉ khác màu, hình, nhạc, giọng, nhịp
    for v in item.get("variants") or []:          # bỏ video của lượt biến thể trước
        for f in ((v.get("output") or {}).get("path"), (v.get("output") or {}).get("thumb"), (v.get("output") or {}).get("caption_file")):
            if f and Path(f).is_file() and (OUT_DIR in Path(f).parents or _dir(nid) in Path(f).parents):
                Path(f).unlink(missing_ok=True)
    count = max(2, min(MAX_VARIANTS, int(count)))
    _patch(nid, status="rendering", progress=2, error=None, stage="Đang viết thêm tiêu đề", variants=[])
    voices = [x["name"] for x in tts.voice_server().get("presets") or []]
    alts = [] if simple else alt_headlines(item, count - 1)
    alts += [{} for _ in range(count - 1 - len(alts))]
    for k, alt in enumerate([] if simple else alts, start=1):            # thân bài mỗi bản viết lại riêng một lượt: model nhỏ làm gộp thì hay bỏ sót
        if not alt.get("body"):
            _patch(nid, stage=f"Đang viết lại lời cho bản {k + 1}/{count}", progress=2 + k)
            alt["body"] = rewrite_body(item, k)
    specs = variant_specs(item, count, alts, voices, vary_voice, winner_order())
    base_hash = script_hash(item)          # các biến thể sinh ra từ lời này; lời đổi thì cả lô thành cũ
    rows = [{"k": s["k"], "status": "waiting", "headline": s["headline"], "theme": s["theme"], "style": s["style"],
             "base_hash": base_hash,
             "rewritten": s["body"] != item["body"], "rate": s["rate"],
             "voice": s["voice"].get("name") or "Giọng máy", "first_media": s["media"][0]["name"] if s["media"] else None,
             "output": None, "error": None} for s in specs]
    _patch(nid, variants=rows, progress=5)
    cache = _dir(nid) / "cache"
    for i, s in enumerate(specs):
        rows[i]["status"] = "rendering"
        _patch(nid, variants=rows)

        def on(p, stage, i=i):
            _patch(nid, progress=int((i + p / 100) / len(specs) * 100),
                   **({"stage": f"Bản {i + 1}/{len(specs)}: {stage}"} if stage else {}))
        try:
            res = _build({**item, **s}, _dir(nid) / "work", _out_name({**item, "headline": item["headline"]}, f"-ban{i + 1}"),
                         _dir(nid) / "variants" / f"{i + 1}.jpg", on, cache)
            rows[i].update(status="done", output=res)
        except AppError as e:
            rows[i].update(status="failed", error=e.message + (f" ({e.hint})" if e.hint else ""))
        except Exception as e:  # noqa: BLE001 — một bản hỏng không dừng các bản còn lại
            rows[i].update(status="failed", error=str(e)[:300])
        _patch(nid, variants=rows)
    shutil.rmtree(cache, ignore_errors=True)
    return _patch(nid, status=prev_status if prev_status in ("draft", "done") else "draft", progress=100, stage=None, variants=rows)


# ---------------------------------------------------------------- sổ kết quả
DIMS = {"theme": "Màu", "style": "Kiểu mở đầu", "voice": "Giọng đọc", "mood": "Nhạc", "kind": "Loại video"}


def videos() -> list[dict]:
    """Mọi video đã dựng (bản chính và biến thể) kèm công thức và số liệu người dùng nhập."""
    out = []
    for it in list_items():
        rows = [(None, it.get("headline"), it.get("output"))] + [(v["k"], v.get("headline"), v.get("output")) for v in it.get("variants") or []]
        for k, headline, o in rows:
            if o and o.get("path"):
                out.append({"nid": it["id"], "k": k, "headline": headline or "", "path": o["path"], "thumb": o.get("thumb"),
                            "created_at": o.get("created_at") or it.get("updated_at"), "formula": o.get("formula") or {},
                            "caption": o.get("caption") or "", "stats": o.get("stats") or {}})
    return sorted(out, key=lambda x: x["created_at"] or "", reverse=True)


def results() -> dict:
    """Gộp số liệu theo từng yếu tố của công thức. Chỉ tính video đã được nhập lượt xem."""
    vids = videos()
    have = [v for v in vids if v["stats"].get("views") is not None]
    dims = {}
    for dim in DIMS:
        groups: dict[str, dict] = {}
        for v in have:
            key = str(v["formula"].get(dim) or "")
            if not key:
                continue
            g = groups.setdefault(key, {"value": key, "videos": 0, "views": 0, "orders": 0})
            g["videos"] += 1
            g["views"] += int(v["stats"].get("views") or 0)
            g["orders"] += int(v["stats"].get("orders") or 0)
        rows = [{**g, "avg_views": round(g["views"] / g["videos"]),
                 "orders_per_1000": round(g["orders"] * 1000 / g["views"], 2) if g["views"] else 0.0} for g in groups.values()]
        dims[dim] = sorted(rows, key=lambda g: (g["orders_per_1000"], g["avg_views"]), reverse=True)
    return {"videos": vids, "with_stats": len(have), "dims": dims, "labels": DIMS, "min_videos": MIN_VIDEOS}


MIN_VIDEOS = 3        # một giá trị cần ít nhất chừng này video có số liệu mới được coi là đủ để ưu tiên


def winner_order() -> dict:
    """Thứ tự ưu tiên màu và kiểu mở đầu cho lô biến thể sau, rút từ sổ kết quả. Thiếu dữ liệu thì không ưu tiên gì."""
    dims = results()["dims"]
    return {d: [g["value"] for g in dims[d] if g["videos"] >= MIN_VIDEOS] for d in ("theme", "style")}


def set_stats(nid: str, k: int | None, data: dict) -> dict:
    item = load(nid)
    target = item.get("output") if k is None else next((v.get("output") for v in item.get("variants") or [] if v["k"] == k), None)
    if not target:
        raise AppError("NOT_FOUND", "Không tìm thấy video này", status=404)
    stats = dict(target.get("stats") or {})
    for key in ("views", "orders", "likes"):
        if key in data:
            try:
                stats[key] = None if data[key] in (None, "") else max(0, int(data[key]))
            except (TypeError, ValueError):
                raise AppError("BAD_INPUT", "Số liệu phải là số nguyên", status=422) from None
    if "url" in data:
        stats["url"] = str(data["url"] or "")[:500]
    target["stats"] = stats
    return save(item)


def _variants_bg(nid: str, count: int, vary_voice: bool, prev_status: str) -> None:
    with _render_lock:
        try:
            make_variants(nid, count, vary_voice, prev_status)
        except Exception as e:  # noqa: BLE001
            _patch(nid, status="failed", error=getattr(e, "message", None) or str(e)[:300], stage=None)


def _render_bg(nid: str) -> None:
    with _render_lock:                # mỗi lúc chỉ dựng một tin để không tranh CPU với hàng đợi chính
        try:
            render(nid)
        except AppError as e:
            _patch(nid, status="failed", error=e.message + (f" ({e.hint})" if e.hint else ""), stage=None)
        except Exception as e:  # noqa: BLE001 — báo lên màn hình thay vì chết im lặng
            _patch(nid, status="failed", error=str(e)[:300], stage=None)


def recover() -> None:
    """Mở lại app giữa lúc đang dựng: tin kẹt ở trạng thái đang dựng được trả về để người dùng bấm dựng lại."""
    for it in list_items():
        if it.get("status") == "rendering":
            _patch(it["id"], status="failed", stage=None, error="App bị tắt khi đang dựng. Bấm Dựng video để làm lại.")


# ---------------------------------------------------------------- API
@router.get("/news")
def api_list():
    return {"items": list_items(), "themes": THEMES, "styles": STYLES, "kinds": KINDS, "max_clips": 10,
            "platforms": {k: v["name"] for k, v in PLATFORMS.items()}, "platform_cta": {k: v["cta"] for k, v in PLATFORMS.items()}, "voices": tts.voice_server().get("presets") or [],
            "music": scale.music_library(), "moods": {k: music.MOODS[k] for k in NEWS_MOODS}, "max_variants": MAX_VARIANTS}


@router.post("/news")
def api_create(data: dict | None = None):
    return create(data or {})


@router.get("/news/{nid}")
def api_get(nid: str):
    item = load(nid)
    h = script_hash(item)
    o, vs = item.get("output") or {}, item.get("variants") or []
    return {**item, "auto_mood": mood_of(item),
            # video dựng từ lời cũ (người dùng đã sửa lời sau khi dựng); video dựng trước khi có dấu vân tay thì không kết luận
            "output_stale": bool(o.get("script_hash")) and o["script_hash"] != h,
            "variants_stale": any(v.get("base_hash") and v["base_hash"] != h for v in vs)}


@router.put("/news/{nid}")
def api_update(nid: str, data: dict):
    item = load(nid)
    if item["status"] == "rendering":
        raise AppError("NEWS_BUSY", "Tin đang được dựng, chờ xong rồi sửa", status=409)
    item.update({k: v for k, v in data.items() if k in EDITABLE})
    return save(_clean(item))


@router.delete("/news/{nid}")
def api_delete(nid: str):
    item = load(nid)
    if item["status"] == "rendering":
        raise AppError("NEWS_BUSY", "Tin đang được dựng, chờ xong rồi xoá", status=409)
    shutil.rmtree(_dir(nid), ignore_errors=True)      # video đã xuất trong thư mục output được giữ lại
    return {"ok": True}


@router.post("/news/{nid}/media")
async def api_media(nid: str, file: UploadFile = File(...)):
    item = load(nid)
    if len(item["media"]) >= MAX_MEDIA:
        raise AppError("NEWS_TOO_MANY", f"Mỗi tin tối đa {MAX_MEDIA} ảnh và video", status=422)
    name = Path(file.filename or "file").name
    kind = media.media_type_of(name)
    if kind not in ("video", "image"):
        raise AppError("ASSET_UNSUPPORTED", "Tin tức chỉ nhận ảnh và video", status=422)
    d = _dir(nid) / "media"
    d.mkdir(parents=True, exist_ok=True)
    mid = uuid.uuid4().hex[:8]
    dst = d / f"{mid}{Path(name).suffix.lower()}"
    with dst.open("wb") as f:
        shutil.copyfileobj(file.file, f, 1 << 20)
    try:
        meta = media.probe(dst)
    except AppError:
        dst.unlink(missing_ok=True)
        raise
    item = load(nid)
    item["media"].append({"id": mid, "name": name, "path": str(dst), "type": kind, "duration_ms": meta.get("duration_ms") or 0,
                          "has_audio": bool(meta.get("audio_codec")) and kind == "video",
                          "width": meta.get("width"), "height": meta.get("height")})
    return save(item)


@router.delete("/news/{nid}/media/{mid}")
def api_media_delete(nid: str, mid: str):
    item = load(nid)
    for m in [x for x in item["media"] if x["id"] == mid]:
        if not m.get("shared"):               # hình mượn từ thư viện sản phẩm thì chỉ gỡ khỏi tin, không xoá file
            Path(m["path"]).unlink(missing_ok=True)
    item["media"] = [x for x in item["media"] if x["id"] != mid]
    return save(item)


@router.post("/news/{nid}/media/{mid}/first")
def api_media_first(nid: str, mid: str):
    item = load(nid)
    item["media"].sort(key=lambda x: x["id"] != mid)       # hình đưa lên đầu sẽ dùng cho phần mở
    return save(item)


@router.post("/news/{nid}/write")
def api_write(nid: str):
    return write_script(nid)


@router.post("/news/{nid}/render")
def api_render(nid: str):
    item = load(nid)
    if item["status"] == "rendering":
        return item
    from . import modes
    modes.ready(item)
    item = _patch(nid, status="rendering", progress=1, error=None, stage="Đang chờ lượt")
    threading.Thread(target=_render_bg, args=(nid,), daemon=True, name=f"news-{nid}").start()
    return item


@router.post("/news/{nid}/variants")
def api_variants(nid: str, data: dict | None = None):
    """Dựng nhiều biến thể của một tin: {count: 2..6, vary_voice: bool}."""
    data = data or {}
    item = load(nid)
    if item["status"] == "rendering":
        return item
    from . import modes
    modes.ready(item)
    try:
        count = int(data.get("count") or (item.get("clip_count") if item.get("kind") == "clips" else 3))
    except (TypeError, ValueError):
        count = 3
    prev = "done" if item.get("output") else "draft"
    item = _patch(nid, status="rendering", progress=1, error=None, stage="Đang chờ lượt")
    threading.Thread(target=_variants_bg, args=(nid, count, bool(data.get("vary_voice")), prev), daemon=True,
                     name=f"news-var-{nid}").start()
    return item


@router.put("/news/{nid}/stats")
def api_stats(nid: str, data: dict):
    """Nhập kết quả sau khi đăng: {k: null (bản chính) | số thứ tự biến thể, views, orders, likes, url}."""
    return set_stats(nid, data.get("k"), data)


@router.get("/news-results")
def api_results():
    return results()
