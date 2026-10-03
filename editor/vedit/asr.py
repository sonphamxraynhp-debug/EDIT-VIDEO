"""Nhận dạng giọng nói tiếng Việt (faster-whisper) lấy mốc thời gian từng từ."""
import json
import os


def transcribe(wav16k_path, cfg, model_name=None, device="auto"):
    """Trả về danh sách từ [{"w", "s", "e"}] theo thời gian của file wav."""
    model_name = model_name or os.environ.get("VEDIT_ASR_MODEL") or cfg["model"]
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "Chưa cài faster-whisper. Chạy: pip install -r editor/requirements.txt\n"
            "Hoặc tự cung cấp transcript bằng --transcript file.json"
        ) from exc

    if device == "auto":
        try:
            import ctranslate2
            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            device = "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    print(f"[asr] Đang tải mô hình {model_name} ({device}, {compute_type})...", flush=True)
    model = WhisperModel(model_name, device=device, compute_type=compute_type)

    segments, _ = model.transcribe(
        str(wav16k_path),
        language=cfg.get("language", "vi"),
        beam_size=cfg.get("beam_size", 5),
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
        initial_prompt=cfg.get("initial_prompt") or None,
        condition_on_previous_text=False,
    )
    words = []
    for i, seg in enumerate(segments):
        for w in seg.words or []:
            text = w.word.strip()
            if text:
                words.append({"w": text, "s": round(w.start, 3), "e": round(w.end, 3), "seg": i})
        print(f"[asr] {seg.start:6.1f}s  {seg.text.strip()}", flush=True)
    return words


def load_transcript(path):
    """Đọc transcript tự cung cấp.

    Hỗ trợ: {"words": [{"w","s","e"}]} | [{"w","s","e"}] | {"segments": [{"text","start","end"}]} | file .srt.
    Với dạng segments (không có mốc từng từ), thời gian được chia đều theo số ký tự.
    """
    if str(path).lower().endswith(".srt"):
        data = {"segments": parse_srt(path)}
    else:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    if isinstance(data, list):
        return data
    if "words" in data:
        return data["words"]
    words = []
    for i, seg in enumerate(data.get("segments", [])):
        toks = seg["text"].split()
        if not toks:
            continue
        total = sum(len(t) + 1 for t in toks)
        t = seg["start"]
        span = seg["end"] - seg["start"]
        for tok in toks:
            d = span * (len(tok) + 1) / total
            words.append({"w": tok, "s": round(t, 3), "e": round(t + d * 0.92, 3), "seg": i})
            t += d
    return words


def parse_srt(path):
    """Đọc phụ đề .srt (vd. xuất từ CapCut) -> [{"text","start","end"}]."""
    def ts(x):
        h, m, rest = x.strip().replace(".", ",").split(":")
        sec, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000

    with open(path, encoding="utf-8-sig") as f:
        blocks = f.read().replace("\r\n", "\n").strip().split("\n\n")
    segs = []
    for block in blocks:
        lines = [l for l in block.strip().split("\n") if l.strip()]
        idx = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if idx is None:
            continue
        a, b = lines[idx].split("-->")
        text = " ".join(lines[idx + 1:]).strip()
        if text:
            segs.append({"text": text, "start": ts(a), "end": ts(b.split()[0])})
    return segs
