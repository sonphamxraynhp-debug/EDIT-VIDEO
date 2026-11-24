@echo off
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul || (echo Chua co Python. Cai tu https://www.python.org/downloads/ ^(tick "Add python.exe to PATH"^) roi chay lai. & pause & exit /b 1)
where ffmpeg >nul 2>nul || (echo Dang cai ffmpeg... & winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements)
if not exist .venv (python -m venv .venv)
call .venv\Scripts\activate.bat
python -m pip install -q --upgrade pip
python -m pip install -q -r requirements.txt
python -m flow_agent setup --auto
pause
