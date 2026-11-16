"""Folder of photos + music -> ready-to-render beat-synced project (pack `beatslide`, no voice).

usage:
  python -I scripts/beat_project.py <images_dir> <project_dir> [--music hype|<file.mp3>] [--dur 20]
         [--mode scene|clips] [--every 0 (auto)] [--horizontal] [--title "The *Riverside*"] [--sub "…"]
         [--labels "Phòng khách,Phòng ngủ,…"] [--fit cover|blurfill|contain] [--no-intro] [--no-outro] [--bars] [--offset auto|<s>]
then:
  python -I scripts/mix_audio.py <project_dir>/timeline.json
  node scripts/render.mjs <project_dir>/timeline.json out.mp4

What it does
  1. Music: --music is a library mood (assets/music/<mood>.mp3) or a file. beats.py analyses it.
  2. Offset: the music starts at its first strong downbeat (minus 1 beat of lead-in for the intro) so the
     first cut lands on "the one". Every beat time is shifted into OUTPUT time and stored in timeline.beats.
  3. Cut grid: every N beats, N chosen so a photo stays >= ~0.85 s (128 BPM -> every 2 beats).
     The intro takes 1 bar, the outro 2 bars; the total is snapped to a downbeat near --dur.
  4. --mode scene (default): one `beat_slideshow` scene (Ken Burns + per-cut zoom/slide/flash/glitch,
     labels, counter) between `beat_intro` and `beat_outro`, optional `beat_bars`.
     --mode clips: the photos become TL.clips (main track, each clip = one beat interval, transition on the
     cut cycling zoom/slide_l/flash/glitch) — editable as clips in Studio; intro/outro stay scenes on top.
  Images are referenced relative to the project dir (copied into <project>/media/ when outside it).
"""
import importlib.util
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
spec = importlib.util.spec_from_file_location("beats", os.path.join(HERE, "beats.py"))
beats_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(beats_mod)

EXT = (".jpg", ".jpeg", ".png", ".webp")


