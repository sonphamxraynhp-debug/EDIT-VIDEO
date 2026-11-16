"""Beat analysis for the `beatslide` pack: audio (mp3/wav/m4a/mp4) -> {bpm, beats, downbeats, levels}.

usage:
  python -I scripts/beats.py music.mp3 [-o beats.json] [--start 0] [--dur 30] [--bpm-min 60] [--bpm-max 190]
         [--bpm 128]            # force a known tempo (skip estimation, still phase-tracks)
         [--fps 30]             # rate of "levels" (one 0..1 loudness value per video frame)
  python -I scripts/beats.py --test    # runs on the library tracks and compares with assets/music/catalog.json

Output JSON (times in seconds from --start):
  {"bpm": 128.0, "beats": [0.23, 0.70, …], "downbeats": [0.23, 2.11, …], "levels": [0.12, …], "fps": 30, "dur": 30.0}

Method (numpy/scipy only, no librosa):
  1. ffmpeg -> mono 22.05 kHz.  STFT (1024 / hop 256 = 11.6 ms).
  2. Onset strength = spectral flux of log-compressed magnitudes on ~40 log-spaced bands, half-wave rectified,
     minus a 0.4 s moving average (removes slow loudness swells).
  3. Tempo = autocorrelation of the onset envelope; each candidate lag also scores its 2x and 0.5x multiples
     (metrical consistency) and is weighted by a log-Gaussian prior centred on 120 BPM, then refined with
     parabolic interpolation.
  4. Beat tracking = Ellis (2007) dynamic programming: score(t) = onset(t) + max_p [score(p) - a*log((t-p)/P)^2].
  5. Downbeats = the beat phase (0..3) whose beats carry the most low-frequency (< 200 Hz) onset energy (kick).
  6. Levels = RMS per 1/fps s, stretched between the 5th and 98th percentile, gamma 0.8 -> 0..1 (for beat_bars / beat_pulse).
"""
import json
import os
import subprocess
import sys

import numpy as np
from scipy.ndimage import uniform_filter1d
from scipy.signal import get_window

SR, NFFT, HOP = 22050, 1024, 256


