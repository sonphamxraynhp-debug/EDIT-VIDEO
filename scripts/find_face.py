"""Estimate the speaker's face centre for timeline.face (bubble, PIP, hook cutout all anchor on it).

usage: python find_face.py <frames_dir> [--n 5] [--design 720x1280]
Samples n frames, cuts the person out (rembg), finds the head (crown → shoulder line) and
prints {"x","y"} in design-space pixels (frames are mapped to the design canvas, so frame px are rescaled).
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image
from rembg import new_session, remove

ap = argparse.ArgumentParser()
ap.add_argument("frames")
ap.add_argument("--n", type=int, default=5)
ap.add_argument("--design", default="720x1280")
a = ap.parse_args()

DW, DH = (int(v) for v in a.design.split("x"))
files = sorted(glob.glob(os.path.join(a.frames, "*.jpg")))
pick = [files[int(i)] for i in np.linspace(0, len(files) - 1, a.n)] if files else []
sess = new_session("u2net_human_seg")
xs, ys = [], []
for f in pick:
    im = Image.open(f).convert("RGB")
    m = np.array(remove(im, session=sess, only_mask=True)) > 128
    rows = np.where(m.any(1))[0]
    if not len(rows):
        continue
    top = rows[0]
    h = rows[-1] - top
    width = m.sum(1)
    # Shoulder line = first row (below the crown) where the silhouette gets 1.6x wider than the head.
    head_w = np.median(width[top + int(h * .04):top + int(h * .12) + 1])
    below = np.where(width[top + int(h * .08):] > head_w * 1.6)[0]
    sh = top + int(h * .08) + (below[0] if len(below) else int(h * .3))
    cols = np.where(m[top:sh].any(0))[0]
    sx, sy = DW / im.width, DH / im.height
    xs.append((cols[0] + cols[-1]) / 2 * sx)
    ys.append((top + (sh - top) * .62) * sy)  # eyes-nose level
if not xs:
    raise SystemExit("no person found")
print(json.dumps({"x": round(float(np.median(xs))), "y": round(float(np.median(ys)))}))
