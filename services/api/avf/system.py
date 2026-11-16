"""M12: phát hiện phần cứng, giám sát tài nguyên, registry model local."""
from __future__ import annotations

import platform
import shutil
import subprocess
import time

import psutil

from . import ai, config, media, tts

_cache: dict = {}


def _sysctl(key: str) -> str:
    try:
        return subprocess.run(["sysctl", "-n", key], capture_output=True, text=True, timeout=2).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def hardware_static() -> dict:
    if "static" in _cache:
        return _cache["static"]
    system = platform.system()
    cpu = platform.processor() or platform.machine()
    gpu, unified = "Không xác định", False
    if system == "Darwin":
        cpu = _sysctl("machdep.cpu.brand_string") or cpu
        if platform.machine() == "arm64":
            gpu, unified = f"{cpu} GPU (Unified Memory)", True
    elif shutil.which("nvidia-smi"):
        r = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                           capture_output=True, text=True)
        gpu = r.stdout.strip() or gpu
    encoders = subprocess.run([config.FFMPEG, "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    hw = [e for e in ("h264_videotoolbox", "hevc_videotoolbox", "h264_nvenc", "hevc_nvenc", "h264_qsv", "h264_amf",
                      "av1_nvenc") if e in encoders]
    disk = shutil.disk_usage(config.DATA_DIR)
    _cache["static"] = {
        "os": f"{system} {platform.release()}", "os_pretty": platform.platform(terse=True),
        "cpu": cpu, "cores_physical": psutil.cpu_count(logical=False), "cores_logical": psutil.cpu_count(),
        "gpu": gpu, "unified_memory": unified, "ram_total_gb": round(psutil.virtual_memory().total / 1e9, 1),
        "disk_total_gb": round(disk.total / 1e9), "hw_encoders": hw, "sw_encoder": "libx264" in encoders,
        "ffmpeg": subprocess.run([config.FFMPEG, "-version"], capture_output=True, text=True).stdout.split("\n")[0][:60],
    }
    return _cache["static"]


def hardware_live() -> dict:
    vm = psutil.virtual_memory()
    disk = shutil.disk_usage(config.DATA_DIR)
    io = psutil.disk_io_counters()
    now = time.time()
    prev = _cache.get("io")
    rd = wr = 0.0
    if prev and io:
        dt = max(0.1, now - prev[0])
        rd, wr = (io.read_bytes - prev[1]) / dt / 1e6, (io.write_bytes - prev[2]) / dt / 1e6
    if io:
        _cache["io"] = (now, io.read_bytes, io.write_bytes)
    temps = None
    try:
        t = psutil.sensors_temperatures() if hasattr(psutil, "sensors_temperatures") else {}
        vals = [x.current for v in t.values() for x in v]
        temps = round(max(vals)) if vals else None
    except (OSError, AttributeError):
        pass
    return {
        "cpu_pct": psutil.cpu_percent(interval=None), "ram_used_gb": round((vm.total - vm.available) / 1e9, 1),
        "ram_total_gb": round(vm.total / 1e9, 1), "ram_pct": vm.percent,
        "gpu_pct": None,   # cần công cụ riêng theo hãng; UI hiển thị "N/A" thay vì số giả
        "disk_free_gb": round(disk.free / 1e9, 1), "disk_total_gb": round(disk.total / 1e9),
        "disk_read_mbs": round(rd, 1), "disk_write_mbs": round(wr, 1), "temp_c": temps, "ts": now,
    }


def best_encoder(prefer_gpu: bool = True) -> str:
    hw = hardware_static()["hw_encoders"]
    if prefer_gpu:
        for e in ("h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_amf"):
            if e in hw:
                return e
    return "libx264"                           # M09-08 fallback CPU


def models_status() -> list[dict]:
    llm_models = ai.ollama_models()
    whisper = media.find_whisper_model()
    tesslangs = media.run([config.TESSERACT, "--list-langs"]).stdout if media.tool_available(config.TESSERACT) else ""
    tts_p = tts.providers()
    out = [
        {"kind": "llm", "title": "LLM – Tạo kịch bản, phân tích nội dung", "provider": "Ollama",
         "model_name": config.OLLAMA_MODEL, "installed": any(m["name"] == config.OLLAMA_MODEL for m in llm_models),
         "size_gb": round(next((m["size"] for m in llm_models if m["name"] == config.OLLAMA_MODEL), 0) / 1e9, 1),
         "license": "Apache 2.0 (Qwen3)", "backend": "Metal/CUDA/CPU",
         "available": [m["name"] for m in llm_models]},
        {"kind": "asr", "title": "ASR – Chuyển giọng nói thành văn bản", "provider": "whisper.cpp",
         "model_name": whisper.name if whisper else "ggml-base.bin", "installed": bool(whisper) and media.tool_available(config.WHISPER_CLI),
         "size_gb": round(whisper.stat().st_size / 1e9, 2) if whisper else 0.15, "license": "MIT",
         "backend": "CPU/Metal", "cli": media.tool_available(config.WHISPER_CLI), "accurate": media.whisper_is_accurate(),
         "download_url": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/" + media.WHISPER_MODELS["accurate"]["file"]},
        {"kind": "tts", "title": "TTS – Chuyển văn bản thành giọng nói", "provider": tts_p[0]["name"] if tts_p else "—",
         "model_name": ", ".join(tts_p[0]["voices"]) if tts_p else "—", "installed": bool(tts_p and tts_p[0]["ready"]),
         "size_gb": 0, "license": tts_p[0]["license"] if tts_p else "—", "backend": "CPU"},
        {"kind": "ocr", "title": "OCR – Nhận diện chữ trong ảnh/video", "provider": "Tesseract",
         "model_name": "vie" if "vie" in tesslangs.split() else "eng (thiếu vie)",
         "installed": media.tool_available(config.TESSERACT), "size_gb": 0.02, "license": "Apache 2.0", "backend": "CPU",
         "warning": None if "vie" in tesslangs.split() else "Chưa có gói ngôn ngữ tiếng Việt (vie.traineddata)"},
        {"kind": "embeddings", "title": "Embeddings – So sánh ngữ nghĩa", "provider": "Built-in",
         "model_name": "TF cosine (unigram+bigram)", "installed": True, "size_gb": 0, "license": "Nội bộ",
         "backend": "CPU", "note": "Có thể thay bằng BGE-M3 qua Ollama"},
        {"kind": "vision", "title": "Vision – Gắn nhãn cảnh", "provider": "Heuristic + người duyệt",
         "model_name": "signalstats + OCR + tag thủ công", "installed": True, "size_gb": 0, "license": "Nội bộ",
         "backend": "CPU", "note": "Gắn nhãn tự động có confidence thấp; cần người xác nhận (M03-08)"},
    ]
    return out
