"""Synthesize the full SFX library (~170 sounds, 100% generated, royalty-free) + catalog.json.

usage: python gen_sfx.py <out_dir> [--only whoosh,impact] [--ext flac]
Each sound: <out_dir>/<name>.<ext>. Catalog: <out_dir>/catalog.json [{name, cat, dur, tags, use}].
Deterministic: same seed -> same files.
"""
import argparse
import json
import os
import sys
import zlib

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from dsp import (SR, autopan, bp, chirp, env_adsr, exp_dec, fade, fm, hp, karplus, lp, noise, normalize, osc, place,
                 reverb, soft_clip, supersaw, sweep_filter, to_stereo, tt)

REG = []


def sfx(name, cat, tags, use):
    def deco(fn):
        REG.append((name, cat, tags, use, fn))
        return fn
    return deco


def rng(seed):
    return np.random.default_rng(zlib.crc32(repr(seed).encode()))


# ---------------------------------------------------------------- transitions: whoosh / swoosh / swipe
def whoosh(d=.6, f0=500, f1=3500, peak=.55, pan=True, color="pink", r=None, tail=.0):
    r = r or rng(("wh", d, f0, f1))
    n = noise(d, color, r)
    x = sweep_filter(n, f0, f1, "band", q=.9, blocks=48)
    t = tt(d)
    env = np.where(t < d * peak, (t / (d * peak)) ** 2.2, np.exp(-(t - d * peak) / (d * (1 - peak) * .35)))
    x = fade(x * env, .002, .03)
    out = autopan(x, rate=1 / d, depth=.9, start=-.9) if pan else to_stereo(x)
    return reverb(out, wet=tail, length=.8) if tail else out


for i, (d, f0, f1, pk, tail) in enumerate([(.55, 400, 3200, .55, 0), (.35, 800, 5000, .6, 0), (.8, 300, 2500, .5, .15),
                                           (.45, 1200, 6000, .5, 0), (1.1, 200, 1800, .6, .2), (.6, 3000, 600, .45, 0),
                                           (.25, 1500, 7000, .7, 0), (.7, 500, 4000, .65, .25)]):
    sfx("whoosh" if i == 0 else f"whoosh_{i + 1}", "transition", ["whoosh", "vút", "chuyển cảnh", "chữ bay vào"],
        "chữ hero/mega vào, đổi cảnh, card trượt")(lambda d=d, f0=f0, f1=f1, pk=pk, tail=tail: whoosh(d, f0, f1, pk, tail=tail))

sfx("whoosh_fast", "transition", ["whoosh", "nhanh", "cut"], "jump cut nhanh, pill bật")(lambda: whoosh(.18, 2000, 8000, .6))
sfx("whoosh_slow", "transition", ["whoosh", "chậm", "fade"], "light leak, chuyển mood chậm")(lambda: whoosh(1.6, 150, 1500, .55, tail=.3))
sfx("whoosh_deep", "transition", ["whoosh", "trầm"], "iris tối mở ra, vào panel")(lambda: whoosh(.9, 80, 700, .55, color="brown", tail=.2))
sfx("whoosh_reverse", "transition", ["reverse", "hút vào"], "trước khi chữ lớn đập vào (đặt kết thúc đúng frame)")(
    lambda: whoosh(.7, 400, 4000, .95, tail=.1))


def swoosh(up=True, d=.4):
    f0, f1 = (300, 2400) if up else (2400, 300)
    x = chirp(f0, f1, d) * .25 + sweep_filter(noise(d, "white", rng(("sw", up, d))), f0 * 2, f1 * 2, "band", .6) * .8
    return autopan(fade(x * env_adsr(len(x), .05, d * .5, .4, d * .4)), 1 / d, .7, -.7)


for d in (.3, .5):
    sfx(f"swoosh_up{'' if d == .3 else '_2'}", "transition", ["swoosh", "lên", "bay lên"], "chữ/thẻ bay lên, số tăng")(lambda d=d: swoosh(True, d))
    sfx(f"swoosh_down{'' if d == .3 else '_2'}", "transition", ["swoosh", "xuống", "rơi"], "chữ rơi xuống, rời cảnh")(lambda d=d: swoosh(False, d))


def swipe(d=.22, f=4000, s=0):
    x = bp(noise(d, "white", rng(("swipe", d, f, s))), f * .5, f * 1.6) * env_adsr(int(d * SR), .01, d * .3, .5, d * .6)
    return autopan(fade(x), 1 / d, .8, -.8)


for i, (d, f) in enumerate([(.22, 4000), (.16, 6000), (.3, 2500), (.2, 8000)]):
    sfx("swipe" if i == 0 else f"swipe_{i + 1}", "ui", ["vuốt", "swipe", "lướt"], "vuốt màn hình điện thoại, lật thẻ")(lambda d=d, f=f, i=i: swipe(d, f, i))
for i, d in enumerate((.35, .55)):
    sfx(f"slide{'' if i == 0 else '_2'}", "ui", ["trượt", "slide", "panel"], "panel/thẻ trượt vào")(
        lambda d=d: autopan(fade(lp(noise(d, "pink", rng(("slide", d))), 1800) * env_adsr(int(d * SR), .03, .1, .7, d * .5)), 1 / d, .5, -.5))


# ---------------------------------------------------------------- impacts / booms / hits
def impact(f=70, d=.7, click=.8, body=1.0, seed=0, verb=.18, drop=2.5):
    t = tt(d)
    sub = np.sin(2 * np.pi * (f * t + f * drop * (1 - np.exp(-t * 18)) / 18)) * np.exp(-t * 5) * body
    cl = hp(noise(.06, "white", rng(("imp", seed))), 1500) * exp_dec(.06, 70) * click
    x = sub.copy()
    x[:len(cl)] += cl
    x += lp(noise(d, "brown", rng(("imp2", seed))), 300) * np.exp(-t * 9) * .6
    return reverb(soft_clip(normalize(x), 1.6), wet=verb, length=1.4)


for i, (f, d, c, v, dr) in enumerate([(70, .7, .8, .18, 2.5), (55, .9, .5, .25, 3), (90, .5, 1, .1, 2), (45, 1.2, .4, .3, 4),
                                      (110, .4, 1.2, .08, 1.5), (65, .8, .7, .35, 3.5)]):
    sfx("impact" if i == 0 else f"impact_{i + 1}", "impact", ["impact", "đập", "hit", "dấu"], "stamp, chữ mega đập, 100%, kết luận")(
        lambda f=f, d=d, c=c, v=v, dr=dr, i=i: impact(f, d, c, 1, i, v, dr))


def boom(f=42, d=1.6, seed=0):
    t = tt(d)
    x = np.sin(2 * np.pi * (f * t + 60 * (1 - np.exp(-t * 8)) / 8)) * np.exp(-t * 2.2)
    x += lp(noise(d, "brown", rng(("boom", seed))), 160) * np.exp(-t * 3) * .9
    return reverb(soft_clip(normalize(x), 2.2), wet=.3, length=2.4, damp=2)


for i, (f, d) in enumerate([(42, 1.6), (35, 2.2), (50, 1.2), (38, 3.0)]):
    sfx("boom" if i == 0 else f"boom_{i + 1}", "impact", ["boom", "nổ trầm", "bass"], "slam_bg hook, mở màn, con số lớn")(lambda f=f, d=d, i=i: boom(f, d, i))
for i, (f0, f1, d) in enumerate([(120, 28, 1.5), (90, 22, 2.5), (160, 35, 1.0)]):
    sfx(f"sub_drop{'' if i == 0 else '_' + str(i + 1)}", "impact", ["sub drop", "bass drop", "rơi"], "ngay sau riser, cảnh chuyển lớn")(
        lambda f0=f0, f1=f1, d=d: to_stereo(soft_clip(chirp(f0, f1, d) * np.exp(-tt(d) * 1.6), 1.5)))


def cine_hit(seed=0, d=2.5):
    a = boom(40 + seed * 4, d, seed)
    m = len(a)
    met = sum(np.sin(2 * np.pi * f * tt(d)) * np.exp(-tt(d) * (2 + k)) for k, f in enumerate([233, 351, 523, 787]))
    met = hp(met, 200) * .25
    b = reverb(met[:m] + hp(noise(d, "white", rng(("ch", seed))), 3000)[:m] * np.exp(-tt(d)[:m] * 12) * .5, .5, 3)
    return a + b[:m] * .7


for i in range(3):
    sfx(f"cinematic_hit{'' if i == 0 else '_' + str(i + 1)}", "impact", ["cinematic", "điện ảnh", "trailer"], "câu chốt, tiết lộ, title lớn")(lambda i=i: cine_hit(i))


def braam(d=2.8, f=55, seed=0):
    x = sum(supersaw(f * m, d, 5, .01, rng(("br", seed, m))) * g for m, g in [(1, 1), (2, .6), (1.5, .3)])
    x = lp(x, 900) * env_adsr(len(x), .04, .4, .7, 1.4)
    return reverb(soft_clip(normalize(x), 2.5), .35, 3)


sfx("braam", "impact", ["braam", "kèn đồng", "trailer", "căng"], "tuyên bố lớn kiểu trailer")(lambda: braam())
sfx("braam_2", "impact", ["braam", "trầm"], "tuyên bố lớn kiểu trailer")(lambda: braam(3.5, 41, 1))
sfx("transition_hit", "transition", ["whoosh+impact", "chuyển cảnh mạnh"], "đổi cảnh lớn có đập")(
    lambda: _combo(whoosh(.45, 400, 4000, .9), impact(), .4))


def _combo(a, b, at):
    n = max(len(a), int(at * SR) + len(b))
    out = np.zeros((n, 2))
    place(out, a, 0)
    place(out, b, at * SR)
    return out


sfx("transition_hit_2", "transition", ["whoosh+boom"], "đổi cảnh lớn có boom")(lambda: _combo(whoosh(.7, 300, 3000, .92, tail=.1), boom(48, 1.4, 5), .65))
sfx("transition_hit_3", "transition", ["riser+impact"], "build up ngắn rồi đập")(lambda: _combo(riser(1.0, 0), impact(80, .6, 1, 1, 9, .2), 1.0))
sfx("transition_hit_4", "transition", ["swoosh+pop"], "chuyển nhẹ vui")(lambda: _combo(swoosh(True, .3), pop(900, 0), .26))


