"""Phong cách edit, kiểu phụ đề và thư viện font.

Ý tưởng lấy từ bộ engine của AI Video Studio (cùng tác giả Nguyễn Tất Kiểm, MIT): style bible "AI Hype Cam" (phụ đề
karaoke, punch zoom giấu vết cắt, grade màu), bộ kiểu phụ đề captions_hf và các gói neon / luxury / cinema / news.
Ở đây viết lại cho đường dựng FFmpeg + Pillow của AI Video Factory, không dùng trình duyệt:

- Font: 19 font Google Fonts (giấy phép OFL, đủ dấu tiếng Việt) đóng kèm ở avf/fonts, chạy được khi không có mạng.
- Kiểu phụ đề: vẽ bằng Pillow theo từng trạng thái (từ đang đọc sáng lên, chữ hiện dần, nảy nhẹ khi đổi khối),
  ghép thành MỘT luồng ảnh có thời lượng (concat demuxer) rồi phủ lên video một lần.
- Phong cách edit: gộp màu phim (grade), hiệu ứng ở mỗi lần cắt, hạt phim, viền tối, viền đen điện ảnh,
  kiểu phụ đề và font thành một lựa chọn.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from . import config, db
from .errors import AppError

router = APIRouter()
FONT_DIR = Path(__file__).with_name("fonts")
PREVIEW_DIR = config.DATA_DIR / "looks"

# ---------------------------------------------------------------- font
FONTS = {
    "bevn_bold": {"name": "Be Vietnam Pro đậm", "file": "BeVietnamPro-Bold.ttf", "group": "Dễ đọc"},
    "bevn_black": {"name": "Be Vietnam Pro rất đậm", "file": "BeVietnamPro-Black.ttf", "group": "Dễ đọc"},
    "bevn_italic": {"name": "Be Vietnam Pro nghiêng", "file": "BeVietnamPro-BlackItalic.ttf", "group": "Mạnh"},
    "bevn_light": {"name": "Be Vietnam Pro mảnh", "file": "BeVietnamPro-Light.ttf", "group": "Thanh lịch"},
    "montserrat": {"name": "Montserrat Black", "file": "Montserrat-VF.ttf", "wght": 900, "group": "Mạnh"},
    "montserrat_bold": {"name": "Montserrat đậm", "file": "Montserrat-VF.ttf", "wght": 700, "group": "Dễ đọc"},
    "lexend": {"name": "Lexend", "file": "Lexend-VF.ttf", "wght": 600, "group": "Dễ đọc"},
    "lexend_light": {"name": "Lexend mảnh", "file": "Lexend-VF.ttf", "wght": 300, "group": "Thanh lịch"},
    "nunito": {"name": "Nunito tròn", "file": "Nunito-VF.ttf", "wght": 900, "group": "Dễ thương"},
    "baloo": {"name": "Baloo 2", "file": "Baloo2-VF.ttf", "wght": 800, "group": "Dễ thương"},
    "oswald": {"name": "Oswald (hẹp)", "file": "Oswald-VF.ttf", "wght": 700, "group": "Tin tức"},
    "barlow": {"name": "Barlow Condensed", "file": "BarlowCondensed-ExtraBold.ttf", "group": "Tin tức"},
    "saira": {"name": "Saira Condensed", "file": "SairaCondensed-Black.ttf", "group": "Tin tức"},
    "anton": {"name": "Anton (cao, hẹp)", "file": "Anton-Regular.ttf", "group": "Mạnh"},
    "unbounded": {"name": "Unbounded", "file": "Unbounded-VF.ttf", "wght": 800, "group": "Công nghệ"},
    "bungee": {"name": "Bungee", "file": "Bungee-Regular.ttf", "group": "Công nghệ"},
    "jetbrains": {"name": "JetBrains Mono", "file": "JetBrainsMono-VF.ttf", "wght": 700, "group": "Công nghệ"},
    "playfair": {"name": "Playfair nghiêng", "file": "PlayfairDisplay-Italic-VF.ttf", "wght": 600, "group": "Thanh lịch"},
    "dancing": {"name": "Dancing Script", "file": "DancingScript-VF.ttf", "wght": 700, "group": "Viết tay"},
    "pacifico": {"name": "Pacifico", "file": "Pacifico-Regular.ttf", "group": "Viết tay"},
    "lobster": {"name": "Lobster", "file": "Lobster-Regular.ttf", "group": "Viết tay"},
}
DEFAULT_FONT = "bevn_bold"


@lru_cache(maxsize=256)
def font(fid: str, size: int) -> ImageFont.FreeTypeFont:
    """Font theo mã trong thư viện; thiếu file thì lùi về font hệ thống của máy."""
    f = FONTS.get(fid) or FONTS[DEFAULT_FONT]
    p = FONT_DIR / f["file"]
    if p.is_file():
        ft = ImageFont.truetype(str(p), max(8, int(size)))
        if f.get("wght"):
            try:
                ft.set_variation_by_axes([f["wght"]])
            except (OSError, AttributeError):
                pass
        return ft
    for c in config.FONT_CANDIDATES:
        if Path(c).exists():
            return ImageFont.truetype(c, max(8, int(size)))
    return ImageFont.load_default()


# ---------------------------------------------------------------- kiểu phụ đề
# mode: static (cả khối một màu) | karaoke (từ đang đọc đổi màu) | box_word (khối màu sau từ đang đọc)
#       | reveal (chữ hiện dần theo lời) ; words: số từ tối đa mỗi khối ; pop: khối mới nảy nhẹ
CAPTION_STYLES = {
    "classic": {"name": "Cổ điển", "desc": "Chữ trắng viền đen, cả câu hiện cùng lúc.", "font": "bevn_bold", "size": 62,
                "mode": "static", "words": 8, "stroke": 5},
    "karaoke": {"name": "Karaoke vàng", "desc": "Từ đang đọc chuyển vàng, chữ trắng viền đen.", "font": "montserrat", "size": 68,
                "mode": "karaoke", "words": 5, "stroke": 6, "hl": "#FFD84A", "pop": True},
    "box_word": {"name": "Khối màu theo từ", "desc": "In hoa đậm, từ đang đọc có khối màu nhấn phía sau.", "font": "montserrat",
                 "size": 68, "mode": "box_word", "words": 4, "stroke": 5, "upper": True, "pop": True},
    "big_bold": {"name": "Chữ to dồn dập", "desc": "Hai, ba từ mỗi lần, chữ cao in hoa, nảy khi đổi khối.", "font": "anton",
                 "size": 104, "mode": "karaoke", "words": 3, "stroke": 8, "upper": True, "hl": "#FFD84A", "pop": True},
    "pill": {"name": "Viên thuốc tối", "desc": "Nền bo tròn tối, từ đang đọc sáng vàng.", "font": "lexend", "size": 56,
             "mode": "karaoke", "words": 5, "stroke": 0, "hl": "#FFD84A", "box": "pill", "dim": True},
    "neon": {"name": "Neon phát sáng", "desc": "Chữ phát sáng màu nhấn, hợp chủ đề công nghệ.", "font": "unbounded", "size": 58,
             "mode": "karaoke", "words": 4, "stroke": 0, "glow": True, "upper": True, "hl": "#4FF0FF"},
    "news_block": {"name": "Khối bản tin", "desc": "Khối vàng chữ đen in hoa, kiểu truyền hình.", "font": "oswald", "size": 62,
                   "mode": "static", "words": 7, "stroke": 0, "upper": True, "box": "line", "box_color": "#FFD400", "color": "#111111"},
    "minimal": {"name": "Tối giản", "desc": "Chữ thường mảnh, bóng mềm, không viền.", "font": "lexend", "size": 52,
                "mode": "static", "words": 9, "stroke": 0, "shadow": True},
    "cinema": {"name": "Điện ảnh", "desc": "Chữ nghiêng có chân, nhỏ, nằm thấp như phụ đề phim.", "font": "playfair", "size": 54,
               "mode": "static", "words": 9, "stroke": 0, "shadow": True, "color": "#F4EFE6", "y": 0.78},
    "typewriter": {"name": "Gõ chữ", "desc": "Từng từ hiện ra theo lời đọc trên nền tối.", "font": "jetbrains", "size": 48,
                   "mode": "reveal", "words": 7, "stroke": 0, "box": "pill", "box_color": "#000000"},
    "luxury": {"name": "Sang trọng", "desc": "Chữ mảnh ánh vàng, nhiều khoảng thở.", "font": "bevn_light", "size": 58,
               "mode": "static", "words": 7, "stroke": 0, "gradient": ("#FFF1C9", "#C9A15A"), "shadow": True},
    "cute": {"name": "Dễ thương", "desc": "Chữ tròn viền màu dày, từ đang đọc đổi màu hồng.", "font": "baloo", "size": 68,
             "mode": "karaoke", "words": 4, "stroke": 8, "stroke_color": "#5B2A86", "hl": "#FF7AB6", "pop": True},
}
DEFAULT_CAPTION = "classic"
# tên kiểu phụ đề cũ trong template → kiểu mới
LEGACY_CAPTION = {"kinetic": "karaoke", "dynamic": "big_bold", "bold": "box_word", "bold_launch": "box_word",
                  "highlight": "karaoke", "minimal": "minimal", "cinematic": "cinema", "educational": "pill",
                  "infographic": "pill", "chat": "pill", "list": "classic"}

# ---------------------------------------------------------------- màu và hiệu ứng
GRADES = {
    "natural": {"name": "Tự nhiên", "vf": "eq=contrast=1.04:saturation=1.06"},
    "vivid": {"name": "Rực rỡ", "vf": "eq=contrast=1.1:saturation=1.3:brightness=0.01"},
    "warm": {"name": "Ấm", "vf": "colorbalance=rs=0.06:gs=0.02:bs=-0.06:rm=0.04:bm=-0.04,eq=saturation=1.08"},
    "cool": {"name": "Lạnh", "vf": "colorbalance=rs=-0.05:bs=0.07:bm=0.04,eq=contrast=1.06"},
    "teal_orange": {"name": "Điện ảnh xanh cam", "vf": "colorbalance=rs=-0.08:bs=0.1:rh=0.08:bh=-0.08,eq=contrast=1.12:saturation=1.1"},
    "moody": {"name": "Trầm buồn", "vf": "eq=saturation=0.6:brightness=-0.04:contrast=1.05,colorbalance=bs=0.05"},
    "vintage": {"name": "Phim cũ", "vf": "curves=preset=vintage,eq=saturation=0.85"},
    "bw": {"name": "Đen trắng", "vf": "hue=s=0,eq=contrast=1.18:brightness=-0.02"},
    "bright": {"name": "Sáng trong", "vf": "eq=brightness=0.04:gamma=1.05:saturation=1.1"},
}
CUTS = {
    "none": "Cắt thẳng",
    "punch": "Phóng to xen kẽ để giấu vết cắt",
    "flash": "Loé trắng khi đổi cảnh",
    "dip": "Mờ từ đen khi đổi cảnh",
    "zoom": "Phóng vào nhanh khi đổi cảnh",
    "shake": "Rung nhẹ khi đổi cảnh",
}
EDIT_STYLES = {
    "clean": {"name": "Sạch, tự nhiên", "desc": "Màu tự nhiên, cắt thẳng, phụ đề cổ điển. An toàn cho mọi video.",
              "grade": "natural", "cut": "none", "caption": "classic", "font": "bevn_bold"},
    "hype": {"name": "TikTok sôi động", "desc": "Màu rực, phóng to xen kẽ và loé khi cắt, chữ đậm có khối màu theo từ.",
             "grade": "vivid", "cut": "punch+flash", "caption": "box_word", "font": "montserrat"},
    "viral": {"name": "Chữ to viral", "desc": "Hai, ba từ chữ to dồn dập, phóng vào khi đổi cảnh.",
              "grade": "vivid", "cut": "zoom", "caption": "big_bold", "font": "anton"},
    "cinema": {"name": "Điện ảnh", "desc": "Màu xanh cam, viền đen trên dưới, hạt phim nhẹ, chuyển mờ.",
               "grade": "teal_orange", "cut": "dip", "letterbox": True, "grain": 6, "vignette": True, "caption": "cinema", "font": "playfair"},
    "luxury": {"name": "Sang trọng tối giản", "desc": "Màu ấm trầm, viền tối, chuyển mờ chậm, chữ mảnh ánh vàng.",
               "grade": "warm", "cut": "dip", "vignette": True, "caption": "luxury", "font": "bevn_light"},
    "news": {"name": "Bản tin", "desc": "Màu trung tính, cắt thẳng, phụ đề khối vàng chữ hẹp.",
             "grade": "natural", "cut": "none", "caption": "news_block", "font": "oswald"},
    "neon": {"name": "Neon công nghệ", "desc": "Màu lạnh tương phản, loé khi cắt, chữ phát sáng.",
             "grade": "cool", "cut": "flash", "caption": "neon", "font": "unbounded"},
    "vintage": {"name": "Phim cũ", "desc": "Màu phim cũ, hạt phim, viền tối, chữ gõ máy.",
                "grade": "vintage", "cut": "dip", "grain": 12, "vignette": True, "caption": "typewriter", "font": "jetbrains"},
    "cute": {"name": "Dễ thương", "desc": "Màu sáng trong, phóng vào khi đổi cảnh, chữ tròn viền tím.",
             "grade": "bright", "cut": "zoom", "caption": "cute", "font": "baloo"},
    "story": {"name": "Kể chuyện cảm xúc", "desc": "Màu trầm, chuyển mờ, chữ tối giản.",
              "grade": "moody", "cut": "dip", "vignette": True, "caption": "minimal", "font": "lexend_light"},
}
DEFAULT_EDIT = "clean"


def resolve(look: dict | None) -> dict:
    """Ghép lựa chọn của người dùng lên phong cách edit: kiểu phụ đề và font chọn riêng thì thắng phong cách."""
    look = look or {}
    e = EDIT_STYLES.get(look.get("edit")) or EDIT_STYLES[DEFAULT_EDIT]
    cap = look.get("caption") if look.get("caption") in CAPTION_STYLES else e["caption"]
    fid = look.get("font") if look.get("font") in FONTS else (e["font"] if not look.get("caption") else CAPTION_STYLES[cap]["font"])
    return {**e, "edit": look.get("edit") if look.get("edit") in EDIT_STYLES else DEFAULT_EDIT, "caption": cap, "font": fid}


def default_look() -> dict:
    return db.get_setting("look_default", {}) or {}


def item_look(item: dict) -> dict:
    """Phong cách của một tin / video ở các chế độ nhanh: chọn riêng cho tin > mặc định người dùng lưu."""
    own = {k: item.get(v) for k, v in (("edit", "look"), ("caption", "cap_style"), ("font", "font")) if item.get(v)}
    return resolve({**default_look(), **own})


# ---------------------------------------------------------------- hiệu ứng FFmpeg
def segment_vf(look: dict, i: int, W: int, H: int, frame_only: bool = False) -> str:
    """Chuỗi lọc thêm vào sau phần chuyển động của cảnh thứ i (bắt đầu bằng dấu phẩy, rỗng nếu không có gì).
    frame_only: chỉ màu, hạt phim, viền tối và loé/mờ khi cắt, không đổi khung (dùng cho hình đặt trong bố cục có sẵn)."""
    out = ""
    cuts = str(look.get("cut") or "none").split("+")
    if frame_only:
        cuts = [c for c in cuts if c in ("flash", "dip")]
        look = {**look, "letterbox": False}
    if "punch" in cuts and i % 2 == 1:
        out += f",scale={int(W * 1.07) // 2 * 2}:{int(H * 1.07) // 2 * 2},crop={W}:{H}"
    if i > 0 and "zoom" in cuts:
        k = "(1+0.14*max(0,1-t/0.3))"
        out += f",scale=w='max({W},trunc({W}*{k}/2)*2)':h='max({H},trunc({H}*{k}/2)*2)':eval=frame,crop={W}:{H}"
    if i > 0 and "shake" in cuts:
        out += f",crop={W - 16}:{H - 16}:x='8+8*sin(t*70)*max(0,1-t/0.3)':y='8+6*cos(t*55)*max(0,1-t/0.3)',scale={W}:{H}"
    g = GRADES.get(look.get("grade") or "")
    if g:
        out += "," + g["vf"]
    if look.get("vignette"):
        out += ",vignette=PI/5"
    if look.get("grain"):
        out += f",noise=alls={int(look['grain'])}:allf=t+u"
    if look.get("letterbox"):
        bar = int(H * 0.085)
        out += f",drawbox=x=0:y=0:w={W}:h={bar}:color=black:t=fill,drawbox=x=0:y={H - bar}:w={W}:h={bar}:color=black:t=fill"
    if i > 0 and "flash" in cuts:
        out += ",fade=t=in:st=0:d=0.14:color=white"
    if i > 0 and "dip" in cuts:
        out += ",fade=t=in:st=0:d=0.22"
    return out


# ---------------------------------------------------------------- vẽ phụ đề
def _hex(c: str, a: int = 255) -> tuple:
    c = str(c or "#FFFFFF").lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a


def word_times(text: str, t0: float, t1: float) -> list[dict]:
    """Mốc từng từ khi chỉ biết mốc cả câu: chia theo số ký tự (cùng cách với tts.word_timing)."""
    ws = text.split()
    total = sum(len(w) for w in ws) or 1
    out, t = [], t0
    for w in ws:
        d = (t1 - t0) * len(w) / total
        out.append({"w": w, "s": t, "e": t + d})
        t += d
    return out


def chunk_words(words: list[dict], n: int, max_chars: int = 34) -> list[list[dict]]:
    """Chia lời thành các khối ngắn: tối đa n từ, ngắt sớm ở dấu câu để khối nào cũng trọn ý."""
    out, cur = [], []
    for w in words:
        if cur and (len(cur) >= n or len(" ".join(x["w"] for x in cur + [w])) > max_chars):
            out.append(cur)
            cur = []
        cur.append(w)
        if re.search(r"[.,!?;:…]$", w["w"]) and len(cur) >= max(2, n // 2):
            out.append(cur)
            cur = []
    return out + ([cur] if cur else [])


def _layout(d, words: list[str], f, maxw: float, space: float) -> list[list[int]]:
    lines, cur, w = [], [], 0.0
    for i, t in enumerate(words):
        tw = d.textlength(t, font=f)
        if cur and w + space + tw > maxw:
            lines.append(cur)
            cur, w = [], 0.0
        w += (space if cur else 0) + tw
        cur.append(i)
    return lines + ([cur] if cur else [])


def draw_caption(words: list[str], active: int, W: int, H: int, cs: dict, fid: str, colors: dict,
                 y_frac: float, scale: float = 1.0, upto: int | None = None) -> Image.Image:
    """Một trạng thái của khối phụ đề. active: chỉ số từ đang đọc (-1 nếu không có); upto: chỉ vẽ tới từ này (kiểu gõ chữ)."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, "RGBA")
    text = [w.upper() if cs.get("upper") else w for w in words]
    size = cs["size"] * W / 1080 * scale * float(colors.get("size", 1.0))
    maxw = W * 0.82
    while True:
        f = font(fid, int(size))
        space = d.textlength(" ", font=f)
        lines = _layout(d, text, f, maxw, space)
        if len(lines) <= (1 if cs["words"] <= 3 else 2) or size < 22:
            break
        size *= 0.92
    lh = int(size * 1.22)
    y = int(H * y_frac) - lh * len(lines) // 2
    sw = int(cs.get("stroke", 0) * W / 1080)
    base, hl, accent = _hex(cs.get("color") or colors.get("color", "#FFFFFF")), _hex(colors.get("hl") or cs.get("hl", "#FFD84A")), _hex(colors.get("accent", "#F0543A"))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0)) if cs.get("glow") else None
    gd = ImageDraw.Draw(glow) if glow else None
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0)) if cs.get("shadow") else None
    sd = ImageDraw.Draw(shadow) if shadow else None
    grad_mask = Image.new("L", (W, H), 0) if cs.get("gradient") else None
    gm = ImageDraw.Draw(grad_mask) if grad_mask else None
    pad = size * 0.32
    if cs.get("box") == "pill":                            # một nền bo tròn chung cho cả khối
        widest = max(sum(d.textlength(text[i], font=f) for i in ln) + space * (len(ln) - 1) for ln in lines)
        d.rounded_rectangle((W / 2 - widest / 2 - pad * 2, y - pad, W / 2 + widest / 2 + pad * 2, y + lh * len(lines) + pad * 0.4),
                            radius=int(lh * 0.6), fill=_hex(cs.get("box_color", "#0E0E14"), 215))
    for ln in lines:
        lw = sum(d.textlength(text[i], font=f) for i in ln) + space * (len(ln) - 1)
        x = (W - lw) / 2
        if cs.get("box") == "line":                         # khối màu riêng cho từng dòng
            d.rectangle((x - pad, y - pad * 0.25, x + lw + pad, y + lh - pad * 0.15), fill=_hex(cs.get("box_color", "#FFD400")))
        for i in ln:
            tw = d.textlength(text[i], font=f)
            if upto is not None and i > upto:
                x += tw + space
                continue
            on = i == active
            col = base
            if cs["mode"] in ("karaoke",) and on:
                col = hl
            elif cs.get("dim") and active >= 0 and i > active:
                col = base[:3] + (110,)
            if cs["mode"] == "box_word" and on:
                d.rounded_rectangle((x - pad * 0.7, y - pad * 0.15, x + tw + pad * 0.7, y + lh + pad * 0.05), radius=int(pad * 0.6), fill=accent)
            if sd:
                sd.text((x + size * 0.03, y + size * 0.05), text[i], font=f, fill=(0, 0, 0, 255), stroke_width=max(1, int(size * 0.05)), stroke_fill=(0, 0, 0, 255))
            if gd:
                gd.text((x, y), text[i], font=f, fill=hl if on else accent, stroke_width=max(2, int(size * 0.08)), stroke_fill=hl if on else accent)
            if gm:
                gm.text((x, y), text[i], font=f, fill=255)
            elif gd:                                       # neon: lõi chữ trắng, màu nằm ở quầng sáng
                d.text((x, y), text[i], font=f, fill=(255, 255, 255, 255) if on or active < 0 else (235, 240, 255, 235))
            else:
                d.text((x, y), text[i], font=f, fill=col, stroke_width=sw, stroke_fill=_hex(cs.get("stroke_color", "#000000")))
            x += tw + space
        y += lh
    layers = []
    if shadow:
        layers.append(shadow.filter(ImageFilter.GaussianBlur(size * 0.06)))
    if glow:
        layers += [glow.filter(ImageFilter.GaussianBlur(size * 0.35)), glow.filter(ImageFilter.GaussianBlur(size * 0.12))]
    if grad_mask:
        top, bot = _hex(cs["gradient"][0]), _hex(cs["gradient"][1])
        fill = Image.new("RGBA", (W, H))
        fd = ImageDraw.Draw(fill)
        y0 = int(H * y_frac) - lh * len(lines) // 2
        for yy in range(H):
            t = (yy - y0) % max(1, lh) / max(1, lh)       # chuyển màu lặp lại trong từng dòng chữ
            fd.line([(0, yy), (W, yy)], fill=tuple(int(top[k] + (bot[k] - top[k]) * t) for k in range(3)) + (255,))
        fill.putalpha(grad_mask)
        layers.append(fill)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for l in layers:
        out = Image.alpha_composite(out, l)
    return Image.alpha_composite(out, im)                 # chữ sắc nét nằm trên quầng sáng và bóng


