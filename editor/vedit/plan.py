"""Bước PREPARE: cắt khoảng lặng + nhận dạng giọng nói -> edit_plan.json (agent có thể sửa trước khi render)."""
import json
import os

import numpy as np

from . import asr, cut, media
from .captions import build_chunks, pick_hook


def detect_face(path, info, default):
    """Tâm khuôn mặt (tỉ lệ 0-1) lấy trung vị trên vài khung hình; không có OpenCV thì dùng mặc định."""
    try:
        import cv2
        cascade = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
    except Exception:  # không có OpenCV / bản OpenCV không còn Haar cascade
        return list(default)
    cap = cv2.VideoCapture(str(path))
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
    pts = []
    for i in np.linspace(0.05, 0.95, 9):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(n * i))
        ok, frame = cap.read()
        if not ok:
            continue
        h, w = frame.shape[:2]
        if (w > h) != (info["width"] > info["height"]):  # ảnh chưa được xoay
            continue
        gray = cv2.cvtColor(cv2.resize(frame, (w // 3, h // 3)), cv2.COLOR_BGR2GRAY)
        faces = cascade.detectMultiScale(gray, 1.1, 6, minSize=(w // 18, w // 18))
        if len(faces):
            x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            pts.append(((x + fw / 2) * 3 / w, (y + fh / 2) * 3 / h))
    cap.release()
    if not pts:
        return list(default)
    fx, fy = np.median(np.array(pts), axis=0)
    return [round(float(fx), 3), round(float(fy), 3)]


def zoom_schedule(duration, cuts, chunks, hook_end, cfg):
    """Đổi khung tại điểm cắt (giấu jump-cut); nếu giữ quá lâu thì đổi ở ranh giới câu."""
    levels, pattern = cfg["levels"], cfg["pattern"]
    sched = []
    cur_start, idx = 0.0, 0
    level = levels[cfg["hook_level"]]
    first_change = max(hook_end, cfg["min_hold"])
    cut_ts = sorted(c["t"] for c in cuts)
    bounds = sorted({c["start"] for c in chunks})

    # Lần đổi đầu tiên đúng lúc tiêu đề biến mất (như video mẫu)
    while True:
        lo, hi = cur_start + cfg["min_hold"], cur_start + cfg["max_hold"]
        if cur_start == 0.0:
            nxt = first_change if first_change < duration - 1.0 else None
        else:
            in_cut = [c for c in cut_ts if lo <= c <= hi]
            if in_cut:
                nxt = in_cut[0]
            else:
                target = cur_start + (cfg["min_hold"] + cfg["max_hold"]) / 2
                near = [b for b in bounds if lo <= b <= hi]
                nxt = min(near, key=lambda b: abs(b - target)) if near else (hi if hi < duration else None)
        if nxt is None or nxt >= duration - 0.8:
            break
        sched.append({"start": round(cur_start, 3), "end": round(nxt, 3), "level": level})
        idx += 1
        level = levels[pattern[idx % len(pattern)]]
        cur_start = nxt
    sched.append({"start": round(cur_start, 3), "end": round(duration, 3), "level": level})
    return sched


def prepare(input_path, workdir, style, transcript=None, model=None, asr_backend=None, threshold_db=None,
            remove=None, no_asr=False, hook_text=None, hook_style=None, hook_position=None):
    os.makedirs(workdir, exist_ok=True)
    info = media.probe(input_path)
    if not info["has_audio"]:
        raise SystemExit("Video không có âm thanh – không thể cắt theo giọng nói.")
    print(f"[prepare] {info['width']}x{info['height']} @ {info['fps']:.3f}fps, {info['duration']:.1f}s")

    samples = media.read_audio(input_path, info["sample_rate"], info["channels"])

    # 1) Nhận dạng giọng nói trên audio GỐC (một lần, có cache) -> mốc từ theo thời gian gốc
    words_src = None
    cache = os.path.join(workdir, "transcript_source.json")
    if transcript:
        words_src = asr.load_transcript(transcript)
    elif os.path.exists(cache):
        words_src = asr.load_transcript(cache)
        print(f"[prepare] Dùng transcript đã cache: {cache}")
    elif not no_asr:
        wav = os.path.join(workdir, "audio16k.wav")
        media.write_wav16k(samples, info["sample_rate"], wav)
        words_src = asr.transcribe(wav, style["asr"], model_name=model, backend=asr_backend)
        with open(cache, "w", encoding="utf-8") as f:
            json.dump({"words": words_src}, f, ensure_ascii=False, indent=1)

    # 2) Cắt khoảng lặng (không bao giờ cắt vào giữa từ đã nhận dạng)
    segs, thr = cut.detect_speech(samples, info["sample_rate"], style["silence"], threshold_db,
                                  words=[w for w in words_src or [] if not w.get("approx")], remove=remove)
    # Thời gian âm thanh -> thời gian hình (khung 0 = 0s)
    off = info.get("av_offset", 0.0)
    if off:
        segs = [(max(0.0, a - off), b - off) for a, b in segs if b - off > 0]
        words_src = [dict(w, s=w["s"] - off, e=w["e"] - off) for w in (words_src or [])] or words_src
    n_frames = int(info["duration"] * info["fps"])
    frame_segs = cut.to_frames(segs, info["fps"], n_frames)
    tmap = cut.timeline_map(frame_segs, info["fps"])
    out_dur = sum(b - a for a, b, _ in tmap)
    print(f"[prepare] Ngưỡng lặng {thr['threshold_db']} dB (nền {thr['noise_db']}, giọng {thr['speech_db']}). "
          f"Giữ {len(frame_segs)} đoạn: {info['duration']:.1f}s -> {out_dur:.1f}s")

    # 3) Đổi mốc từ sang thời gian sau cắt. Từ có mốc rơi vào phần lặng bị cắt (mốc nhận dạng lệch)
    #    vẫn được giữ cho phụ đề, kéo về mép đoạn gần nhất; chỉ bỏ từ nằm trong vùng --remove.
    words = []
    for w in words_src or []:
        mid = (w["s"] + w["e"]) / 2
        if any(ra <= mid <= rb for ra, rb in remove or []):
            continue
        s = cut.map_time_nearest(tmap, w["s"])
        e = cut.map_time_nearest(tmap, w["e"])
        if s is None:
            continue
        nw = {"w": w["w"], "s": round(s, 3), "e": round(max(e, s + 0.05), 3)}
        if "seg" in w:
            nw["seg"] = w["seg"]
        words.append(nw)
    words.sort(key=lambda w: w["s"])

    chunks = build_chunks(words, style["captions"], style["glossary"]) if words else []
    hook = pick_hook(chunks, style["hook"]) if chunks else None
    if hook_text:
        hook = hook or {"start": 0.0, "end": style["hook"]["min_duration"] + 1.0,
                        "style": style["hook"]["default_style"], "position": style["hook"]["default_position"]}
        hook["text"] = hook_text
    if hook:
        if hook_style:
            hook["style"] = hook_style
        if hook_position:
            hook["position"] = hook_position

    cuts = cut.cut_points(tmap)
    face = detect_face(input_path, info, style["zoom"]["default_face"])
    zoom = zoom_schedule(out_dur, cuts, chunks, hook["end"] if hook else 0.0, style["zoom"])

    plan = {
        "input": os.path.abspath(input_path),
        "video": info,
        "silence": thr,
        "segments_frames": frame_segs,
        "segments_sec": [[round(a, 3), round(b, 3)] for a, b, _ in tmap],
        "duration": round(out_dur, 3),
        "cut_points": cuts,
        "face": face,
        "hook": hook,
        "captions": chunks,
        "zoom": zoom,
        "broll": [],
        "music": None,
        "words": words,
    }
    path = os.path.join(workdir, "edit_plan.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=1)
    print(f"[prepare] Đã ghi {path}  ({len(chunks)} câu phụ đề, {len(zoom)} khung zoom, mặt tại {face})")
    return path
