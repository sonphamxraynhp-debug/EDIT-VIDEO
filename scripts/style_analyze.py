"""Offline analysis of an already-edited reference video (TikTok / Reels / YouTube) for "Clone style từ video".

usage: python -I scripts/style_analyze.py <video> <out_dir> [--model large-v3-turbo] [--lang vi|auto] [--no-transcribe] [--sheets 4]
Writes into <out_dir>:
  analysis.json          duration/aspect, cuts + cut rate, motion, palette, text zones, transcript, speech ratio, audio (music/BPM/transients)
  sheet_1..4.jpg         contact sheets (grid of frames with timestamps, CUT marks)  → shown to Claude
  text_zones.jpg         crops of the detected caption / title bands from frames across the video
  keyframes/*.jpg        frames at every cut + every ~1 s (270 px wide)
  words.json             word timings (scripts/transcribe.py)
Progress lines "@@ <0..1> <step>" on stdout (read by scripts/style_lab.mjs / studio route).
Everything is heuristic (numpy only): text zones = rows dense in sharp horizontal edges, music = background level in speech gaps
+ onset periodicity, SFX = strong broadband transients. Claude reads the sheets to judge the actual look.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
pos = [a for i, a in enumerate(args) if not a.startswith("--") and not (i and args[i - 1] in ("--model", "--lang", "--sheets"))]
if len(pos) < 2:
    print(__doc__); sys.exit(2)
SRC, OUT = os.path.abspath(pos[0]), os.path.abspath(pos[1])
os.makedirs(os.path.join(OUT, "keyframes"), exist_ok=True)
say = lambda p, s: print(f"@@ {p:.2f} {s}", flush=True)
r2 = lambda v: round(float(v), 2)


def probe(f):
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate",
                                   "-of", "json", f], capture_output=True, text=True, check=True).stdout)
    v = next((s for s in j["streams"] if s["codec_type"] == "video"), None)
    if not v: raise SystemExit("LỖI: file không có hình (video stream)")
    n, d = (v.get("r_frame_rate") or "30/1").split("/")
    return float(j["format"]["duration"]), int(v["width"]), int(v["height"]), float(n) / max(1, float(d)), any(s["codec_type"] == "audio" for s in j["streams"])


say(.02, "Đọc thông tin video")
DUR, W, H, FPS, HAS_AUDIO = probe(SRC)
VERT = H > W

# ---------- small frames at 4 fps (analysis) ----------
say(.05, "Trích khung hình nhỏ để phân tích")
AW, AH = (144, 256) if VERT else (256, 144)
afps = 4 if DUR <= 240 else max(.5, 960 / DUR)
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", SRC, "-vf", f"fps={afps},scale={AW}:{AH}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                     capture_output=True, check=True).stdout
F = np.frombuffer(raw, np.uint8).reshape(-1, AH, AW, 3)
FT = np.arange(len(F)) / afps

# ---------- scene cuts (ffmpeg scene score) ----------
say(.12, "Dò điểm cắt cảnh")
log = subprocess.run(["ffmpeg", "-hide_banner", "-i", SRC, "-an", "-vf", "scale=180:-2,select='gt(scene,0.30)',showinfo", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
cuts = sorted({r2(float(m)) for m in re.findall(r"pts_time:([\d.]+)", log)})
cuts = [c for i, c in enumerate(cuts) if c > .15 and c < DUR - .15 and (i == 0 or c - cuts[i - 1] > .25)]
shots = np.diff([0, *cuts, DUR])
diff = np.abs(np.diff(F.astype(np.int16), axis=0)).mean(axis=(1, 2, 3)) if len(F) > 1 else np.zeros(1)
motion = float(np.median(diff))

# ---------- keyframes (270 px) at every cut + every ~1 s ----------
say(.2, "Lưu khung hình chính")
KW = 270 if VERT else 480
step = 1.0 if DUR <= 120 else DUR / 120
times = sorted({*(r2(x) for x in np.arange(.3, DUR - .1, step)), *(r2(min(DUR - .05, c + .12)) for c in cuts)})
kdir = os.path.join(OUT, "keyframes")
for f in os.listdir(kdir): os.remove(os.path.join(kdir, f))
kf = []
for i, t in enumerate(times):
    fn = os.path.join(kdir, f"{i:03d}_{t:06.2f}.jpg")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", SRC, "-frames:v", "1", "-vf", f"scale={KW}:-2", "-q:v", "4", fn], check=False)
    if os.path.exists(fn): kf.append((t, fn, any(abs(t - c - .12) < .02 for c in cuts)))
    if i % 10 == 0: say(.2 + .2 * i / max(1, len(times)), f"Lưu khung hình chính {i + 1}/{len(times)}")

# ---------- contact sheets ----------
say(.42, "Ghép contact sheet")
NS = int(opt("--sheets", 4))
cols, rows = (4, 3) if VERT else (3, 4)
per = cols * rows
cutk = [k for k in kf if k[2]]
pick = list(cutk)
rest = [k for k in kf if not k[2]]
need = max(0, min(NS * per, len(kf)) - len(pick))
if need and rest: pick += [rest[int(i)] for i in np.linspace(0, len(rest) - 1, min(need, len(rest)))]
if len(pick) > NS * per: pick = [pick[int(i)] for i in np.linspace(0, len(pick) - 1, NS * per)]
pick = sorted({k[1]: k for k in pick}.values())
try: font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 22)
except Exception: font = ImageFont.load_default()
sheets = []
nsheet = max(1, -(-len(pick) // per))
chunk = -(-len(pick) // nsheet)
for si in range(nsheet):
    part = pick[si * chunk:(si + 1) * chunk]
    if not part: break
    ims = [Image.open(k[1]).convert("RGB") for k in part]
    tw, th = ims[0].size
    lab = 30
    sh = Image.new("RGB", (cols * tw + (cols + 1) * 6, rows * (th + lab) + (rows + 1) * 6), (24, 24, 28))
    d = ImageDraw.Draw(sh)
    for j, (k, im) in enumerate(zip(part, ims)):
        x, y = 6 + (j % cols) * (tw + 6), 6 + (j // cols) * (th + lab + 6)
        sh.paste(im.resize((tw, th)), (x, y + lab))
        d.text((x + 4, y + 3), f"{int(k[0] // 60)}:{k[0] % 60:05.2f}", fill=(255, 255, 255), font=font)
        if k[2]: d.rectangle([x + tw - 62, y + 2, x + tw - 2, y + lab - 3], fill=(220, 40, 60)); d.text((x + tw - 56, y + 3), "CUT", fill=(255, 255, 255), font=font)
    fn = f"sheet_{si + 1}.jpg"
    sh.save(os.path.join(OUT, fn), quality=82)
    sheets.append({"file": fn, "from": part[0][0], "to": part[-1][0], "frames": len(part)})

# ---------- palette (k-means on all analysis frames) ----------
say(.5, "Tìm bảng màu chủ đạo")
px = F[:, ::2, ::2].reshape(-1, 3).astype(np.float32)
rng = np.random.default_rng(1)
px = px[rng.choice(len(px), min(60000, len(px)), replace=False)]


def kmeans(X, k, it=18):
    C = X[rng.choice(len(X), k, replace=False)]
    for _ in range(it):
        lab = np.argmin(((X[:, None] - C[None]) ** 2).sum(-1), 1)
        C = np.array([X[lab == i].mean(0) if (lab == i).any() else C[i] for i in range(k)])
    return C, np.bincount(lab, minlength=k) / len(X)


hexc = lambda c: "#%02X%02X%02X" % tuple(int(v) for v in np.clip(c, 0, 255))
def sat(c): mx, mn = max(c), min(c); return 0 if mx == 0 else (mx - mn) / mx
C, share = kmeans(px, 8)
palette = sorted([{"hex": hexc(c), "share": r2(s), "lum": r2((.2126 * c[0] + .7152 * c[1] + .0722 * c[2]) / 255), "sat": r2(sat(c))} for c, s in zip(C, share)], key=lambda x: -x["share"])
# accents: saturated pixels only
hs = px[(px.max(1) - px.min(1)) / np.maximum(px.max(1), 1) > .45]
hs = hs[hs.max(1) > 80]
accents = []
if len(hs) > 200:
    C2, s2 = kmeans(hs, 4)
    accents = sorted([{"hex": hexc(c), "share_of_frame": r2(s * len(hs) / len(px))} for c, s in zip(C2, s2)], key=lambda x: -x["share_of_frame"])
lum = F.mean(axis=3)
look = {"brightness": r2(lum.mean() / 255), "contrast": r2(lum.std() / 255),
        "saturation": r2(np.mean((F.max(3).astype(float) - F.min(3)) / np.maximum(F.max(3), 1)))}

# ---------- text zones: rows dense in sharp horizontal edges, stable over time ----------
say(.56, "Dò vùng chữ / phụ đề")
KF = np.stack([np.asarray(Image.open(k[1]).convert("RGB").resize((KW, int(KW * H / W) // 2 * 2))) for k in kf]) if kf else F
KH = KF.shape[1]
g = KF.mean(axis=3).astype(np.float32)
ed = (np.abs(np.diff(g, axis=2)) > 60).mean(axis=2)          # (frames, rows) share of sharp edges per row
prof = ed.mean(0)
med = np.median(prof); mad = np.median(np.abs(prof - med)) + 1e-4
z = (prof - med) / mad
pres = (ed > med + 4 * mad).mean(0)                          # how often each row looks like text
zones, y = [], 0
while y < KH:
    if z[y] >= 4:
        y0 = y
        while y0 > 0 and z[y0 - 1] >= 1.5: y0 -= 1
        while y < KH and z[y] >= 1.5: y += 1
        if y - y0 >= KH * .012: zones.append([y0, min(y, y0 + int(KH * .2))])
    y += 1
merged = []
for zz in zones:
    if merged and zz[0] - merged[-1][1] < KH * .02: merged[-1][1] = zz[1]
    else: merged.append(zz)
text_zones = []
for y0, y1 in merged:
    band = g[:, y0:y1]
    sel = ed[:, y0:y1].mean(1) > med + 4 * mad
    cols_ = (KF[sel, y0:y1] if sel.any() else KF[:, y0:y1]).reshape(-1, 3).astype(np.float32)
    bright = cols_[cols_.mean(1) > 170]
    textc = hexc(np.median(bright, 0)) if len(bright) > 50 else None
    sc = cols_[(cols_.max(1) - cols_.min(1)) / np.maximum(cols_.max(1), 1) > .35]
    hlc = hexc(np.median(sc, 0)) if len(sc) > max(50, .05 * len(cols_)) else None
    xs = (np.abs(np.diff(band, axis=2)) > 60).mean(axis=(0, 1))
    xi = np.where(xs > xs.max() * .25)[0] if xs.max() > 0 else np.array([0, KW - 1])
    text_zones.append({"y0": r2(y0 / KH), "y1": r2(y1 / KH), "x0": r2(xi.min() / KW), "x1": r2(xi.max() / KW),
                       "strength": r2(z[y0:y1].max()), "present": r2(pres[y0:y1].mean()), "text_color": textc, "box_or_accent_color": hlc,
                       "role": "top title" if y1 / KH < .3 else "bottom caption" if y0 / KH > .55 else "middle text"})
text_zones = sorted(text_zones, key=lambda q: -q["strength"] * q["present"])[:4]
crop_file = None
if text_zones:
    tz = sorted(text_zones[:3], key=lambda z: z["y0"])
    sel_t = [kf[int(i)] for i in np.linspace(0, len(kf) - 1, min(8, len(kf)))]
    strips = []
    for t, fn, _ in sel_t:
        im = Image.open(fn).convert("RGB"); w, h = im.size
        for z in tz:
            a, b = max(0, int((z["y0"] - .02) * h)), min(h, int((z["y1"] + .02) * h))
            strips.append(im.crop((0, a, w, b)).resize((w * 2, (b - a) * 2)))
    tw = max(s.size[0] for s in strips)
    sh = Image.new("RGB", (tw, sum(s.size[1] + 4 for s in strips)), (24, 24, 28))
    y = 0
    for s in strips: sh.paste(s, (0, y)); y += s.size[1] + 4
    if sh.size[1] > 3000: sh = sh.resize((int(tw * 3000 / sh.size[1]), 3000))
    crop_file = "text_zones.jpg"; sh.save(os.path.join(OUT, crop_file), quality=85)

# ---------- transcript ----------
words, lang = [], opt("--lang", "vi")
if HAS_AUDIO and "--no-transcribe" not in args:
    say(.6, "Nhận dạng lời nói (whisper " + opt("--model", "large-v3-turbo") + ")")
    wf = os.path.join(OUT, "words.json")
    r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "transcribe.py"), SRC, wf, "--model", opt("--model", "large-v3-turbo"), "--lang", lang], capture_output=True, text=True)
    if r.returncode == 0 and os.path.exists(wf): words = json.load(open(wf))
    for f in (wf + ".16k.wav",):
        if os.path.exists(f): os.remove(f)

# ---------- audio: speech ratio, music, BPM, transients ----------
say(.85, "Phân tích âm thanh (nhạc, nhịp, SFX)")
audio = {"has_audio": HAS_AUDIO}
speech = 0.0
if words:
    segs = []
    for w in words:
        if segs and w["s"] - segs[-1][1] < .6: segs[-1][1] = max(segs[-1][1], w["e"])
        else: segs.append([w["s"], w["e"]])
    speech = sum(b - a for a, b in segs)
if HAS_AUDIO:
    SR = 22050
    a = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", SRC, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"], capture_output=True).stdout, np.int16).astype(np.float32) / 32768
    hop, nf = 512, 2048
    n = max(1, (len(a) - nf) // hop)
    win = np.hanning(nf).astype(np.float32)
    rms = np.array([np.sqrt(np.mean(a[i * hop:i * hop + nf] ** 2) + 1e-10) for i in range(n)])
    db = 20 * np.log10(rms)
    tt = np.arange(n) * hop / SR
    spec = np.abs(np.fft.rfft(np.stack([a[i * hop:i * hop + nf] * win for i in range(n)]), axis=1)) if n > 2 else np.zeros((1, nf // 2 + 1))
    lg = np.log1p(spec * 10)
    flux = np.maximum(0, np.diff(lg, axis=0)).sum(1); flux = np.concatenate([[0], flux])
    hf = np.maximum(0, np.diff(lg[:, spec.shape[1] // 6:], axis=0)).sum(1); hf = np.concatenate([[0], hf])
    # speech vs gaps
    inspeech = np.zeros(n, bool)
    if words:
        for s0, s1 in segs: inspeech[(tt >= s0) & (tt <= s1)] = True
    gap = ~inspeech & (tt > .3) & (tt < DUR - .3)
    sp_db = float(np.median(db[inspeech])) if inspeech.any() else float(np.percentile(db, 80))
    gap_db = float(np.median(db[gap])) if gap.sum() > 10 else None
    # onset periodicity (music has a steady pulse)
    env = flux - np.convolve(flux, np.ones(20) / 20, "same"); env = np.maximum(env, 0)
    ac = np.correlate(env - env.mean(), env - env.mean(), "full")[len(env) - 1:]
    lo, hi = int(.3 * SR / hop), int(1.0 * SR / hop)
    period = float(ac[lo:hi].max() / ac[0]) if ac[0] > 0 and hi < len(ac) else 0
    rel = None if gap_db is None else gap_db - sp_db
    music_score = (0 if rel is None else np.clip((rel + 32) / 16, 0, 1)) * .65 + np.clip((period - .1) / .3, 0, 1) * .35
    if not words: music_score = max(music_score, np.clip((period - .1) / .3, 0, 1))
    bpm = None
    try:
        bj = os.path.join(OUT, "beats.json")
        r = subprocess.run([sys.executable, "-I", os.path.join(HERE, "beats.py"), SRC, "-o", bj], capture_output=True, text=True, timeout=180)
        if r.returncode == 0: bpm = json.load(open(bj)).get("bpm")
    except Exception: pass
    # transients: strong broadband jumps (whoosh / pop / hit), min 0.25 s apart
    med = np.median(hf); mad = np.median(np.abs(hf - med)) + 1e-6
    cand = [i for i in range(1, n - 1) if hf[i] > med + 9 * mad and hf[i] >= hf[i - 1] and hf[i] >= hf[i + 1]]
    cand = sorted(cand, key=lambda i: -hf[i])
    tr = []
    for i in cand:
        if all(abs(tt[i] - x) > .25 for x in tr): tr.append(float(tt[i]))
        if len(tr) >= 24: break
    tr.sort()
    near = [r2(x) for x in tr if any(abs(x - c) < .2 for c in cuts)]
    audio.update({"speech_db": r2(sp_db), "gap_db": None if gap_db is None else r2(gap_db), "pulse": r2(period), "music_score": r2(music_score),
                  "music_likely": bool(music_score > .45), "bpm": bpm, "transients": [r2(x) for x in tr], "transients_on_cuts": near,
                  "loudness_db": r2(np.percentile(db, 95))})

an = {
    "src": os.path.basename(SRC), "duration": r2(DUR), "width": W, "height": H, "fps": r2(FPS), "aspect": "9:16" if VERT else "16:9" if W / H > 1.5 else f"{W}:{H}",
    "cuts": cuts, "n_cuts": len(cuts), "cut_rate_per_min": r2(len(cuts) / DUR * 60), "avg_shot_s": r2(shots.mean()), "min_shot_s": r2(shots.min()), "max_shot_s": r2(shots.max()),
    "motion": r2(motion), "look": look, "palette": palette, "accents": accents, "text_zones": text_zones,
    "transcript": {"lang": lang, "n_words": len(words), "text": " ".join(w["w"] for w in words)[:3000],
                   "words_per_min": r2(len(words) / DUR * 60) if words else 0},
    "speech_ratio": r2(speech / DUR) if DUR else 0, "audio": audio,
    "sheets": sheets, "text_zones_image": crop_file, "keyframes": len(kf),
    "notes": "Heuristic numbers (numpy). Look at the contact sheets for the real look.",
}
json.dump(an, open(os.path.join(OUT, "analysis.json"), "w"), ensure_ascii=False, indent=1)
say(1, f"Xong: {len(cuts)} cắt cảnh, {len(sheets)} contact sheet, {len(words)} từ")
