"""Tight silence cut (reference: gaps <= 0.16 s) + optional removal of repeated takes.

usage: python cut.py <raw.mp4> <words.json> <out_dir> [--drop 12-30,88-95] [--pad 0.06] [--join 0.12]
  --drop  word-index ranges (inclusive) to delete, e.g. a fluffed take you re-said later.
Writes out_dir/aroll.mp4 (30 fps CFR) and out_dir/words.json remapped onto the cut timeline.
"""
import argparse
import json
import os
import subprocess

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("words")
ap.add_argument("out_dir")
ap.add_argument("--drop", default="")
ap.add_argument("--pad", type=float, default=0.06)
ap.add_argument("--join", type=float, default=0.12)
ap.add_argument("--fps", type=int, default=30)
a = ap.parse_args()

words = json.load(open(a.words))
drop = set()
for r in filter(None, a.drop.split(",")):
    lo, hi = (int(x) for x in r.split("-"))
    drop.update(range(lo, hi + 1))
kept = [(i, w) for i, w in enumerate(words) if i not in drop]

# Speech islands: each word padded, merged when the gap is shorter than --join.
spans = []
for _, w in kept:
    s, e = max(0.0, w["s"] - a.pad), w["e"] + a.pad
    if spans and s - spans[-1][1] <= a.join:
        spans[-1][1] = max(spans[-1][1], e)
    else:
        spans.append([s, e])

# Remap word times onto the concatenated timeline.
out_words, si = [], 0
starts, acc = [], 0.0
for s, e in spans:
    starts.append(acc)
    acc += e - s
for _, w in kept:
    while not (spans[si][0] <= w["s"] + 1e-6 <= spans[si][1]):
        si += 1
    off = starts[si] - spans[si][0]
    out_words.append({"w": w["w"], "s": round(w["s"] + off, 3), "e": round(w["e"] + off, 3)})

def probe(entries, sel=None):
    cmd = ["ffprobe", "-v", "error", *(["-select_streams", sel] if sel else []), "-show_entries", entries, "-of", "csv=p=0", a.src]
    return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()


# No speech found (silent / music-only clip): keep the whole clip instead of an empty select.
if not spans:
    acc = float(probe("format=duration") or 0)
    spans = [[0.0, acc]]
# Audio-less source: cut a generated silent track alongside so aroll.mp4 always has an audio stream.
has_audio = bool(probe("stream=index", "a"))
expr = "+".join(f"between(t,{s:.3f},{e:.3f})" for s, e in spans)
# Force CFR first: phone footage is often VFR and N/FRAME_RATE would then drift.
vf = f"fps={a.fps},select='{expr}',setpts=N/{a.fps}/TB"
af = f"aselect='{expr}',asetpts=N/SR/TB"
os.makedirs(a.out_dir, exist_ok=True)
script = os.path.join(a.out_dir, "cut_filter.txt")
open(script, "w").write(f"[0:v]{vf}[v];[{0 if has_audio else 1}:a]{af}[a]")
silence = [] if has_audio else ["-f", "lavfi", "-t", f"{float(probe('format=duration') or acc):.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.src, *silence, "-/filter_complex", script, "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-crf", "16", "-preset", "fast", "-c:a", "aac", "-b:a", "192k", os.path.join(a.out_dir, "aroll.mp4")], check=True)
json.dump(out_words, open(os.path.join(a.out_dir, "words.json"), "w"), ensure_ascii=False, indent=1)
print(f"{len(spans)} spans, {acc:.2f}s kept, {len(drop)} words dropped")