# ---------------------------------------------------------------- risers / downlifters / reverse
def riser(d=1.0, seed=0, f0=180, f1=2400):
    t = tt(d)
    tone = sum(chirp(f0 * m, f1 * m, d) * g for m, g in [(1, .4), (1.5, .2), (2, .15)])
    nz = sweep_filter(noise(d, "white", rng(("ris", seed, d))), 800, 9000, "high", blocks=40) * .5
    x = (tone + nz) * (t / d) ** 2.2
    return reverb(to_stereo(fade(x, .01, .01)), .2, 1.2)


for i, d in enumerate([.5, 1.0, 2.0, 3.0, 4.0]):
    sfx(f"riser_{d:g}s" if i else "riser", "build", ["riser", "dâng lên", "build up", "căng dần"], f"dồn trước khoảnh khắc lớn {d:g}s (kết thúc đúng frame đập)")(lambda d=d, i=i: riser(d, i))


def downlifter(d=1.5, seed=0):
    t = tt(d)
    x = chirp(1800, 90, d) * .3 + sweep_filter(noise(d, "white", rng(("dl", seed))), 7000, 300, "low", blocks=40) * .7
    return reverb(to_stereo(fade(x * np.exp(-t * 1.8), .002, .05)), .25, 1.5)


for i, d in enumerate([1.0, 1.6, 2.5]):
    sfx(f"downlifter{'' if i == 0 else '_' + str(i + 1)}", "build", ["downlifter", "hạ xuống", "xả"], "sau cú đập, rời cảnh căng")(lambda d=d, i=i: downlifter(d, i))


def rev_cymbal(d=1.5, seed=0):
    x = hp(noise(d, "white", rng(("rc", seed))), 5000) * np.exp(-tt(d) * 3)
    x = reverb(x, .4, 1.6)[::-1]
    return fade(x, .01, .005)


for i, d in enumerate([.8, 1.5, 2.5]):
    sfx(f"reverse_cymbal{'' if i == 0 else '_' + str(i + 1)}", "build", ["reverse cymbal", "hút ngược", "dồn"], "đặt sao cho kết thúc đúng lúc chữ xuất hiện")(lambda d=d, i=i: rev_cymbal(d, i))


# ---------------------------------------------------------------- pops / blips / bubbles / ticks
def pop(f=900, seed=0, d=.12):
    t = tt(d)
    x = np.sin(2 * np.pi * (f * t - f * 2.2 * t * t)) * np.exp(-t * 38)
    return to_stereo(fade(x, .0005, .01))


for i, f in enumerate([900, 650, 1200, 500, 1600, 780]):
    sfx("pop" if i == 0 else f"pop_{i + 1}", "ui", ["pop", "bật", "emoji", "tag"], "emoji/pill/tag/chip bật ra")(lambda f=f, i=i: pop(f, i))


def bubble(f=400, d=.18):
    t = tt(d)
    x = np.sin(2 * np.pi * np.cumsum(f * (1 + 3 * t / d)) / SR) * env_adsr(len(t), .003, .05, .4, d * .6)
    return to_stereo(x)


for i, f in enumerate([400, 600, 300]):
    sfx(f"bubble{'' if i == 0 else '_' + str(i + 1)}", "ui", ["bong bóng", "bubble", "vui"], "sticker vui, chat bubble")(lambda f=f: bubble(f))


def blip(f=1500, d=.07, kind="square"):
    return to_stereo(lp(osc(f, d, kind), 6000) * exp_dec(d, 30) * .5)


for i, (f, k) in enumerate([(1500, "square"), (2200, "sine"), (900, "square"), (3000, "tri"), (1200, "saw")]):
    sfx("blip" if i == 0 else f"blip_{i + 1}", "ui", ["blip", "bíp", "số", "HUD"], "HUD/số nhảy/icon nhỏ")(lambda f=f, k=k: blip(f, .07, k))


def tick(f=3200, rate=180, d=.05, s=0):
    x = np.sin(2 * np.pi * f * tt(d)) * exp_dec(d, rate) + hp(noise(d, "white", rng(("tk", s))), 4000) * exp_dec(d, 400) * .4
    return to_stereo(x * .8)


for i, (f, r) in enumerate([(3200, 180), (2400, 220), (4200, 260)]):
    sfx("tick" if i == 0 else f"tick_{i + 1}", "ui", ["tick", "đồng hồ", "đếm"], "counter mỗi bước, kim đồng hồ")(lambda f=f, r=r, i=i: tick(f, r, .05, i))


def clock_loop(d=4.0, bpm=120, tock=True):
    out = np.zeros((int(d * SR), 2))
    step = 60 / bpm
    for k in range(int(d / step)):
        place(out, tick(3200 if (k % 2 == 0 or not tock) else 2300, 200), k * step * SR)
    return out


sfx("clock_ticking", "ui", ["tích tắc", "đồng hồ chạy", "thời gian"], "nói về thời gian, deadline (4s loop)")(lambda: clock_loop())
sfx("clock_ticking_fast", "ui", ["tích tắc nhanh", "gấp"], "áp lực thời gian")(lambda: clock_loop(3, 240))


def countdown_beep():
    out = np.zeros((int(3.4 * SR), 2))
    for k in range(3):
        place(out, to_stereo(osc(880, .15, "sine") * env_adsr(int(.15 * SR), .002, .05, .6, .08) * .6), k * SR)
    place(out, to_stereo(osc(1760, .5, "sine") * env_adsr(int(.5 * SR), .002, .1, .6, .3) * .7), 3 * SR)
    return out


sfx("countdown_321", "ui", ["đếm ngược", "3 2 1"], "đếm ngược 3-2-1 (beep cuối ở 3.0s)")(countdown_beep)


# ---------------------------------------------------------------- clicks / typing / keyboard
def click(f=4000, s=0, d=.03):
    x = bp(noise(d, "white", rng(("ck", s, f))), f * .6, f * 1.6) * exp_dec(d, 160)
    x += np.sin(2 * np.pi * f * .4 * tt(d)) * exp_dec(d, 300) * .4
    return to_stereo(x)


for i, f in enumerate([4000, 3000, 5200, 2500, 6000]):
    sfx("click" if i == 0 else f"click_{i + 1}", "ui", ["click", "bấm", "chuột"], "bấm nút, chọn mục")(lambda f=f, i=i: click(f, i))
sfx("mouse_click", "ui", ["chuột", "click đôi"], "bấm chuột trên UI showcase")(lambda: _combo(click(3500, 11), click(2800, 12), .08))


def typing(d=2.0, cps=11, s=0):
    r = rng(("type", s, d))
    out = np.zeros((int(d * SR), 2))
    tpos = 0.0
    while tpos < d - .05:
        f = r.uniform(2500, 5500)
        place(out, click(f, int(r.integers(1e6)), .035) * r.uniform(.4, 1), tpos * SR)
        tpos += r.exponential(1 / cps) + .025
    return out


for d in (1, 2, 4):
    sfx(f"typing_{d}s", "ui", ["gõ phím", "typing", "bàn phím"], "prompt_box gõ chữ, search bar")(lambda d=d: typing(d, 11, d))
sfx("keyboard_enter", "ui", ["enter", "gửi lệnh"], "gõ xong bấm Enter")(lambda: _combo(click(2200, 30, .05), click(1500, 31, .05), .012))


# ---------------------------------------------------------------- chimes / notifications / success / error
def bell(f=1320, d=1.2, partials=((1, .4, 4), (2, .25, 6), (3, .15, 8), (4.2, .08, 10))):
    t = tt(d)
    return sum(g * np.sin(2 * np.pi * f * m * t) * np.exp(-r * t) for m, g, r in partials)


for i, f in enumerate([1320, 1046, 1568, 880]):
    sfx("ding" if i == 0 else f"ding_{i + 1}", "chime", ["ding", "chuông", "kết luận"], "kết luận, đáp án, check ✅")(lambda f=f: reverb(bell(f), .2, 1.2))


def arp_chime(notes, step=.08, d=1.4, kind="bell"):
    out = np.zeros((int((len(notes) * step + d) * SR), 2))
    for k, f in enumerate(notes):
        tone = bell(f, d) if kind == "bell" else fm(f, d, 3.5, 1.5, 6) * np.exp(-tt(d) * 3) * .5
        place(out, tone, k * step * SR)
    return reverb(out, .25, 1.4)


N = lambda m: 440 * 2 ** ((m - 69) / 12)
sfx("success", "chime", ["thành công", "success", "hoàn thành"], "hoàn tất, kết quả tốt")(lambda: arp_chime([N(72), N(76), N(79), N(84)]))
sfx("success_2", "chime", ["thành công", "level up"], "đạt mục tiêu")(lambda: arp_chime([N(67), N(72), N(76), N(79), N(84)], .06, 1.2, "fm"))
sfx("success_3", "chime", ["hoàn thành nhẹ"], "check mục cuối checklist")(lambda: arp_chime([N(76), N(83)], .1, 1.0))
sfx("level_up", "chime", ["lên cấp", "game"], "nâng cấp, mở khoá")(lambda: _seq([blip(N(m), .09, "square") for m in [60, 64, 67, 72, 76, 79, 84]], .07))


def _mix(parts):
    out = np.zeros((max(len(p) for p in parts), 2))
    for p in parts:
        place(out, p, 0)
    return out


def _seq(parts, step):
    out = np.zeros((int((len(parts) * step + .3) * SR), 2))
    for k, p in enumerate(parts):
        place(out, p, k * step * SR)
    return out


for i, notes in enumerate([[N(84), N(88)], [N(79), N(84), N(91)], [N(88), N(84)], [N(76), N(81)], [N(91), N(91)]]):
    sfx("notification" if i == 0 else f"notification_{i + 1}", "chime", ["thông báo", "notification", "tin nhắn", "đơn hàng"],
        "thông báo đẩy, tin nhắn mới, đơn hàng")(lambda notes=notes: arp_chime(notes, .11, .7, "fm"))
