#!/usr/bin/env bash
# Cài bộ giọng nhái (VieNeu-TTS v3 Turbo) vào .venv-voice — làm một lần. Model tải từ Hugging Face lần chạy đầu (~1 GB).
# Giấy phép VieNeu: LICENSE ghi Apache 2.0 nhưng lộ trình ghi v3 Turbo "personal use" — hỏi tác giả trước khi dùng thương mại.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="$(command -v python3.12 || command -v python3)"
[ -d .venv-voice ] || "$PY" -m venv .venv-voice
# huggingface_hub 2.x gom blob ra kho chung làm onnxruntime báo "External data path escapes model directory"
.venv-voice/bin/pip install -q "vieneu==3.8.3" "huggingface_hub<2" soundfile numpy
echo "Đã cài. Mở lại app bằng scripts/start.sh để bật giọng nhái."