def main(argv):
    if len(argv) < 2 or argv[0].startswith("-"):
        print(__doc__)
        return
    img_dir, proj = argv[0], argv[1]
    opt = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    flag = lambda k: k in argv
    music = opt("--music", "hype")
    want = float(opt("--dur", 20))
    mode = opt("--mode", "scene")
    horiz = flag("--horizontal")
    os.makedirs(os.path.join(proj, "work"), exist_ok=True)

    imgs = sorted(f for f in os.listdir(img_dir) if f.lower().endswith(EXT))
    if not imgs:
        sys.exit(f"no images in {img_dir}")
    rel = []
    for f in imgs:
        src = os.path.abspath(os.path.join(img_dir, f))
        if not src.startswith(os.path.abspath(proj) + os.sep):
            os.makedirs(os.path.join(proj, "media"), exist_ok=True)
            dst = os.path.join(proj, "media", f)
            if not os.path.exists(dst):
                shutil.copy(src, dst)
            src = dst
        rel.append(os.path.relpath(src, proj))
    labels = [x.strip() for x in opt("--labels", "").split(",") if x.strip()] or None

    mfile = music if os.path.isfile(music) else os.path.join(SKILL, "assets", "music", music + ".mp3")
    if not os.path.isfile(mfile):
        sys.exit(f"music not found: {music}")
    A = beats_mod.analyse(mfile, 0, want + 25)
    bpm, ibi = A["bpm"], 60.0 / A["bpm"]
    # first downbeat after 0.3 s, lead-in of one beat for the intro logo
    downs = [d for d in A["downbeats"] if d > 0.3] or A["downbeats"]
    off = opt("--offset", "auto")
    offset = max(0.0, downs[0] - ibi) if off == "auto" else float(off)
    shift = lambda arr: [round(x - offset, 3) for x in arr if x - offset >= -1e-3]
    beats, down = shift(A["beats"]), shift(A["downbeats"])
    lv = A["levels"][int(offset * A["fps"]):]
    # total: snap to the downbeat nearest the requested duration (+ a short tail)
    end = min(down, key=lambda d: abs(d - want)) if down else want
    dur = round(end + 0.4, 3)

    every = int(opt("--every", 0)) or max(1, round(0.85 / ibi))
    intro_end = down[1] if (len(down) > 1 and not flag("--no-intro")) else 0.0
    outro_t = dur - 0.4 - (8 if want >= 16 else 4) * ibi if not flag("--no-outro") else dur
    outro_t = min(down, key=lambda d: abs(d - outro_t)) if not flag("--no-outro") else dur
    cuts = [b for b in beats if intro_end - 1e-3 <= b < outro_t - 0.2]
    cuts = cuts[::every]
    if not cuts or cuts[0] > intro_end + 1e-3:
        cuts = [intro_end] + cuts

    B = {"bpm": bpm, "beats": beats, "downbeats": down, "levels": lv, "fps": A["fps"]}
    tl = {
        "width": 1280 if horiz else 1080, "height": 720 if horiz else 1920, "fps": 30, "duration": dur,
        "caption_style": "none", "captions": [], "scenes": [], "beats": B,
        "brand": {},
        "audio": {"music": [{"t0": 0, "t1": dur, "file": os.path.relpath(mfile, proj) if not os.path.isabs(music) and os.path.isfile(music) else mfile,
                             "offset": round(offset, 3), "gain": -6}], "sfx": [], "mix": "work/mix.wav", "duck": False},
    }
    title = opt("--title", "Bộ sưu tập *mới*")
    sc = tl["scenes"]
    # portrait photos in a landscape video (or the reverse) -> letterbox on a blurred copy instead of a heavy crop
    fit = opt("--fit", "blurfill" if horiz else "cover")
    if intro_end > 0:
        sc.append({"type": "beat_intro", "t0": 0, "t1": intro_end, "title": title, "tag": opt("--tag", "GIỚI THIỆU"),
                   "sub": opt("--sub", ""), "image": rel[0], "cid": "bi"})
    if mode == "clips":
        trans = ["zoom", "slide_l", "flash", "glitch"]
        clips, prev = [], 0.0
        # Clip 0 runs under the intro; each later clip starts exactly on a cut beat.
        pts = [0.0] + [c for c in cuts if c > 0] + [outro_t]
        for i in range(len(pts) - 1):
            d = round(pts[i + 1] - pts[i], 3)
            if d <= 0.02:
                continue
            c = {"src": rel[i % len(rel)], "in": 0, "out": d, "fit": fit}
            if i > 0:
                c["transition"] = {"type": trans[(i - 1) % 4], "dur": 0.25 if trans[(i - 1) % 4] != "flash" else 0.2}
            clips.append(c)
        clips.append({"src": rel[-1], "in": 0, "out": round(dur - outro_t, 3), "fit": fit})
        tl["clips"] = clips
    else:
        sc.append({"type": "beat_slideshow", "t0": intro_end, "t1": outro_t, "images": rel, "labels": labels,
                   "every": every, "trans": "mix", "fit": fit, "cid": "bs"})
    if flag("--bars"):
        sc.append({"type": "beat_bars", "t0": intro_end, "t1": outro_t, "mode": "bars", "h": 56, "opacity": .5, "n": 48, "y": 1240 if not horiz else 700, "cid": "bb"})
    if outro_t < dur:
        sc.append({"type": "beat_outro", "t0": outro_t, "t1": dur, "image": rel[-1], "name": opt("--name", "Liên hệ *ngay*"),
                   "phone": opt("--phone", "0909 123 456"), "website": opt("--website", ""), "cid": "bo"})
    out = os.path.join(proj, "timeline.json")
    json.dump(tl, open(out, "w"), ensure_ascii=False, indent=1)
    print(f"bpm {bpm}  offset {offset:.3f}s  every {every} beat(s)  cuts {len(cuts)}  dur {dur}s  mode {mode}  -> {out}")
    print("cuts:", [round(c, 3) for c in cuts])


if __name__ == "__main__":
    main(sys.argv[1:])
