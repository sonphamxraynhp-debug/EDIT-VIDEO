@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Flow Video Agent - lam video va dang Chi minh toi
where python >/dev/null 2>/dev/null || (echo Chua co Python. Cai tu https://www.python.org/downloads/ ^(tick "Add python.exe to PATH"^) roi chay lai. & pause & exit /b 1)
where ffmpeg >/dev/null 2>/dev/null || (echo Dang cai ffmpeg... & winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements)
if not exist .venv (python -m venv .venv)
call .venv\Scripts\activate.bat
python -m pip install -q -r requirements.txt
if not exist config\config.yaml copy config\config.example.yaml config\config.yaml >nul
if not exist .env copy .env.example .env >nul
python -m flow_agent make-video %*
pause
