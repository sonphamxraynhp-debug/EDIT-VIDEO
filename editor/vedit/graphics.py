"""Vẽ các lớp đồ hoạ (PNG trong suốt full khung) bằng Pillow."""
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts")
_FONT_CACHE = {}


def font(name, size):
    key = (name, size)
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(os.path.join(FONT_DIR, name), size)
    return _FONT_CACHE[key]


def _text_block(lines, fnt, line_spacing, stroke=0):
    """Đo khối chữ nhiều dòng: (rộng, cao, [(dòng, rộng_dòng)], chiều cao dòng)."""
    ascent, descent = fnt.getmetrics()
    line_h = int((ascent + descent) * line_spacing)
    widths = [fnt.getbbox(l, stroke_width=stroke)[2] - fnt.getbbox(l, stroke_width=stroke)[0] for l in lines]
    total_h = line_h * (len(lines) - 1) + ascent + descent
    return max(widths), total_h, list(zip(lines, widths)), line_h


# ---------------------------------------------------------------- phụ đề chạy
def text_measure(font_name, size):
    fnt = font(font_name, size)
    return lambda t: fnt.getlength(t)


def caption_lines(text, cfg, k, split):
    """Ngắt dòng phụ đề theo độ rộng pixel thật của font."""
    if "\n" in text:
        return text.split("\n")
    return split(text, cfg["max_line_width"] * k, cfg["max_lines"], text_measure(cfg["font"], int(cfg["font_size"] * k)),
                 no_end=cfg.get("no_end", ()), keep_together=set(cfg.get("keep_together", ())))


def caption_image(lines, W, H, cfg, k):
    """Hộp trắng bo góc + chữ serif đậm đen, căn giữa theo chiều ngang."""
    fnt = font(cfg["font"], int(cfg["font_size"] * k))
    tw, th, items, line_h = _text_block(lines, fnt, cfg["line_spacing"])
    pad_x, pad_y = int(cfg["box_pad_x"] * k), int(cfg["box_pad_y"] * k)
    bw, bh = tw + 2 * pad_x, th + 2 * pad_y
    cx, cy = W // 2, int(H * cfg["center_y_ratio"])
    x0, y0 = cx - bw // 2, cy - bh // 2

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # bóng rất nhẹ để hộp tách khỏi áo blouse trắng
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [x0, y0 + int(4 * k), x0 + bw, y0 + bh + int(4 * k)], radius=int(cfg["box_radius"] * k), fill=(0, 0, 0, 40))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(6 * k)))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=int(cfg["box_radius"] * k), fill=tuple(cfg["box_color"]))
    y = y0 + pad_y
    for line, lw in items:
        d.text((cx - lw // 2, y), line, font=fnt, fill=tuple(cfg["text_color"]))
        y += line_h
    return img


def blank(W, H):
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


# ---------------------------------------------------------------- tiêu đề bong bóng
def _wobbly_rounded_rect(x0, y0, x1, y1, r, wobble, seed, tail=None):
    """Đa giác hình chữ nhật bo góc có viền 'vẽ tay' lượn sóng nhẹ; tail = (x_base, width, height)."""
    rnd = random.Random(seed)
    pts = []
    step = 6

    def edge(ax, ay, bx, by):
        n = max(2, int(math.hypot(bx - ax, by - ay) / step))
        for i in range(n):
            t = i / n
            pts.append((ax + (bx - ax) * t, ay + (by - ay) * t))

    def arc(cx, cy, a0, a1):
        n = max(3, int(abs(a1 - a0) * r / step))
        for i in range(n):
            a = a0 + (a1 - a0) * i / n
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))

    edge(x0 + r, y0, x1 - r, y0)
    arc(x1 - r, y0 + r, -math.pi / 2, 0)
    edge(x1, y0 + r, x1, y1 - r)
    arc(x1 - r, y1 - r, 0, math.pi / 2)
    if tail:
        tx, tw, thh = tail
        edge(x1 - r, y1, tx + tw, y1)
        pts.append((tx + tw, y1))
        pts.append((tx + tw * 0.15, y1 + thh))   # mũi đuôi
        pts.append((tx, y1))
        edge(tx, y1, x0 + r, y1)
    else:
        edge(x1 - r, y1, x0 + r, y1)
    arc(x0 + r, y1 - r, math.pi / 2, math.pi)
    edge(x0, y1 - r, x0, y0 + r)
    arc(x0 + r, y0 + r, math.pi, 1.5 * math.pi)

    # nhiễu tần số thấp + rung nhẹ -> nét như bút dạ
    phase = [rnd.uniform(0, 2 * math.pi) for _ in range(3)]
    out = []
    n = len(pts)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for i, (px, py) in enumerate(pts):
        t = 2 * math.pi * i / n
        off = wobble * (0.6 * math.sin(7 * t + phase[0]) + 0.3 * math.sin(17 * t + phase[1]) +
                        0.1 * math.sin(41 * t + phase[2])) + rnd.uniform(-0.6, 0.6)
        dx, dy = px - cx, py - cy
        dist = math.hypot(dx, dy) or 1
        out.append((px + dx / dist * off, py + dy / dist * off))
    return out