sfx("message_sent", "chime", ["gửi tin", "send"], "gửi tin nhắn, gửi prompt")(lambda: to_stereo(chirp(600, 1400, .18) * env_adsr(int(.18 * SR), .005, .05, .5, .1) * .5))
sfx("error", "chime", ["lỗi", "sai", "error", "buzz"], "sai lầm, ❌, cách cũ")(lambda: to_stereo(lp(osc(150, .45, "saw") + osc(155, .45, "saw"), 1200) * env_adsr(int(.45 * SR), .005, .05, .8, .1) * .4))
sfx("error_2", "chime", ["lỗi", "từ chối"], "sai lầm nhẹ")(lambda: _seq([to_stereo(osc(330, .12, "square") * .25), to_stereo(osc(220, .2, "square") * .25)], .14))
sfx("wrong_buzzer", "chime", ["sai", "buzzer", "gameshow"], "câu trả lời sai kiểu gameshow")(lambda: to_stereo(soft_clip(lp(osc(110, .8, "square") * osc(5, .8, "square") * .5 + osc(116, .8, "saw") * .4, 2500), 1.5) * .6))
sfx("correct", "chime", ["đúng", "chính xác", "gameshow"], "đáp án đúng")(lambda: arp_chime([N(76), N(80), N(83)], .09, .9, "fm"))
sfx("coin", "chime", ["xu", "tiền", "coin"], "tiền, doanh thu, giá")(lambda: _seq([to_stereo(osc(N(83), .08, "square") * .25), to_stereo(osc(N(88), .5, "square") * np.exp(-tt(.5) * 6) * .25)], .07))
sfx("coin_2", "chime", ["tiền rơi", "xu"], "tiền rơi, nhận thưởng")(lambda: reverb(bell(2400, .6, ((1, .4, 9), (2.7, .2, 14), (5.1, .1, 18))), .15, .8))


def cash_register():
    out = np.zeros((int(1.4 * SR), 2))
    place(out, click(1800, 51, .05), 0)
    place(out, click(1500, 52, .05), .09 * SR)
    place(out, to_stereo(bell(2637, 1.2, ((1, .5, 3), (2.4, .2, 5), (3.9, .1, 7)))), .2 * SR)
    place(out, to_stereo(lp(noise(.4, "pink", rng("drawer")), 1500) * env_adsr(int(.4 * SR), .02, .1, .5, .2) * .5), .25 * SR)
    return out


sfx("cash_register", "chime", ["ka-ching", "bán hàng", "doanh thu", "tiền"], "chốt đơn, doanh thu tăng")(cash_register)
sfx("money_count", "chime", ["đếm tiền", "tiền"], "tiền, lương, thu nhập")(lambda: _seq([swipe(.06, 5000 + 300 * k, k) for k in range(12)], .07))
sfx("alarm", "chime", ["báo thức", "cảnh báo"], "cảnh báo, deadline")(lambda: to_stereo(np.concatenate([osc(1000, .12, "square") * .25 if k % 2 == 0 else np.zeros(int(.08 * SR)) for k in range(12)])))
sfx("phone_vibrate", "chime", ["rung điện thoại", "vibrate"], "điện thoại rung, có cuộc gọi")(lambda: to_stereo(np.concatenate([lp(osc(170, .4, "saw"), 400) * .7, np.zeros(int(.25 * SR))] * 2)))
sfx("phone_ring", "chime", ["chuông điện thoại"], "cuộc gọi")(lambda: _seq([to_stereo((osc(N(81), .09) + osc(N(85), .09)) * .25) for _ in range(10)], .1))


# ---------------------------------------------------------------- tech / glitch / HUD / sci-fi
def glitch(d=.4, seed=0):
    r = rng(("gl", seed))
    out = np.zeros(int(d * SR))
    p = 0
    while p < len(out):
        seglen = int(r.uniform(.01, .06) * SR)
        kind = r.integers(4)
        if kind == 0:
            seg = osc(r.uniform(200, 3000), seglen / SR, "square") * .4
        elif kind == 1:
            seg = noise(seglen / SR, "white", r) * .5
        elif kind == 2:
            seg = np.round(osc(r.uniform(60, 400), seglen / SR, "saw") * 3) / 3 * .5
        else:
            seg = np.zeros(seglen)
        seg = np.resize(seg, seglen)[:len(out) - p]
        out[p:p + len(seg)] = seg
        p += seglen
    return to_stereo(fade(out, .001, .01))


for i, d in enumerate([.3, .5, .2, .8, .4, 1.2]):
    sfx("glitch" if i == 0 else f"glitch_{i + 1}", "tech", ["glitch", "nhiễu", "lỗi số", "AI"], "glitch cut, chữ RGB split, AI")(lambda d=d, i=i: glitch(d, i))
sfx("static", "tech", ["nhiễu TV", "static"], "TV nhiễu, mất tín hiệu")(lambda: to_stereo(bp(noise(1.0, "white", rng("st")), 1000, 9000) * .35 * fade(np.ones(SR), .05, .2)))
sfx("static_burst", "tech", ["nhiễu ngắn"], "cắt glitch")(lambda: to_stereo(hp(noise(.15, "white", rng("stb")), 2000) * .6))


def data_burst(d=.6, seed=0):
    r = rng(("db", seed))
    return _seq([blip(r.uniform(800, 4000), .03, "square") for _ in range(int(d / .035))], .035)


for i, d in enumerate([.6, 1.0, 1.6]):
    sfx(f"data_burst{'' if i == 0 else '_' + str(i + 1)}", "tech", ["dữ liệu", "data", "xử lý", "computer"], "dashboard, số liệu chạy, AI xử lý")(lambda d=d, i=i: data_burst(d, i))


def scan(d=1.2, seed=0):
    t = tt(d)
    x = np.sin(2 * np.pi * np.cumsum(800 + 600 * np.sin(2 * np.pi * 2.5 * t)) / SR) * .25
    x += bp(noise(d, "white", rng(("scan", seed))), 3000, 6000) * .15 * (.5 + .5 * np.sin(2 * np.pi * 10 * t))
    return autopan(fade(x * env_adsr(len(t), .05, .1, .8, .2)), 1 / d, .8, -.8)


sfx("scan", "tech", ["quét", "scan", "nhận diện"], "HUD quét mặt, AI phân tích")(lambda: scan())
sfx("scan_2", "tech", ["quét nhanh"], "quét ngắn")(lambda: scan(.6, 1))
sfx("hud_lock", "tech", ["khoá mục tiêu", "lock", "HUD"], "HUD khoá mặt xong")(lambda: _seq([blip(2000, .05, "sine"), blip(2000, .05, "sine"), blip(3000, .15, "sine")], .09))
sfx("hud_lock_2", "tech", ["lock on"], "khoá mục tiêu")(lambda: _combo(blip(1500, .04), to_stereo(chirp(1200, 2400, .25) * env_adsr(int(.25 * SR), .005, .05, .6, .15) * .4), .05))
for i, (f0, f1) in enumerate([(400, 1600), (1600, 400)]):
    nm = "ui_open" if i == 0 else "ui_close"
    sfx(nm, "tech", ["mở UI", "đóng UI", "cửa sổ"], "mở/đóng cửa sổ, panel")(lambda f0=f0, f1=f1: to_stereo((chirp(f0, f1, .2) * .3 + bp(noise(.2, "white", rng((f0,))), 2000, 8000) * .2) * env_adsr(int(.2 * SR), .005, .05, .6, .1)))
for i, f in enumerate([1000, 1500, 700, 2000]):
    sfx(f"beep_computer{'' if i == 0 else '_' + str(i + 1)}", "tech", ["beep", "máy tính", "robot"], "AI/robot trả lời")(lambda f=f, i=i: _seq([blip(f * (1 + .25 * (k % 3)), .06, "sine") for k in range(3 + i)], .08))
sfx("power_up", "tech", ["khởi động", "power up", "sạc"], "bật lên, kích hoạt AI")(lambda: reverb(to_stereo(chirp(80, 1600, 1.0) * (tt(1.0) ** .5) * .4 + 0), .2, 1))
sfx("power_down", "tech", ["tắt", "power down"], "tắt, thất bại, hết pin")(lambda: reverb(to_stereo(chirp(1600, 50, 1.0) * np.exp(-tt(1.0) * 1.5) * .45), .2, 1))
sfx("laser", "tech", ["laser", "bắn"], "tia sáng, chữ bắn ra")(lambda: to_stereo(chirp(3000, 300, .25) * exp_dec(.25, 8) * .4))
sfx("teleport", "tech", ["dịch chuyển", "xuất hiện"], "đối tượng xuất hiện thần kỳ")(lambda: reverb(to_stereo(fm(600, .8, 3.01, 6, 2) * np.sin(np.pi * tt(.8) / .8) * .4), .4, 1.5))
sfx("hologram", "tech", ["hologram", "ảo"], "UI nổi, hologram")(lambda: reverb(to_stereo(sum(osc(f, 1.5, "sine") for f in (520, 523.5, 780)) * env_adsr(int(1.5 * SR), .3, .2, .7, .8) * .2 * (1 + .3 * np.sin(2 * np.pi * 6 * tt(1.5)))), .4, 2))
sfx("drone_tech", "tech", ["drone", "nền căng", "công nghệ"], "nền căng dưới cảnh tech (3s)")(lambda: to_stereo(lp(supersaw(55, 3, 5, .006, rng("dt")), 500) * env_adsr(int(3 * SR), .8, .2, .8, 1) * .5))


# ---------------------------------------------------------------- magic / sparkle / shimmer
def sparkle(d=1.2, n=14, seed=0):
    r = rng(("sp", seed))
    out = np.zeros((int(d * SR), 2))
    for k in range(n):
        f = r.uniform(3000, 8000)
        place(out, to_stereo(np.sin(2 * np.pi * f * tt(.15)) * exp_dec(.15, 30) * r.uniform(.1, .3), r.uniform(-1, 1)), r.uniform(0, d * .7) * SR)
    return reverb(out, .4, 1.2)


for i in range(4):
    sfx("sparkle" if i == 0 else f"sparkle_{i + 1}", "magic", ["lấp lánh", "sparkle", "phép màu", "✨"], "✨ xuất hiện, highlight, đẹp")(lambda i=i: sparkle(1.0 + .3 * i, 10 + 4 * i, i))
for i in range(3):
    sfx("shimmer" if i == 0 else f"shimmer_{i + 1}", "magic", ["shimmer", "lung linh", "ánh sáng"], "light leak, mood happy, end card")(
        lambda i=i: reverb(to_stereo(hp(noise(1.6, "white", rng(("sh", i))), 6000 + 1000 * i) * env_adsr(int(1.6 * SR), .6, .2, .6, .8) * .5), .3, 1.5))
for i, root in enumerate([72, 76, 69]):
    sfx("magic" if i == 0 else f"magic_{i + 1}", "magic", ["phép thuật", "magic", "biến hoá", "🪄"], "biến hoá, trước→sau, AI làm phép")(
        lambda root=root, i=i: _combo(arp_chime([N(root + s) for s in (0, 4, 7, 11, 14, 19)], .05, 1.2, "fm"), sparkle(1.2, 12, i + 10), .1))
