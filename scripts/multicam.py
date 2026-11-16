#!/usr/bin/env python3
"""Multicam auto-switch: decide who is talking from 2-3 mic/camera audio tracks.

For each track (one per person / per camera) it measures RMS loudness every `--step` s (0.1), normalises each
track to its own speaking level (so a quiet mic is not always "losing"), smooths, then picks the active speaker
with hysteresis:
  * a new speaker must be louder than the current one by `--margin` dB (default 4) for `--hold` s (0.5),
  * no shot shorter than `--min-shot` s (1.2),
  * when nobody talks (all under the gate) the current camera stays,
  * `--both` : if both talk at once (within margin, above gate) for >= `--both-min` s -> a 'both' cut (2-up).

Output JSON (pack `multicam`, engine/packs/multicam.js):
  {"step":0.1, "duration":20.2, "cams":2, "cuts":[{"t":0.0,"cam":0},{"t":3.4,"cam":1},...],
   "levels":[[0.02,0.61,...],[...]], "stats":{...}}
`levels[i][k]` = speaking level 0..1 of track i at time k*step (drives mc_wave).

Usage:
  python3 scripts/multicam.py host.wav guest.wav -o work/multicam.json
  python3 scripts/multicam.py camA.mp4 camB.mp4 camC.mp4 --offsets 0,-0.42,0.1 --min-shot 1.5 --margin 5 --both
  python3 scripts/multicam.py a.wav b.wav --apply timeline.json      # write cuts+levels into its mc_* scenes
Inputs can be any file ffmpeg reads (wav/mp3/m4a/mp4/mov). `--offsets`: seconds to shift each track so they line up
(positive = the track starts later on the timeline). Needs only ffmpeg + Python 3 (no numpy).
"""
import argparse
import array
import json
import math
import subprocess
import sys

SR = 16000


