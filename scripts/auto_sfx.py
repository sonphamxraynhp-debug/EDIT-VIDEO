"""Auto-place SFX from timeline.json scenes (the reference video's sound design rules), rotating library variants.

usage: python auto_sfx.py timeline.json [--keep-manual] [--density 1.0] [--dry]
       python auto_sfx.py timeline.json --level nhe|vua|phongphu [--music auto] [--claude] [--clear]   (v4, references/autofill.md)
Writes timeline.audio.sfx. Entries you add by hand with "manual": true survive with --keep-manual.
Rules = references/audio-spec.md §SFX map. Hits land 1 frame early (perceived sync), duplicates within 0.12 s are dropped.
--level (absent = the classic behaviour above, unchanged): generic rules for ANY scene type (all packs, b-roll, text, photo,
emoji, clip transitions, caption numbers/money/highlights), risers before hero hits, a hits-per-second limiter, quieter hits
while someone speaks. Only entries marked "_auto" are replaced; everything else (manual, AI, older hits) is kept.
--music auto: one bed per section with an offline keyword mood (or Claude with --claude), crossfades, ducking on.
"""
import argparse
import json
import os
import re
import subprocess
import unicodedata
import zlib
from collections import defaultdict

ap = argparse.ArgumentParser()
ap.add_argument("timeline")
ap.add_argument("--keep-manual", action="store_true")
ap.add_argument("--density", type=float, default=1.0, help="<1 drops low-priority hits (pops/ticks), >1 keeps everything")
ap.add_argument("--dry", action="store_true")
ap.add_argument("--level", default="", help="nhe | vua | phongphu (also nhẹ / vừa / phong phú)")
ap.add_argument("--music", default="keep", help="auto = pick a mood bed per section (only with --level)")
ap.add_argument("--claude", action="store_true", help="ask `claude -p` for the section moods (offline fallback)")
ap.add_argument("--clear", action="store_true", help="only remove _auto SFX / music and exit")
a = ap.parse_args()
fold = lambda x: unicodedata.normalize("NFD", str(x).lower().replace("đ", "d")).encode("ascii", "ignore").decode()
LEVEL = {"nhe": 1, "vua": 2, "phongphu": 3, "phong phu": 3, "phong_phu": 3, "light": 1, "medium": 2, "rich": 3}.get(fold(a.level).strip(), 0) if a.level else 0
if a.level and not LEVEL:
    raise SystemExit(f"--level không hợp lệ: {a.level} (nhe | vua | phongphu)")

tl = json.load(open(a.timeline))
VARIANTS = {
    "whoosh": ["whoosh", "whoosh_2", "whoosh_4", "whoosh_7", "whoosh_3"],
    "impact": ["impact", "impact_3", "impact_5", "impact_2"],
    "pop": ["pop", "pop_2", "pop_3", "pop_6", "pop_4"],
    "click": ["click", "click_2", "click_3"],
    "notification": ["notification", "notification_2", "notification_4"],
    "swipe": ["swipe", "swipe_2", "swipe_3"],
    "glitch": ["glitch", "glitch_3", "glitch_5"],
    "sparkle": ["sparkle", "sparkle_2", "sparkle_3"],
    "blip": ["blip", "blip_2", "blip_4"],
}
rot = defaultdict(int)
hits = []
F = 1 / 30


def v(kind):
    """Next variant of a sound family (keeps repeated hits from sounding mechanical)."""
    if kind not in VARIANTS:
        return kind
    i = rot[kind]
    rot[kind] += 1
    return VARIANTS[kind][i % len(VARIANTS[kind])]


def add(t, name, gain, prio=1):
    if t is None or t < 0 or t > tl.get("duration", 1e9):
        return
    if prio < 1 and a.density < 1 and zlib.crc32(f"{t:.2f}{name}".encode()) % 100 / 100 > a.density:
        return
    hits.append({"t": round(max(0.0, t - F), 3), "name": v(name), "gain": gain, "_p": prio})


