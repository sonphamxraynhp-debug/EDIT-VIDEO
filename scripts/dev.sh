#!/usr/bin/env bash
# Chạy API (127.0.0.1:8765) + worker + giao diện dev (127.0.0.1:5190). Ctrl+C để dừng tất cả.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$PATH"           # whisper-cli do install-linux.sh cài vào đây
[ -x .venv/bin/python ] || python3 -m venv .venv
if [ ! -f .venv/.req-stamp ] || [ services/api/requirements.txt -nt .venv/.req-stamp ]; then
  .venv/bin/pip install -q -r services/api/requirements.txt && touch .venv/.req-stamp
fi
[ -d apps/desktop/node_modules ] || (cd apps/desktop && npm install)
export PYTHONPATH="$ROOT/services/api"
VOICE=""
if [ -x .venv-voice/bin/python ]; then         # giọng nhái (scripts/setup-voice.sh); không có thì dùng giọng hệ điều hành
  .venv-voice/bin/python -I services/voice/server.py &
  VOICE=$!
fi
.venv/bin/python -m uvicorn avf.main:app --host 127.0.0.1 --port 8765 &
API=$!
.venv/bin/python -m avf.worker &
WORKER=$!
(cd apps/desktop && npx vite --host 127.0.0.1 --port 5190) &
UI=$!
trap 'kill $API $WORKER $UI $VOICE 2>/dev/null' EXIT INT TERM
echo "AI Video Factory: http://127.0.0.1:5190"
wait
