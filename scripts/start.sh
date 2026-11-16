#!/usr/bin/env bash
# Chế độ dùng thật: build giao diện một lần rồi phục vụ tất cả qua API tại http://127.0.0.1:8765
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -q -r services/api/requirements.txt; }
(cd apps/desktop && { [ -d node_modules ] || npm install; } && npm run build)
export PYTHONPATH="$ROOT/services/api"
VOICE=""
if [ -x .venv-voice/bin/python ]; then         # giọng nhái (scripts/setup-voice.sh); không có thì dùng giọng hệ điều hành
  .venv-voice/bin/python -I services/voice/server.py &
  VOICE=$!
fi
.venv/bin/python -m avf.worker &
WORKER=$!
trap 'kill $WORKER $VOICE 2>/dev/null' EXIT INT TERM
echo "AI Video Factory: http://127.0.0.1:8765"
.venv/bin/python -m uvicorn avf.main:app --host 127.0.0.1 --port 8765
