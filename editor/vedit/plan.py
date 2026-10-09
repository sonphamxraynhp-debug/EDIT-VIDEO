"""Bước PREPARE: cắt lặng + nhận dạng giọng nói -> edit_plan.json (agent soát và chỉnh trước khi render)."""
import hashlib
import json
import os

from . import asr, captions, cut, media


def _cache_key(path, extra):
    st = os.stat(path)
    return hashlib.sha1(f"{os.path.abspath(path)}|{st.st_size}|{st.st_mtime}|{extra}".encode()).hexdigest()[:16]


def get_words(input_path, samples, info, voiced, style, workdir, transcript=None, engine=None):
    """Từ nhận dạng theo thời gian GỐC; có cache để chạy lại prepare (vd. thêm --remove) thật nhanh."""
    if transcript:
        return asr.load_transcript(transcript)
    cache = os.path.join(workdir, "transcript_source.json")
    key = _cache_key(input_path, engine or style["asr"].get("engine"))
    if os.path.exists(cache):
        with open(cache, encoding="utf-8") as f:
            data = json.load(f)
        if data.get("key") == key:
            print("[prepare] Dùng transcript đã nhận dạng trước đó (cache)")
            return data["words"]
    audio16k = media.to_mono16k(samples, info["sample_rate"])
    words = asr.transcribe(audio16k, voiced, len(audio16k) / 16000, style["asr"], engine=engine)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump({"key": key, "words": words}, f, ensure_ascii=False)
    return words


def prepare(input_path, workdir, style, transcript=None, engine=None, threshold_db=None, remove=None,
            no_asr=False, hook_text=None):
    os.makedirs(workdir, exist_ok=True)
    info = media.probe(input_path)
    if not info["has_audio"]:
        raise SystemExit("Video không có âm thanh – không thể cắt lặng/làm phụ đề.")
    print(f"[prepare] {input_path}: {info['width']}x{info['height']} @ {info['fps_str']} fps, "
          f"{info['duration']:.1f}s{' (HDR)' if info['hdr'] else ''}")
    samples = media.read_audio(input_path, info["sample_rate"], info["channels"])
    total = len(samples) / info["sample_rate"]
    scfg = style["silence"]
    voiced, thr = cut.voiced_regions(samples, info["sample_rate"], scfg, threshold_db)
    print(f"[prepare] Ngưỡng lặng {thr['threshold_db']} dB (nền {thr['noise_db']} dB, giọng {thr['speech_db']} dB)")

    words = [] if no_asr else get_words(input_path, samples, info, voiced, style, workdir, transcript, engine)
    words = asr.snap_to_voiced(words, voiced)

    keep = cut.keep_segments(voiced, total, scfg, remove=remove)
    n_frames = int(info["duration"] * info["fps"] + 0.5)
    frame_segs = cut.to_frames(keep, info["fps"], n_frames)
    tmap = cut.timeline_map(frame_segs, info["fps"])
    duration = sum(ef - sf for sf, ef in frame_segs) / info["fps"]

    # Từ -> thời gian sau cắt (bỏ từ nằm trong đoạn đã xoá)
    out_words, prev_e = [], None
    for w in words:
        # Giữ từ nếu phần đầu của nó nằm trong đoạn giữ lại (mốc cuối từ chỉ là ước lượng)
        if cut.map_time(tmap, w["s"] + 0.03, snap=False) is None:
            continue
        s = cut.map_time(tmap, w["s"])
        e = min(cut.map_time(tmap, w["e"]), duration)
        out_words.append({"w": w["w"], "s": round(s, 3), "e": round(max(e, s + 0.05), 3),
                          "src_s": w["s"], "src_e": w["e"],
                          "gap": round(w["s"] - prev_e, 3) if prev_e is not None else 9.0})
        prev_e = w["e"]

    ccfg = style["captions"]
    caps = captions.build_captions(out_words, ccfg, style.get("glossary"))
    sents = captions.sentences(out_words, ccfg["sentence_gap"])
    hook = None
    if hook_text:
        parts = [p.strip() for p in hook_text.split("|")]
        hook = {"start": style["hook"]["start"], "end": style["hook"]["start"] + 3.0,
                "lines": [{"text": parts[0], "style": "main"}] + [{"text": p, "style": "sub"} for p in parts[1:]]}
    elif sents:
        hook = captions.auto_hook(sents, style["hook"])

    plan = {
        "input": os.path.abspath(input_path),
        "video": info,
        "silence": thr,
        "duration_source": round(total, 3),
        "duration": round(duration, 3),
        "segments": [[round(a, 3), round(b, 3)] for a, b in keep],
        "segments_frames": frame_segs,
        "cut_points": cut.cut_points(tmap),
        "intro_blur": True,
        "hook": hook,
        "sections": [],
        "notes": [],
        "captions": caps,
        "transcript": sents,
        "words": [{"w": w["w"], "s": w["s"], "e": w["e"]} for w in out_words],
    }
    path = os.path.join(workdir, "edit_plan.json")
    write_plan(plan, path)
    removed = total - duration
    print(f"[prepare] {total:.1f}s -> {duration:.1f}s (bỏ {removed:.1f}s lặng, {len(frame_segs)} đoạn), "
          f"{len(caps)} câu phụ đề")
    print(f"[prepare] Đã ghi {path}")
    return path


def write_plan(plan, path):
    """Ghi JSON dễ đọc/sửa: mỗi câu phụ đề, câu transcript, từ nằm trên 1 dòng."""
    one_line = {"captions", "transcript", "words", "cut_points", "segments", "segments_frames", "sections"}
    parts = []
    for k, v in plan.items():
        if k in one_line and isinstance(v, list):
            if not v:
                body = "[]"
            else:
                body = "[\n" + ",\n".join("  " + json.dumps(x, ensure_ascii=False) for x in v) + "\n ]"
        else:
            body = json.dumps(v, ensure_ascii=False, indent=2).replace("\n", "\n ")
        parts.append(f" {json.dumps(k)}: {body}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(parts) + "\n}\n")


def load_plan(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)