sfx("fairy_dust", "magic", ["bụi tiên", "nhẹ nhàng"], "mood mellow, chuyển nhẹ")(lambda: sparkle(2.0, 30, 99))


# ---------------------------------------------------------------- camera / paper / stamp / misc foley-ish
def shutter(s=0):
    out = np.zeros((int(.35 * SR), 2))
    place(out, click(2500, 70 + s, .04) * 1.2, 0)
    place(out, to_stereo(bp(noise(.08, "white", rng(("sh2", s))), 1000, 5000) * exp_dec(.08, 40) * .6), .02 * SR)
    place(out, click(1800, 80 + s, .04), .12 * SR)
    return out


sfx("camera_shutter", "foley", ["chụp ảnh", "camera", "shutter"], "ảnh chụp màn hình xuất hiện, flash")(lambda: shutter())
sfx("camera_shutter_2", "foley", ["chụp liên tiếp"], "nhiều ảnh xuất hiện")(lambda: _seq([shutter(k) for k in range(3)], .18))
sfx("flash_pop", "foley", ["flash", "chớp sáng"], "flash trắng")(lambda: _combo(impact(150, .3, 1.5, .3, 77, .05, 1), sparkle(.6, 6, 5), 0))
sfx("paper", "foley", ["giấy", "lật trang"], "lật trang, tài liệu")(lambda: to_stereo(bp(noise(.4, "white", rng("pp")), 1500, 7000) * env_adsr(int(.4 * SR), .03, .1, .4, .25) * (1 + .5 * np.sin(2 * np.pi * 23 * tt(.4))) * .5))
sfx("paper_2", "foley", ["vò giấy"], "bỏ đi, gạch bỏ")(lambda: to_stereo(bp(noise(.7, "white", rng("pp2")), 800, 6000) * np.abs(noise(.7, "white", rng("pp3"))) ** 2 * .4))
for i in range(2):
    sfx(f"stamp{'' if i == 0 else '_2'}", "foley", ["đóng dấu", "stamp", "duyệt"], "stamp ĐÃ DUYỆT/100%")(lambda i=i: _combo(impact(95 + 20 * i, .35, 1.4, .8, 90 + i, .06, 1.2), click(1200, 95 + i, .05), 0))
sfx("pen_scribble", "foley", ["viết", "gạch"], "gạch bỏ chữ, viết tay")(lambda: to_stereo(bp(noise(.6, "white", rng("pen")), 2500, 6000) * (.5 + .5 * np.sign(np.sin(2 * np.pi * 9 * tt(.6)))) * .35))
sfx("zipper", "foley", ["kéo khoá", "mở"], "mở ra, tiết lộ")(lambda: to_stereo(hp(noise(.5, "white", rng("zip")), 2000) * (np.sin(2 * np.pi * np.cumsum(60 + 140 * tt(.5)) / SR) > .6) * .5))
sfx("heartbeat", "foley", ["nhịp tim", "hồi hộp"], "hồi hộp, căng thẳng (2 nhịp)")(lambda: _seq([impact(50, .3, 0, 1, 60, .05, .5), impact(45, .3, 0, .7, 61, .05, .5), np.zeros((int(.4 * SR), 2))], .25))
sfx("heartbeat_loop", "foley", ["nhịp tim", "loop"], "nền hồi hộp 4s")(lambda: _seq([impact(50, .3, 0, 1, 62 + k, .05, .5) if k % 3 != 2 else np.zeros((10, 2)) for k in range(12)], .33))
sfx("door_knock", "foley", ["gõ cửa"], "có người đến, cơ hội")(lambda: _seq([impact(140, .2, 1.2, .6, 63 + k, .08, .3) for k in range(3)], .16))
sfx("footsteps", "foley", ["bước chân"], "bước tiếp, hành trình")(lambda: _seq([to_stereo(lp(noise(.08, "pink", rng(("fs", k))), 900) * exp_dec(.08, 40)) for k in range(6)], .4))
sfx("water_drop", "foley", ["giọt nước", "drop"], "nhẹ nhàng, tinh tế")(lambda: reverb(to_stereo(np.sin(2 * np.pi * np.cumsum(800 + 1600 * tt(.12) / .12) / SR) * exp_dec(.12, 30) * .6), .35, 1.2))
sfx("rubber_band", "foley", ["bật dây", "boing"], "hài hước, bật lại")(lambda: to_stereo(np.sin(2 * np.pi * np.cumsum(220 + 80 * np.sin(2 * np.pi * 14 * tt(.6)) * np.exp(-tt(.6) * 4)) / SR) * exp_dec(.6, 5) * .5))
sfx("cartoon_slip", "foley", ["trượt", "hài"], "fail hài hước")(lambda: to_stereo(chirp(1800, 200, .4) * .4 * exp_dec(.4, 2)))
sfx("balloon_pop", "foley", ["nổ bóng"], "phá vỡ niềm tin sai")(lambda: to_stereo(hp(noise(.12, "white", rng("bp")), 500) * exp_dec(.12, 45)))
sfx("crowd_cheer", "foley", ["vỗ tay", "cổ vũ", "đám đông"], "thành tựu, ăn mừng (tổng hợp)")(
    lambda: reverb(sum(to_stereo(bp(noise(2.5, "white", rng(("cr", k))), 500 + 300 * k, 2000 + 800 * k) * env_adsr(int(2.5 * SR), .3, .4, .7, 1.2), (k - 2) / 3) for k in range(5)) * .25, .3, 1.5))


def clap(seed=0, gain=1.0):
    r = rng(("clap", seed))
    out = np.zeros(int(.3 * SR))
    for k in range(3):
        b = bp(noise(.3, "white", r), 900, 4000) * exp_dec(.3, 25 if k == 2 else 120)
        out[int(k * .01 * SR):] += b[:len(out) - int(k * .01 * SR)]
    return to_stereo(out * .5 * gain)


sfx("applause", "foley", ["vỗ tay", "applause"], "kết thúc, chúc mừng")(lambda: reverb(_mix([_seq([clap(s * 100 + k, rng(("ap", s, k)).uniform(.3, 1)) for k in range(16)], .14 + .013 * s) for s in range(6)])[:int(2.6 * SR)] * .5, .35, 1.5))


# ---------------------------------------------------------------- drums / musical stingers
def kick(f=55, d=.5):
    t = tt(d)
    x = np.sin(2 * np.pi * (f * t + 140 * (1 - np.exp(-t * 30)) / 30)) * np.exp(-t * 7)
    x[:int(.01 * SR)] += hp(noise(.01, "white", rng("kc")), 2000) * .3
    return to_stereo(x)


def snare(d=.3, s=0):
    t = tt(d)
    x = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * .6 + bp(noise(d, "white", rng(("sn", s))), 1500, 9000) * np.exp(-t * 14)
    return to_stereo(x * .6)


sfx("kick", "drum", ["kick", "trống", "nhịp"], "nhấn nhịp từ khoá")(lambda: kick())
sfx("kick_2", "drum", ["kick", "trống"], "nhấn nhịp")(lambda: kick(45, .7))
sfx("snare", "drum", ["snare", "trống"], "nhấn chữ")(lambda: reverb(snare(), .2, 1))
sfx("clap", "drum", ["clap", "vỗ tay đơn"], "pop hero vui")(lambda: reverb(clap(1), .25, 1))
sfx("clap_2", "drum", ["clap"], "pop hero vui")(lambda: reverb(clap(2), .15, .8))
sfx("drum_roll", "drum", ["trống dồn", "drum roll", "hồi hộp"], "chuẩn bị công bố (2s)")(lambda: _combo(_seq([snare(.12, k) * (.3 + .7 * k / 40) for k in range(40)], .05), cine_hit(2)[:int(1.2 * SR)] * .6, 2.0))
sfx("tom_hits", "drum", ["trống trận", "epic"], "epic, tuyên bố")(lambda: reverb(_seq([to_stereo(np.sin(2 * np.pi * (f * tt(.6))) * np.exp(-tt(.6) * 6)) for f in (110, 90, 70)], .18), .35, 2))
sfx("cymbal_crash", "drum", ["chập chõa", "crash"], "mở đầu đoạn mới")(lambda: reverb(to_stereo(hp(noise(2.0, "white", rng("cc")), 4000) * np.exp(-tt(2.0) * 2.2) * .6), .3, 1.5))
sfx("tape_stop", "drum", ["tape stop", "dừng băng", "khựng"], "khựng lại, 'nhưng mà…'")(lambda: to_stereo(np.sin(2 * np.pi * np.cumsum(220 * (1 - tt(.8) / .8) ** 2) / SR) * .4 + lp(osc(110, .8, "saw"), 600) * (1 - tt(.8) / .8) ** 2 * .3))
sfx("record_scratch", "drum", ["scratch", "cắt ngang", "khoan đã"], "phủ định bất ngờ, 'khoan đã'")(lambda: to_stereo(bp(noise(.5, "white", rng("rs")), 600, 3500) * np.abs(np.sin(2 * np.pi * np.cumsum(4 + 10 * tt(.5)) / SR)) * .8))
sfx("vinyl_rewind", "drum", ["tua lại", "rewind"], "quay về quá khứ, 'trước đây'")(lambda: to_stereo(np.sin(2 * np.pi * np.cumsum(np.linspace(200, 2000, int(1.2 * SR)) * (1 + .3 * np.sin(2 * np.pi * 7 * tt(1.2)))) / SR) * .25 * fade(np.ones(int(1.2 * SR)), .05, .2)))


def stinger(chord, kind="pluck", d=1.6):
    out = np.zeros((int(d * SR), 2))
    for k, m in enumerate(chord):
        if kind == "pluck":
            tone = karplus(N(m), d, .998, .6, rng(("st", m)))
        elif kind == "pad":
            tone = lp(supersaw(N(m), d, 5, .01, rng(("stp", m))), 2500) * env_adsr(int(d * SR), .02, .3, .5, .8)
        else:
            tone = fm(N(m), d, 1, 2, 3) * np.exp(-tt(d) * 2.5)
        place(out, to_stereo(tone * .3, (k / max(1, len(chord) - 1) - .5)), k * .015 * SR)
    return reverb(out, .3, 1.8)


