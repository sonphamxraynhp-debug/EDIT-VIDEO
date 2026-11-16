#!/usr/bin/env bash
# Chế độ dùng thật: build giao diện một lần rồi phục vụ tất cả qua API tại http://127.0.0.1:8765
# Chạy được trên macOS và Linux. Lần đầu trên Linux nên chạy scripts/install-linux.sh trước.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"           # whisper-cli do install-linux.sh cài vào đây

PY="$(command -v python3.12 || command -v python3)"
if [ ! -x .venv/bin/python ]; then
  "$PY" -m venv .venv || { echo "Không tạo được môi trường Python. Ubuntu/Debian: sudo apt install python3-venv"; exit 1; }
fi
# cài lại thư viện khi requirements.txt đổi (vd. bản cập nhật thêm thư viện mới)
if [ ! -f .venv/.req-stamp ] || [ services/api/requirements.txt -nt .venv/.req-stamp ]; then
  .venv/bin/pip install -q -r services/api/requirements.txt && touch .venv/.req-stamp
fi
(cd apps/desktop && { [ -d node_modules ] || npm install; } && npm run build)

if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q '127.0.0.1:8765 '; then
  echo "Cổng 8765 đang bị chương trình khác dùng (có thể app đã mở sẵn): http://127.0.0.1:8765"; exit 1
fi

export PYTHONPATH="$ROOT/services/api"
PIDS=()
mkdir -p "${AVF_DATA_DIR:-$ROOT/data}"
# Ollama cài nhưng chưa chạy → bật kèm, cấu hình gọn RAM cho máy 16 GB (1 model, 1 yêu cầu, KV cache nén)
if command -v ollama >/dev/null 2>&1 && ! curl -s -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 \
    ollama serve >"${AVF_DATA_DIR:-$ROOT/data}/ollama.log" 2>&1 &
  PIDS+=($!)
fi
if [ -x .venv-voice/bin/python ]; then         # giọng nhái (scripts/setup-voice.sh); không có thì dùng giọng hệ điều hành / Piper
  .venv-voice/bin/python -I services/voice/server.py &
  PIDS+=($!)
fi
.venv/bin/python -m avf.worker &
PIDS+=($!)
trap 'kill "${PIDS[@]}" 2>/dev/null' EXIT INT TERM
echo "AI Video Factory: http://127.0.0.1:8765"
.venv/bin/python -m uvicorn avf.main:app --host 127.0.0.1 --port 8765
