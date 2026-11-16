"""Person cutouts (RGBA PNG) for background-swap scenes: slam_bg, orbit, mood happy, mega behind.

usage: python segment.py <frames_dir> <cutouts_dir> --ranges 0-2.6,27.3-27.8 [--fps 30] [--model u2net_human_seg]
Only frames inside --ranges (seconds) are processed; the engine falls back to a soft ellipse elsewhere.
Needs: pip install "rembg[cpu]"
"""
import argparse
import os

from PIL import Image
from rembg import new_session, remove

ap = argparse.ArgumentParser()
ap.add_argument("frames")
ap.add_argument("out")
ap.add_argument("--ranges", required=True)
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--model", default="u2net_human_seg")
a = ap.parse_args()

os.makedirs(a.out, exist_ok=True)
sess = new_session(a.model)
todo = set()
for r in a.ranges.split(","):
    s, e = (float(x) for x in r.split("-"))
    todo.update(range(int(s * a.fps) + 1, int(e * a.fps) + 2))
for n in sorted(todo):
    src = os.path.join(a.frames, f"{n:05d}.jpg")
    dst = os.path.join(a.out, f"{n:05d}.png")
    if not os.path.exists(src) or os.path.exists(dst):
        continue
    remove(Image.open(src), session=sess, post_process_mask=True).save(dst)
print(f"{len(todo)} cutouts -> {a.out}")