for nm, ch, kind, use in [("stinger_happy", [60, 64, 67, 72], "pluck", "kết câu vui"), ("stinger_sad", [57, 60, 64, 69], "fm", "câu buồn, thất bại"),
                          ("stinger_epic", [50, 57, 62, 65, 69], "pad", "tuyên bố lớn"), ("stinger_mystery", [59, 62, 65, 68], "fm", "bí mật, hé lộ"),
                          ("stinger_win", [65, 69, 72, 77], "pluck", "chiến thắng"), ("stinger_tension", [48, 49, 55, 56], "pad", "căng thẳng, rủi ro")]:
    sfx(nm, "stinger", ["stinger", "nhạc ngắn"] + nm.split("_")[1:], use)(lambda ch=ch, kind=kind: stinger(ch, kind))


# ---------------------------------------------------------------- atmos / beds (short loops)
sfx("tension_drone", "atmos", ["căng thẳng", "drone", "suspense"], "nền căng dưới con số đau (4s)")(lambda: reverb(to_stereo(lp(sum(osc(f, 4, "saw") for f in (55, 58.3, 82.4)) / 3, 400) * env_adsr(int(4 * SR), 1, .2, .9, 1.2) * .5), .4, 2))
sfx("tension_drone_2", "atmos", ["căng", "rủi ro"], "nền căng (6s)")(lambda: reverb(to_stereo(lp(supersaw(41, 6, 7, .02, rng("td2")), 300) * env_adsr(int(6 * SR), 1.5, .2, .9, 2) * .6), .4, 2.5))
sfx("wind", "atmos", ["gió", "trống trải"], "cô đơn, trống rỗng (4s)")(lambda: to_stereo(sweep_filter(noise(4, "pink", rng("wd")), 300, 900, "band", .5, 32) * env_adsr(int(4 * SR), 1, .2, .8, 1.5) * .6))
sfx("vinyl_crackle", "atmos", ["vinyl", "lofi", "hoài niệm"], "mood mellow/hoài niệm (5s loop)")(lambda: to_stereo((noise(5, "white", rng("vc")) * (rng("vc2").random(5 * SR) > .9993) * .6) + lp(noise(5, "pink", rng("vc3")), 3000) * .03))
sfx("rain", "atmos", ["mưa", "buồn"], "mood sad (5s)")(lambda: to_stereo(bp(noise(5, "white", rng("rn")), 800, 8000) * .2 + (noise(5, "white", rng("rn2")) * (rng("rn3").random(5 * SR) > .997)) * .3))
sfx("office_room", "atmos", ["văn phòng", "room tone"], "cảnh làm việc (5s)")(lambda: to_stereo(lp(noise(5, "brown", rng("of")), 500) * .3 + typing(5, 4, 77)[:, 0] * .15))
sfx("crowd_murmur", "atmos", ["đám đông", "ồn ào"], "sự kiện, đông người (4s)")(lambda: to_stereo(sum(bp(noise(4, "white", rng(("cm", k))), 300 + 120 * k, 900 + 200 * k) * (.6 + .4 * np.sin(2 * np.pi * (1.5 + k * .7) * tt(4))) for k in range(6)) * .15))


# ================================================================ v4 expansion (118 sounds; auto_sfx.py --level uses them)
# Every v4 sound reseeds the shared reverb RNG from its name in main() -> each file is deterministic on its own.
V4 = set()


def sfx4(name, cat, tags, use):
    V4.add(name)
    return sfx(name, cat, tags, use)


def rv(x, wet=.25, length=1.2, seed=0):
    return reverb(x, wet, length, rng=rng(("rv4", seed)))


def loopify(x, xf=.8):
    """Bed loops seamlessly: the extra xf seconds at the end are crossfaded into the head (input = loop + xf)."""
    x = to_stereo(np.asarray(x, float))
    n = int(xf * SR)
    body = x[:-n].copy()
    k = np.linspace(0, 1, n)[:, None]
    body[:n] = body[:n] * k + x[-n:] * (1 - k)
    return body


def glide_saw(f0, f1, d, voices=5, spread=.01, seed=0):
    t = tt(d)
    f = f0 * (f1 / f0) ** (t / d)
    r = rng(("gs", seed))
    out = sum(2 * ((np.cumsum(f * (1 + spread * (i / max(1, voices - 1) - .5) * 2)) / SR + r.random()) % 1) - 1 for i in range(voices))
    return out / voices


def sprinkle(d, n, make, seed, spread=(-.8, .8), until=1.0):
    """n short events at seeded random times in [0, d*until)."""
    r = rng(("spr", seed))
    out = np.zeros((int(d * SR), 2))
    for k in range(n):
        place(out, to_stereo(np.asarray(make(r, k), float), r.uniform(*spread)), r.uniform(0, d * until) * SR)
    return out


# ---- risers (end exactly at the hit: place them at hit_t - dur)
for nm, d, sd, f0, f1 in [("riser_0_6s", .6, 20, 250, 3000), ("riser_1_5s", 1.5, 21, 160, 2600)]:
    sfx4(nm, "build", ["riser", "dâng lên", "build up"], f"dồn trước khoảnh khắc lớn {d:g}s")(lambda d=d, sd=sd, f0=f0, f1=f1: riser(d, sd, f0, f1))


def riser_noise(d, seed):
    t = tt(d)
    x = sweep_filter(noise(d + .05, "white", rng(("rn4", seed)))[:int(d * SR)], 400, 11000, "band", .6, 48) * (t / d) ** 2
    return autopan(fade(x, .01, .004), 1 / d, .9, -.9)


for d in (.6, 1.0, 2.0):
    sfx4(f"riser_noise_{d:g}s".replace(".", "_"), "build", ["riser", "noise", "hút lên"], f"riser nhiễu trắng {d:g}s trước cú đập")(lambda d=d: riser_noise(d, d))


def riser_tension(d, seed):
    t = tt(d)
    x = glide_saw(55, 220, d, 6, .015, seed) + glide_saw(82.4, 330, d, 4, .012, seed + 1) * .6
    x = sweep_filter(x, 250, 5000, "low", blocks=48) * (t / d) ** 1.6
    return rv(to_stereo(fade(soft_clip(x * 1.4, 1.2), .02, .004)), .25, 1.4, seed)


for d in (1.0, 2.0, 3.0):
    sfx4(f"riser_tension_{d:g}s", "build", ["riser", "căng", "trailer"], f"dồn căng kiểu trailer {d:g}s")(lambda d=d: riser_tension(d, int(d * 10)))
for d in (1.0, 2.0):
    sfx4(f"riser_pitch_{d:g}s", "build", ["riser", "lên cao", "tremolo"], f"tông lên + rung nhanh dần {d:g}s")(
        lambda d=d: rv(to_stereo(chirp(200, 1800, d) * (.55 + .45 * np.sin(2 * np.pi * np.cumsum(4 + 26 * tt(d) / d) / SR)) * (tt(d) / d) ** 1.4 * .6), .2, 1, int(d)))
sfx4("reverse_cymbal_0_6s", "build", ["reverse cymbal", "hút ngược"], "kết thúc đúng frame chữ lớn (0.6s)")(lambda: rev_cymbal(.6, 7))


def rev_swell(d, seed, root=60):
    x = sum(osc(N(root + i), .5, "saw", detune=.004 * k) for k, i in enumerate((0, 7, 12, 16))) / 4
    x = lp(x, 2500) * exp_dec(.5, 6)
    y = rv(to_stereo(np.pad(x, (0, int((d - .5) * SR)))), .9, d, seed)[::-1]
    return fade(y, .01, .004)


sfx4("reverse_swell_1s", "build", ["reverse", "swell", "hút vào"], "hút vào mềm trước tiêu đề (1s)")(lambda: rev_swell(1.0, 31))
sfx4("reverse_swell_2s", "build", ["reverse", "swell"], "hút vào dài trước tiêu đề (2s)")(lambda: rev_swell(2.0, 32, 57))

# ---- hits
for i, (f, d) in enumerate([(62, .45), (75, .38), (52, .55)]):
    sfx4("hit_punch" if i == 0 else f"hit_punch_{i + 1}", "impact", ["hit", "punch", "đấm"], "nhấn chữ/b-roll vào mạnh, gọn")(
        lambda f=f, d=d, i=i: _combo(kick(f, d), to_stereo(bp(noise(.15, "white", rng(("hp4", i))), 900, 6000) * exp_dec(.15, 32) * .7), 0))
for i, f in enumerate([1180, 760]):
    sfx4("hit_metal" if i == 0 else "hit_metal_2", "impact", ["kim loại", "metal", "keng"], "đập kim loại, con số lớn")(
        lambda f=f, i=i: _combo(impact(90, .5, 1, 1, 40 + i, .1, 2), rv(to_stereo(bell(f, 1.4, ((1, .4, 5), (2.76, .3, 7), (5.4, .2, 9), (8.9, .1, 12))) * .6), .3, 1.4, 40 + i), 0))
for i, (f, d) in enumerate([(32, 1.2), (28, 1.8)]):
    sfx4("hit_deep" if i == 0 else "hit_deep_2", "impact", ["trầm", "deep hit", "bass"], "cú đập trầm, tiết lộ")(
        lambda f=f, d=d, i=i: _combo(boom(f, d, 50 + i), to_stereo(chirp(140, 30, .5) * exp_dec(.5, 4) * .5), 0))
sfx4("hit_snap", "impact", ["snap", "tách"], "cắt gọn, chữ bật")(lambda: rv(to_stereo(hp(noise(.08, "white", rng("snap4")), 1200) * exp_dec(.08, 60)), .25, .6, 3))
sfx4("hit_glass", "impact", ["thuỷ tinh", "sáng"], "chữ sáng, đẹp, cao cấp")(
    lambda: rv(_combo(to_stereo(bell(2900, 1.2, ((1, .35, 5), (2.32, .25, 7), (4.25, .15, 9), (6.63, .1, 12)))), to_stereo(hp(noise(.05, "white", rng("gl4")), 5000) * exp_dec(.05, 70) * .4), 0), .35, 1.4, 4))
sfx4("hit_cinematic_short", "impact", ["cinematic", "ngắn"], "title lớn, không quá dài")(lambda: cine_hit(5, 1.4))
sfx4("hit_trailer", "impact", ["trailer", "braam ngắn"], "tuyên bố, chương mới")(lambda: _combo(braam(1.8, 48, 3), impact(55, .9, .6, 1, 44, .25, 3), 0))
sfx4("intro_hit", "impact", ["mở màn", "intro"], "đầu video: hút ngược rồi đập (đập ở 0.8s)")(lambda: _combo(rev_cymbal(.8, 11), cine_hit(6, 1.6), .8))
sfx4("outro_hit", "impact", ["kết", "outro", "end card"], "thẻ kết, câu chốt cuối")(lambda: _combo(impact(60, .8, .6, 1, 45, .3, 3), stinger([60, 67, 72, 76], "pad", 2.0), 0))