for s in tl.get("scenes", []):
    ty, t0 = s.get("type"), s.get("t0", 0)
    if ty == "hud":
        add(t0, "scan", -18)
        add(s.get("face_out", t0 + 1.2) - .3, "hud_lock", -16)
    elif ty == "slam_bg":
        add(t0, "boom", -11)
    elif ty == "flash_ring":
        add(t0, "flash_pop", -12)
    elif ty == "kinetic":
        for w in s.get("label_words", []):
            add(w.get("t"), "whoosh_fast", -24, 0)
        if s.get("label_t") is not None and not s.get("label_words"):
            add(s["label_t"], "whoosh_fast", -22, 0)
        add(s.get("hero_t"), "whoosh", -13)
        add(s.get("sub_t"), "pop", -20, 0)
        add(s.get("sub2_t"), "pop", -20, 0)
        if s.get("emoji"):
            add(s.get("emoji_t", s.get("hero_t")), "pop", -16)
    elif ty == "mega":
        if s.get("behind"):
            add(t0 - .02, "whoosh_reverse", -18)
        add(t0, "impact", -10)
    elif ty == "counter":
        ta, tb = s.get("t_a", t0), s.get("t_b", t0 + 1)
        k = ta
        while k < tb - .05:
            add(k, "tick", -24, 0)
            k += .12
        add(tb, "ding" if s.get("format") != "clock" else "impact", -14)
    elif ty == "question_marks":
        for it in s.get("items", []):
            add(it.get("t"), "pop", -16)
    elif ty in ("pill",):
        add(t0, "pop", -15)
    elif ty == "stamp":
        add(t0, "stamp", -9)
    elif ty == "stickers":
        for it in s.get("items", []):
            add(it.get("t"), "pop", -17, 0)
    elif ty == "light_leak":
        add(t0, "whoosh_slow", -16)
        add(t0 + .1, "shimmer", -20, 0)
    elif ty == "iris":
        add(t0, "whoosh_deep", -14)
    elif ty == "ring":
        add(s.get("t_b"), "blip", -18)
    elif ty == "compare_bar":
        add(s.get("bottom_t"), "swoosh_up", -16)
        add(s.get("shrink_t"), "swoosh_down", -16)
    elif ty == "ui_showcase":
        add(t0, "camera_shutter", -16)
        add(s.get("chip_t"), "pop", -18, 0)
        for g in s.get("tags", []):
            add(g.get("t"), "pop", -17, 0)
    elif ty == "checklist_panel":
        add(t0, "ui_open", -18)
        items = s.get("items", [])
        for i, it in enumerate(items):
            add(it.get("t"), "click", -14)
            if i == len(items) - 1:
                add(it.get("t", 0) + .25, "success_3", -16)
    elif ty == "prompt_box":
        ta, tb = s.get("type_a", t0), s.get("type_b", t0 + 1)
        dur = max(1, min(4, round(tb - ta)))
        add(ta, f"typing_{dur if dur in (1, 2, 4) else 2}s", -18)
        add(tb, "keyboard_enter", -14)
        add(s.get("progress_b"), "success", -16)
    elif ty == "orbit":
        add(t0, "whoosh_3", -14)
        add(s.get("fill_t", t0 + .6), "sparkle", -16)
    elif ty == "mood":
        add(t0, {"sad": "downlifter", "happy": "stinger_happy", "mellow": "fairy_dust"}.get(s.get("mode"), "shimmer"), -14)
    elif ty == "mosaic":
        add(t0, "whoosh", -14)
        step = s.get("step", .35)
        k = t0 + step
        while k < s["t1"] - .1:
            add(k, "swipe", -22, 0)
            k += step * 2
    elif ty == "mosaic_wall":
        add(t0, "whoosh_2", -13)
        add(s.get("text_t"), "impact", -11)
    elif ty == "step_cards":
        for c in s.get("cards", []):
            add(c.get("t"), "swoosh_up", -16)
        add(s.get("highlight_t"), "ding", -14)
    elif ty == "end_card":
        add(t0, "cinematic_hit", -10)
        add(t0 + .3, "shimmer", -18, 0)
    elif ty == "broll":
        tp = s.get("template", "")
        add(t0, "whoosh", -14)
        d = s["t1"] - t0
        if tp in ("bar_chart", "line_chart", "kpi", "pie", "counter_big", "progress"):
            add(t0 + .25, "data_burst", -20, 0)
            add(t0 + min(2.0, d - .3), "ding", -16)
        elif tp == "notifications":
            for i in range(min(5, len(s.get("items") or [0] * 4))):
                add(t0 + .2 + i * .45, "notification", -16)
        elif tp == "chat":
            for i in range(min(5, len(s.get("items") or [0] * 4))):
                add(t0 + .2 + i * .6, "message_sent" if i % 2 else "pop", -16)
        elif tp == "money_rain":
            add(t0 + .2, "cash_register", -14)
        elif tp == "likes":
            add(t0 + .1, "pop", -15)
            add(t0 + .4, "sparkle", -20, 0)
        elif tp == "countdown":
            add(t0, "countdown_321", -14)
        elif tp == "clock":
            add(t0, "clock_ticking", -18)
        elif tp in ("typewriter", "search"):
            add(t0 + .2, "typing_2s", -18)
        elif tp in ("glitch_text", "matrix", "code_rain"):
            add(t0, "glitch", -16)
        elif tp == "rocket":
            add(t0 + .2, "riser_2s", -16)
        elif tp == "emoji_burst":
            add(t0 + .15, "impact_5", -14)
            add(t0 + .2, "sparkle", -16)
        elif tp == "versus":
            add(t0 + .05, "transition_hit", -12)
        elif tp == "checklist":
            for i in range(len(s.get("items") or [0] * 4)):
                add(t0 + .6 + i * .5, "click", -15)
        elif tp == "files":
            add(t0 + .1, "paper", -18)
        elif tp == "map_pins":
            for i in range(min(6, len(s.get("items") or [0] * 5))):
                add(t0 + .2 + i * .3, "pop", -17, 0)
        elif tp == "calendar":
            add(t0, "paper", -18)
        elif tp in ("neural", "orbit_icons", "browser", "phone_feed"):
            add(t0 + .2, "ui_open", -18)
        elif tp == "timeline_steps":
            add(t0 + .2, "swoosh_up", -18)
    # ---- vertical tutorial-bubble modules (references/modules-vertical.md) ----
    elif ty == "hook_card":
        add(t0, "whoosh_2", -15)
    elif ty == "spotlight":
        add(t0, "whoosh_deep", -15)
    elif ty == "bubble_screen":
        add(t0, {"drop": "whoosh", "push_up": "whoosh", "zoom": "whoosh_reverse", "fade": "whoosh_slow"}.get(s.get("enter"), "swipe"), -15)
        add(s.get("bubble_t", t0) + .05, "pop", -18, 0)
        chat = (s.get("screen") or {}).get("chat") or {}
        inp = chat.get("input")
        if inp:
            dur = inp["t1"] - inp["t0"]
            add(inp["t0"], f"typing_{4 if dur > 3 else 2 if dur > 1.5 else 1}s", -20)
        for m in chat.get("messages", []):
            if m.get("t", 0) > t0 + .05:
                add(m["t"], "keyboard_enter" if m.get("role") == "user" else "blip", -17 if m.get("role") == "user" else -21)
    elif ty == "icon_tap":
        add(t0, "pop", -14)
        for tp in s.get("taps", [.55, 1.15]):
            add(t0 + tp, "click", -13)
    elif ty == "follow_cta":
        add(t0, "pop", -15)
        add(t0 + .6, "click", -13)
        add(t0 + .65, "notification", -16)
        kw = s.get("keyword")
        if kw:
            add(kw.get("t"), "shimmer", -16)
            add(kw.get("t"), "impact_5", -17, 0)
    elif ty == "sticker":
        add(s.get("t", t0), "swipe", -18)
    elif ty == "black":
        pass
    # ---- slate grid modules (references/modules-slate.md) ----
    elif ty == "frame_grid":
        if s.get("enter") in ("blur", "zoom"):
            add(t0, "whoosh_slow", -18)
        if isinstance(s.get("blur"), list) and len(s["blur"]) > 1:
            add(s["blur"][1]["t"] - .3, "whoosh_reverse", -19, 0)
    elif ty == "led_text":
        add(t0, "beep_computer", -20)
        add(t0 + .35, "data_burst", -22, 0)
    elif ty == "neon_text":
        add(t0, "static_burst", -20)
    elif ty == "logo_row":
        for i in range(len(s.get("icons", []))):
            add(t0 + i * s.get("stagger", .07), "blip", -20 if i else -17, 0 if i else 1)
    elif ty == "media_card":
        add(t0, "swoosh_up", -18)
    elif ty == "diagram":
        for n in s.get("nodes", []):
            nm = {"pill": "sparkle", "pill_outline": "pop_4", "big": "shimmer", "person": "pop"}.get(n.get("kind"), "pop_2")
            add(n.get("t", t0), nm, -17 if nm != "pop_2" else -19)
        for e in s.get("edges", []):
            add(e.get("t", t0), "swoosh_up", -21, 0)
    elif ty == "title_card":
        add(t0, "stinger_happy", -16)
    # ---- style packs (engine/packs/*.js): a light sound on every graphic entrance ----
    elif ty.split("_")[0] in ("course", "re", "rv", "sh", "luxury", "neon", "keynote", "glow", "podcast", "kinetic") or ty in ("photo", "emoji_pop"):
        big = any(k in ty for k in ("stamp", "verdict", "slam", "chapter", "title", "hook", "bigtype", "zoomcut", "zoomblur", "cta"))
        soft = any(k in ty for k in ("frame", "grade", "scrim", "progress", "dip"))
        if not soft:
            add(t0, "whoosh_2" if big else "pop", -16 if big else -19)
        if "stamp" in ty or "verdict" in ty or "slam" in ty:
            add(t0 + .05, "stamp", -15, 0)
        for it in (s.get("steps") or s.get("items") or [])[:6] if isinstance(s.get("steps") or s.get("items"), list) else []:
            if isinstance(it, dict) and it.get("t"):
                add(it["t"], "blip", -21, 0)
    # Text lines + stickers inside any vertical module: sound follows the entrance animation.
    LINE_SFX = {"slide_l": "whoosh_fast", "slide_r": "whoosh_fast", "pop": "pop", "drop": "pop", "tumble": "whoosh_2",
                "blur_zoom": "whoosh_reverse", "fly": "pop", "type": "typing_1s", "fade": None}
    for L in s.get("lines", []) if ty in ("hook_card", "spotlight", "bubble_screen", "text", "media_card", "diagram", "frame_grid") else []:
        nm = LINE_SFX.get(L.get("anim", "pop"))
        if nm:
            add(L.get("t"), nm, -16 if nm != "pop" else -17)
        if L.get("anim") == "fly":
            add(L.get("t", 0) + .45, "whoosh_fast", -20, 0)
    st = s.get("sticker") if ty in ("spotlight", "bubble_screen") else None
    if st:
        add(st.get("t"), "swipe", -17)
        add(st.get("t", 0) + .3, "pop", -16)
