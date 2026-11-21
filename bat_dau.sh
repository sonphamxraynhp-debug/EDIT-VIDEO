#!/usr/bin/env bash
# Cài đặt + chạy agent lần đầu trên macOS / Linux: ./bat_dau.sh
set -euo pipefail
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Chưa có Python 3 — cài từ python.org rồi chạy lại."; exit 1; }
if ! command -v ffmpeg >/dev/null; then
  if command -v brew >/dev/null; then brew install ffmpeg; else echo "Cài ffmpeg (sudo apt install ffmpeg) rồi chạy lại."; exit 1; fi
fi
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
python -m pip install -q --upgrade pip
python -m pip install -q -r requirements.txt
python -m flow_agent setup
