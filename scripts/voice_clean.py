"""Làm sạch giọng (voice enhance) — pure ffmpeg + numpy, offline, no model download.

usage: python voice_clean.py <in audio/video> <out.wav> [--preset nhe|vua|manh] [--ss SEC --t SEC] [--json '{"denoise":…}']
Chain: high-pass → afftdn with a noise profile learned from the quietest 0.6 s of the WHOLE input
(that slice is prepended, sampled with `sn start/stop`, then trimmed off, so timing is unchanged)
→ downward expander (de-reverb approximation: tails between words pulled down) + low-mid cut
→ de-esser → compressor → presence EQ → loudnorm (-16 LUFS, speech) → limiter.
--ss/--t render only an excerpt (A/B preview); the noise profile still comes from the whole file.
Overrides (TL.audio.clean): denoise (dB of reduction), gate (0 = off … 1 = strong), deess (0…1), comp (ratio), presence (dB), hp (Hz).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys

import numpy as np

PRESETS = {
    'nhe':  dict(hp=70, denoise=10, gate=0.0, deess=0.3, comp=2.0, presence=1.5),
    'vua':  dict(hp=80, denoise=18, gate=0.4, deess=0.5, comp=3.0, presence=2.5),
    'manh': dict(hp=100, denoise=28, gate=0.8, deess=0.7, comp=4.0, presence=3.5),
}
ALIAS = {'nhẹ': 'nhe', 'vừa': 'vua', 'mạnh': 'manh', 'light': 'nhe', 'medium': 'vua', 'strong': 'manh'}
KEYS = ('hp', 'denoise', 'gate', 'deess', 'comp', 'presence')


def settings(clean):
    """TL.audio.clean → full settings dict (preset + overrides), or None when off."""
    if not clean or clean.get('on') is False or clean.get('preset') in (None, '', 'off'):
        return None
    p = ALIAS.get(clean['preset'], clean['preset'])
    s = dict(PRESETS.get(p, PRESETS['vua']))
    s.update({k: float(clean[k]) for k in KEYS if clean.get(k) is not None})
    s['preset'] = p
    return s


def key(s, src):
    """Cache key: settings + source content (size/mtime are not enough — voice_clips.wav is rebuilt every mix)."""
    h = hashlib.sha1(json.dumps(s, sort_keys=True).encode())
    with open(src, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()[:16]


def quietest(src, win=0.6):
    """Start time (s) of the quietest `win` seconds that still has signal (room tone, not digital silence)."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-af', 'highpass=f=60', '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    hop = 800  # 50 ms
    n = len(x) // hop
    if n < 4:
        return 0.0, len(x) / 16000
    rms = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)
    k = max(1, int(win / 0.05))
    if n <= k:
        return 0.0, len(x) / 16000
    m = np.convolve(rms, np.ones(k) / k, 'valid')
    m[m < 1e-5] = np.inf  # skip pure digital silence (padding, muted clips)
    if not np.isfinite(m).any():
        return 0.0, len(x) / 16000
    return float(np.argmin(m) * 0.05), len(x) / 16000


def chain(s):
    g = s['gate']
    f = [f"highpass=f={s['hp']:.0f}:poles=2", f"afftdn=nr={s['denoise']:.0f}:nf=-50:tn=1"]
    if g > 0:  # expander: pulls reverb tails / room down between words (approximation, not true de-reverb)
        f.append(f"agate=threshold={0.02 + 0.03 * g:.3f}:ratio={1.5 + 2.5 * g:.2f}:range={10 ** (-(6 + 12 * g) / 20):.3f}:attack=5:release={250 - 120 * g:.0f}:knee=4")
        f.append(f"equalizer=f=300:t=q:w=1.2:g={-1.5 - 2 * g:.1f}")
    if s['deess'] > 0:
        f.append(f"deesser=i={0.2 + 0.6 * s['deess']:.2f}:m=0.5:f=0.5")
    f.append(f"acompressor=threshold=-21dB:ratio={s['comp']:.1f}:attack=5:release=90:makeup=2")
    if s['presence']:
        f.append(f"equalizer=f=3200:t=q:w=1:g={s['presence']:.1f}")
    f += ["loudnorm=I=-16:TP=-1.5:LRA=7", "alimiter=limit=0.89:level=0", "aresample=48000"]
    return ','.join(f)


def clean(src, out, s, ss=None, t=None):
    q0, total = quietest(src)
    qd = min(0.6, total)
    seg = ['-ss', f'{ss:.3f}'] + (['-t', f'{t:.3f}'] if t else []) if ss is not None else []
    # input 0: quiet slice (noise profile), input 1: the material to clean
    fc = (f"[0:a]aformat=sample_rates=48000:channel_layouts=mono,asetpts=PTS-STARTPTS[q];"
          f"[1:a]aformat=sample_rates=48000:channel_layouts=mono,asetpts=PTS-STARTPTS[m];"
          f"[q][m]concat=n=2:v=0:a=1,asendcmd=c='0.0 afftdn sn start;{qd - 0.02:.3f} afftdn sn stop',{chain(s)},"
          f"atrim=start={qd:.3f},asetpts=PTS-STARTPTS,pan=stereo|c0=c0|c1=c0[o]")
    os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{q0:.3f}', '-t', f'{qd:.3f}', '-i', src, *seg, '-i', src,
                    '-filter_complex', fc, '-map', '[o]', '-ar', '48000', out], check=True)
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--preset', default='vua'); ap.add_argument('--json', default='{}')
    ap.add_argument('--ss', type=float); ap.add_argument('--t', type=float)
    a = ap.parse_args()
    s = settings({'preset': a.preset, **json.loads(a.json)})
    if not s:
        sys.exit('preset off: nothing to do')
    clean(a.src, a.out, s, a.ss, a.t)
    print('clean ->', a.out, json.dumps(s))