for f in tl.get("fx", []):
    add(f.get("t"), {"shake": "impact_3", "punch": "kick", "whip": "whoosh_fast", "glitch": "glitch", "flash": "flash_pop",
                     "blur_in": "whoosh_2", "zoom_in": "whoosh_reverse"}.get(f.get("type"), "whoosh"), -14)

# ===================================================================== v4: --level (generic rules + limiter + music)
SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.dirname(os.path.abspath(a.timeline))
DUR = tl.get("duration", 0)
VERT = (tl.get("height") or 720) > (tl.get("width") or 1280)
DW = 720 if VERT else 1280
V4_VARIANTS = {
    "whoosh_soft": ["whoosh_soft", "whoosh_soft_2"],
    "whoosh_heavy": ["whoosh_heavy", "whoosh_deep", "whoosh_5", "whoosh_3"],
    "swoosh_out": ["swoosh_out", "swoosh_out_2", "swoosh_down"],
    "pop_soft": ["pop_soft", "pop_soft_2", "pop_bubble"],
    "pop_card": ["pop", "pop_bright", "pop_3", "cartoon_pop", "pop_2"],
    "hit": ["hit_punch", "hit_punch_2", "impact_3", "hit_punch_3", "impact_5"],
    "hero_hit": ["hit_cinematic_short", "impact", "hit_metal", "impact_2", "hit_deep"],
    "riser06": ["reverse_cymbal_0_6s", "riser_noise_0_6s", "riser_0_6s"],
    "sparkle_soft": ["sparkle_soft", "twinkle", "sparkle", "chime_soft"],
    "ding": ["ding", "ding_2", "ding_3", "ding_4", "price_tag"],
    "money": ["cash_ching", "coin", "coin_drop", "cash_ching_2", "coin_2"],
    "notif": ["notif_pop", "message_in", "notification", "message_in_2", "notification_2"],
    "shutter": ["camera_shutter", "camera_shutter_2"],
    "swipe_in": ["swipe", "ui_swipe_soft", "swipe_3", "slide"],
    "clip_cut": ["whoosh_fast", "whip", "whip_2"],
    "tick_ui": ["ui_select", "blip", "ui_tap", "blip_2"],
}
LEG = {"hud", "slam_bg", "flash_ring", "kinetic", "mega", "counter", "question_marks", "pill", "stamp", "stickers", "light_leak", "iris", "ring",
       "compare_bar", "ui_showcase", "checklist_panel", "prompt_box", "orbit", "mood", "mosaic", "mosaic_wall", "step_cards", "end_card", "broll",
       "hook_card", "spotlight", "bubble_screen", "icon_tap", "follow_cta", "sticker", "black", "frame_grid", "led_text", "neon_text", "logo_row",
       "media_card", "diagram", "title_card", "photo", "emoji_pop"}
