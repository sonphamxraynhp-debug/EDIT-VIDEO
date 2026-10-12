"""Vẽ chữ phong cách video mẫu: chữ trắng-kem chuyển vàng, phát sáng vàng cam, emoji màu, bóng ma (ghost).

Mỗi phần tử được vẽ thành một Sprite (ảnh RGBA đã nhân alpha, dạng numpy) kèm toạ độ trong khung hình.
"""
import os
import re
import unicodedata
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
FONT_DIR = os.path.join(ASSETS, "fonts")
EMOJI_DIR = os.path.join(ASSETS, "emoji")
SYSTEM_EMOJI_FONTS = ["/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
                      "/System/Library/Fonts/Apple Color Emoji.ttc",
                      "C:/Windows/Fonts/seguiemj.ttf"]


class Sprite:
    """Ảnh RGBA đã nhân alpha (float32, 0..1) đặt tại (x, y) trong khung hình."""

    def __init__(self, rgb, alpha, x, y):
        self.rgb, self.alpha, self.x, self.y = rgb, alpha, int(x), int(y)

    @classmethod
    def from_pil(cls, img, x, y):
        a = np.asarray(img, dtype=np.float32) / 255.0
        alpha = a[:, :, 3].copy()
        return cls(a[:, :, :3] * alpha[:, :, None], alpha, x, y)

    @property
    def h(self):
        return self.alpha.shape[0]

    @property
    def w(self):
        return self.alpha.shape[1]


# ----------------------------------------------------------------------------- font & emoji
@lru_cache(maxsize=64)
def font(name, size):
    path = name if os.path.isabs(name) else os.path.join(FONT_DIR, name)
    return ImageFont.truetype(path, max(8, int(round(size))))


def _is_emoji_char(ch):
    cp = ord(ch)
    return (0x1F000 <= cp <= 0x1FAFF or 0x2600 <= cp <= 0x27BF or 0x2B00 <= cp <= 0x2BFF
            or cp in (0x200D, 0xFE0F, 0x203C, 0x2049, 0x2122, 0x2139, 0x3030, 0x303D)
            or 0x2190 <= cp <= 0x21FF or 0x2300 <= cp <= 0x23FF or 0x1F1E6 <= cp <= 0x1F1FF)


def split_runs(text):
    """Tách 'văn bản' và 'emoji' -> [(is_emoji, str)]."""
    runs = []
    for ch in text:
        e = _is_emoji_char(ch)
        if ch in "\u200d\ufe0f" and runs and runs[-1][0]:
            e = True
        if runs and runs[-1][0] == e:
            runs[-1] = (e, runs[-1][1] + ch)
        else:
            runs.append((e, ch))
    out = []
    for e, s in runs:
        if not e:
            out.append((False, s))
            continue
        # Mỗi emoji (kể cả chuỗi ZWJ) là một phần tử riêng
        cur = ""
        for ch in s:
            if cur and ch not in "\u200d\ufe0f" and not cur.endswith("\u200d"):
                out.append((True, cur))
                cur = ""
            cur += ch
        if cur:
            out.append((True, cur))
    return out


@lru_cache(maxsize=256)
def emoji_image(seq, size):
    """Ảnh RGBA của emoji, cao `size` px. Ưu tiên ảnh đi kèm, sau đó font emoji của hệ thống."""
    name = "-".join(f"{ord(c):x}" for c in seq if ord(c) != 0xFE0F)
    path = os.path.join(EMOJI_DIR, name + ".png")
    img = None
    if os.path.exists(path):
        img = Image.open(path).convert("RGBA")
    else:
        for fp in SYSTEM_EMOJI_FONTS:
            if not os.path.exists(fp):
                continue
            try:
                f = ImageFont.truetype(fp, 109)
                tmp = Image.new("RGBA", (180, 180), (0, 0, 0, 0))
                ImageDraw.Draw(tmp).text((90, 90), seq, font=f, embedded_color=True, anchor="mm")
                if tmp.getbbox():
                    img = tmp.crop(tmp.getbbox())
                    break
            except OSError:
                continue
    if img is None:
        print(f"[graphics] Không có ảnh cho emoji {seq!r} – bỏ qua")
        return None
    s = size / img.height
    return img.resize((max(1, int(img.width * s)), max(1, int(size))), Image.LANCZOS)


