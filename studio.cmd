@echo off
rem Mở AI Video Studio trên Windows (giống studio.sh):
rem   studio.cmd                         dự án clip mẫu
rem   studio.cmd <thư mục dự án>         mở dự án
rem   studio.cmd --new <video.mp4>       tạo dự án từ video thô
rem Giữ cửa sổ này mở trong lúc dùng; đóng nó là tắt Studio.
chcp 65001 >nul
title AI Video Studio
set "HERE=%~dp0"
set "AVSH=%AVS_HOME%"
if "%AVSH%"=="" set "AVSH=%USERPROFILE%\.ai-video-studio"
where node >nul 2>nul || (echo Chưa có Node.js. Chạy install.cmd trước. & pause & exit /b 1)
if "%~1"=="" if exist "%AVSH%\footage\clip-mau\timeline.json" (
  node "%HERE%studio\server.mjs" "%AVSH%\footage\clip-mau" --open
  goto done
)
node "%HERE%studio\server.mjs" %* --open
:done
if errorlevel 1 pause
