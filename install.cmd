@echo off
rem Bấm đúp để cài AI Video Studio trên Windows 10/11 (chạy install.ps1).
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