LEG_PRE = ("course", "re", "rv", "sh", "luxury", "neon", "keynote", "glow", "podcast", "kinetic")
LEG_LINES = ("hook_card", "spotlight", "bubble_screen", "text", "media_card", "diagram", "frame_grid")
RX = lambda p: re.compile(p)
SOFT = RX(r"(frame|grade|scrim|progress|dip|letterbox|backdrop|wave|cursor|facecam|slowmo|grid_bg|waveform|^black$|^mood$|lowerthird|names|ticker)")
BIG = RX(r"(title|hook|bigtype|slam|zoomcut|zoomblur|intro|headline|breaking|verdict|stamp|reveal|podium|chapter|outro|endcard|end_card|myth|punch|mega|led_text|neon_text)")
CHAT = RX(r"(chat|comment|tweet|notif|message|phone|poll|mic|qa_question)")
MONEY = RX(r"(price|coupon|loan|money|cash)")
PHOTO = RX(r"(photo|gallery|unbox|product|article|screen|showcase|floorplan)")
LIST = RX(r"(list|steps|rows|chips|specs|proscons|amenities|pillars|labels|recap|item|timeline|keypoint|lesson)")
STAT = RX(r"(chart|stat|score|rating|bars|counter|compare|number|kpi|gridfill)")
TYPE = RX(r"(typewriter|_type$|code|keys|search)")
EMO = RX(r"(emoji|sticker|doodle|scatter|diamonds|badge)")
SWITCH = RX(r"(flash|switch|split|focus|zoom|transition|slider)")
CTA = RX(r"(cta|follow|subscribe)")
HERO_NAMES = RX(r"^(impact|boom|cinematic|braam|hit_|stamp|sub_drop|transition_hit|intro_hit|outro_hit|kick)")
LOUD_P = 3
# matched on the lower-case word WITH diacritics (folding would confuse tiền/tiến, giá/gia…)
MONEY_W = {"tiền", "đồng", "triệu", "tỷ", "tỉ", "nghìn", "ngàn", "usd", "vnđ", "đô", "lương", "giá", "k", "$"}
MONEY_SOLO = {"tiền", "triệu", "tỷ", "tỉ", "lương", "doanh thu", "lợi nhuận", "thu nhập", "giá", "chi phí", "lãi"}
EMO_W = {"tuyệt", "tuyệt vời", "wow", "bất ngờ", "sốc", "yêu", "thích", "vui", "hạnh phúc", "đỉnh", "khủng", "quá đã", "buồn", "sợ", "kinh khủng", "chúc mừng", "thành công", "tiến hoá", "tiến hóa", "tự động"}
KEY_W = {"ai", "video", "clip", "edit", "công cụ", "hiệu ứng", "phông chữ", "hình ảnh", "khách hàng", "doanh thu", "sản phẩm", "thời gian", "miễn phí", "bí mật", "kéo thả", "nhạc", "tool"}


def load_words():
    cap = tl.get("captions")
    if isinstance(cap, str):
        try:
            cap = json.load(open(os.path.join(BASE, cap)))
        except Exception:
            cap = []
    out = []
    for c in cap or []:
        for w in c.get("words", []):
            if w.get("w"):
                out.append({"w": w["w"], "s": float(w.get("s", c.get("t0", 0))), "e": float(w.get("e", c.get("t1", 0))), "hl": bool(w.get("hl"))})
    return cap or [], out