def text_width(text, fnt, emoji_scale=1.0):
    w = 0.0
    for is_e, s in split_runs(text):
        if is_e:
            w += fnt.size * emoji_scale * 1.05 + fnt.size * 0.12
        else:
            w += fnt.getlength(s)
    return w


# ----------------------------------------------------------------------------- xuống dòng
def wrap_balanced(text, fnt, max_width, max_lines=2, no_end=(), glue=()):
    """Chia 1–2 dòng cân đối; tôn trọng '\\n' do người soát đặt.

    Không ngắt dòng sau từ lửng (no_end) hay giữa hai âm tiết của một từ ghép (glue: {"vợ chồng", ...}).
    """
    if "\n" in text:
        return [l.strip() for l in text.split("\n") if l.strip()]
    if text_width(text, fnt) <= max_width:
        return [text]
    words = text.split()
    if max_lines < 2 or len(words) < 2:
        return [text]
    best, best_cost = None, None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        wa, wb = text_width(a, fnt), text_width(b, fnt)
        cost = max(wa, wb) + abs(wa - wb) * 0.15
        if wa < wb:
            cost += (wb - wa) * 0.2  # ưu tiên dòng trên dài hơn hoặc bằng dòng dưới
        if words[i - 1].lower() in no_end:
            cost += fnt.size * 8
        if f"{words[i - 1]} {words[i]}".lower() in glue:
            cost += fnt.size * 8
        if max(wa, wb) > max_width:
            # Hơi tràn thì chấp nhận được: fit_size sẽ thu nhỏ cỡ chữ thay vì ngắt dòng xấu
            cost += (max(wa, wb) - max_width) * 2
        if best_cost is None or cost < best_cost:
            best, best_cost = [a, b], cost
    return best


# ----------------------------------------------------------------------------- vẽ chữ phát sáng
def _gradient(h, w, top, bottom, y0, y1):
    ys = np.clip((np.arange(h, dtype=np.float32) - y0) / max(1.0, y1 - y0), 0, 1)[:, None, None]
    top = np.array(top[:3], np.float32) / 255
    bottom = np.array(bottom[:3], np.float32) / 255
    return np.broadcast_to(top + (bottom - top) * ys, (h, w, 3))