def caption_states(words: list[dict], cs: dict) -> list[tuple[float, float, int, float, int | None]]:
    """Các trạng thái của một khối theo thời gian: (từ giây, tới giây, từ đang đọc, độ phóng, vẽ tới từ)."""
    t0, t1 = words[0]["s"], words[-1]["e"]
    if cs["mode"] == "static":
        st = [(t0, t1, -1, 1.0, None)]
    else:
        st = []
        for i, w in enumerate(words):
            a = w["s"] if i else t0
            b = words[i + 1]["s"] if i + 1 < len(words) else t1
            st.append((a, b, i, 1.0, i if cs["mode"] == "reveal" else None))
    if cs.get("pop") and st and st[0][1] - st[0][0] > 0.12:   # khung đầu của khối phóng to 12% trong 0,07 giây
        a, b, i, _, u = st[0]
        st = [(a, a + 0.07, i, 1.12, u), (a + 0.07, b, i, 1.0, u)] + st[1:]
    return st


def caption_track(captions: list[dict], W: int, H: int, look: dict, colors: dict, y_frac: float, work: Path,
                  total_s: float) -> Path | None:
    """Vẽ mọi khối phụ đề thành ảnh và ghi danh sách concat (ảnh + thời lượng) để FFmpeg phủ một lần.
    captions: [{start_ms, end_ms, text, words?: [{w, start_ms, end_ms}]}]. Trả về file danh sách, hoặc None nếu trống."""
    cs = CAPTION_STYLES[look["caption"]]
    y_frac = cs.get("y", y_frac)
    if look.get("letterbox"):
        y_frac = min(y_frac, 0.86)
    work.mkdir(parents=True, exist_ok=True)
    blank = work / "cap_blank.png"
    Image.new("RGBA", (W, H), (0, 0, 0, 0)).save(blank)
    timeline: list[tuple[float, float, Path]] = []
    n = 0
    for c in captions:
        t0, t1 = c["start_ms"] / 1000, c["end_ms"] / 1000
        if t1 - t0 < 0.05 or not str(c.get("text") or "").strip():
            continue
        if c.get("words"):
            ws = [{"w": w["w"], "s": w["start_ms"] / 1000, "e": w["end_ms"] / 1000} for w in c["words"] if str(w.get("w") or "").strip()]
        else:
            ws = word_times(c["text"], t0, t1)
        if not ws:
            continue
        ws[-1]["e"] = max(ws[-1]["e"], t1)
        for chunk in chunk_words(ws, cs["words"]):
            for a, b, active, sc, upto in caption_states(chunk, cs):
                if b - a < 0.02:
                    continue
                p = work / f"cap_{n:05d}.png"
                draw_caption([w["w"] for w in chunk], active, W, H, cs, look["font"], colors, y_frac, sc, upto).save(p, compress_level=1)
                timeline.append((a, b, p))
                n += 1
    if not timeline:
        return None
    timeline.sort(key=lambda x: x[0])
    lines, t = [], 0.0
    for a, b, p in timeline:
        a = max(a, t)
        if a - t > 0.001:
            lines += [f"file '{blank.as_posix()}'", f"duration {a - t:.3f}"]
        if b - a > 0.001:
            lines += [f"file '{p.as_posix()}'", f"duration {b - a:.3f}"]
            t = b
    if total_s - t > 0.001:
        lines += [f"file '{blank.as_posix()}'", f"duration {total_s - t + 0.5:.3f}"]
    lines.append(f"file '{blank.as_posix()}'")            # concat cần lặp lại ảnh cuối để giữ thời lượng của nó
    out = work / "captions.txt"
    out.write_text("\n".join(lines) + "\n", "utf-8")
    return out


