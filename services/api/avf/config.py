"""Cấu hình local. Không hardcode secrets; mọi đường dẫn có thể đổi qua biến môi trường."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = Path(os.environ.get("AVF_DATA_DIR", ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "avf.sqlite3"
MEDIA_DIR = DATA_DIR / "media"        # bản sao nguồn (không sửa file gốc)
PROXY_DIR = DATA_DIR / "proxy"        # proxy, keyframe, waveform
WORK_DIR = DATA_DIR / "work"          # file tạm khi render
OUTPUT_DIR = Path(os.environ.get("AVF_OUTPUT_DIR", DATA_DIR / "output")).resolve()
MODELS_DIR = DATA_DIR / "models"
LOG_DIR = DATA_DIR / "logs"

HOST = "127.0.0.1"                    # chỉ bind localhost (NFR-06)
PORT = int(os.environ.get("AVF_PORT", "8765"))

OLLAMA_URL = os.environ.get("AVF_OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("AVF_OLLAMA_MODEL", "qwen3:8b")
# Máy 16 GB: giới hạn ngữ cảnh (KV cache ~1,2 GB ở 8192) và nhả model khỏi RAM sau 3 phút rảnh để dành RAM cho render
OLLAMA_NUM_CTX = int(os.environ.get("AVF_OLLAMA_NUM_CTX", "8192"))
OLLAMA_KEEP_ALIVE = os.environ.get("AVF_OLLAMA_KEEP_ALIVE", "3m")
FFMPEG = os.environ.get("AVF_FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("AVF_FFPROBE", "ffprobe")
WHISPER_CLI = os.environ.get("AVF_WHISPER_CLI", "whisper-cli")
TESSERACT = os.environ.get("AVF_TESSERACT", "tesseract")
VOICE_URL = f"http://127.0.0.1:{os.environ.get('AVF_VOICE_PORT', '8771')}"   # máy chủ giọng nhái (services/voice)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

MIN_FREE_DISK_GB = float(os.environ.get("AVF_MIN_FREE_GB", "2"))

for d in (DATA_DIR, MEDIA_DIR, PROXY_DIR, WORK_DIR, OUTPUT_DIR, MODELS_DIR, LOG_DIR):
    d.mkdir(parents=True, exist_ok=True)
