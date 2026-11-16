"""Tiny numpy DSP toolkit shared by gen_sfx.py and gen_music.py (no samples, no downloads)."""
import subprocess

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
RNG = np.random.default_rng(7)


def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d, color="white", rng=RNG):
    n = rng.standard_normal(int(d * SR))
    if color == "white":
        return n
    f = np.fft.rfft(n)
    k = np.arange(len(f)) + 1.0
    f /= np.sqrt(k) if color == "pink" else k  # pink 1/f, brown 1/f^2 (power)
    out = np.fft.irfft(f, len(n))
    return out / (np.abs(out).max() + 1e-9)


def _sos(kind, f, order=2):
    nyq = SR / 2
    if kind == "band":
        lo, hi = max(20, f[0]), min(nyq * .98, f[1])
        return butter(order, [lo / nyq, hi / nyq], "band", output="sos")
    return butter(order, min(f, nyq * .98) / nyq, kind, output="sos")


def lp(x, f, order=2):
    return sosfilt(_sos("low", f, order), x)


def hp(x, f, order=2):
    return sosfilt(_sos("high", f, order), x)


def bp(x, lo, hi, order=2):
    return sosfilt(_sos("band", (lo, hi), order), x)


def sweep_filter(x, f0, f1, kind="band", q=1.0, blocks=64):
    """Time-varying filter: Hann-windowed 50%-overlap blocks, each filtered with warm-up -> click-free."""
    n = len(x)
    hop = max(256, n // blocks)
    win = np.hanning(2 * hop + 1)[:-1]
    out = np.zeros(n + 4 * hop)
    xp = np.concatenate([np.zeros(hop), x, np.zeros(4 * hop)])
    for a in range(0, n + hop, hop):
        k = min(1.0, a / max(1, n))
        f = f0 * (f1 / f0) ** k
        warm = xp[max(0, a - 2048):a + 2 * hop]
        if kind == "band":
            y = bp(warm, f / (1 + q), f * (1 + q))
        elif kind == "low":
            y = lp(warm, f)
        else:
            y = hp(warm, f)
        out[a:a + 2 * hop] += y[-2 * hop:] * win
    return out[hop:hop + n]


def env_adsr(n, a=.005, d=.1, s=.6, r=.2, sus_len=None):
    a_, d_, r_ = int(a * SR), int(d * SR), int(r * SR)
    sus = max(0, n - a_ - d_ - r_) if sus_len is None else int(sus_len * SR)
    e = np.concatenate([np.linspace(0, 1, a_, endpoint=False), np.linspace(1, s, d_, endpoint=False),
                        np.full(sus, s), np.linspace(s, 0, r_)])
    if len(e) < n:
        e = np.pad(e, (0, n - len(e)))
    return e[:n]


def exp_dec(d, rate):
    return np.exp(-rate * tt(d))


def fade(x, fi=.005, fo=.02):
    x = x.copy()
    a, b = int(fi * SR), int(fo * SR)
    shape = (-1, 1) if x.ndim == 2 else (-1,)
    a, b = min(a, len(x)), min(b, len(x))
    if a:
        x[:a] *= np.linspace(0, 1, a).reshape(shape)
    if b:
        x[-b:] *= np.linspace(1, 0, b).reshape(shape)
    return x


def chirp(f0, f1, d, curve="exp"):
    t = tt(d)
    if curve == "exp":
        k = np.log(f1 / f0) / d
        ph = 2 * np.pi * f0 * (np.exp(k * t) - 1) / k
    else:
        ph = 2 * np.pi * (f0 * t + (f1 - f0) * t * t / (2 * d))
    return np.sin(ph)


def osc(f, d, kind="sine", detune=0.0, phase=0.0):
    t = tt(d)
    ph = (f * (1 + detune) * t + phase) % 1.0
    if kind == "sine":
        return np.sin(2 * np.pi * ph)
    if kind == "saw":
        return 2 * ph - 1
    if kind == "square":
        return np.sign(np.sin(2 * np.pi * ph))
    if kind == "tri":
        return 2 * np.abs(2 * ph - 1) - 1
    raise ValueError(kind)


def supersaw(f, d, voices=7, spread=.012, rng=RNG):
    out = sum(osc(f, d, "saw", detune=spread * (i / (voices - 1) - .5) * 2, phase=rng.random()) for i in range(voices))
    return out / voices


def karplus(f, d, decay=.996, bright=.5, rng=RNG):
    n, p = int(d * SR), max(2, int(SR / f))
    buf = rng.uniform(-1, 1, p)
    buf = lp(buf, 1500 + bright * 9000)
    out = np.empty(n + p)
    # One period at a time: the averaging filter applied per cycle (vectorised Karplus-Strong).
    for k in range(0, n, p):
        out[k:k + p] = buf
        buf = decay * .5 * (buf + np.roll(buf, -1))
    return out[:n]


def fm(f, d, ratio=1.0, index=2.0, idx_decay=4.0):
    t = tt(d)
    mod = index * np.exp(-idx_decay * t) * np.sin(2 * np.pi * f * ratio * t)
    return np.sin(2 * np.pi * f * t + mod)


def reverb(x, wet=.25, length=1.6, damp=3.5, stereo=True, pre=.012, rng=RNG):
    """Convolution with decaying filtered noise. Returns stereo (n,2)."""
    n = int(length * SR)
    t = np.arange(n) / SR
    chans = []
    mono = x if x.ndim == 1 else x.mean(1)
    for c in range(2):
        ir = rng.standard_normal(n) * np.exp(-damp * t)
        ir = lp(ir, 6000)
        ir[: int(pre * SR)] = 0
        ir /= np.sqrt((ir ** 2).sum()) + 1e-9
        chans.append(fftconvolve(mono, ir)[: len(mono)])
    dry = to_stereo(x)
    return dry * (1 - wet) + np.stack(chans, 1) * wet * 1.4


def to_stereo(x, pan=0.0):
    if x.ndim == 2:
        return x
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l * 1.414, x * r * 1.414], 1)


def autopan(x, rate=1.0, depth=.8, start=-1.0):
    t = np.arange(len(x)) / SR
    pan = np.clip(start + depth * 2 * t * rate, -1, 1) if rate > 0 else np.zeros(len(x))
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l * 1.414, x * r * 1.414], 1)


def place(buf, x, at):
    """Add x into buf starting at sample `at` (handles mono/stereo, clipping at end)."""
    i = int(at)
    if i >= len(buf):
        return
    x = to_stereo(x) if buf.ndim == 2 else x
    m = min(len(x), len(buf) - i)
    buf[i:i + m] += x[:m]


def normalize(x, peak=.89):
    m = np.abs(x).max()
    return x * (peak / m) if m > 0 else x


def soft_clip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def write(path, x, codec=None):
    """Write via ffmpeg so we can emit wav/flac/mp3/m4a by extension."""
    x = np.clip(x, -1, 1)
    ch = 1 if x.ndim == 1 else x.shape[1]
    pcm = (x * 32767).astype("<i2").tobytes()
    args = ["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", str(ch), "-i", "-"]
    if path.endswith(".mp3"):
        args += ["-c:a", "libmp3lame", "-b:a", "160k"]
    elif path.endswith(".m4a"):
        args += ["-c:a", "aac", "-b:a", "160k"]
    subprocess.run(args + [path], input=pcm, check=True)