def load(path, start=0.0, dur=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", path]
    if dur:
        cmd += ["-t", str(dur)]
    cmd += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def stft_mag(y):
    if len(y) < NFFT:
        y = np.pad(y, (0, NFFT - len(y)))
    n = 1 + (len(y) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    win = get_window("hann", NFFT)
    return np.abs(np.fft.rfft(y[idx] * win, axis=1))  # (frames, bins)


def band_matrix(nb=40, fmin=30.0, fmax=10000.0):
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    edges = np.geomspace(fmin, fmax, nb + 2)
    M = np.zeros((nb, len(freqs)))
    for b in range(nb):
        lo, c, hi = edges[b], edges[b + 1], edges[b + 2]
        up = (freqs - lo) / (c - lo)
        dn = (hi - freqs) / (hi - c)
        M[b] = np.clip(np.minimum(up, dn), 0, None)
    return M, edges[1:-1]


def onset_strength(S):
    M, centres = band_matrix()
    B = np.log1p(100.0 * (S @ M.T))  # (frames, bands), log compression
    flux = np.maximum(0.0, np.diff(B, axis=0, prepend=B[:1]))
    env = flux.sum(axis=1)
    low = flux[:, centres < 200].sum(axis=1)
    fr = SR / HOP
    w = max(3, int(0.4 * fr))
    env = np.maximum(0.0, env - uniform_filter1d(env, w))
    low = np.maximum(0.0, low - uniform_filter1d(low, w))
    env /= (np.percentile(env, 99) + 1e-9)
    low /= (np.percentile(low, 99) + 1e-9)
    return env, low


def estimate_tempo(env, bpm_min=60, bpm_max=190, prior=120.0):
    fr = SR / HOP
    x = env - env.mean()
    n = len(x)
    f = np.fft.rfft(x, 2 * n)
    ac = np.fft.irfft(f * np.conj(f))[:n]
    ac /= ac[0] + 1e-9
    lmin, lmax = int(fr * 60 / bpm_max), int(fr * 60 / bpm_min) + 1
    best, best_s = None, -1e9
    for L in range(max(2, lmin), min(lmax, n // 2 - 1)):
        s = ac[L] + 0.5 * ac[min(2 * L, n - 1)] + 0.25 * ac[min(4 * L, n - 1)]
        if L // 2 >= 2:
            s += 0.25 * ac[L // 2]
        bpm = 60 * fr / L
        s *= np.exp(-0.5 * (np.log2(bpm / prior) / 0.9) ** 2)
        if s > best_s:
            best, best_s = L, s
    L = best
    # parabolic refinement on the raw autocorrelation peak
    if 1 <= L < n - 1:
        a, b, c = ac[L - 1], ac[L], ac[L + 1]
        d = a - 2 * b + c
        off = 0.5 * (a - c) / d if abs(d) > 1e-12 else 0.0
        L = L + float(np.clip(off, -0.5, 0.5))
    return 60 * fr / L


def track_beats(env, bpm, tight=100.0):
    fr = SR / HOP
    P = 60 * fr / bpm
    n = len(env)
    loc = env - env.std() * 0.0
    score = loc.copy()
    back = -np.ones(n, dtype=int)
    lo, hi = int(round(P / 2)), int(round(2 * P))
    for t in range(n):
        p0, p1 = t - hi, t - lo
        if p1 < 0:
            continue
        ps = np.arange(max(0, p0), p1 + 1)
        pen = -tight * np.log((t - ps) / P) ** 2
        cand = score[ps] + pen
        k = int(np.argmax(cand))
        if cand[k] > 0:
            score[t] = loc[t] + cand[k]
            back[t] = ps[k]
    # end on the best-scoring frame in the last beat period
    tail = np.arange(max(0, n - int(P) - 1), n)
    t = int(tail[np.argmax(score[tail])])
    beats = []
    while t >= 0:
        beats.append(t)
        t = back[t]
    beats = np.array(beats[::-1])
    # extend backwards / forwards on the grid when tracking started late or stopped early
    first = beats[0] if len(beats) else 0
    pre = []
    t = first - P
    while t >= 0:
        pre.append(t)
        t -= P
    beats = np.concatenate([np.array(pre[::-1]), beats]) if pre else beats.astype(float)
    return beats / fr


def downbeat_phase(beats, low, env, per_bar=4):
    fr = SR / HOP
    idx = np.clip(np.round(beats * fr).astype(int), 0, len(low) - 1)
    strength = low[idx] * 2 + env[idx]
    best = max(range(per_bar), key=lambda ph: strength[ph::per_bar].mean() if len(strength[ph::per_bar]) else -1)
    return beats[best::per_bar]


def levels(y, fps=30):
    hop = SR / fps
    n = int(len(y) / hop)
    out = np.zeros(n)
    for i in range(n):
        seg = y[int(i * hop): int((i + 1) * hop)]
        out[i] = np.sqrt(np.mean(seg ** 2)) if len(seg) else 0
    # stretch between the quiet floor (5th pct) and loud peaks (98th pct) so bars actually move
    lo, hi = np.percentile(out, 5), np.percentile(out, 98) + 1e-9
    return np.clip((out - lo * .8) / (hi - lo * .8), 0, 1) ** 0.8


def analyse(path, start=0.0, dur=None, bpm_min=60, bpm_max=190, bpm=None, fps=30):
    y = load(path, start, dur)
    S = stft_mag(y)
    env, low = onset_strength(S)
    tempo = bpm or estimate_tempo(env, bpm_min, bpm_max)
    beats = track_beats(env, tempo)
    total = len(y) / SR
    beats = beats[(beats >= 0) & (beats < total - 0.05)]
    # report the tempo of the tracked grid (least-squares slope of beat time vs index: sub-frame accurate)
    if len(beats) > 4 and not bpm:
        tempo = 60.0 / float(np.polyfit(np.arange(len(beats)), beats, 1)[0])
    down = downbeat_phase(beats, low, env)
    r = lambda a: [round(float(v), 3) for v in a]
    return {"bpm": round(float(tempo), 1), "beats": r(beats), "downbeats": r(down),
            "levels": [round(float(v), 3) for v in levels(y, fps)], "fps": fps, "dur": round(total, 3)}


def self_test():
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "music")
    cat = json.load(open(os.path.join(root, "catalog.json")))
    ok = 0
    for e in cat:
        r = analyse(os.path.join(root, e["file"]), 0, 40)
        known = e.get("bpm")
        ratio = r["bpm"] / known if known else 0
        good = known and min(abs(ratio - 1), abs(ratio - 2), abs(ratio - .5)) < .03
        ok += bool(good)
        print(f"{e['file']:<16} known {known:>5}  est {r['bpm']:>6}  beats {len(r['beats']):>3}  "
              f"{'OK' if abs(ratio - 1) < .03 else ('octave' if good else 'MISS')}")
    print(f"{ok}/{len(cat)} within 3% (incl. octave)")


def main(argv):
    if "--test" in argv:
        return self_test()
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return
    opt = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    r = analyse(argv[0], float(opt("--start", 0)), float(opt("--dur")) if opt("--dur") else None,
                float(opt("--bpm-min", 60)), float(opt("--bpm-max", 190)),
                float(opt("--bpm")) if opt("--bpm") else None, int(opt("--fps", 30)))
    out = opt("-o")
    if out:
        json.dump(r, open(out, "w"))
        print(f"bpm {r['bpm']}  beats {len(r['beats'])}  downbeats {len(r['downbeats'])}  -> {out}")
    else:
        print(json.dumps(r))


if __name__ == "__main__":
    main(sys.argv[1:])
