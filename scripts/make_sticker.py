"""Die-cut sticker PNG from a photo/frame: cut out the subject, thick white outline, colour disc behind, 3D emoji around.

usage: python make_sticker.py <in.jpg|png> <out.png> [--disc "#F7BE48"] [--emojis "📈,🎵,💰"] [--outline 14] [--size 640]
       [--crop x,y,w,h] [--no-cut]   (--no-cut = input already transparent; --crop in source px before cutting)
Recreates the reference's cartoon "me" stickers (spotlight layout) from the speaker's own footage, no AI image model needed.
Emoji are Fluent 3D PNGs (MIT) fetched from jsDelivr; they are skipped silently when offline.
"""
import argparse
import io
import json
import os
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw, ImageFilter

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--disc", default="#F7BE48", help='colour disc behind the subject ("none" to skip)')
ap.add_argument("--emojis", default="")
ap.add_argument("--outline", type=int, default=14)
ap.add_argument("--size", type=int, default=640)
ap.add_argument("--crop", default="")
ap.add_argument("--no-cut", action="store_true")
a = ap.parse_args()

im = Image.open(a.src).convert("RGBA")
if a.crop:
    x, y, w, h = (int(v) for v in a.crop.split(","))
    im = im.crop((x, y, x + w, y + h))
if not a.no_cut:
    from rembg import new_session, remove
    im = remove(im, session=new_session("u2net_human_seg"))
im = im.crop(im.getbbox())

S = a.size
# Fit subject into the lower ~78% of the canvas, centred, like the reference stickers.
k = min(S * .78 / im.height, S * .82 / im.width)
im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ox, oy = (S - im.width) // 2, S - im.height - int(S * .04)

art = Image.new("RGBA", (S, S), (0, 0, 0, 0))
if a.disc != "none":
    d = ImageDraw.Draw(art)
    r = int(S * .4)
    d.ellipse((S // 2 - r, int(S * .52) - r, S // 2 + r, int(S * .52) + r), fill=a.disc)
art.alpha_composite(im, (ox, oy))

if a.emojis:
    # engine/fluent_index.js = "const FLUENT_INDEX = {char: path, ...};"
    js = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engine", "fluent_index.js"), encoding="utf8").read()
    index = json.loads(js[js.index("{"):js.rindex("}") + 1])
    spots = [(.80, .22), (.86, .45), (.16, .24), (.78, .70), (.12, .55)]
    for i, ch in enumerate([c.strip() for c in a.emojis.split(",") if c.strip()][:len(spots)]):
        p = index.get(ch) or index.get(ch.replace("️", ""))
        if not p:
            continue
        try:
            u = "https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/" + urllib.parse.quote(p)
            em = Image.open(io.BytesIO(urllib.request.urlopen(u, timeout=15).read())).convert("RGBA")
        except Exception:
            continue
        es = int(S * .2)
        em = em.resize((es, es), Image.LANCZOS).rotate((-12, 10, 8, -6, 14)[i], expand=True, resample=Image.BICUBIC)
        x, y = spots[i]
        art.alpha_composite(em, (int(S * x - em.width / 2), int(S * y - em.height / 2)))

# White die-cut outline = dilated alpha, then a soft drop shadow.
alpha = art.split()[3]
ol = alpha.filter(ImageFilter.MaxFilter(a.outline * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2)).point(lambda v: 255 if v > 90 else 0)
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
shadow.putalpha(ol.filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * .35)))
white = Image.new("RGBA", (S, S), (255, 255, 255, 0))
white.putalpha(ol)
canvas.alpha_composite(shadow, (0, 8))
canvas.alpha_composite(white)
canvas.alpha_composite(art)
canvas.save(a.out)
print("sticker ->", a.out)