def decode(path, offset, dur=None):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    a = array.array("h")
    a.frombytes(raw[: len(raw) // 2 * 2])
    if sys.byteorder == "big":
        a.byteswap()
    pad = int(round(offset * SR))
    if pad > 0:
        a = array.array("h", bytes(2 * pad)) + a
    elif pad < 0:
        a = a[-pad:]
    return a


def rms_db(a, step):
    n = int(SR * step)
    out = []
    for i in range(0, len(a), n):
        seg = a[i:i + n]
        if not seg:
            break
        s = sum(x * x for x in seg) / len(seg)
        out.append(10 * math.log10(s / (32768.0 ** 2) + 1e-12))
    return out


def pct(v, q):
    s = sorted(v)
    return s[min(len(s) - 1, max(0, int(q * (len(s) - 1))))] if s else -90.0


def smooth(v, w):
    if w <= 1:
        return v[:]
    h = w // 2
    out = []
    for i in range(len(v)):
        seg = v[max(0, i - h): i + h + 1]
        out.append(sum(seg) / len(seg))
    return out


def decide(db, step, margin, hold, min_shot, gate, both, both_min):
    n, T = len(db), len(db[0])
    hold_n, min_n, both_n = max(1, round(hold / step)), max(1, round(min_shot / step)), max(1, round(both_min / step))
    # Start on whoever is loudest during the first second of speech.
    first = next((k for k in range(T) if max(d[k] for d in db) > gate), 0)
    win = range(first, min(T, first + round(1 / step)))
    cur = max(range(n), key=lambda i: sum(db[i][k] for k in win))
    cuts, shot_start, cand, cand_n, both_run = [{"t": 0.0, "cam": cur}], 0, None, 0, 0
    for k in range(T):
        lv = [d[k] for d in db]
        loud = max(range(n), key=lambda i: lv[i])
        talking = [i for i in range(n) if lv[i] > gate]
        if both and len(talking) >= 2 and abs(lv[talking[0]] - lv[talking[1]]) < margin:
            both_run += 1
        else:
            both_run = 0
        want = cur
        if both and both_run >= both_n:
            want = "both"
        elif lv[loud] > gate and (cur == "both" or (loud != cur and lv[loud] - lv[cur] >= margin)):
            want = loud
        if want != cur:
            cand_n = cand_n + 1 if want == cand else 1
            cand = want
            if cand_n >= hold_n and k - shot_start >= min_n:
                t = round(max(0.0, (k - cand_n + 1) * step), 2)  # cut where the new speaker started
                if t - cuts[-1]["t"] < min_shot:
                    t = round(cuts[-1]["t"] + min_shot, 2)
                cuts.append({"t": t, "cam": want})
                cur, shot_start, cand, cand_n = want, round(t / step), None, 0
        else:
            cand, cand_n = None, 0
    # merge accidental duplicates
    out = []
    for c in cuts:
        if not out or out[-1]["cam"] != c["cam"]:
            out.append(c)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+", help="2-3 audio/video files, one per mic or camera (same start time)")
    ap.add_argument("-o", "--out", help="output JSON (default: print)")
    ap.add_argument("--step", type=float, default=0.1)
    ap.add_argument("--margin", type=float, default=4.0, help="dB a new speaker must beat the current one by")
    ap.add_argument("--hold", type=float, default=0.5, help="seconds the new speaker must stay louder")
    ap.add_argument("--min-shot", type=float, default=1.2, help="shortest shot in seconds")
    ap.add_argument("--gate", type=float, default=-14.0, help="dB under each track's speaking level = silence")
    ap.add_argument("--smooth", type=float, default=0.3, help="moving-average window in seconds")
    ap.add_argument("--offsets", default="", help="comma list of seconds per input (sync)")
    ap.add_argument("--both", action="store_true", help="emit 'both' cuts when two people talk over each other")
    ap.add_argument("--both-min", type=float, default=1.5)
    ap.add_argument("--no-normalize", action="store_true", help="compare raw dBFS instead of per-track levels")
    ap.add_argument("--apply", help="timeline.json: write cuts/levels into its mc_switch/mc_split/mc_wave scenes (in place)")
    a = ap.parse_args()
    if not 2 <= len(a.inputs) <= 3:
        ap.error("give 2 or 3 inputs")
    offs = [float(x) for x in a.offsets.split(",")] if a.offsets else []
    offs += [0.0] * (len(a.inputs) - len(offs))
    raw = [rms_db(decode(p, o), a.step) for p, o in zip(a.inputs, offs)]
    T = max(len(r) for r in raw)
    raw = [r + [-90.0] * (T - len(r)) for r in raw]
    w = max(1, round(a.smooth / a.step))
    db, levels, stats = [], [], []
    for r in raw:
        ref = pct(r, 0.95)  # this mic's "speaking loud" level
        floor = pct(r, 0.10)
        norm = r if a.no_normalize else [x - ref for x in r]
        db.append(smooth(norm, w))
        # 0..1 level for the waveform: -40 dB under speaking level -> 0
        levels.append([round(min(1.0, max(0.0, (x - ref + 40) / 40)), 2) for x in r])
        stats.append({"speak_db": round(ref, 1), "floor_db": round(floor, 1)})
    gate = a.gate if not a.no_normalize else max(s["floor_db"] for s in stats) + 8
    cuts = decide(db, a.step, a.margin, a.hold, a.min_shot, gate, a.both, a.both_min)
    dur = round(T * a.step, 2)
    talk = [0.0] * len(a.inputs)
    for i, c in enumerate(cuts):
        end = cuts[i + 1]["t"] if i + 1 < len(cuts) else dur
        if isinstance(c["cam"], int):
            talk[c["cam"]] += end - c["t"]
    res = {"step": a.step, "duration": dur, "cams": len(a.inputs), "cuts": cuts, "levels": levels,
           "stats": {"tracks": stats, "shots": len(cuts), "screen_time": [round(x, 1) for x in talk],
                     "inputs": a.inputs, "offsets": offs}}
    if a.apply:
        tl = json.load(open(a.apply, encoding="utf-8"))
        n = 0
        for s in tl.get("scenes", []):
            if s.get("type") in ("mc_switch", "mc_split"):
                s["cuts"], s["levels"], s["step"] = cuts, levels, a.step
                n += 1
            elif s.get("type") == "mc_wave":
                s["levels"], s["step"] = levels, a.step
                n += 1
        json.dump(tl, open(a.apply, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"applied to {n} scene(s) in {a.apply}", file=sys.stderr)
    txt = json.dumps(res, ensure_ascii=False, separators=(",", ":"))
    if a.out:
        open(a.out, "w", encoding="utf-8").write(txt)
        print(f"{len(cuts)} shots, screen time {res['stats']['screen_time']} s -> {a.out}", file=sys.stderr)
    else:
        print(txt)


if __name__ == "__main__":
    main()
