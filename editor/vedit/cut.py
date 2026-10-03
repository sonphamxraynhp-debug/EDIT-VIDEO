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
    # Bỏ qua "lặng tuyệt đối" (số 0 kỹ thuật số giữa các clip ghép) khi ước lượng nền nhiễu phòng
    live = db[db > -90]
    ref = live if len(live) > 0.2 * len(db) else db
    noise = float(np.percentile(ref, 10))
    speech = float(np.percentile(ref, 90))
    # Âm thanh gần như không còn khoảng lặng (vd. video đã cắt): phân vị 10 lại là giọng nói nhỏ
    # -> ước lượng nền nhiễu theo mức giọng để không coi giọng nhỏ là khoảng lặng.
    if speech - noise < 30:
        noise = speech - 45
    thr = noise + cfg["threshold_ratio"] * (speech - noise)
    return max(thr, noise + cfg["min_margin_db"]), noise, speech


def _runs(mask):
    """Các đoạn liên tiếp True trong mask: [(start_idx, end_idx_exclusive)]."""
    padded = np.concatenate([[False], mask, [False]])
    diff = np.diff(padded.astype(np.int8))
    starts = np.where(diff == 1)[0]
    ends = np.where(diff == -1)[0]
    return list(zip(starts, ends))


def detect_speech(samples, sample_rate, cfg, threshold_db=None, words=None, remove=None):
    """Trả về các đoạn có tiếng nói (giây, theo thời gian video gốc) cùng thông tin ngưỡng.

    words: danh sách từ nhận dạng (giây gốc) để không bao giờ cắt vào giữa một từ.
    remove: các khoảng [a, b] (giây gốc) người dùng/agent muốn bỏ hẳn (vd. câu nói hỏng, nói lại).
    """
    total = len(samples) / sample_rate
    db, win = frame_db(samples, sample_rate, cfg["window_ms"])
    step = win / sample_rate
    if threshold_db is None:
        thr, noise, speech = auto_threshold(db, cfg)
    else:
        thr, noise, speech = threshold_db, float(np.percentile(db, 10)), float(np.percentile(db, 90))

    voiced = db > thr
    segs = [(s * step, e * step) for s, e in _runs(voiced)]
    # Bỏ tiếng động ngắn (click, va chạm) nhưng giữ nếu nằm sát tiếng nói khác
    segs = [s for s in segs if s[1] - s[0] >= cfg["min_speech"]]

    # Đảm bảo phủ trọn các từ đã nhận dạng – nhưng chỉ phần THỰC SỰ có tiếng: bộ nhận dạng hay kéo
    # mốc từ sang khoảng lặng (vd. từ đầu mỗi đoạn được đánh dấu từ 0 s), nếu tin nguyên mốc sẽ giữ lại lặng.
    if words:
        for w in words:
            a, b = int(w["s"] / step), int(np.ceil(w["e"] / step))
            if b <= a:
                continue
            idx = np.where(voiced[a:b])[0]
            if len(idx):
                segs.append(((a + idx[0]) * step, (a + idx[-1] + 1) * step))
            elif w["e"] - w["s"] <= 0.6:
                # Từ nói rất nhỏ dưới ngưỡng: chỉ giữ khi nằm sát tiếng nói thật (≤ 0.3 s),
                # còn từ "lơ lửng" giữa khoảng lặng là mốc thời gian sai của bộ nhận dạng.
                near = int(0.3 / step)
                if voiced[max(0, a - near):b + near].any():
                    segs.append((w["s"], w["e"]))
        segs.sort()

    segs = _merge(segs, cfg["min_silence"])
    segs = [(max(0.0, a - cfg["pad_before"]), min(total, b + cfg["pad_after"])) for a, b in segs]
    segs = _merge(segs, 0.0)

    if remove:
        for ra, rb in remove:
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
        segs = [s for s in segs if s[1] - s[0] >= 0.1]

    info = {"threshold_db": round(thr, 1), "noise_db": round(noise, 1), "speech_db": round(speech, 1)}
    return segs, info


def _merge(segs, gap):
    segs = sorted(segs)
    out = []
    for a, b in segs:
        if out and a - out[-1][1] <= gap:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


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
    """Ghép các đoạn âm thanh đúng theo ranh giới khung hình, có fade cực ngắn chống tiếng 'tách'.

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
        if a < 0:  # tiếng bắt đầu muộn hơn hình
            chunk = np.concatenate([np.zeros((min(-a, need), samples.shape[1]), np.float32), chunk])
        if len(chunk) < need:  # âm thanh ngắn hơn hình ở cuối file
            chunk = np.concatenate([chunk, np.zeros((need - len(chunk), samples.shape[1]), np.float32)])
        if len(chunk) > 2 * fade:
            chunk[:fade] *= ramp
            chunk[-fade:] *= ramp[::-1]
        parts.append(chunk)
    return np.concatenate(parts) if parts else np.zeros((0, samples.shape[1]), np.float32)


def timeline_map(frame_segs, fps):
    """Danh sách (src_start, src_end, out_start) theo giây để đổi thời gian gốc -> thời gian sau cắt."""
    out = []
    t = 0.0
    for sf, ef in frame_segs:
        a, b = sf / fps, ef / fps
        out.append((a, b, t))
        t += b - a
    return out


def map_time(tmap, t):
    """Thời gian gốc -> thời gian sau cắt (None nếu rơi vào phần bị cắt)."""
    for a, b, o in tmap:
        if a <= t <= b:
            return o + (t - a)
    return None


def cut_points(tmap):
    """Các mốc (giây, sau cắt) nơi hai đoạn được nối với nhau, kèm độ dài phần bị bỏ."""
    pts = []
    for (a0, b0, o0), (a1, b1, o1) in zip(tmap, tmap[1:]):
        pts.append({"t": o1, "removed": a1 - b0})
    return pts