def _styled_text(lines, st, k, uppercase):
    """Lớp chữ tiêu đề (có viền + phát sáng tuỳ kiểu). Trả về (ảnh RGBA, rộng, cao)."""
    fnt = font(st["font"], int(st["size"] * k))
    sw = int(st["stroke_width"] * k)
    lines = [l.upper() if uppercase else l for l in lines]
    tw, th, items, line_h = _text_block(lines, fnt, 1.12, stroke=sw)
    glow_pad = int(30 * k)
    W, H = tw + 2 * (sw + glow_pad), th + 2 * (sw + glow_pad)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    def draw_lines(canvas, fill, stroke_w, stroke_fill):
        d = ImageDraw.Draw(canvas)
        y = sw + glow_pad
        for line, lw in items:
            d.text(((W - lw) // 2, y), line, font=fnt, fill=fill, stroke_width=stroke_w, stroke_fill=stroke_fill)
            y += line_h

    if st.get("glow"):
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        g = tuple(st["glow"])
        draw_lines(glow, g, sw + int(12 * k), g)
        glow = glow.filter(ImageFilter.GaussianBlur(10 * k))
        img = Image.alpha_composite(img, glow)
        img = Image.alpha_composite(img, glow)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_lines(layer, tuple(st["fill"]), sw, tuple(st["stroke"]))
    img = Image.alpha_composite(img, layer)
    return img, W, H, tw, th


def hook_images(hook, W, H, cfg, k, wrap):
    """Trả về (bong_bóng, chữ_nét, chữ_mờ) – 3 ảnh RGBA full khung."""
    st = cfg["styles"][hook.get("style") or cfg["default_style"]]
    if "\n" in hook["text"]:
        lines = hook["text"].split("\n")
    else:
        size = int(st["size"] * k)
        txt = hook["text"].upper() if st.get("uppercase") else hook["text"]
        lines = wrap(txt, cfg["max_line_width"] * k, 2, text_measure(st["font"], size))
    ox, oy = int(cfg["bubble_back_offset"][0] * k), int(cfg["bubble_back_offset"][1] * k)
    pad_x = int(cfg["pad_x"] * k)
    # Bong bóng (kể cả lớp tím lệch phía sau) phải nằm trọn trong khung, chừa lề hai bên
    max_bw = W - 2 * int(24 * k) - abs(ox)
    text_img, tW, tH, tw, th = _styled_text(lines, st, k, st.get("uppercase"))
    if tw + 2 * pad_x > max_bw:  # chữ quá dài -> thu nhỏ cỡ chữ cho vừa
        text_img, tW, tH, tw, th = _styled_text(lines, st, k * (max_bw - 2 * pad_x) / tw, st.get("uppercase"))

    bw = int(W * cfg["bubble_width_ratio"])
    bw = min(max(bw, tw + 2 * pad_x), max_bw)
    bh = th + int(2 * cfg["pad_y"] * k)
    pos = hook.get("position") or cfg["default_position"]
    cy = int(H * cfg["positions"].get(pos, 0.145))
    x0, y0 = (W - bw - ox) // 2, cy - bh // 2
    x1, y1 = x0 + bw, y0 + bh
    r = int(cfg["bubble_radius"] * k)
    wob = cfg["bubble_wobble"] * k
    tail = (x0 + int(bw * cfg["tail_x_ratio"]), int(70 * k), int(cfg["tail_height"] * k))

    bubble = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(bubble)
    back = _wobbly_rounded_rect(x0 + ox, y0 + oy, x1 + ox, y1 + oy, r, wob, seed=7)
    d.polygon(back, fill=tuple(cfg["bubble_back"]))
    d.line(back + back[:1], fill=tuple(cfg["bubble_border"]), width=max(2, int(cfg["bubble_border_width"] * k * 0.7)), joint="curve")
    front = _wobbly_rounded_rect(x0, y0, x1, y1, r, wob, seed=3, tail=tail)
    d.polygon(front, fill=tuple(cfg["bubble_fill"]))
    d.line(front + front[:1], fill=tuple(cfg["bubble_border"]), width=max(2, int(cfg["bubble_border_width"] * k)), joint="curve")

    sharp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sharp.alpha_composite(text_img, (x0 + (bw - tW) // 2, cy - tH // 2))
    blurred = sharp.filter(ImageFilter.GaussianBlur(14 * k))
    return bubble, sharp, blurred


# ---------------------------------------------------------------- ảnh minh hoạ (b-roll)
def broll_image(path, W, H, cfg):
    band_h = int(H * cfg["band_height_ratio"])
    src = Image.open(path).convert("RGB")
    s = max(W / src.width, band_h / src.height)
    src = src.resize((math.ceil(src.width * s), math.ceil(src.height * s)), Image.LANCZOS)
    left = (src.width - W) // 2
    top = max(0, int((src.height - band_h) * 0.35))
    src = src.crop((left, top, left + W, top + band_h)).convert("RGBA")

    alpha = Image.new("L", (W, band_h), int(255 * cfg["opacity"]))
    fade_h = int(band_h * cfg["bottom_fade_ratio"])
    grad = Image.linear_gradient("L").resize((W, fade_h)).transpose(Image.FLIP_TOP_BOTTOM)
    fade_mask = ImageChops.multiply(alpha.crop((0, band_h - fade_h, W, band_h)), grad)
    alpha.paste(fade_mask, (0, band_h - fade_h))
    src.putalpha(alpha)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img.paste(src, (0, 0))
    return img