def level_mode():
    VARIANTS.update(V4_VARIANTS)
    audio = tl.setdefault("audio", {})
    kept = [h for h in audio.get("sfx", []) if not h.get("_auto")]
    if a.clear:
        audio["sfx"] = kept
        was = [w for m in audio.get("music", []) if m.get("_auto") for w in m.get("_was", [])]  # beds the auto music replaced
        audio["music"] = [m for m in audio.get("music", []) if not m.get("_auto")] + was
        print(f"đã xoá SFX/nhạc tự động; giữ {len(kept)} SFX")
        if not a.dry:
            json.dump(tl, open(a.timeline, "w"), ensure_ascii=False, indent=1)
        return
    caps, words = load_words()
    cand = []
    photo_t = {round(max(0.0, float(s.get("t0", 0)) - F), 3) for s in tl.get("scenes", []) if s.get("type") == "photo"}
    for h in hits:  # classic per-module rules -> v4 priorities (photos get a shutter instead of the generic pop)
        if h["t"] in photo_t and h["name"].startswith("pop"):
            continue
        nm = h["name"]
        h["_p"] = LOUD_P if HERO_NAMES.match(nm) else 2 if h.pop("_p", 1) >= 1 else 1
        cand.append(h)

    def put(t, fam, gain, prio=2):
        if t is None or t < 0 or t > DUR - .05:
            return
        cand.append({"t": round(max(0.0, t - F), 3), "name": v(fam), "gain": gain, "_p": prio})

    def typing_for(d):
        return "typing_1s" if d < 1.4 else "typing_2s" if d < 2.6 else "typing_3s"

    def tpl_rules(tp, t0, d, items):  # b-roll preset shown inside a card (media_card.screen.broll)
        if tp in ("bar_chart", "line_chart", "kpi", "pie", "counter_big", "progress"):
            put(t0 + .25, "data_burst", -22, 1)
            put(t0 + min(1.8, d - .3), "ding", -18, 2)
        elif tp in ("typewriter", "search"):
            put(t0 + .2, typing_for(d - .4), -21, 1)
        elif tp in ("notifications", "phone_feed", "chat", "likes"):
            put(t0 + .3, "notif", -19, 2)
        elif tp == "money_rain":
            put(t0 + .2, "money", -17, 2)
        elif tp in ("glitch_text", "matrix", "code_rain"):
            put(t0, "glitch_short", -18, 1)
        elif tp in ("emoji_burst", "sunburst", "icon_hero", "rings"):
            put(t0 + .15, "sparkle_soft", -21, 1)
        elif tp in ("checklist", "timeline_steps"):
            for i in range(min(4, len(items or [0] * 3))):
                put(t0 + .6 + i * .5, "tick_ui", -21, 1)
        elif tp == "countdown":
            put(t0, "countdown_321" if d >= 3.3 else "tick_ui", -17, 2)
        elif tp == "rocket":
            put(t0 + .2, "riser_1s", -19, 1)

    def is_full(s):
        ty = s.get("type", "")
        if ty == "broll":
            return (s.get("layout") or "full") == "full"
        if ty == "photo":
            return (s.get("mode") or "full") == "full"
        if ty == "media_card":
            c = s.get("card") or {}
            return (c.get("w") or 0) >= DW * .95
        return ty in ("slam_bg", "mosaic", "mosaic_wall", "end_card", "hook_card", "spotlight", "re_gallery", "beat_slideshow")

    scenes = sorted([s for s in tl.get("scenes", []) if not s.get("hidden")], key=lambda s: s.get("t0", 0))
    LINE4 = {"slide_l": "whoosh_soft", "slide_r": "whoosh_soft", "pop": "pop_card", "drop": "pop_card", "tumble": "whoosh_soft",
             "blur_zoom": "riser06", "fly": "pop_card", "type": "typing_1s", "fade": None}
    hook = None
    for s in scenes:
        ty, t0 = s.get("type", ""), float(s.get("t0", 0))
        t1 = float(s.get("t1", t0 + 1))
        d = max(.1, t1 - t0)
        if SOFT.search(ty):
            continue
        full, big = is_full(s), bool(BIG.search(ty)) or any((L.get("size") or 0) >= 80 for L in s.get("lines", []) or [])
        if hook is None and t0 < 2.5 and (big or full or s.get("lines")):
            hook = s
        if not (ty in LEG or ty.split("_")[0] in LEG_PRE):
            if full:
                put(t0, "whoosh_heavy", -16, 2)
            elif CTA.search(ty):
                put(t0, "pop_card", -16, 2)
                put(t0 + .5, "ui_click_soft", -17, 1)
            elif big:
                put(t0, "hero_hit", -13, LOUD_P)
            elif CHAT.search(ty):
                put(t0, "notif", -17, 2)
            elif MONEY.search(ty):
                put(t0, "money", -16, 2)
            elif PHOTO.search(ty):
                put(t0, "shutter" if re.search("photo|gallery|unbox|product", ty) else "swipe_in", -17, 2)
            elif STAT.search(ty):
                put(t0, "whoosh_soft", -18, 2)
                put(t0 + min(1.6, d - .3), "ding", -19, 1)
            elif TYPE.search(ty):
                put(t0, typing_for(d * .7), -20, 2)
            elif EMO.search(ty):
                put(t0, "pop_card", -17, 2)
                put(t0 + .08, "sparkle_soft", -22, 1)
            elif SWITCH.search(ty):
                put(t0, "whoosh_fast", -16, 2)
            elif LIST.search(ty):
                put(t0, "swipe_in", -17, 2)
            else:
                put(t0, "pop_card", -18, 2)
            its = s.get("items") or s.get("steps") or s.get("rows") or []
            if isinstance(its, list):
                for it in its[:6]:
                    if isinstance(it, dict) and isinstance(it.get("t"), (int, float)):
                        put(it["t"], "tick_ui", -21, 1)
            for L in (s.get("lines") or []) if ty not in LEG_LINES else []:
                nm = LINE4.get(L.get("anim", "pop"))
                if nm and isinstance(L.get("t"), (int, float)):
                    put(L["t"] - (.6 if nm == "riser06" else 0), nm, -19, 1)
        # extras on top of the classic rules
        if full and d <= 4.5 and LEVEL >= 2 and t1 < DUR - .3:
            put(t1 - .12, "swoosh_out", -20, 1)
        if ty == "photo" or (ty == "media_card" and s.get("media") and not s.get("screen")):
            put(t0 + .02, "shutter", -18, 2)
        if ty in ("emoji_pop", "sticker") and LEVEL >= 2:
            put(t0 + .1, "sparkle_soft", -22, 1)
        if ty == "text" and any((L.get("anim") == "type") for L in s.get("lines", [])):
            for L in s["lines"]:
                if L.get("anim") == "type":
                    put(L.get("t", t0), typing_for(len(L.get("text", "")) * .035), -21, 1)
        sc = s.get("screen") or {}
        if ty == "media_card" and sc.get("broll"):
            b = sc["broll"]
            tp = b.get("template") or ((b.get("id") or "").split("--") + ["", ""])[1]
            tpl_rules(tp, t0, d, b.get("items"))
        if ty == "media_card" and sc.get("chat"):
            ch = sc["chat"]
            inp = ch.get("input") or {}
            if inp.get("t0") is not None:
                put(inp["t0"], typing_for(inp.get("t1", inp["t0"] + 1) - inp["t0"]), -20, 1)
            for m in ch.get("messages", [])[:5]:
                put(m.get("t"), "notif" if m.get("role") != "user" else "keyboard_enter", -19, 1)
        if re.search(r"(title_card|end_card|outro|endcard|follow_cta|_cta$)", ty) and t0 >= DUR * .6 and LEVEL >= 2:
            put(t0, "outro_hit", -14, LOUD_P)

    # hook: hit on the first big graphic (or the first line of speech), sub drop when it ends
    if hook is not None:
        h0, h1 = float(hook["t0"]), float(hook.get("t1", hook["t0"] + 2))
        if not any(c["_p"] >= LOUD_P and abs(c["t"] - h0) < .25 for c in cand):
            put(h0, "hero_hit", -13, LOUD_P)
        if LEVEL >= 2:
            put(min(h1, h0 + 3.0), "sub_drop_short", -17, 1)
    elif LEVEL >= 2 and caps:
        first_end = next((c["t1"] for c in caps if c["t1"] >= 1.2), None)
        if first_end and first_end < 4:
            put(first_end, "sub_drop_short", -19, 1)
    # risers ~0.6 s before every hero hit
    if LEVEL >= 2:
        for c in [c for c in cand if c["_p"] >= LOUD_P and c["t"] >= .7]:
            put(c["t"] - .6 + F, "riser06", -21, 1)
    # clip transitions on the main track
    pos = 0.0
    for i, c in enumerate([c for c in tl.get("clips") or [] if not c.get("hidden")]):
        if i:
            tr = (c.get("transition") or {}).get("type")
            fam = {"whip": "clip_cut", "glitch": "transition_glitch", "flash": "transition_whip_hit", "zoom": "whoosh", "zoom_out": "whoosh",
                   "push": "whoosh", "slide_l": "whoosh", "slide_r": "whoosh", "slide_up": "whoosh", "spin": "transition_hit_4",
                   "fade": "transition_soft", "dissolve": "transition_soft", "blur": "whoosh_soft", "wipe": "swipe_in", "circle": "whoosh_soft"}.get(tr)
            if fam and (LEVEL >= 2 or fam not in ("transition_soft", "whoosh_soft")):
                put(pos, fam, -16, 2)
            elif not tr and LEVEL >= 3:
                put(pos, "whoosh_soft", -25, 0)
        pos += max(1 / 30, (c.get("out", 3) - c.get("in", 0)) / (c.get("speed") or 1))
    # captions: numbers / money (vừa+), highlighted & emotional words (phong phú)
    last_money, last_key = -9.0, -9.0
    any_hl = any(w["hl"] for w in words)
    lw = lambda w: unicodedata.normalize("NFC", w["w"].lower()).strip(".,!?…:;\"'")
    for i, w in enumerate(words):
        f = lw(w)
        nxt = lw(words[i + 1]) if i + 1 < len(words) else ""
        pair = f + " " + nxt
        if LEVEL >= 2 and re.search(r"\d", f):
            if (nxt in MONEY_W or f.endswith(("k", "$", "đ"))) and w["s"] - last_money > 1.5:
                put(w["s"], "money", -19, 1)
                last_money = w["s"]
            else:
                put(w["s"], "ding", -21, 1)
        elif LEVEL >= 2 and (f in MONEY_SOLO or pair in MONEY_SOLO) and w["s"] - last_money > 2.0:
            put(w["s"], "money", -21, 1)
            last_money = w["s"]
        elif LEVEL >= 3 and (f in EMO_W or pair in EMO_W):
            put(w["s"], "sparkle_soft", -25, 0)
        elif LEVEL >= 3 and (w["hl"] or (not any_hl and (f in KEY_W or pair in KEY_W) and w["s"] - last_key > 2.5)):
            put(w["s"], "pop_soft" if i % 2 else "whoosh_soft", -26, 0)
            last_key = w["s"]

    music_note = music_auto(caps, words, audio) if a.music == "auto" else ""
    if a.music == "auto" and LEVEL >= 2 and not music_note.startswith("bỏ qua"):
        if not any(c["_p"] >= LOUD_P and c["t"] < 1.0 for c in cand):
            put(0.0, "swell_soft", -24, 1)  # intro: soft swell under the first words

    # speech-aware gain + per-level offset
    spans = [(w["s"] - .05, w["e"] + .05) for w in words]
    talk = lambda t: any(x <= t <= y for x, y in spans)
    for c in cand:
        if talk(c["t"]):
            c["gain"] -= 2 if c["_p"] >= LOUD_P else {1: 4, 2: 3, 3: 2}[LEVEL]
        c["gain"] += {1: -1, 2: 1, 3: 2}[LEVEL]

    # limiter: max hits per 1 s / 0.5 s window, ≥ 0.1 s apart; risers counted separately (one at a time)
    cap1, cap05 = {1: 2, 2: 3, 3: 4}[LEVEL], {1: 1, 2: 2, 3: 2}[LEVEL]
    floor = {1: 2, 2: 1, 3: 0}[LEVEL]  # lowest priority allowed per level
    exempt = lambda n: bool(re.match(r"(riser|reverse_|swell|countdown|clock_|typing|typewriter_keys)", n))
    old_t = [h["t"] for h in kept]
    acc, acc_x = [], []
    for c in sorted(cand, key=lambda c: (-c["_p"], c["t"])):
        if c["_p"] < floor or any(abs(c["t"] - t) < .15 for t in old_t):
            continue
        if exempt(c["name"]):
            if all(abs(c["t"] - x["t"]) > .5 for x in acc_x):
                acc_x.append(c)
            continue
        n1 = sum(1 for x in acc if c["t"] - .5 <= x["t"] < c["t"] + .5)
        n05 = sum(1 for x in acc if c["t"] - .25 <= x["t"] < c["t"] + .25)
        if n1 < cap1 and n05 < cap05 and all(abs(c["t"] - x["t"]) >= .1 for x in acc):
            acc.append(c)
    out = []
    for c in sorted(acc + acc_x, key=lambda c: c["t"]):
        c.pop("_p", None)
        out.append({**c, "gain": round(c["gain"], 1), "_auto": True})
    audio["sfx"] = sorted(kept + out, key=lambda h: h["t"])
    if audio.get("music") and (not isinstance(audio.get("duck"), dict) or not audio["duck"].get("on")):
        audio["duck"] = {"on": True, "amount_db": -10, "attack": 60, "release": 400, "hold": 250}
        music_note += " · bật tự hạ nhạc"
    span = max(1.0, DUR)
    per_s = len(out) / span
    peak = max((sum(1 for x in out if c["t"] <= x["t"] < c["t"] + 1) for c in out), default=0)
    print(f"level {LEVEL}: {len(out)} SFX tự động ({len(set(h['name'] for h in out))} tiếng khác nhau, {per_s:.2f}/s, tối đa {peak} trong 1 s) + giữ {len(kept)}"
          + (f" · {music_note}" if music_note else ""))
    if not a.dry:
        json.dump(tl, open(a.timeline, "w"), ensure_ascii=False, indent=1)