# ---- UI
for i, f in enumerate([2600, 1900]):
    sfx4("ui_click_soft" if i == 0 else "ui_click_soft_2", "ui", ["click mềm", "bấm nhẹ"], "bấm UI nhẹ nhàng, không gắt")(lambda f=f, i=i: to_stereo(lp(click(f, 200 + i)[:, 0], 3200) * 1.6))
for i, f in enumerate([1250, 980]):
    sfx4("ui_tap" if i == 0 else "ui_tap_2", "ui", ["chạm", "tap"], "chạm màn hình, chọn thẻ")(
        lambda f=f, i=i: _combo(to_stereo(np.sin(2 * np.pi * f * tt(.06)) * exp_dec(.06, 70) * .6), to_stereo(lp(click(3000, 210 + i)[:, 0], 5000) * .5), 0))
sfx4("ui_toggle_on", "ui", ["bật", "toggle"], "bật công tắc, chọn")(lambda: _seq([blip(900, .04, "sine"), blip(1400, .05, "sine")], .05))
sfx4("ui_toggle_off", "ui", ["tắt", "toggle"], "tắt công tắc, bỏ chọn")(lambda: _seq([blip(1400, .04, "sine"), blip(900, .05, "sine")], .05))
sfx4("ui_hover", "ui", ["rê chuột", "hover"], "rê qua mục, highlight rất nhẹ")(lambda: to_stereo(np.sin(2 * np.pi * 2100 * tt(.07)) * np.sin(np.pi * tt(.07) / .07) * .3))
sfx4("ui_select", "ui", ["chọn", "select"], "chọn mục trong danh sách")(lambda: _seq([blip(1600, .03, "tri"), blip(2400, .06, "sine")], .04))
sfx4("ui_confirm", "ui", ["xác nhận", "ok"], "xác nhận, lưu xong")(lambda: arp_chime([N(79), N(86)], .07, .5, "fm"))
sfx4("ui_back", "ui", ["quay lại", "back"], "quay lại, đóng")(lambda: to_stereo(chirp(900, 480, .12) * exp_dec(.12, 18) * .5))
sfx4("ui_swipe_soft", "ui", ["vuốt nhẹ", "swipe"], "vuốt thẻ nhẹ")(lambda: to_stereo(lp(swipe(.25, 3000, 9)[:, 0] + swipe(.25, 3000, 9)[:, 1], 4500) * .6))
sfx4("ui_type_key", "ui", ["phím", "key"], "một phím gõ")(lambda: click(3500, 99, .04))

# ---- money
def coin_ring(f, d=.5, s=0):
    return bell(f, d, ((1, .4, 9), (2.7, .2, 14), (5.1, .1, 18)))


def coin_drop():
    out = np.zeros((int(1.0 * SR), 2))
    tpos, gap, amp = 0.0, .16, 1.0
    for k in range(7):
        place(out, to_stereo(coin_ring(2500 + 80 * k, .25) * amp), tpos * SR)
        tpos += gap
        gap *= .72
        amp *= .75
    return rv(out, .15, .8, 60)


sfx4("coin_drop", "chime", ["đồng xu rơi", "tiền"], "đồng xu rơi nảy, tiết kiệm")(coin_drop)
sfx4("coin_multi", "chime", ["nhiều xu", "tiền"], "nhận nhiều tiền, thưởng")(lambda: rv(sprinkle(1.0, 9, lambda r, k: coin_ring(r.uniform(2200, 3400), .35), 61, until=.6), .2, .8, 61))
sfx4("coins_pour", "chime", ["đổ tiền", "tiền xu"], "tiền về ào ào (1.6s)")(lambda: rv(sprinkle(1.6, 40, lambda r, k: coin_ring(r.uniform(2000, 4200), .2) * r.uniform(.3, 1), 62, until=.85), .25, 1, 62))


def cash_ching(root=2637, s=0):
    out = np.zeros((int(1.2 * SR), 2))
    place(out, click(1700, 300 + s, .05), 0)
    place(out, to_stereo(bell(root, 1.0, ((1, .5, 3), (2.4, .2, 5), (3.9, .1, 7))) + bell(root * 1.335, 1.0, ((1, .3, 4), (2.4, .1, 6)))), .07 * SR)
    return out


sfx4("cash_ching", "chime", ["ka-ching", "doanh thu", "tiền"], "ra tiền, chốt đơn (ngắn)")(lambda: cash_ching())
sfx4("cash_ching_2", "chime", ["ka-ching", "giá"], "giá, khuyến mãi")(lambda: cash_ching(2349, 1))
sfx4("money_bag", "chime", ["túi tiền", "tiền"], "đặt túi tiền, thu nhập lớn")(
    lambda: _combo(to_stereo(lp(noise(.25, "brown", rng("mb4")), 400) * exp_dec(.25, 14)), rv(sprinkle(.6, 8, lambda r, k: coin_ring(r.uniform(2400, 3600), .25) * .5, 63), .2, .6, 63), .04))
sfx4("price_tag", "chime", ["giá", "nhãn giá"], "hiện giá tiền, con số")(lambda: _combo(blip(1800, .04, "sine"), to_stereo(coin_ring(3136, .5)), .04))
sfx4("purchase_success", "chime", ["mua thành công", "đơn hàng"], "chốt đơn thành công")(lambda: _combo(cash_ching(2637, 2), arp_chime([N(76), N(79), N(84)], .07, .8, "fm"), .35))


# ---- beds (loop-friendly, ≤ 20 s)
def dc_block(x):
    x = to_stereo(np.asarray(x, float))
    return np.stack([hp(x[:, c], 20) for c in (0, 1)], 1)


def bed(fn, d, xf=.8):
    return loopify(dc_block(fn(d + xf)), xf)


def b_rain(d, heavy=False):
    r = "rh" if heavy else "rl"
    x = bp(noise(d, "white", rng((r, 1))), 900 if heavy else 1500, 9000) * (.3 if heavy else .16)
    drops = lp(noise(d, "white", rng((r, 2))) * (rng((r, 3)).random(int(d * SR)) > (.996 if heavy else .9985)), 6000) * .5
    low = lp(noise(d, "brown", rng((r, 4))), 300) * (.35 if heavy else .12)
    return np.stack([x + drops + low, bp(noise(d, "white", rng((r, 5))), 1500, 9000) * (.3 if heavy else .16) + low], 1)


def b_room(d):
    return to_stereo(lp(noise(d, "brown", rng("rt4")), 400) * .3 + osc(60, d) * .006 + osc(120, d) * .004 + hp(noise(d, "pink", rng("rt5")), 3000) * .01)


def b_city(d):
    t = tt(d)
    base = lp(noise(d, "brown", rng("ct1")), 260) * (.5 + .15 * np.sin(2 * np.pi * t / d * 2))
    out = to_stereo(base * .5)
    r = rng("ct2")
    for k in range(int(d / 3.5)):  # passing cars
        cd = r.uniform(2.5, 4.0)
        car = sweep_filter(noise(cd, "pink", rng(("car", k))), 300, 900, "band", .8, 24) * np.sin(np.pi * tt(cd) / cd) ** 2 * .4
        place(out, autopan(car, 1 / cd, .9 if k % 2 else -.9, -.9 if k % 2 else .9), r.uniform(0, d - cd) * SR)
    for k in range(2):  # distant horns
        place(out, to_stereo(lp(osc(r.uniform(380, 460), .35, "saw") + osc(r.uniform(470, 520), .35, "saw"), 1200) * env_adsr(int(.35 * SR), .02, .05, .8, .1) * .05, r.uniform(-.7, .7)), r.uniform(1, d - 1) * SR)
    return out


def b_cafe(d):
    mur = sum(to_stereo(bp(noise(d, "white", rng(("cf", k))), 250 + 110 * k, 800 + 180 * k) * (.6 + .4 * np.sin(2 * np.pi * (.7 + k * .37) * tt(d))), (k - 3) / 4) for k in range(7)) * .12
    clinks = sprinkle(d, int(d * .8), lambda r, k: bell(r.uniform(2800, 4800), .3, ((1, .3, 14), (2.6, .15, 20))) * .25, 70, until=.95)
    return mur + clinks + to_stereo(lp(noise(d, "brown", rng("cf9")), 300) * .15)


def b_office(d):
    out = b_room(d) * .8
    r = rng("of4")
    for k in range(int(d / 4)):
        place(out, typing(r.uniform(.8, 1.8), 9, 500 + k) * .25, r.uniform(0, d - 2) * SR)
    for k in range(int(d / 3)):
        place(out, click(3000, 600 + k, .03) * .3, r.uniform(0, d) * SR)
    return out


def b_night(d):
    out = to_stereo(sweep_filter(noise(d, "pink", rng("ng1")), 300, 700, "band", .5, 24) * .08)
    r = rng("ng2")
    for k in range(int(d * 1.2)):
        f = r.uniform(4200, 5200)
        burst = np.concatenate([np.sin(2 * np.pi * f * tt(.025)) * np.sin(np.pi * tt(.025) / .025) if j % 2 == 0 else np.zeros(int(.018 * SR)) for j in range(6)])
        place(out, to_stereo(burst * r.uniform(.05, .15), r.uniform(-.8, .8)), r.uniform(0, d - .3) * SR)
    return out


def b_ocean(d):
    t = tt(d)
    sw = (.35 + .65 * np.sin(np.pi * ((t / d * 3) % 1)) ** 2)  # 3 waves per loop -> periodic
    x = lp(noise(d, "pink", rng("oc1")), 1800) * sw * .5 + hp(noise(d, "white", rng("oc2")), 3000) * sw ** 3 * .1
    return np.stack([x, np.roll(x, int(.3 * SR))], 1)


def b_wind(d):
    t = tt(d)
    x = sweep_filter(noise(d, "pink", rng("wd4")), 250, 600, "band", .6, 32) * (.6 + .4 * np.sin(2 * np.pi * t / d * 2))
    return autopan(x * .6, 0, 0, 0) * np.array([1, .9])


