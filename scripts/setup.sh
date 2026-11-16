#!/bin/bash
# One-time setup: Python venv (whisper, rembg, numpy, scipy) + puppeteer-core. Needs ffmpeg + Google Chrome + Node 18.
# The sound + b-roll libraries ship pre-generated; they are only rebuilt here if missing.
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
./.venv/bin/pip -q install faster-whisper numpy scipy pillow "rembg[cpu]"
./.venv/bin/pip -q install edge-tts || echo "edge-tts not installed (optional: online voices for scripts/dub.py --tts edge)"
npm install --silent
PY=./.venv/bin/python
[ -f ../assets/sfx/catalog.json ] || $PY gen_sfx.py ../assets/sfx --ext flac
[ -f ../assets/music/catalog.json ] || $PY gen_music.py ../assets/music
[ -f ../assets/broll/catalog.json ] || $PY gen_broll_catalog.py
echo "SFX:   $(ls ../assets/sfx/*.flac | wc -l | tr -d ' ') · music: $(ls ../assets/music/*.mp3 | wc -l | tr -d ' ') · b-roll presets: $($PY -c "import json;print(len(json.load(open('../assets/broll/catalog.json'))))")"
echo "OK. Python: $(pwd)/.venv/bin/python"