def draw_lines(lines, k, look, align="center", width=None, emoji_scale=1.0):
    """Vẽ nhiều dòng chữ.

    lines: [{"text", "font", "size", "dx"?, "dy" (tâm dòng so với dòng đầu), "strike"?}]
    look:  thông số màu/phát sáng (style.json -> "look").
    Trả về dict: text (Sprite chữ + glow), ghost (Sprite chữ trắng mờ), emoji (Sprite), strikes [...],
                 line_boxes [(x0, y0, x1, y1)] theo toạ độ sprite, anchor = (ax, ay) tâm dòng đầu trong sprite.
    """
    glow_r = look["glow_radius"] * k
    pad = int(glow_r * 3 + 8 * k)
    fonts = [font(l["font"], l["size"]) for l in lines]
    widths = [text_width(l["text"], f, emoji_scale) for l, f in zip(lines, fonts)]
    dxs = [l.get("dx", 0.0) for l in lines]
    dys = [l["dy"] for l in lines]
    if width is None:
        if align == "center":
            width = max(abs(dx) * 2 + w for dx, w in zip(dxs, widths))
        else:
            width = max(dx + w for dx, w in zip(dxs, widths))
    top = min(dy - f.size for dy, f in zip(dys, fonts))
    bottom = max(dy + f.size for dy, f in zip(dys, fonts))
    W = int(width + 2 * pad)
    H = int(bottom - top + 2 * pad)
    ay = pad - top
    ax = pad + (width / 2 if align == "center" else 0)

    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    emo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    strikes, boxes = [], []
    for l, f, w, dx, dy in zip(lines, fonts, widths, dxs, dys):
        x = ax + dx - (w / 2 if align == "center" else 0)
        cy = ay + dy
        x_start = x
        for is_e, s in split_runs(l["text"]):
            if is_e:
                im = emoji_image(s, int(f.size * emoji_scale))
                if im is not None:
                    emo.alpha_composite(im, (int(x + f.size * 0.09), int(cy - im.height / 2)))
                x += f.size * emoji_scale * 1.05 + f.size * 0.12
            else:
                md.text((x, cy), s, font=f, fill=255, anchor="lm")
                x += f.getlength(s)
        boxes.append((x_start, cy - f.size * 0.62, x, cy + f.size * 0.62))
        if l.get("strike"):
            # Gạch ngang phần chữ (bỏ emoji đứng đầu)
            first_txt = next((i for i, (e, _) in enumerate(split_runs(l["text"])) if not e), 0)
            sx = x_start + sum(text_width(s, f, emoji_scale) for _, s in split_runs(l["text"])[:first_txt])
            strikes.append((sx - f.size * 0.08, cy + f.size * 0.02, x + f.size * 0.08, max(3, f.size * 0.075)))

    m = np.asarray(mask, np.float32) / 255
    ink_rows = np.where(m.max(axis=1) > 0)[0]
    y0, y1 = (ink_rows[0], ink_rows[-1]) if len(ink_rows) else (0, H)
    fill = _gradient(H, W, look["fill_top"], look["fill_bottom"], y0, y1)

    def compose(m):
        glow1 = cv2.GaussianBlur(m, (0, 0), glow_r) * look["glow_strength"]
        glow2 = cv2.GaussianBlur(m, (0, 0), glow_r * 2.6) * look["glow_wide_strength"]
        halo = cv2.GaussianBlur(m, (0, 0), max(1.0, look["halo_radius"] * k)) * look["halo_strength"]
        gcol = np.array(look["glow"][:3], np.float32) / 255
        hcol = np.array(look["halo"][:3], np.float32) / 255
        a_glow = np.clip(glow1 + glow2, 0, 1)
        rgb = gcol * a_glow[:, :, None]
        a = a_glow
        # quầng sáng sát chữ (kem) rồi tới chữ
        rgb = hcol * np.clip(halo, 0, 1)[:, :, None] + rgb * (1 - np.clip(halo, 0, 1)[:, :, None])
        a = np.clip(halo, 0, 1) + a * (1 - np.clip(halo, 0, 1))
        rgb = fill * m[:, :, None] + rgb * (1 - m[:, :, None])
        a = m + a * (1 - m)
        return rgb.astype(np.float32), a.astype(np.float32)

    rgb, a = compose(m)
    text = Sprite(rgb, a, 0, 0)

    ghost_a = cv2.GaussianBlur(m, (0, 0), max(0.8, 1.2 * k)) * look["ghost_alpha"]
    ghost = Sprite(np.repeat(ghost_a[:, :, None], 3, axis=2) * np.array(look["ghost_color"][:3], np.float32) / 255,
                   ghost_a.astype(np.float32), 0, 0)

    emoji = Sprite.from_pil(emo, 0, 0) if emo.getbbox() else None

    strike_sprites = []
    for sx0, sy, sx1, th in strikes:
        sm = Image.new("L", (W, H), 0)
        ImageDraw.Draw(sm).rounded_rectangle((sx0, sy - th / 2, sx1, sy + th / 2), radius=th / 2, fill=255)
        smn = np.asarray(sm, np.float32) / 255
        r, sa = compose(smn)
        strike_sprites.append({"sprite": Sprite(r, sa, 0, 0), "x0": int(sx0 - pad / 2), "x1": int(sx1 + pad / 2)})
    return {"text": text, "ghost": ghost, "emoji": emoji, "strikes": strike_sprites,
            "line_boxes": boxes, "anchor": (ax, ay), "size": (W, H)}


def place(drawn, x, y):
    """Đặt toàn bộ phần đã vẽ sao cho điểm neo (tâm dòng đầu) nằm tại (x, y) trong khung hình."""
    ax, ay = drawn["anchor"]
    ox, oy = int(round(x - ax)), int(round(y - ay))
    for key in ("text", "ghost", "emoji"):
        if drawn[key] is not None:
            drawn[key].x, drawn[key].y = ox, oy
    for s in drawn["strikes"]:
        s["sprite"].x, s["sprite"].y = ox, oy
    drawn["origin"] = (ox, oy)
    return drawn


def sanitize(text):
    return unicodedata.normalize("NFC", re.sub(r"[ \t]+", " ", text)).strip()
