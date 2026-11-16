# Windows: build giao diện rồi chạy API + worker tại http://127.0.0.1:8765
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if (-not (Test-Path ".venv")) { python -m venv .venv; .\.venv\Scripts\pip install -q -r services\api\requirements.txt }
Push-Location apps\desktop; if (-not (Test-Path "node_modules")) { npm install }; npm run build; Pop-Location
$env:PYTHONPATH = "$Root\services\api"
$worker = Start-Process -PassThru -NoNewWindow .\.venv\Scripts\python.exe -ArgumentList "-m avf.worker"
Write-Host "AI Video Factory: http://127.0.0.1:8765"
try { & .\.venv\Scripts\python.exe -m uvicorn avf.main:app --host 127.0.0.1 --port 8765 } finally { try { Stop-Process -Id $worker.Id -Force } catch {} }