def b_fire(d):
    crackle = lp(noise(d, "white", rng("fr1")) * (rng("fr2").random(int(d * SR)) > .998), 5000) * .7
    return to_stereo(crackle + lp(noise(d, "brown", rng("fr3")), 200) * .4 + bp(noise(d, "pink", rng("fr4")), 400, 1500) * .05)


def b_forest(d):
    out = b_wind(d) * .4
    tweet = lambda r, k: np.sin(2 * np.pi * np.cumsum(r.uniform(2500, 3800) + 900 * np.sin(2 * np.pi * r.uniform(12, 25) * tt(.18))) / SR) * np.sin(np.pi * tt(.18) / .18) * .25
    return out + sprinkle(d, int(d * 1.3), tweet, 71, until=.97)


def b_tech(d):
    hum = sum(osc(f, d) * g for f, g in ((55, .05), (110, .03), (165, .015)))
    return to_stereo(hum + lp(noise(d, "pink", rng("th1")), 900) * .05) + sprinkle(d, int(d * 2), lambda r, k: blip(r.uniform(1500, 4000), .03, "sine")[:, 0] * .08, 72)


for nm, fn, d, use in [("bed_rain_light", lambda d: b_rain(d), 12, "mưa nhẹ: buồn, hoài niệm, thư giãn"), ("bed_rain_heavy", lambda d: b_rain(d, True), 12, "mưa to: kịch tính, khó khăn"),
                       ("bed_room_tone", b_room, 10, "room tone: lấp khoảng lặng giữa các câu"), ("bed_city", b_city, 14, "thành phố, giao thông: đô thị, BĐS"),
                       ("bed_cafe", b_cafe, 14, "quán cà phê: trò chuyện, chia sẻ, review đồ uống"), ("bed_office", b_office, 12, "văn phòng: làm việc, công sở"),
                       ("bed_night", b_night, 14, "đêm, dế kêu: yên tĩnh, kể chuyện"), ("bed_ocean", b_ocean, 16, "sóng biển: du lịch, thư giãn, nghỉ dưỡng"),
                       ("bed_wind_soft", b_wind, 12, "gió nhẹ: trống trải, suy tư"), ("bed_fire", b_fire, 12, "lửa bập bùng: ấm cúng, kể chuyện"),
                       ("bed_forest", b_forest, 14, "rừng, chim hót: thiên nhiên, sức khoẻ"), ("bed_tech_hum", b_tech, 10, "máy chủ rì rì + bíp: công nghệ, AI")]:
    sfx4(nm, "bed", ["nền", "ambience", "loop"] + nm.split("_")[1:2], f"{use} ({d}s, loop liền)")(lambda fn=fn, d=d: bed(fn, d))


# ---- cartoon
def boing(f0=180, wob=11, d=.7, s=0):
    t = tt(d)
    f = f0 * (1 + .5 * t / d) + f0 * .45 * np.sin(2 * np.pi * wob * t) * np.exp(-t * 3.5)
    return to_stereo(np.sin(2 * np.pi * np.cumsum(f) / SR) * exp_dec(d, 4.5) * .6)


for i, (f, w, d) in enumerate([(180, 11, .7), (260, 14, .55), (120, 8, .9)]):
    sfx4("boing" if i == 0 else f"boing_{i + 1}", "cartoon", ["boing", "lò xo", "hài"], "hài hước, nảy lên, bất ngờ vui")(lambda f=f, w=w, d=d, i=i: boing(f, w, d, i))
sfx4("cartoon_pop", "cartoon", ["pop hoạt hình", "bật"], "emoji/sticker bật vui nhộn")(lambda: _combo(pop(500, 0, .12), bubble(700, .14), .02))
for nm, a, b in [("slide_whistle_up", 400, 1600), ("slide_whistle_down", 1600, 350)]:
    sfx4(nm, "cartoon", ["sáo trượt", "hài", "lên" if a < b else "xuống"], "tăng vọt vui nhộn" if a < b else "tụt dốc, thất bại hài")(
        lambda a=a, b=b: to_stereo(np.sin(2 * np.pi * np.cumsum(a * (b / a) ** (tt(.6) / .6) * (1 + .02 * np.sin(2 * np.pi * 6 * tt(.6)))) / SR) * env_adsr(int(.6 * SR), .03, .1, .8, .12) * .45
                                   + bp(noise(.6, "white", rng(("sw4", a))), 1000, 4000) * .02))
sfx4("cartoon_spring", "cartoon", ["lò xo", "kim loại"], "bật lò xo, nhảy ra")(lambda: to_stereo(fm(220, .6, 3.5, 5, 3) * (1 + .3 * np.sin(2 * np.pi * 18 * tt(.6))) * exp_dec(.6, 5) * .5))
sfx4("cartoon_bonk", "cartoon", ["bonk", "gõ đầu", "hài"], "gõ đầu, nhận ra sai")(lambda: _combo(to_stereo((np.sin(2 * np.pi * 720 * tt(.18)) + .5 * np.sin(2 * np.pi * 1440 * tt(.18))) * exp_dec(.18, 26) * .6), to_stereo(bp(noise(.02, "white", rng("bk4")), 1500, 6000) * .4), 0))
sfx4("cartoon_zip", "cartoon", ["vụt", "zip", "chạy mất"], "biến mất nhanh, chạy đi")(lambda: _combo(to_stereo(chirp(300, 3200, .15) * exp_dec(.15, 8) * .5), whoosh(.2, 2000, 8000, .5), 0))

# ---- swells / pads
def swell(notes, d=2.0, cutoff=(400, 3000), seed=0, kind="saw"):
    x = sum(supersaw(N(m), d, 5, .01, rng(("swl", seed, m))) if kind == "saw" else osc(N(m), d, "tri", detune=.003) for m in notes) / len(notes)
    x = sweep_filter(x, cutoff[0], cutoff[1], "low", blocks=40) * env_adsr(int(d * SR), d * .6, d * .1, .8, d * .3)
    return rv(to_stereo(x), .4, 2.0, seed)


sfx4("swell_soft", "swell", ["swell", "pad", "nhẹ"], "dâng nhẹ cảm xúc, chuyển đoạn êm")(lambda: swell([60, 64, 67, 71], 2.0, (300, 1500), 1, "tri"))
sfx4("swell_bright", "swell", ["swell", "sáng", "lạc quan"], "giải pháp, kết quả tốt")(lambda: swell([62, 66, 69, 73, 78], 2.0, (500, 6000), 2))
sfx4("swell_dark", "swell", ["swell", "tối", "căng"], "vấn đề, rủi ro")(lambda: swell([45, 48, 51, 56], 2.2, (200, 1500), 3))
sfx4("swell_pad_2s", "swell", ["pad", "swell"], "nền chuyển đoạn 2s")(lambda: swell([57, 60, 64, 67], 2.0, (300, 2500), 4))
sfx4("swell_pad_3s", "swell", ["pad", "swell"], "nền chuyển đoạn 3s")(lambda: swell([53, 57, 60, 64, 69], 3.0, (250, 2800), 5))

# ---- glitches
sfx4("glitch_digital", "tech", ["glitch", "số"], "glitch ngắn số hoá")(lambda: glitch(.35, 21))
sfx4("glitch_digital_2", "tech", ["glitch", "số"], "glitch dài hơn")(lambda: glitch(.6, 22))
sfx4("glitch_short", "tech", ["glitch", "cực ngắn"], "nháy glitch 1 frame")(lambda: glitch(.12, 23))


def stutter(seed=0):
    r = rng(("stt", seed))
    seg = np.concatenate([osc(r.uniform(300, 900), .035, "square") * .4, noise(.02, "white", r) * .3])
    return to_stereo(np.concatenate([seg * (1 - k / 10) for k in range(9)]))


sfx4("glitch_stutter", "tech", ["stutter", "giật", "lặp"], "chữ/hình giật lặp")(lambda: stutter())
sfx4("glitch_bitcrush", "tech", ["bitcrush", "8-bit"], "lỗi số, AI hỏng")(lambda: to_stereo(np.round(glide_saw(800, 120, .5, 1, 0, 9) * 4) / 4 * exp_dec(.5, 3) * .5))
sfx4("glitch_tape", "tech", ["băng từ", "tape"], "tua nhầm, khựng lại")(lambda: to_stereo(np.sin(2 * np.pi * np.cumsum(500 * (1 - tt(.5) / .5) ** 1.5 + 20) / SR) * .35 + hp(noise(.5, "white", rng("tp4")), 3000) * .05 * (rng("tp5").random(int(.5 * SR)) > .97)))

# ---- heartbeats
hb = lambda s, g=1: impact(50, .3, 0, g, 400 + s, .05, .5)
sfx4("heartbeat_single", "foley", ["nhịp tim", "1 nhịp"], "khựng lại một nhịp")(lambda: _seq([hb(0), hb(1, .7)], .22))
sfx4("heartbeat_slow", "foley", ["nhịp tim chậm", "hồi hộp"], "chờ đợi, căng thẳng (chậm)")(lambda: _seq([hb(k, 1 if k % 2 == 0 else .7) if k % 3 != 2 else np.zeros((10, 2)) for k in range(6)], .36))
sfx4("heartbeat_fast", "foley", ["nhịp tim nhanh", "sợ"], "lo sợ, gấp gáp")(lambda: _seq([hb(10 + k, 1 if k % 2 == 0 else .7) for k in range(10)], .2))

# ---- applause / crowd (synthetic)
def claps(n_people, d, seed, rate=(.11, .2)):
    r = rng(("cl4", seed))
    out = np.zeros((int(d * SR), 2))
    for p in range(n_people):
        tpos, step, pan = r.uniform(0, .25), r.uniform(*rate), r.uniform(-.9, .9)
        while tpos < d - .3:
            place(out, to_stereo(clap(int(r.integers(1e6)), r.uniform(.3, 1))[:, 0], pan), tpos * SR)
            tpos += step * r.uniform(.9, 1.1)
    return out * env_adsr(len(out), .15, .3, .8, d * .35)[:, None]


