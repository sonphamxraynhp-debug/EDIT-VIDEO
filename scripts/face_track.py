"""Face-centre track over time, for auto-reframe (clip.reframe) and multi-aspect export (references/reframe-dub.md).

usage: python face_track.py <video | frames_dir> [--fps 5] [--src-fps 30] [--from 0] [--to END] [--out track.json]
Detector: YuNet (assets/models/face_detection_yunet_2023mar.onnx, MIT, OpenCV Zoo) run with onnxruntime, fully offline.
Per sample keeps the face that is big, confident and close to the previous one; detects hard cuts (frame difference)
and never pans across a cut; missing detections are interpolated/held; then a dead-zone ("camera operator") plus a
zero-phase critically-damped smoother removes jitter. Prints/writes
  {"w","h","fps","found","cuts":[t…],"keys":[{"t","ox","oy","fs"}]}   ox/oy = face centre in % of the source, fs = face height %.
"""
import argparse
import glob
import json
import os
import subprocess
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.path.join(SKILL, "assets/models/face_detection_yunet_2023mar.onnx")
N = 640


def frames_from_video(path, fps, t0, t1):
    pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                                    "-of", "json", path], capture_output=True, text=True, check=True).stdout)
    W, H = pr["streams"][0]["width"], pr["streams"][0]["height"]
    t1 = t1 if t1 is not None else float(pr["format"]["duration"])
    sc = N / max(W, H)
    w, h = max(2, int(W * sc) // 2 * 2), max(2, int(H * sc) // 2 * 2)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", str(t0), "-to", str(t1), "-i", path, "-vf", f"fps={fps},scale={w}:{h}",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    i, sz = 0, w * h * 3
    while True:
        b = p.stdout.read(sz)
        if len(b) < sz:
            break
        yield W, H, t0 + i / fps, np.frombuffer(b, np.uint8).reshape(h, w, 3)
        i += 1
    p.wait()


def frames_from_dir(d, fps, src_fps, t0, t1):
    files = sorted(glob.glob(os.path.join(d, "*.jpg")) + glob.glob(os.path.join(d, "*.png")))
    if not files:
        raise SystemExit(f"không có khung hình trong {d}")
    t1 = t1 if t1 is not None else len(files) / src_fps
    W, H = Image.open(files[0]).size
    sc = N / max(W, H)
    t = t0
    while t < t1:
        n = min(len(files) - 1, int(t * src_fps + 1e-6))
        im = Image.open(files[n]).convert("RGB").resize((max(2, int(W * sc)), max(2, int(H * sc))))
        yield W, H, t, np.asarray(im)
        t += 1 / fps


class YuNet:
    def __init__(self):
        o = ort.SessionOptions()
        o.log_severity_level = 3
        self.s = ort.InferenceSession(MODEL, o, providers=["CPUExecutionProvider"])
        self.names = [x.name for x in self.s.get_outputs()]

    def __call__(self, rgb, thr=0.6):
        h, w = rgb.shape[:2]
        x = np.zeros((N, N, 3), np.float32)
        x[:h, :w] = rgb[:, :, ::-1]  # BGR, 0..255, letterboxed top-left
        out = dict(zip(self.names, self.s.run(None, {"input": x.transpose(2, 0, 1)[None]})))
        dets = []
        for st in (8, 16, 32):
            cols = N // st
            cls, obj, bb = out[f"cls_{st}"][0, :, 0], out[f"obj_{st}"][0, :, 0], out[f"bbox_{st}"][0]
            sc = np.sqrt(np.clip(cls, 0, 1) * np.clip(obj, 0, 1))
            for i in np.where(sc > thr)[0]:
                r, c = divmod(int(i), cols)
                cx, cy = (c + bb[i, 0]) * st, (r + bb[i, 1]) * st
                bw, bh = np.exp(bb[i, 2]) * st, np.exp(bb[i, 3]) * st
                dets.append((cx / w, cy / h, bw / w, bh / h, float(sc[i])))
        dets.sort(key=lambda d: -d[4])
        keep = []
        for d in dets:  # NMS
            if all(iou(d, k) < 0.3 for k in keep):
                keep.append(d)
        return keep


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0] - a[2] / 2, a[1] - a[3] / 2, a[0] + a[2] / 2, a[1] + a[3] / 2
    bx0, by0, bx1, by1 = b[0] - b[2] / 2, b[1] - b[3] / 2, b[0] + b[2] / 2, b[1] + b[3] / 2
    iw, ih = max(0, min(ax1, bx1) - max(ax0, bx0)), max(0, min(ay1, by1) - max(ay0, by0))
    u = a[2] * a[3] + b[2] * b[3] - iw * ih
    return iw * ih / u if u > 0 else 0


