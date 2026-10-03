"""Nhận dạng giọng nói tiếng Việt lấy mốc thời gian từng từ.

Hai bộ nhận dạng:
- faster-whisper (mặc định, cần tải mô hình từ huggingface.co)
- sherpa-onnx Zipformer tiếng Việt (~70k giờ dữ liệu, tải từ GitHub Releases) – dùng khi chọn
  backend "sherpa-onnx" hoặc khi faster-whisper không chạy được (thiếu thư viện / mạng chặn huggingface).
"""
import json
import os
import subprocess
import tarfile
import urllib.request

import numpy as np

SHERPA_MODEL = "sherpa-onnx-zipformer-vi-2025-04-20"
SHERPA_URL = f"https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{SHERPA_MODEL}.tar.bz2"


def transcribe(wav16k_path, cfg, model_name=None, device="auto", backend=None):
    """Trả về danh sách từ [{"w", "s", "e", "seg"}] theo thời gian của file wav."""
    backend = backend or os.environ.get("VEDIT_ASR_BACKEND") or cfg.get("backend", "auto")
    if backend == "sherpa-onnx":
        return transcribe_sherpa(wav16k_path, cfg)
    try:
        return transcribe_whisper(wav16k_path, cfg, model_name, device)
    except Exception as exc:
        if backend != "auto":
            raise
        print(f"[asr] faster-whisper không chạy được ({type(exc).__name__}: {str(exc)[:160]}).\n"
              f"[asr] Chuyển sang sherpa-onnx Zipformer tiếng Việt.", flush=True)
        return transcribe_sherpa(wav16k_path, cfg)


def transcribe_whisper(wav16k_path, cfg, model_name=None, device="auto"):
    model_name = model_name or os.environ.get("VEDIT_ASR_MODEL") or cfg["model"]
    from faster_whisper import WhisperModel

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


# ---------------------------------------------------------------- sherpa-onnx (Zipformer tiếng Việt)
def _sherpa_model_dir():
    d = os.environ.get("VEDIT_SHERPA_MODEL")
    if d:
        return d
    cache = os.path.join(os.path.expanduser(os.environ.get("XDG_CACHE_HOME", "~/.cache")), "vedit")
    d = os.path.join(cache, SHERPA_MODEL)
    if not os.path.exists(os.path.join(d, "tokens.txt")):
        os.makedirs(cache, exist_ok=True)
        tmp = os.path.join(cache, SHERPA_MODEL + ".tar.bz2")
        print(f"[asr] Đang tải mô hình {SHERPA_MODEL} (~250 MB) từ GitHub...", flush=True)
        urllib.request.urlretrieve(SHERPA_URL, tmp)
        with tarfile.open(tmp) as tar:
            tar.extractall(cache)
        os.remove(tmp)
    return d


def _split_points(audio, sr, min_len=8.0, max_len=18.0):
    """Chia audio dài thành đoạn 8-18 s, cắt tại chỗ yên lặng nhất để không cắt giữa từ."""
    win = int(sr * 0.02)
    n = len(audio) // win
    rms = np.sqrt(np.mean(audio[: n * win].reshape(n, win) ** 2, axis=1) + 1e-12)
    bounds, start = [0], 0
    while (len(audio) - start) / sr > max_len:
        lo, hi = start + int(min_len * sr), start + int(max_len * sr)
        a, b = lo // win, min(hi // win, n)
        cut = (a + int(np.argmin(rms[a:b]))) * win + win // 2
        bounds.append(cut)
        start = cut
    bounds.append(len(audio))
    return list(zip(bounds, bounds[1:]))


def _speech_onset(audio, sr, a, b, lead=0.12):
    """Vị trí (mẫu) bắt đầu có tiếng trong audio[a:b], lùi lại `lead` giây."""
    win = int(sr * 0.02)
    seg = audio[a:b]
    n = len(seg) // win
    if n < 5:
        return a
    db = 20 * np.log10(np.sqrt(np.mean(seg[: n * win].reshape(n, win) ** 2, axis=1) + 1e-12) + 1e-12)
    live = db[db > -90]
    if len(live) < 5:
        return a
    thr = np.percentile(live, 10) + 0.4 * (np.percentile(live, 90) - np.percentile(live, 10))
    on = np.where(db > thr)[0]
    if not len(on):
        return a
    return max(a, a + on[0] * win - int(lead * sr))


def transcribe_sherpa(wav16k_path, cfg):
    try:
        import sherpa_onnx
    except ImportError as exc:
        raise SystemExit("Chưa cài sherpa-onnx: pip install sherpa-onnx") from exc
    d = _sherpa_model_dir()

    def f(prefix):
        return os.path.join(d, next(x for x in sorted(os.listdir(d)) if x.startswith(prefix) and x.endswith(".onnx")))

    rec = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=f("encoder"), decoder=f("decoder"), joiner=f("joiner"),
        tokens=os.path.join(d, "tokens.txt"), num_threads=min(8, os.cpu_count() or 4),
        decoding_method="modified_beam_search")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav16k_path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    audio = np.frombuffer(raw, np.float32)
    sr = 16000
    words = []
    for seg_id, (a, b) in enumerate(_split_points(audio, sr)):
        # Bỏ phần lặng đầu đoạn: mô hình hay gán từ đầu tiên vào mốc 0 của đoạn
        a = _speech_onset(audio, sr, a, b)
        chunk = audio[a:b]
        if len(chunk) < sr:  # mô hình cần tối thiểu ~1 s
            chunk = np.concatenate([chunk, np.zeros(sr - len(chunk), np.float32)])
        st = rec.create_stream()
        st.accept_waveform(sr, chunk)
        rec.decode_stream(st)
        r = st.result
        off = a / sr
        cur = None
        for tok, ts in zip(r.tokens, r.timestamps):
            t = off + float(ts)
            if tok.startswith(" ") or tok.startswith("▁") or cur is None:
                if cur:
                    words.append(cur)
                cur = {"w": tok.strip(" ▁").lower(), "s": t, "last": t, "seg": seg_id}
            else:
                cur["w"] += tok.lower()
                cur["last"] = t
        if cur:
            words.append(cur)
        print(f"[asr] {off:6.1f}s  {r.text.lower()}", flush=True)
    # Mốc kết thúc từ = token cuối + 0.25 s, không vượt quá đầu từ kế tiếp
    for w, nxt in zip(words, words[1:] + [None]):
        end = w.pop("last") + 0.25
        if nxt is not None:
            end = min(end, nxt["s"])
        w["s"], w["e"] = round(w["s"], 3), round(max(end, w["s"] + 0.06), 3)
        w["approx"] = True  # mốc từ lệch được ±0.5 s: chỉ dùng cho phụ đề, không dùng để chặn điểm cắt
    return [w for w in words if w["w"]]
