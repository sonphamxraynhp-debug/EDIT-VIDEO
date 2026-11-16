# Windows: chạy API (127.0.0.1:8765) + worker + giao diện dev (127.0.0.1:5190). Đóng cửa sổ để dừng.
# Yêu cầu: Python 3.11+, Node 18+, ffmpeg trong PATH (winget install Gyan.FFmpeg). Tuỳ chọn: Ollama, whisper-cli, tesseract.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if (-not (Test-Path ".venv")) { python -m venv .venv; .\.venv\Scripts\pip install -q -r services\api\requirements.txt }
if (-not (Test-Path "apps\desktop\node_modules")) { Push-Location apps\desktop; npm install; Pop-Location }
$env:PYTHONPATH = "$Root\services\api"
$api = Start-Process -PassThru -NoNewWindow .\.venv\Scripts\python.exe -ArgumentList "-m uvicorn avf.main:app --host 127.0.0.1 --port 8765"
$worker = Start-Process -PassThru -NoNewWindow .\.venv\Scripts\python.exe -ArgumentList "-m avf.worker"
$ui = Start-Process -PassThru -NoNewWindow -WorkingDirectory "$Root\apps\desktop" npx -ArgumentList "vite --host 127.0.0.1 --port 5190"
Write-Host "AI Video Factory: http://127.0.0.1:5190  (Ctrl+C để dừng)"
try { Wait-Process -Id $api.Id } finally { foreach ($p in @($api, $worker, $ui)) { try { Stop-Process -Id $p.Id -Force } catch {} } }
