@echo off
chcp 65001 >nul
cd /d "%~dp0"
call .venv\Scripts\activate.bat
title Flow Video Agent - dang tu chay (dung dong cua so nay)
python -m flow_agent run
pause
