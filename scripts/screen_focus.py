"""Screen recording -> auto zoom/pan focus keys + click guesses for the `screencast` pack (sc_screen / sc_click / sc_cursor).

usage:
  python -I scripts/screen_focus.py <frames_dir | video.mp4> [-o focus.json] [--fps 30] [--zoom-max 1.8]
         [--min-dwell 0.45] [--idle 1.6] [--lead 0.15] [--thresh 14] [--offset 0]
  frames_dir: *.jpg/*.png sorted by name, captured at --fps. A video is decoded with ffmpeg at --fps.
  --offset: add this many seconds to every output time (when the recording starts later on the timeline).

Output (times in seconds, x/y in SCREEN pixels of the recording):
  {"sw":1280, "sh":800, "fps":30, "dur":8.3,
   "focus":  [{"t":0, "x":640, "y":400, "s":1}, {"t":0.65, "x":420, "y":210, "s":1.9}, …],   -> sc_screen.focus
   "clicks": [{"t":0.8, "x":350, "y":178}, …],                                                -> sc_click.clicks
   "cursor": [{"t":0.45, "x":350, "y":178}, …],                                               -> sc_cursor.keys
   "activity": [{"t0":0.8,"t1":2.3,"box":[x0,y0,x1,y1]}, …]}

Method:
  1. Frames -> grey 320 px wide; |frame - previous| > thresh => change mask (dilated, tiny specks removed).
  2. Per frame: changed-pixel count + bounding box of the change.
  3. Activity segments: frames with change are grouped while gaps < idle s and split on a new onset (after >= 0.15 s
     of stillness) away from the recent work; a short reaction followed by work inside it is merged; within a segment the box is the
     union of the boxes seen in a sliding 0.5 s window (smooths typing / caret blinks), and the segment's
     focus target is the median centre of those boxes.
  4. Focus keys: one key per segment whose dwell (time until the next segment) >= min-dwell, framed on its
     narrow boxes (wide focus rings ignored), arriving
     `lead` s before the activity starts (sc_screen eases into each key over ~0.8 s ending at key.t).
     Zoom s = fit the activity box * 2.2 margin into the screen, clamped 1..zoom-max. A large change
     (> 45 % of the screen, e.g. a page navigation or modal) zooms out to s = 1. Idle > idle s -> back to s = 1.
  5. Click guesses: a change ONSET after >= 0.25 s of stillness whose area is small (0.05 %..6 % of the screen):
     the localised reaction to a click (focus ring, button press, checkbox). Position = centre of that box.
     Cursor keys: arrive at each click 0.35 s early.
"""
import glob
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage


def load_frames(src, fps):
    if os.path.isdir(src):
        files = sorted(glob.glob(os.path.join(src, "*.jpg")) + glob.glob(os.path.join(src, "*.png")))
        return files, None
    tmp = tempfile.mkdtemp(prefix="scfocus_")
    subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vf", f"fps={fps}", os.path.join(tmp, "%05d.jpg")], check=True)
    return sorted(glob.glob(os.path.join(tmp, "*.jpg"))), tmp


