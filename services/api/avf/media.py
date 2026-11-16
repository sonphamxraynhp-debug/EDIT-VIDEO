"""M01 + M03: đọc metadata, proxy, keyframe, waveform, scene detect, ASR, OCR, chất lượng.

Tất cả xử lý chạy local bằng ffmpeg/ffprobe/whisper-cli/tesseract. Không sửa file gốc.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path

from . import config
from .errors import AppError

VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v", ".mkv"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}
AUDIO_EXT = {".wav", ".mp3", ".m4a", ".aac"}
DOC_EXT = {".pdf", ".docx", ".txt", ".csv", ".xlsx", ".json", ".md"}


def media_type_of(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext in VIDEO_EXT:
        return "video"
    if ext in IMAGE_EXT:
        return "image"
    if ext in AUDIO_EXT:
        return "audio"
    if ext in DOC_EXT:
        return "document"
    raise AppError("ASSET_UNSUPPORTED", f"Định dạng {ext or '(không có đuôi)'} chưa được hỗ trợ",
                   hint="Dùng MP4/MOV/WEBM, PNG/JPEG, WAV/MP3 hoặc PDF/DOCX/CSV/XLSX/JSON.")


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def run(cmd: list[str], timeout: int = 600) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError as e:
        raise AppError("TOOL_MISSING", f"Không tìm thấy công cụ {cmd[0]}",
                       hint="Cài ffmpeg/ffprobe và thêm vào PATH.") from e


def tool_available(name: str) -> bool:
    return shutil.which(name) is not None


def probe(path: Path) -> dict:
    """M01-03: codec, fps, bitrate, rotation, duration, aspect, audio channels, integrity."""
    r = run([config.FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)])
    if r.returncode != 0:
        raise AppError("ASSET_CORRUPT", "File hỏng hoặc codec không đọc được",
                       details={"stderr": r.stderr[-400:]}, hint="Xuất lại file bằng H.264/AAC rồi nhập lại.")
    info = json.loads(r.stdout or "{}")
    fmt = info.get("format", {})
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    a = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
    meta: dict = {
        "duration_ms": int(float(fmt.get("duration", 0) or 0) * 1000),
        "size_bytes": int(fmt.get("size", 0) or 0),
        "bitrate": int(fmt.get("bit_rate", 0) or 0),
        "container": fmt.get("format_name"),
    }
    if v:
        w, h = int(v.get("width", 0)), int(v.get("height", 0))
        rot = 0
        for sd in v.get("side_data_list", []) or []:
            if "rotation" in sd:
                rot = int(sd["rotation"])
        rot = int(v.get("tags", {}).get("rotate", rot))
        if abs(rot) % 180 == 90:
            w, h = h, w                       # TC-002: hiển thị đúng chiều
        try:
            fps = float(Fraction(v.get("avg_frame_rate", "0/1"))) if v.get("avg_frame_rate") != "0/0" else 0
        except (ZeroDivisionError, ValueError):
            fps = 0
        meta.update({
            "video_codec": v.get("codec_name"), "width": w, "height": h, "rotation": rot,
            "fps": round(fps, 2), "pix_fmt": v.get("pix_fmt"),
            "aspect": aspect_label(w, h),
        })
        if meta["duration_ms"] == 0 and v.get("duration"):
            meta["duration_ms"] = int(float(v["duration"]) * 1000)
    if a:
        meta.update({"audio_codec": a.get("codec_name"), "audio_channels": a.get("channels"),
                     "sample_rate": int(a.get("sample_rate", 0) or 0)})
    return meta


def aspect_label(w: int, h: int) -> str:
    if not w or not h:
        return "?"
    r = w / h
    for label, val in (("9:16", 9 / 16), ("1:1", 1.0), ("16:9", 16 / 9), ("4:5", 4 / 5), ("4:3", 4 / 3),
                       ("16:10", 16 / 10), ("3:4", 3 / 4), ("21:9", 21 / 9)):
        if abs(r - val) < 0.03:
            return label
    from math import gcd
    g = gcd(w, h)
    return f"{w // g}:{h // g}"


def make_thumbnail(src: Path, out: Path, at_ms: int = 500, width: int = 360) -> Path | None:
    out.parent.mkdir(parents=True, exist_ok=True)
    r = run([config.FFMPEG, "-y", "-v", "error", "-ss", f"{at_ms / 1000:.3f}", "-i", str(src),
             "-frames:v", "1", "-vf", f"scale={width}:-2", str(out)], timeout=120)
    return out if r.returncode == 0 and out.exists() else None


def make_proxy(src: Path, out: Path) -> Path | None:
    """M01-04: proxy 540p H.264 nhanh để preview."""
    tmp = out.with_suffix(".part.mp4")
    r = run([config.FFMPEG, "-y", "-v", "error", "-i", str(src), "-vf",
             "scale='if(gt(iw,ih),-2,540)':'if(gt(iw,ih),540,-2)'", "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "28", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(tmp)], timeout=1800)
    if r.returncode != 0:
        tmp.unlink(missing_ok=True)
        return None
    tmp.replace(out)                          # rename atomic
    return out


def waveform(src: Path, points: int = 400) -> list[float]:
    r = subprocess.run([config.FFMPEG, "-v", "error", "-i", str(src), "-ac", "1", "-ar", "4000",
                        "-f", "s16le", "-"], capture_output=True, timeout=300)
    if r.returncode != 0 or not r.stdout:
        return []
    import array
    samples = array.array("h", r.stdout[: len(r.stdout) // 2 * 2])
    if not samples:
        return []
    step = max(1, len(samples) // points)
    return [round(max(abs(x) for x in samples[i:i + step]) / 32768, 3) for i in range(0, len(samples), step)][:points]


def detect_scenes(src: Path, duration_ms: int, threshold: float = 0.3, min_len_ms: int = 1200) -> list[tuple[int, int]]:
    """M03-01: scene cut bằng bộ lọc scene của ffmpeg."""
    r = run([config.FFMPEG, "-v", "info", "-i", str(src), "-an", "-vf",
             f"select='gt(scene,{threshold})',showinfo", "-f", "null", "-"], timeout=1800)
    cuts = [int(float(m) * 1000) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr)]
    bounds = [0]
    for c in cuts:
        if c - bounds[-1] >= min_len_ms and duration_ms - c >= min_len_ms:
            bounds.append(c)
    # Video một cảnh dài: chia đều ~6s để có shot catalog dùng được
    if len(bounds) == 1 and duration_ms > 9000:
        n = max(2, round(duration_ms / 6000))
        bounds = [int(duration_ms * i / n) for i in range(n)]
    bounds.append(duration_ms)
    return [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)]


def frame_stats(src: Path, start_ms: int, end_ms: int) -> dict:
    """M03-06: độ sáng/độ nét/rung ước lượng từ signalstats."""
    dur = max(0.2, (end_ms - start_ms) / 1000)
    r = run([config.FFMPEG, "-v", "error", "-ss", f"{start_ms / 1000:.3f}", "-t", f"{dur:.3f}", "-i", str(src),
             "-vf", "fps=2,scale=320:-2,signalstats,metadata=print:file=-", "-an", "-f", "null", "-"], timeout=300)
    ys = [float(x) for x in re.findall(r"signalstats.YAVG=([0-9.]+)", r.stdout)]
    diffs = [float(x) for x in re.findall(r"signalstats.YDIF=([0-9.]+)", r.stdout)]
    bright = sum(ys) / len(ys) if ys else 0
    motion = sum(diffs) / len(diffs) if diffs else 0
    brightness = int(max(0, min(100, 100 - abs(bright - 128) / 1.28)))
    return {
        "brightness": brightness,
        "dark": bright < 40,
        "motion": round(motion, 2),
        "shaky": motion > 18,
        "score": int(max(0, min(100, brightness - (15 if motion > 18 else 0)))),
    }


def audio_levels(src: Path) -> dict:
    """Phát hiện clipping / im lặng (M03-06, M10-07)."""
    r = run([config.FFMPEG, "-v", "info", "-i", str(src), "-vn", "-af", "volumedetect", "-f", "null", "-"], timeout=600)
    mean = re.search(r"mean_volume: (-?[0-9.]+) dB", r.stderr)
    peak = re.search(r"max_volume: (-?[0-9.]+) dB", r.stderr)
    if not mean:
        return {"has_audio": False}
    m, p = float(mean.group(1)), float(peak.group(1)) if peak else 0.0
    return {"has_audio": True, "mean_db": m, "peak_db": p, "clipping": p >= -0.1, "silent": m < -55}


def black_frames(src: Path) -> list[dict]:
    r = run([config.FFMPEG, "-v", "info", "-i", str(src), "-vf", "blackdetect=d=0.4:pix_th=0.10",
             "-an", "-f", "null", "-"], timeout=900)
    return [{"start": float(a), "end": float(b)} for a, b in
            re.findall(r"black_start:([0-9.]+) black_end:([0-9.]+)", r.stderr)]


def frozen_frames(src: Path) -> list[dict]:
    r = run([config.FFMPEG, "-v", "info", "-i", str(src), "-vf", "freezedetect=n=0.002:d=2",
             "-an", "-f", "null", "-"], timeout=900)
    starts = re.findall(r"freeze_start: ([0-9.]+)", r.stderr)
    return [{"start": float(s)} for s in starts]


WHISPER_MODELS = {
    "accurate": {"file": "ggml-large-v3-turbo-q5_0.bin", "version": "large-v3-turbo-q5_0", "size_mb": 574,
                 "sha256": "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"},
    "base": {"file": "ggml-base.bin", "version": "base", "size_mb": 148},
}


def whisper_is_accurate() -> bool:
    """Bản base nghe tiếng Việt sai nhiều; từ cỡ small trở lên mới đủ tin để AI tự lập hồ sơ."""
    m = find_whisper_model()
    return bool(m) and m.stat().st_size > 400e6


def find_whisper_model() -> Path | None:
    """Model lớn nhất có trong thư mục (small/medium nhận tiếng Việt tốt hơn base)."""
    models = list(config.MODELS_DIR.glob("ggml-*.bin"))
    return max(models, key=lambda p: p.stat().st_size) if models else None


def transcribe(src: Path, work: Path) -> list[dict]:
    """M03-03: ASR tiếng Việt bằng whisper.cpp. Trả [] + raise nếu thiếu model."""
    model = find_whisper_model()
    if not tool_available(config.WHISPER_CLI) or model is None:
        raise AppError("ASR_MODEL_MISSING", "Chưa cài model Whisper local",
                       hint="Vào Quản lý mô hình AI → tải Whisper (ggml) từ nguồn được duyệt.", retryable=False)
    wav = work / "asr.wav"
    run([config.FFMPEG, "-y", "-v", "error", "-i", str(src), "-ac", "1", "-ar", "16000", str(wav)])
    out_base = work / "asr"
    threads = str(min(8, max(2, (os.cpu_count() or 4) - 1)))          # chừa 1 nhân cho giao diện / render
    r = run([config.WHISPER_CLI, "-m", str(model), "-l", "vi", "-t", threads, "-oj", "-of", str(out_base),
             "-f", str(wav)], timeout=3600)
    wav.unlink(missing_ok=True)
    jf = out_base.with_suffix(".json")
    if r.returncode != 0 or not jf.exists():
        raise AppError("ASR_FAILED", "Whisper không chạy được", details={"stderr": r.stderr[-400:]})
    data = json.loads(jf.read_text(encoding="utf-8", errors="ignore"))
    segs = []
    for s in data.get("transcription", []):
        off = s.get("offsets", {})
        text = s.get("text", "").strip()
        if text:
            segs.append({"start_ms": int(off.get("from", 0)), "end_ms": int(off.get("to", 0)), "text": text,
                         "confidence": None})
    return segs


def ocr_image(img: Path) -> str:
    """M03-04: OCR bằng tesseract (vie nếu có, không thì eng)."""
    if not tool_available(config.TESSERACT) or not img.exists():
        return ""
    langs = run([config.TESSERACT, "--list-langs"]).stdout
    lang = "vie" if "\nvie" in langs else "eng"
    r = run([config.TESSERACT, str(img), "-", "-l", lang, "--psm", "11"], timeout=60)
    text = " ".join(t for t in r.stdout.split() if len(t) > 1)
    return text[:300]


def disk_free_gb(path: Path = config.DATA_DIR) -> float:
    return shutil.disk_usage(path).free / 1e9