# ---------------------------------------------------------------- xem trước
SAMPLE = "Phụ đề tiếng Việt chạy theo giọng đọc"


def _sample_bg(W: int, H: int) -> Path:
    """Khung nền để xem trước: lấy một khung từ video gần nhất trong thư viện; chưa có video thì dùng nền chuyển màu."""
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    out = PREVIEW_DIR / f"sample_{W}x{H}.jpg"
    if out.is_file():
        return out
    try:
        row = db.q1("SELECT uri FROM assets WHERE media_type='video' ORDER BY created_at DESC LIMIT 1")
    except Exception:  # noqa: BLE001 — bảng chưa có thì dùng nền dựng sẵn
        row = None
    if row and Path(row["uri"]).is_file():
        subprocess.run([config.FFMPEG, "-y", "-v", "error", "-ss", "1", "-i", row["uri"], "-frames:v", "1", "-vf",
                        f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}", str(out)], capture_output=True)
    if not out.is_file():
        im = Image.new("RGB", (W, H))
        d = ImageDraw.Draw(im)
        for y in range(H):
            d.line([(0, y), (W, y)], fill=(int(60 + 120 * y / H), int(90 + 60 * y / H), int(140 - 40 * y / H)))
        d.ellipse((W * 0.2, H * 0.18, W * 0.8, H * 0.52), fill=(232, 196, 170))
        im.save(out, quality=90)
    return out


def preview(edit: str | None, caption: str | None, fid: str | None) -> Path:
    """Ảnh xem trước một tổ hợp phong cách + kiểu phụ đề + font, lưu đệm theo tổ hợp."""
    look = resolve({"edit": edit, "caption": caption, "font": fid})
    W, H = 540, 960
    key = hashlib.sha1(json.dumps([look, SAMPLE, 3], sort_keys=True).encode()).hexdigest()[:12]
    out = PREVIEW_DIR / f"p_{key}.jpg"
    if out.is_file():
        return out
    bg = _sample_bg(W, H)
    graded = PREVIEW_DIR / f"g_{key}.png"
    vf = segment_vf({k: v for k, v in look.items() if k != "cut"}, 0, W, H).lstrip(",") or "null"
    r = subprocess.run([config.FFMPEG, "-y", "-v", "error", "-i", str(bg), "-vf", vf, "-frames:v", "1", str(graded)], capture_output=True, text=True)
    base = Image.open(graded if r.returncode == 0 and graded.is_file() else bg).convert("RGBA")
    cs = CAPTION_STYLES[look["caption"]]
    words = SAMPLE.split()[: cs["words"]]
    cap = draw_caption(words, min(1, len(words) - 1), W, H, cs, look["font"], {}, cs.get("y", 0.70) if not look.get("letterbox") else 0.8)
    Image.alpha_composite(base, cap).convert("RGB").save(out, quality=88)
    graded.unlink(missing_ok=True)
    return out


def font_sample(fid: str) -> Path:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    out = PREVIEW_DIR / f"font_{fid}.png"
    if not out.is_file():
        im = Image.new("RGBA", (720, 110), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.text((12, 18), "Phụ đề đẹp: ĐƯỜNG ĐỜI ỔN ĐỊNH", font=font(fid, 54), fill=(255, 255, 255, 255))
        im.save(out)
    return out


# ---------------------------------------------------------------- API
@router.get("/looks")
def api_looks():
    return {"edit_styles": EDIT_STYLES, "caption_styles": CAPTION_STYLES, "grades": {k: v["name"] for k, v in GRADES.items()},
            "cuts": CUTS, "fonts": {k: {"name": v["name"], "group": v["group"]} for k, v in FONTS.items()},
            "default": resolve(default_look()), "saved": default_look()}


@router.put("/looks/default")
def api_set_default(data: dict):
    look = {k: data.get(k) for k in ("edit", "caption", "font") if data.get(k)}
    for k, table in (("edit", EDIT_STYLES), ("caption", CAPTION_STYLES), ("font", FONTS)):
        if look.get(k) and look[k] not in table:
            raise AppError("BAD_INPUT", "Lựa chọn không có trong danh sách", status=422)
    db.set_setting("look_default", look)
    return resolve(look)


@router.get("/looks/preview")
def api_preview(edit: str = "", caption: str = "", font: str = ""):
    return FileResponse(preview(edit or None, caption or None, font or None), media_type="image/jpeg",
                        headers={"Cache-Control": "max-age=3600"})


@router.get("/looks/font/{fid}")
def api_font(fid: str):
    if fid not in FONTS:
        raise AppError("NOT_FOUND", "Không có font này", status=404)
    return FileResponse(font_sample(fid), media_type="image/png", headers={"Cache-Control": "max-age=3600"})