# ---- music: one bed per section, offline keyword mood (or Claude), crossfades
PACK_MOOD = {"slate": "tech", "hypecam": "hype", "basic": "corporate_upbeat", "course": "corporate_upbeat", "luxury": "real_estate_luxury",
             "neon": "tiktok_trap", "keynote": "corporate", "glow": "lofi_hiphop", "podcast": "lofi_hiphop", "kinetic": "tiktok_trap",
             "realestate": "real_estate_luxury", "review": "happy", "share": "acoustic_warm", "split": "corporate_upbeat", "transform": "hype",
             "greenscreen": "news_bg", "news": "news_bg", "multicam": "lofi_hiphop", "qa": "kids_playful", "topn": "hype",
             "cinema": "cinematic_epic", "screencast": "lofi_hiphop", "bubble": "happy"}
MOOD_KW = {  # whole phrases, matched on lower-case text with diacritics
    "sad": "buồn|khó khăn|thất bại|mất mát|đau khổ|tiếc|cô đơn|áp lực|nợ nần|vất vả|khóc|tuyệt vọng",
    "happy": "vui|tuyệt vời|thích|yêu|hạnh phúc|chúc mừng|cười|dễ dàng|thú vị|hào hứng",
    "cinematic_epic": "tầm nhìn|vĩ đại|thay đổi|cách mạng|tương lai|chinh phục|đỉnh cao|lịch sử|thế giới",
    "suspense": "bí mật|cảnh báo|nguy hiểm|rủi ro|sai lầm|sự thật|lừa đảo|sốc|cẩn thận|đáng sợ",
    "tech": "ai|công nghệ|công cụ|tool|phần mềm|app|tự động|máy tính|dữ liệu|code|edit|video|clip|chatgpt|robot|hiệu ứng",
    "corporate_upbeat": "doanh nghiệp|công ty|khách hàng|sản phẩm|dịch vụ|khoá học|khóa học|giải pháp|bán hàng|marketing",
    "real_estate_luxury": "căn hộ|bất động sản|dự án|nội thất|biệt thự|phòng khách|mặt tiền|ngôi nhà|view",
    "inspire": "ước mơ|cố gắng|nỗ lực|vượt qua|bắt đầu|thành công|hành trình|động lực|kiên trì",
    "news_bg": "tin tức|mới nhất|cập nhật|thông tin|báo cáo|thị trường|chính sách",
    "acoustic_warm": "gia đình|bữa ăn|ẩm thực|kỷ niệm|quê hương|mẹ|bố",
    "ambient_calm": "thiền|thư giãn|sức khoẻ|sức khỏe|giấc ngủ|bình yên|hít thở",
    "lofi_hiphop": "học tập|chill|cà phê|cuối tuần",
}


