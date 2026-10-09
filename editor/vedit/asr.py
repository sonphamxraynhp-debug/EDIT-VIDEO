"""Nhận dạng giọng nói tiếng Việt -> danh sách từ có mốc thời gian (giây, theo video gốc).

Hai bộ nhận dạng:
  sherpa   – Zipformer tiếng Việt (sherpa-onnx, chạy offline trên CPU, mặc định). Mô hình ~250 MB
             tải 1 lần từ GitHub Releases của k2-fsa/sherpa-onnx.
  whisper  – faster-whisper (tuỳ chọn, cần tải mô hình từ huggingface.co).
Hoặc nạp transcript có sẵn: .srt (xuất từ CapCut/Premiere...) hay .json [{"w","s","e"}].
"""
import glob
import json
import os
import re
import sys
import tarfile
import tempfile
import time
import urllib.request

import numpy as np

SR = 16000


def default_model_root():
    env = os.environ.get("EDIT_VIDEO_MODELS")
    if env:
        return env
    repo_models = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models")
    return repo_models


# ----------------------------------------------------------------------------- chia đoạn
def chunk_regions(voiced, total, max_len, join_gap=0.6, pad=0.25):
    """Gộp các vùng có tiếng thành đoạn ≤ max_len giây, chỉ cắt ở chỗ ngừng nói."""
    regions = []
    for a, b in voiced:
        if regions and a - regions[-1][1] <= join_gap and b - regions[-1][0] <= max_len:
            regions[-1] = (regions[-1][0], b)
        else:
            regions.append((a, b))
    out = []
    for a, b in regions:
        # Vùng nói liền quá dài (không có chỗ ngừng) -> chia đều
        n = max(1, int(np.ceil((b - a) / max_len)))
        step = (b - a) / n
        for i in range(n):
            out.append((max(0.0, a + i * step - pad), min(total, a + (i + 1) * step + pad)))
    return out


# ----------------------------------------------------------------------------- sherpa-onnx
def ensure_sherpa_model(cfg, model_root=None):
    root = model_root or default_model_root()
    name = cfg["sherpa_model"]
    path = os.path.join(root, name)
    if os.path.exists(os.path.join(path, "tokens.txt")):
        return path
    os.makedirs(root, exist_ok=True)
    url = cfg["sherpa_url"].format(name=name)
    print(f"[asr] Tải mô hình nhận dạng tiếng Việt (~200 MB, chỉ lần đầu): {url}", flush=True)
    with tempfile.NamedTemporaryFile(suffix=".tar.bz2", dir=root, delete=False) as tmp:
        tmp_path = tmp.name
    try:
        last = [0.0]

        def hook(blocks, bs, total):
            now = time.time()
            if now - last[0] > 3 and total > 0:
                last[0] = now
                print(f"[asr]   {min(100, blocks * bs * 100 // total)}%", flush=True)

        urllib.request.urlretrieve(url, tmp_path, hook)
        with tarfile.open(tmp_path, "r:bz2") as tf:
            tf.extractall(root, filter="data") if sys.version_info >= (3, 12) else tf.extractall(root)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    if not os.path.exists(os.path.join(path, "tokens.txt")):
        raise SystemExit(f"Giải nén mô hình thất bại: {path}")
    return path


def _pick(path, pattern, int8):
    files = sorted(glob.glob(os.path.join(path, pattern)))
    pref = [f for f in files if ("int8" in f) == int8]
    return (pref or files)[0]


def transcribe_sherpa(audio, chunks, voiced, cfg, model_root=None):
    import sherpa_onnx

    path = ensure_sherpa_model(cfg, model_root)
    int8 = bool(cfg.get("int8", False))
    rec = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=_pick(path, "encoder*.onnx", int8), decoder=_pick(path, "decoder*.onnx", int8),
        joiner=_pick(path, "joiner*.onnx", int8), tokens=os.path.join(path, "tokens.txt"),
        num_threads=max(1, min(8, os.cpu_count() or 2)), decoding_method="modified_beam_search",
    )
    words = []
    for a, b in chunks:
        seg = audio[int(a * SR):int(b * SR)]
        if len(seg) < SR * 0.2:
            continue
        st = rec.create_stream()
        st.accept_waveform(SR, seg)
        rec.decode_stream(st)
        res = st.result
        cur = None
        for tok, ts in zip(res.tokens, res.timestamps):
            t = a + float(ts)
            if tok.startswith(" ") or tok.startswith("▁") or cur is None:
                if cur:
                    words.append(cur)
                cur = {"w": tok.strip(" ▁"), "s": t, "e": t + 0.12}
            else:
                cur["w"] += tok
            cur["e"] = t + 0.12
        if cur:
            words.append(cur)
    words = [w for w in words if w["w"]]
    _fix_word_ends(words, voiced)
    for w in words:
        w["w"] = w["w"].lower()
    return words


