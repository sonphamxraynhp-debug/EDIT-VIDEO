"""Phát hiện và cắt khoảng lặng, căn theo khung hình để hình và tiếng luôn khớp."""
import math

import numpy as np


def frame_db(samples, sample_rate, window_ms):
    mono = samples.mean(axis=1)
    win = max(1, int(sample_rate * window_ms / 1000))
    n = len(mono) // win
    if n == 0:
        return np.array([-120.0]), win
    blocks = mono[: n * win].reshape(n, win)
    rms = np.sqrt(np.mean(blocks.astype(np.float64) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-12), win


def auto_threshold(db, cfg):
    """Ngưỡng lặng tự tính theo từng video: nền nhiễu + một phần khoảng cách tới mức giọng nói."""
    noise = float(np.percentile(db, 10))
    speech = float(np.percentile(db, 90))
    # Âm thanh gần như không có khoảng lặng (video đã cắt sẵn): phân vị 10 lại là giọng nhỏ
    if speech - noise < 30:
        noise = speech - 45
    thr = noise + cfg["threshold_ratio"] * (speech - noise)
    return max(thr, noise + cfg["min_margin_db"]), noise, speech


def _runs(mask):
    padded = np.concatenate([[False], mask, [False]])
    diff = np.diff(padded.astype(np.int8))
    return list(zip(np.where(diff == 1)[0], np.where(diff == -1)[0]))


def _merge(segs, gap):
    out = []
    for a, b in sorted(segs):
        if out and a - out[-1][1] <= gap:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


def voiced_regions(samples, sample_rate, cfg, threshold_db=None):
    """Các vùng có tiếng (giây gốc) trước khi thêm đệm – dùng cho cả cắt lặng lẫn chia đoạn nhận dạng."""
    db, win = frame_db(samples, sample_rate, cfg["window_ms"])
    step = win / sample_rate
    if threshold_db is None:
        thr, noise, speech = auto_threshold(db, cfg)
    else:
        thr, noise, speech = threshold_db, float(np.percentile(db, 10)), float(np.percentile(db, 90))
    # Ngưỡng kép (hysteresis): vùng vượt ngưỡng chính được nới ra tới khi xuống dưới ngưỡng phụ
    # -> giữ trọn âm đầu/âm cuối nhỏ của từ mà không giữ khoảng lặng.
    high = db > thr
    low = db > thr - cfg.get("hysteresis_db", 8)
    segs = [(s * step, e * step) for s, e in _runs(low) if high[s:e].any()]
    segs = [s for s in segs if s[1] - s[0] >= cfg["min_speech"]]
    info = {"threshold_db": round(thr, 1), "noise_db": round(noise, 1), "speech_db": round(speech, 1)}
    return segs, info


def keep_segments(voiced, total, cfg, remove=None):
    """Đoạn giữ lại (giây gốc): vùng có tiếng + đệm, khoảng lặng >= min_silence bị bỏ.

    remove: các khoảng [a, b] (giây gốc) cần bỏ hẳn (câu nói hỏng, nói lại...).
    Không dùng mốc thời gian của nhận dạng giọng nói để giữ/cắt: mốc từ có thể lệch ±0.3 s ở chỗ ngừng.
    """
    segs = _merge(list(voiced), cfg["min_silence"])
    segs = [(max(0.0, a - cfg["pad_before"]), min(total, b + cfg["pad_after"])) for a, b in segs]
    segs = _merge(segs, 0.0)
    for ra, rb in remove or []:
        out = []
        for a, b in segs:
            if rb <= a or ra >= b:
                out.append((a, b))
                continue
            if a < ra:
                out.append((a, ra))
            if rb < b:
                out.append((rb, b))
        segs = out
    return [s for s in segs if s[1] - s[0] >= 0.1]


def to_frames(segs, fps, n_frames_max=None):
    """Căn đoạn theo khung hình: [(start_frame, end_frame_exclusive)]."""
    frames = []
    for a, b in segs:
        sf = int(math.floor(a * fps + 1e-6))
        ef = int(math.ceil(b * fps - 1e-6))
        if n_frames_max is not None:
            ef = min(ef, n_frames_max)
        if ef - sf >= 2:
            if frames and sf <= frames[-1][1]:
                frames[-1] = (frames[-1][0], max(frames[-1][1], ef))
            else:
                frames.append((sf, ef))
    return frames


def assemble_audio(samples, sample_rate, fps, frame_segs, fade_ms, av_offset=0.0):
    """Ghép âm thanh đúng ranh giới khung hình, fade cực ngắn ở mỗi mối nối để không có tiếng 'tách'.

    av_offset = thời điểm bắt đầu hình - thời điểm bắt đầu tiếng (giây).
    """
    shift = av_offset * sample_rate
    fade = max(1, int(sample_rate * fade_ms / 1000))
    ramp = (0.5 - 0.5 * np.cos(np.linspace(0, math.pi, fade))).astype(np.float32)[:, None]
    parts = []
    for sf, ef in frame_segs:
        a = int(round(sf * sample_rate / fps + shift))
        b = int(round(ef * sample_rate / fps + shift))
        need = b - a
        chunk = samples[max(0, a):max(0, b)].copy()
        if a < 0:
            chunk = np.concatenate([np.zeros((min(-a, need), samples.shape[1]), np.float32), chunk])
        if len(chunk) < need:
            chunk = np.concatenate([chunk, np.zeros((need - len(chunk), samples.shape[1]), np.float32)])
        if len(chunk) > 2 * fade:
            chunk[:fade] *= ramp
            chunk[-fade:] *= ramp[::-1]
        parts.append(chunk)
    return np.concatenate(parts) if parts else np.zeros((0, samples.shape[1]), np.float32)


def timeline_map(frame_segs, fps):
    """[(src_start, src_end, out_start)] theo giây: đổi thời gian gốc -> thời gian sau cắt."""
    out, t = [], 0.0
    for sf, ef in frame_segs:
        a, b = sf / fps, ef / fps
        out.append((a, b, t))
        t += b - a
    return out


def map_time(tmap, t, snap=True):
    """Thời gian gốc -> thời gian sau cắt. Rơi vào phần bị cắt: snap=True lấy mép đoạn kế tiếp."""
    for a, b, o in tmap:
        if a <= t <= b:
            return o + (t - a)
        if snap and t < a:
            return o
    if snap and tmap:
        a, b, o = tmap[-1]
        return o + (b - a)
    return None


def cut_points(tmap):
    """Các mốc (giây, sau cắt) nơi hai đoạn được nối, kèm độ dài phần bị bỏ."""
    return [{"t": round(o1, 3), "removed": round(a1 - b0, 3)}
            for (a0, b0, o0), (a1, b1, o1) in zip(tmap, tmap[1:])]