def analyse(src, fps=30, zoom_max=1.8, min_dwell=0.45, idle=1.6, lead=0.15, thresh=14, offset=0.0):
    files, _ = load_frames(src, fps)
    if len(files) < 2:
        raise SystemExit("need at least 2 frames")
    im0 = Image.open(files[0])
    sw, sh = im0.size
    w = 320
    h = max(2, round(sh * w / sw))
    sx, sy = sw / w, sh / h
    grab = lambda f: np.asarray(Image.open(f).convert("L").resize((w, h), Image.BILINEAR), dtype=np.int16)
    prev = grab(files[0])
    area_px = w * h
    per = []  # (count, union box, main box) per frame index i (change between i-1 and i)
    per.append((0, None, None))
    for f in files[1:]:
        cur = grab(f)
        diff = np.abs(cur - prev)
        m = diff > thresh
        m = ndimage.binary_dilation(m, iterations=2)
        lab, n = ndimage.label(m)
        cnt, box, main = 0, None, None
        if n:
            idx = list(range(1, n + 1))
            sizes = np.array(ndimage.sum(m, lab, idx))
            inten = np.array(ndimage.mean(diff, lab, idx))
            ok = sizes >= 6
            if ok.any():
                keep = np.isin(lab, 1 + np.nonzero(ok)[0])
                cnt = int(keep.sum())
                ys, xs = np.nonzero(keep)
                box = [xs.min() * sx, ys.min() * sy, (xs.max() + 1) * sx, (ys.max() + 1) * sy]
                # main component = strongest reaction (contrast x sqrt(size)): a button turning solid beats a faint focus ring
                score = np.where(ok, inten * np.sqrt(sizes), -1)
                k = int(np.argmax(score)) + 1
                sl = ndimage.find_objects((lab == k).astype(int))[0]
                main = [sl[1].start * sx, sl[0].start * sy, sl[1].stop * sx, sl[0].stop * sy]
        per.append((cnt, box, main))
        prev = cur
    N = len(per)
    dur = N / fps
    T = lambda i: round(i / fps + offset, 3)

    # --- click guesses: localised onset after stillness ---
    quiet = int(0.25 * fps)
    clicks, last_big = [], -1e9
    def inside(b, B, pad=12):
        return b[0] >= B[0] - pad and b[1] >= B[1] - pad and b[2] <= B[2] + pad and b[3] <= B[3] + pad
    for i in range(1, N):
        cnt, box, main = per[i]
        if not cnt:
            continue
        frac = cnt / area_px
        if frac > .45:
            last_big = i
            continue
        still = all(per[j][0] == 0 for j in range(max(0, i - quiet), i))
        if not (still and 0.0005 < frac < 0.12):
            continue
        if i - last_big < .7 * fps:          # typing into a modal that just opened
            continue
        cx, cy = (main[0] + main[2]) / 2, (main[1] + main[3]) / 2
        if clicks and frac < .02 and i / fps - (clicks[-1]["t"] - offset) < 1.0 and abs(cx - clicks[-1]["x"]) < sw * .25 and abs(cy - clicks[-1]["y"]) < sh * .05:
            continue                          # first keystroke after clicking a field: not a click
        # a wide target (text field focus ring): the caret / first typed glyph shows where the click was
        if (main[2] - main[0]) > 4 * (main[3] - main[1]):
            for j in range(i + 1, min(N, i + int(.8 * fps))):
                if per[j][0] and per[j][0] / area_px < .004 and inside(per[j][2], box):
                    cx, cy = (per[j][2][0] + per[j][2][2]) / 2, (per[j][2][1] + per[j][2][3]) / 2
                    break
        clicks.append({"t": T(i), "x": round(cx), "y": round(cy)})

    # --- activity segments ---
    gap = int(idle * fps)
    segs, cur = [], None
    for i in range(N):
        cnt, box, _ = per[i]
        if not cnt:
            continue
        if cur and i - cur["last"] <= gap:
            cur["last"] = i
            cur["items"].append((i, cnt, per[i][2] if cnt / area_px < .45 else box))
        else:
            cur = {"first": i, "last": i, "items": [(i, cnt, per[i][2] if cnt / area_px < .45 else box)]}
            segs.append(cur)
    # split segments when the change jumps far away (e.g. typing in field A, then clicking button B)
    out = []
    for sg in segs:
        part = [sg["items"][0]]
        for it in sg["items"][1:]:
            b = it[2]
            recent = [q[2] for q in part if q[0] >= part[-1][0] - .5 * fps]
            rb = [min(q[0] for q in recent), min(q[1] for q in recent), max(q[2] for q in recent), max(q[3] for q in recent)]
            big = it[1] / area_px > .45
            overlap = not (b[2] < rb[0] - 8 or b[0] > rb[2] + 8 or b[3] < rb[1] - 8 or b[1] > rb[3] + 8)
            onset = (it[0] - part[-1][0]) / fps >= .15
            if (onset and not overlap) or big != (part[-1][1] / area_px > .45):
                out.append(part)
                part = []
            part.append(it)
        out.append(part)
    # a short reaction (focus ring) followed quickly by work inside it (typing) = one focus segment that starts
    # at the reaction but is framed on the work
    merged = []
    for part in out:
        if merged:
            A = merged[-1]
            a_items = A["items"] if isinstance(A, dict) else A
            a_box = [min(b[0] for _, _, b in a_items), min(b[1] for _, _, b in a_items), max(b[2] for _, _, b in a_items), max(b[3] for _, _, b in a_items)]
            short = (a_items[-1][0] - a_items[0][0]) / fps < .3
            near = (part[0][0] - a_items[-1][0]) / fps < .6
            if short and near and inside(part[0][2], a_box, 16) and not (a_items[0][1] / area_px > .45):
                merged[-1] = {"start": a_items[0][0], "items": part}
                continue
        merged.append(part)
    out = [m if isinstance(m, dict) else {"start": m[0][0], "items": m} for m in merged]

    activity, focus = [], [{"t": round(offset, 3), "x": sw // 2, "y": sh // 2, "s": 1}]
    win = int(0.5 * fps)
    for n_p, P in enumerate(out):
        part = P["items"]
        i0, i1 = P["start"], part[-1][0]
        boxes = [b for _, _, b in part]
        # frame on the work, not on wide reactions (focus rings spanning a whole form row)
        narrow = [b for b in boxes if b[2] - b[0] < sw * .5]
        if narrow and len(narrow) < len(boxes):
            boxes = narrow
        big = max(c for _, c, _ in part) / area_px > .45
        # smoothed union boxes over a sliding window, median of their centres
        cs, ws, hs = [], [], []
        for k in range(len(boxes)):
            bb = np.array(boxes[max(0, k - win): k + 1])
            u = [bb[:, 0].min(), bb[:, 1].min(), bb[:, 2].max(), bb[:, 3].max()]
            cs.append(((u[0] + u[2]) / 2, (u[1] + u[3]) / 2))
            ws.append(u[2] - u[0])
            hs.append(u[3] - u[1])
        cx, cy = float(np.median([c[0] for c in cs])), float(np.median([c[1] for c in cs]))
        bw, bh = max(np.percentile(ws, 80), sw * .12), max(np.percentile(hs, 80), sh * .08)
        s = 1.0 if big else float(np.clip(min(sw / (bw * 2.2), sh / (bh * 2.2)), 1, zoom_max))
        U = np.array(boxes)
        activity.append({"t0": T(i0), "t1": T(i1 + 1), "box": [round(U[:, 0].min()), round(U[:, 1].min()), round(U[:, 2].max()), round(U[:, 3].max())],
                         "big": big})
        t_key = max(0.0, i0 / fps - lead) + offset
        last = focus[-1]
        # dwell = how long the camera could stay here (until the next activity, or end + idle)
        nxt = out[n_p + 1]["start"] if n_p + 1 < len(out) else min(N, i1 + idle * fps)
        if (nxt - i0) / fps < min_dwell and not big:
            continue
        # idle gap before this segment: return to overview halfway
        if len(activity) > 1 and (i0 / fps + offset) - activity[-2]["t1"] > idle and last["s"] > 1:
            focus.append({"t": round(activity[-2]["t1"] + idle * .6, 3), "x": sw // 2, "y": sh // 2, "s": 1})
            last = focus[-1]
        if abs(cx - last["x"]) < sw * .06 and abs(cy - last["y"]) < sh * .06 and abs(s - last["s"]) < .2:
            continue
        if t_key <= last["t"] + .4:
            t_key = last["t"] + .4
        focus.append({"t": round(t_key, 3), "x": round(cx), "y": round(cy), "s": round(s, 2)})
    if activity and dur + offset - activity[-1]["t1"] > idle and focus[-1]["s"] > 1:
        focus.append({"t": round(activity[-1]["t1"] + idle * .6, 3), "x": sw // 2, "y": sh // 2, "s": 1})
    cursor = [{"t": round(max(0, c["t"] - .35), 3), "x": c["x"], "y": c["y"]} for c in clicks]
    return {"sw": sw, "sh": sh, "fps": fps, "dur": round(dur, 3), "focus": focus, "clicks": clicks, "cursor": cursor, "activity": activity}


def main(argv):
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return
    opt = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    r = analyse(argv[0], float(opt("--fps", 30)), float(opt("--zoom-max", 1.8)), float(opt("--min-dwell", .45)),
                float(opt("--idle", 1.6)), float(opt("--lead", .15)), float(opt("--thresh", 14)), float(opt("--offset", 0)))
    out = opt("-o")
    if out:
        json.dump(r, open(out, "w"), indent=1)
        print(f"{r['sw']}x{r['sh']}  {r['dur']}s  focus {len(r['focus'])}  clicks {len(r['clicks'])}  -> {out}")
    else:
        print(json.dumps(r, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:])