def music_auto(caps, words, audio):
    lib = os.path.join(SKILL, "assets/music")
    try:
        mcat = {m["name"]: m for m in json.load(open(os.path.join(lib, "catalog.json")))}
    except Exception:
        mcat = {}
    music = audio.get("music", []) or []
    if any(m.get("file") for m in music if not m.get("_auto")):
        return "bỏ qua nhạc tự động (đã có nhạc riêng của bạn)"
    if tl.get("pack") == "beatslide" or tl.get("beats"):
        return "bỏ qua nhạc tự động (video dựng theo nhịp nhạc)"
    was = [w for m in music if m.get("_auto") for w in m.get("_was", [])] or [m for m in music if not m.get("_auto") and not (m.get("_ai") or m.get("manual"))]
    base = next((m.get("mood") for m in was if m.get("mood")), None) or PACK_MOOD.get(tl.get("pack"), "corporate_upbeat")
    base = re.sub(r"_\d+$", "", base)
    # sections ≥ 8 s at caption boundaries
    secs, cur = [], None
    for c in caps:
        txt = " ".join(w.get("w", "") for w in c.get("words", []))
        if cur is None:
            cur = {"t0": float(c["t0"]) if secs else 0.0, "t1": c["t1"], "text": txt}
        else:
            cur["t1"], cur["text"] = c["t1"], cur["text"] + " " + txt
        if cur["t1"] - cur["t0"] >= 8:
            secs.append(cur)
            cur = None
    if cur:
        if secs and cur["t1"] - cur["t0"] < 5:
            secs[-1]["t1"], secs[-1]["text"] = cur["t1"], secs[-1]["text"] + " " + cur["text"]
        else:
            secs.append(cur)
    if not secs:
        secs = [{"t0": 0.0, "t1": DUR, "text": ""}]
    moods = None
    if a.claude:
        moods = claude_moods(secs, base, [m for m in mcat if not re.search(r"_\d+$", m)] or list(MOOD_KW))
    if not moods:
        moods = []
        for s in secs:
            f = " " + re.sub(r"[^\w%]+", " ", unicodedata.normalize("NFC", s["text"].lower())) + " "
            sc = {m: sum(f.count(" " + k + " ") for k in kw.split("|")) for m, kw in MOOD_KW.items()}
            best = max(sc, key=sc.get)
            moods.append(best if sc[best] >= 2 and sc[best] > sc.get(base, 0) + 1 else base)
    # merge equal neighbours, at most one change per 10 s
    plan = []
    for s, m in zip(secs, moods):
        if plan and (plan[-1]["mood"] == m or len(plan) >= max(1, int(DUR // 10))):
            plan[-1]["t1"] = s["t1"]
        else:
            plan.append({"t0": s["t0"], "t1": s["t1"], "mood": m})
    plan[0]["t0"], plan[-1]["t1"] = 0.0, DUR
    used = defaultdict(int)
    out = []
    for i, p in enumerate(plan):
        name = p["mood"] if p["mood"] in mcat or not mcat else base
        if mcat and name not in mcat:
            name = next(iter(mcat))
        used[name] += 1
        tlen = (mcat.get(name) or {}).get("dur", 60)
        out.append({"t0": round(p["t0"], 2), "t1": round(p["t1"], 2), "mood": name, "gain": -18,
                    "offset": 0 if i == 0 else round(tlen * .5, 2), "xfade": .8,
                    "fade_in": .3 if i == 0 else .8, "fade_out": 1.5 if i == len(plan) - 1 else .8, "_auto": True})
    if was:
        out[0]["_was"] = was  # "Xoá phần tự động" puts these back
    audio["music"] = [m for m in music if m.get("_auto") is None and (m.get("file") or m.get("_ai") or m.get("manual"))] + out
    return "nhạc: " + " → ".join(f"{m['mood']} ({m['t0']:.0f}–{m['t1']:.0f}s)" for m in out)


def claude_moods(secs, base, names):
    prompt = ("Bạn là music editor cho video ngắn tiếng Việt. Với mỗi đoạn lời thoại dưới đây, chọn MỘT mood nhạc nền trong danh sách: "
              + ", ".join(names) + f". Ưu tiên giữ mood chính '{base}' trừ khi đoạn đó rõ ràng mang cảm xúc khác. "
              "Trả về DUY NHẤT một mảng JSON các tên mood, đúng thứ tự, không giải thích.\n\n"
              + json.dumps([{"i": i, "t0": round(s["t0"], 1), "t1": round(s["t1"], 1), "text": s["text"][:400]} for i, s in enumerate(secs)], ensure_ascii=False))
    try:
        r = subprocess.run([os.environ.get("CLAUDE_BIN", "claude"), "-p", "--output-format", "json", "--model", "sonnet"], input=prompt,
                           capture_output=True, text=True, timeout=120)
        txt = r.stdout
        try:
            txt = json.loads(txt).get("result", txt)
        except Exception:
            pass
        m = re.search(r"\[[\s\S]*?\]", txt or "")
        arr = json.loads(m.group(0)) if m else None
        if isinstance(arr, list) and len(arr) == len(secs) and all(x in names for x in arr):
            print("Claude chọn mood:", arr)
            return arr
        print("Claude trả về không hợp lệ -> dùng luật offline")
    except Exception as e:
        print(f"Không gọi được Claude ({type(e).__name__}) -> dùng luật offline")
    return None


if LEVEL:
    level_mode()
    raise SystemExit(0)

hits.sort(key=lambda h: h["t"])
dedup = []
for h in hits:
    h.pop("_p", None)
    if dedup and h["t"] - dedup[-1]["t"] < .12 and (h["name"].rstrip("_0123456789") == dedup[-1]["name"].rstrip("_0123456789")):
        continue
    dedup.append(h)

audio = tl.setdefault("audio", {})
manual = [s for s in audio.get("sfx", []) if s.get("manual")] if a.keep_manual else []
audio["sfx"] = sorted(manual + dedup, key=lambda h: h["t"])
print(f"{len(dedup)} auto SFX ({len(set(h['name'] for h in dedup))} distinct sounds) + {len(manual)} manual")
if not a.dry:
    json.dump(tl, open(a.timeline, "w"), ensure_ascii=False, indent=1)