def _fix_word_ends(words, voiced):
    """Transducer chỉ cho mốc bắt đầu từ -> ước lượng mốc kết thúc theo từ sau và vùng có tiếng."""
    for i, w in enumerate(words):
        nxt = words[i + 1]["s"] if i + 1 < len(words) else w["s"] + 0.6
        reg_end = next((b for a, b in voiced if a - 0.15 <= w["s"] <= b + 0.15), None)
        est = w["s"] + 0.12 + 0.045 * len(w["w"])
        e = min(nxt, max(w["e"], est))
        if reg_end is not None and nxt > reg_end:
            e = min(max(e, reg_end), nxt)  # từ cuối cụm: kéo tới hết vùng có tiếng
        w["e"] = round(max(e, w["s"] + 0.06), 3)
        w["s"] = round(w["s"], 3)


# ----------------------------------------------------------------------------- faster-whisper
def transcribe_whisper(audio, chunks, voiced, cfg):
    from faster_whisper import WhisperModel

    model = WhisperModel(cfg.get("whisper_model", "large-v3"), device="auto", compute_type="int8")
    words = []
    for a, b in chunks:
        seg = audio[int(a * SR):int(b * SR)]
        segments, _ = model.transcribe(seg, language=cfg.get("language", "vi"), beam_size=5,
                                       word_timestamps=True, vad_filter=False,
                                       initial_prompt=cfg.get("initial_prompt") or None)
        for s in segments:
            for w in s.words or []:
                txt = re.sub(r"[^\w\-']", "", w.word.strip().lower())
                if txt:
                    words.append({"w": txt, "s": round(a + w.start, 3), "e": round(a + w.end, 3)})
    return words


# ----------------------------------------------------------------------------- transcript có sẵn
def _srt_time(s):
    h, m, rest = s.strip().replace(".", ",").split(":")
    sec, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000


def load_transcript(path):
    if path.lower().endswith(".json"):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        data = data.get("words", data) if isinstance(data, dict) else data
        return [{"w": d["w"].lower(), "s": float(d["s"]), "e": float(d["e"])} for d in data]
    with open(path, encoding="utf-8-sig") as f:
        blocks = re.split(r"\n\s*\n", f.read().strip())
    words = []
    for blk in blocks:
        lines = [l for l in blk.strip().splitlines() if l.strip()]
        tl = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if tl is None:
            continue
        a, b = [_srt_time(x) for x in lines[tl].split("-->")]
        toks = " ".join(lines[tl + 1:]).split()
        toks = [re.sub(r"[^\w\-']", "", t.lower()) for t in toks]
        toks = [t for t in toks if t]
        if not toks:
            continue
        step = (b - a) / len(toks)
        for i, t in enumerate(toks):
            words.append({"w": t, "s": round(a + i * step, 3), "e": round(a + (i + 1) * step, 3)})
    return words


def transcribe(audio16k, voiced, total, cfg, engine=None, model_root=None):
    engine = engine or cfg.get("engine", "sherpa")
    chunks = chunk_regions(voiced, total, cfg.get("max_chunk", 18))
    t0 = time.time()
    if engine == "whisper":
        words = transcribe_whisper(audio16k, chunks, voiced, cfg)
    else:
        words = transcribe_sherpa(audio16k, chunks, voiced, cfg, model_root)
    print(f"[asr] {engine}: {len(words)} từ, {len(chunks)} đoạn, {time.time() - t0:.1f}s", flush=True)
    return words


def snap_to_voiced(words, voiced, tol=0.04):
    """Kéo mốc đầu/cuối từ nằm trong khoảng lặng về mép vùng có tiếng gần nhất.

    Mốc từ của mô hình có thể lệch ±0.3 s quanh chỗ ngừng; vùng có tiếng (đo năng lượng) thì chính xác.
    """
    if not words or not voiced:
        return words
    starts = [a for a, b in voiced]

    def locate(t):
        """(trong vùng?, vùng trước, vùng sau) cho thời điểm t."""
        import bisect
        i = bisect.bisect_right(starts, t) - 1
        if i >= 0 and t <= voiced[i][1] + tol:
            return True, i, i
        return False, i, i + 1

    out = []
    for w in words:
        s, e = w["s"], w["e"]
        inside, ip, inx = locate(s)
        if not inside:
            prev_end = voiced[ip][1] if ip >= 0 else -1e9
            next_start = voiced[inx][0] if inx < len(voiced) else 1e9
            if s - prev_end < next_start - s:   # từ thật ra thuộc cụm nói phía trước
                s = max(voiced[ip][0], prev_end - max(0.12, e - s))
                e = prev_end
            else:
                s = next_start
        inside, ip, inx = locate(e)
        if not inside:
            prev_end = voiced[ip][1] if ip >= 0 else e
            if prev_end > s + 0.05:
                e = prev_end
        e = max(e, s + 0.08)
        out.append(dict(w, s=round(s, 3), e=round(e, 3)))
    # giữ thứ tự, không chồng lấn
    for a, b in zip(out, out[1:]):
        if b["s"] < a["s"]:
            b["s"] = a["s"]
        if a["e"] > b["s"] and b["s"] > a["s"]:
            a["e"] = b["s"]
    return out