def damp(x, tau, fps):
    """Zero-phase critically-damped smoothing (2 cascaded one-poles, run forward then backward)."""
    if len(x) < 3:
        return x
    a = 1 - np.exp(-1 / (tau * fps))
    y = np.array(x, float)
    for _ in range(2):
        for rng in (range(1, len(y)), range(len(y) - 2, -1, -1)):
            prev = rng.start - (1 if rng.step > 0 else -1)
            for i in rng:
                y[i] = y[prev] + a * (y[i] - y[prev])
                prev = i
    return y


def deadzone(x, dz):
    """Hold the framing until the face leaves a ±dz window, then follow (like a camera operator)."""
    y, hold = [], x[0]
    for v in x:
        if abs(v - hold) > dz:
            hold = v - np.sign(v - hold) * dz
        y.append(hold)
    return np.array(y)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--fps", type=float, default=5)
    ap.add_argument("--src-fps", type=float, default=30)
    ap.add_argument("--from", dest="t0", type=float, default=0)
    ap.add_argument("--to", dest="t1", type=float)
    ap.add_argument("--tau", type=float, default=0.45, help="smoothing time constant (s)")
    ap.add_argument("--out")
    a = ap.parse_args()
    if not os.path.exists(MODEL):
        raise SystemExit(f"thiếu model nhận diện mặt {MODEL}")
    det = YuNet()
    gen = frames_from_dir(a.src, a.fps, a.src_fps, a.t0, a.t1) if os.path.isdir(a.src) else frames_from_video(a.src, a.fps, a.t0, a.t1)
    ts, faces, thumbs, W, H = [], [], [], 1, 1
    prev = None
    for W, H, t, rgb in gen:
        ds = det(rgb)
        pick = None
        ds = [d for d in ds if 0.04 < d[3] < 0.8 and d[2] < 0.8]  # drop specks (faces in thumbnails) and bogus giants
        if ds:
            # biggest confident face, strongly preferring the one we were following
            pick = max(ds, key=lambda d: d[3] * d[4] * (np.exp(-np.hypot(d[0] - prev[0], d[1] - prev[1]) / 0.2) if prev else 1))
            prev = pick
        ts.append(t)
        faces.append(pick)
        g = np.asarray(Image.fromarray(rgb).convert("L").resize((32, 18)), np.float32)
        thumbs.append(g)
        if len(ts) % 25 == 0:
            print(f"face {t:.1f}s", file=sys.stderr, flush=True)
    if not ts:
        raise SystemExit("không đọc được khung hình nào")
    # hard cuts = big jump in the tiny grayscale thumbnail
    cut_idx = [i for i in range(1, len(ts)) if np.abs(thumbs[i] - thumbs[i - 1]).mean() > 38]
    bounds = [0, *cut_idx, len(ts)]
    xs, ys, ss = np.full(len(ts), np.nan), np.full(len(ts), np.nan), np.full(len(ts), np.nan)
    for i, f in enumerate(faces):
        if f:
            xs[i], ys[i], ss[i] = f[0], f[1], f[3]
    last = (0.5, 0.42, 0.25)
    for s0, s1 in zip(bounds, bounds[1:]):
        seg = slice(s0, s1)
        for arr, dflt, dz in ((xs, 0, 0.03), (ys, 1, 0.04), (ss, 2, 0.03)):
            v = arr[seg]
            ok = ~np.isnan(v)
            if ok.any():
                idx = np.arange(len(v))
                v = np.interp(idx, idx[ok], v[ok])  # gaps: interpolate inside, hold at the ends
                v = damp(deadzone(v, dz), a.tau, a.fps)
            else:
                v = np.full(len(v), last[dflt])  # no face in this shot: hold the previous framing
            arr[seg] = v
        last = (xs[s1 - 1], ys[s1 - 1], ss[s1 - 1])
    keys = []
    for i, t in enumerate(ts):
        if i in cut_idx:  # snap at the cut instead of panning across it
            keys.append({"t": round(t - 0.001, 3), "ox": keys[-1]["ox"], "oy": keys[-1]["oy"], "fs": keys[-1]["fs"]})
        keys.append({"t": round(t, 3), "ox": round(float(xs[i]) * 100, 2), "oy": round(float(ys[i]) * 100, 2), "fs": round(float(ss[i]) * 100, 1)})
    res = {"w": W, "h": H, "fps": a.fps, "found": round(sum(f is not None for f in faces) / len(faces), 3),
           "cuts": [round(ts[i], 3) for i in cut_idx], "keys": keys}
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        json.dump(res, open(a.out, "w"))
        print(f"face track: {len(keys)} keys, mặt thấy ở {res['found'] * 100:.0f}% mẫu, {len(cut_idx)} cắt cảnh -> {a.out}")
    else:
        print(json.dumps(res))


if __name__ == "__main__":
    main()