sfx4("applause_small", "crowd", ["vỗ tay", "nhỏ"], "vài người vỗ tay, cảm ơn")(lambda: rv(claps(6, 2.0, 1), .3, 1.2, 81))
sfx4("applause_big", "crowd", ["vỗ tay lớn", "khán phòng"], "thành tựu lớn, kết thúc ấn tượng")(lambda: rv(claps(22, 3.0, 2, (.09, .16)), .4, 1.8, 82))
sfx4("cheer_short", "crowd", ["hò reo", "yeah"], "ăn mừng ngắn")(lambda: rv(sum(to_stereo(bp(glide_saw(r0, r0 * 1.25, 1.6, 2, .02, k), 500, 2500) * env_adsr(int(1.6 * SR), .1, .3, .7, .7), (k - 3) / 4) for k, r0 in enumerate([180, 210, 240, 165, 300, 270, 195])) * .25 + claps(8, 1.6, 3) * .5, .35, 1.5, 83))
sfx4("crowd_ooh", "crowd", ["ồ", "wow", "ngạc nhiên"], "khán giả 'ồ' ngạc nhiên")(lambda: rv(sum(to_stereo(lp(bp(glide_saw(r0, r0 * .82, 1.4, 2, .02, 20 + k), 250, 900), 700) * env_adsr(int(1.4 * SR), .15, .2, .8, .6), (k - 3) / 4) for k, r0 in enumerate([150, 175, 205, 230, 130, 260])) * .4, .35, 1.5, 84))

# ---- whoosh / whip extras
sfx4("whoosh_soft", "transition", ["whoosh mềm", "nhẹ"], "chuyển nhẹ dưới giọng nói")(lambda: to_stereo(lp(whoosh(.5, 300, 2000, .5).mean(1), 3500)) * np.array([1, .95]))
sfx4("whoosh_soft_2", "transition", ["whoosh mềm"], "chữ trượt nhẹ")(lambda: autopan(lp(whoosh(.4, 500, 2600, .55, False).mean(1), 4000), 2.5, .8, .8))
sfx4("whoosh_air", "transition", ["gió", "air"], "thoáng, chuyển sáng")(lambda: whoosh(.8, 2500, 9000, .5, color="white"))
sfx4("whoosh_heavy", "transition", ["whoosh nặng", "trầm"], "khối lớn bay vào, b-roll full")(lambda: _combo(whoosh(1.0, 100, 1500, .6, color="brown", tail=.15), to_stereo(chirp(90, 40, .8) * exp_dec(.8, 3) * .4), .3))
sfx4("swoosh_out", "transition", ["swoosh ra", "rời cảnh"], "b-roll/thẻ rời khỏi khung")(lambda: whoosh(.45, 3000, 400, .3))
sfx4("swoosh_out_2", "transition", ["swoosh ra"], "rời cảnh chậm hơn")(lambda: whoosh(.6, 2500, 300, .25, tail=.1))
sfx4("whip", "transition", ["whip", "quất"], "whip pan, chuyển cực nhanh")(lambda: whoosh(.2, 1500, 9000, .75))
sfx4("whip_2", "transition", ["whip"], "whip pan ngắn")(lambda: whoosh(.15, 2500, 10000, .8))

# ---- pops
sfx4("pop_soft", "ui", ["pop mềm"], "emoji/chữ nhỏ dưới giọng nói")(lambda: to_stereo(lp(pop(700, 0, .12)[:, 0], 2500)))
sfx4("pop_soft_2", "ui", ["pop mềm"], "chữ nhỏ bật nhẹ")(lambda: to_stereo(lp(pop(550, 0, .12)[:, 0], 2200)))
sfx4("pop_bright", "ui", ["pop sáng"], "tag/sticker bật rõ")(lambda: pop(1800, 0, .1))
sfx4("pop_bubble", "ui", ["pop bong bóng"], "bong bóng chat, sticker")(lambda: _combo(bubble(500, .12), pop(1100, 0, .08), .05))
sfx4("pop_cork", "ui", ["bật nút chai", "ăn mừng"], "khui, ăn mừng")(lambda: _combo(to_stereo(bp(noise(.04, "white", rng("ck4")), 600, 3000) * exp_dec(.04, 60)), pop(320, 0, .15), 0))

# ---- sparkle / chime extras
sfx4("sparkle_soft", "magic", ["lấp lánh nhẹ"], "emoji/sticker xuất hiện dưới giọng")(lambda: sparkle(.8, 6, 31))
sfx4("twinkle", "magic", ["lấp lánh", "chuông nhỏ"], "đẹp, mới, sạch")(lambda: rv(_seq([to_stereo(bell(N(m), .6, ((1, .3, 6), (2, .1, 9)))) for m in (88, 91, 95, 100)], .06), .4, 1.4, 90))
sfx4("chime_soft", "magic", ["chuông nhẹ"], "ý hay, mẹo")(lambda: rv(to_stereo(bell(1760, 1.2) * .7), .4, 1.6, 91))
sfx4("magic_rise", "magic", ["phép màu", "dâng"], "biến hoá, trước → sau")(lambda: _combo(to_stereo(chirp(600, 2400, .7) * (tt(.7) / .7) * .25), sparkle(1.0, 14, 32), .3))

# ---- notifications / messages
sfx4("notif_soft", "chime", ["thông báo nhẹ"], "thông báo dưới giọng nói")(lambda: _seq([to_stereo(np.sin(2 * np.pi * N(81) * tt(.25)) * exp_dec(.25, 10) * .4), to_stereo(np.sin(2 * np.pi * N(88) * tt(.4)) * exp_dec(.4, 8) * .4)], .1))
sfx4("notif_pop", "chime", ["thông báo", "pop"], "thông báo bật lên trên điện thoại")(lambda: _combo(pop(1200, 0, .08), to_stereo(bell(N(86), .6)), .03))
sfx4("message_in", "chime", ["tin nhắn đến"], "tin nhắn mới trong chat")(lambda: _combo(bubble(600, .14), blip(2200, .05, "sine"), .1))
sfx4("message_in_2", "chime", ["tin nhắn đến"], "tin nhắn mới (biến thể)")(lambda: arp_chime([N(83), N(90)], .08, .4, "fm"))
sfx4("like_pop", "chime", ["thả tim", "like"], "tim/like bật lên")(lambda: _combo(pop(900, 0, .1), sparkle(.5, 5, 33), .03))

# ---- typing
sfx4("typing_3s", "ui", ["gõ phím", "typing"], "gõ prompt/tìm kiếm 3s")(lambda: typing(3, 11, 33))
sfx4("typing_soft_2s", "ui", ["gõ phím nhẹ"], "gõ chữ dưới giọng nói")(lambda: to_stereo(lp(typing(2, 10, 34).mean(1), 3500)))
sfx4("keyboard_enter_2", "ui", ["enter"], "bấm Enter gửi")(lambda: _combo(click(1900, 35, .06), click(1200, 36, .06), .015))
sfx4("typewriter_ding", "ui", ["máy đánh chữ", "ding"], "hết dòng máy đánh chữ")(lambda: _combo(click(1400, 37, .06), rv(to_stereo(bell(2400, .9, ((1, .5, 4), (2.1, .2, 7)))), .2, .8, 37), .05))
sfx4("typewriter_keys_2s", "ui", ["máy đánh chữ", "gõ"], "chữ hiện từng ký tự kiểu máy chữ")(lambda: _seq([_combo(click(1600 + 300 * (k % 3), 700 + k, .05), to_stereo(lp(noise(.03, "brown", rng(("tw", k))), 600) * exp_dec(.03, 60)), 0) for k in range(14)], .135))

# ---- transitions / sub
sfx4("transition_soft", "transition", ["chuyển nhẹ", "shimmer"], "chuyển clip nhẹ nhàng")(lambda: _combo(whoosh(.5, 400, 2500, .5), sparkle(.6, 5, 34) * .5, .2))
sfx4("transition_glitch", "transition", ["chuyển glitch"], "chuyển clip kiểu glitch")(lambda: _combo(glitch(.25, 24), whoosh(.35, 800, 5000, .6), .05))
sfx4("transition_whip_hit", "transition", ["whip + đập"], "whip pan đập mạnh")(lambda: _combo(whoosh(.2, 1500, 9000, .75), kick(60, .4), .18))
sfx4("transition_riser_hit", "transition", ["riser + đập"], "dồn ngắn rồi đập (đập ở 0.6s)")(lambda: _combo(riser(.6, 25), impact(70, .6, 1, 1, 46, .2, 2.5), .6))
sfx4("sub_drop_short", "impact", ["sub drop", "ngắn"], "rơi bass ngắn sau hook")(lambda: to_stereo(soft_clip(chirp(110, 30, .6) * np.exp(-tt(.6) * 3), 1.5)))
sfx4("sub_boom_soft", "impact", ["boom mềm"], "nhấn trầm nhẹ dưới giọng")(lambda: to_stereo(lp(boom(45, 1.0, 47).mean(1), 400)))


# ----------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--only", default="")
    ap.add_argument("--ext", default="wav")
    ap.add_argument("--skip-existing", action="store_true", help="only synthesize sounds whose file is missing (catalog still lists all)")
    a = ap.parse_args()
    import dsp
    from dsp import write
    os.makedirs(a.out, exist_ok=True)
    only = set(filter(None, a.only.split(",")))
    cpath = os.path.join(a.out, "catalog.json")
    old = {c["name"]: c for c in json.load(open(cpath))} if os.path.exists(cpath) else {}
    cat, made = [], 0
    for name, c, tags, use, fn in REG:
        f = os.path.join(a.out, f"{name}.{a.ext}")
        entry = {"name": name, "cat": c, "tags": tags, "use": use}
        if (only and name not in only) or (a.skip_existing and os.path.exists(f)):
            if name in old:
                cat.append({**entry, "dur": old[name]["dur"]})
            continue
        if name in V4:  # reverb IRs come from the shared RNG: reseed per sound so each v4 file is reproducible alone
            dsp.RNG.bit_generator.state = np.random.default_rng(zlib.crc32(name.encode())).bit_generator.state
        x = fn()
        x = to_stereo(np.asarray(x, dtype=float))
        if name in V4 and c != "bed":
            x = dc_block(x)
        x = normalize(np.nan_to_num(x), .9)
        if c != "bed":  # beds are crossfaded loops: a fade would click at the loop point
            x = fade(x, .0005, .01)
        write(f, x)
        made += 1
        cat.append({**entry, "dur": round(len(x) / SR, 2)})
    order = {n: i for i, (n, *_) in enumerate(REG)}
    keep = {c["name"] for c in cat}
    cat += [c for n, c in old.items() if n not in keep and n in order]
    cat.sort(key=lambda c: order.get(c["name"], 1e9))
    json.dump([{k: c[k] for k in ("name", "cat", "dur", "tags", "use")} for c in cat], open(cpath, "w"), ensure_ascii=False, indent=1)
    print(f"{made} sfx synthesized, catalog {len(cat)} -> {a.out}")


if __name__ == "__main__":
    main()
