# AI Video Studio — cài đặt trên Windows 10/11 (bản tương đương install.sh).
#   Bấm đúp install.cmd, hoặc:  powershell -ExecutionPolicy Bypass -File install.ps1 [-NoSkill] [-NoShortcut] [-Yes]
#   -Yes: tự cài công cụ còn thiếu bằng winget, không hỏi lại.
param([switch]$NoSkill, [switch]$NoShortcut, [switch]$Yes)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$REPO = $PSScriptRoot
$SKILL_DIR = if ($env:AVS_SKILL_DIR) { $env:AVS_SKILL_DIR } else { Join-Path $HOME '.claude\skills\ai-video-studio' }
$HOME_DIR = if ($env:AVS_HOME) { $env:AVS_HOME } else { Join-Path $HOME '.ai-video-studio' }
$SAMPLE = Join-Path $HOME_DIR 'footage\clip-mau'

function Say($m) { Write-Host "▸ $m" -ForegroundColor Magenta }
function Die($m) { Write-Host "✗ $m" -ForegroundColor Red; exit 1 }
function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
# Missing tool → offer winget (built into Windows 10 1809+/11), then re-read PATH so this window sees it.
function Need($cmd, $wingetId, $label, $url) {
  if (Has $cmd) { return }
  if (Has 'winget') {
    $ok = $Yes -or ((Read-Host "Thiếu $label. Cài tự động bằng winget? (Y/n)") -notmatch '^[nN]')
    if ($ok) {
      Say "Cài $label…"
      winget install --id $wingetId -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
      RefreshPath
      if (Has $cmd) { return }
      Die "Đã cài $label nhưng cửa sổ này chưa thấy. Đóng cửa sổ, mở lại install.cmd."
    }
  }
  Die "Thiếu $label. Tải tại $url rồi chạy lại install.cmd."
}

# 1. Công cụ cần có
Say 'Kiểm tra công cụ'
Need 'ffmpeg' 'Gyan.FFmpeg' 'ffmpeg' 'https://www.gyan.dev/ffmpeg/builds/'
Need 'node' 'OpenJS.NodeJS.LTS' 'Node.js ≥ 18' 'https://nodejs.org'
if ([int](node -p 'process.versions.node.split(".")[0]') -lt 18) { Die 'Node.js quá cũ (cần ≥ 18). Cài bản LTS mới tại https://nodejs.org' }
# python.exe in WindowsApps is only the Microsoft Store stub; prefer the py launcher, then a real python.exe
$PY = $null
if (Has 'py') { try { & py -3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; if ($LASTEXITCODE -eq 0) { $PY = @('py', '-3') } } catch {} }
if (-not $PY -and (Has 'python') -and ((Get-Command python).Source -notmatch 'WindowsApps')) {
  & python -c 'import sys; sys.exit(sys.version_info < (3, 10))'; if ($LASTEXITCODE -eq 0) { $PY = @('python') }
}
if (-not $PY) {
  Need 'py' 'Python.Python.3.12' 'Python 3.10+' 'https://www.python.org/downloads/ (nhớ tick "Add python.exe to PATH")'
  $PY = @('py', '-3')
}
$CHROME = @($env:CHROME_PATH,
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") |
  Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $CHROME) { Die 'Thiếu Google Chrome hoặc Microsoft Edge (dùng để render video). Tải Chrome tại https://www.google.com/chrome/' }
Say "Trình duyệt render: $CHROME"
if (Has 'claude') { Say 'Có Claude Code CLI → bật được AI dựng giúp, Tạo style, lồng tiếng…' }
else { Say 'Chưa có Claude Code CLI (tính năng AI sẽ tắt). Cài: https://docs.claude.com/claude-code' }

# 2. Thư viện Python (venv) + puppeteer-core
Say 'Cài thư viện (Python venv + puppeteer-core) — lần đầu mất vài phút'
$S = Join-Path $REPO 'scripts'
$VPY = Join-Path $S '.venv\Scripts\python.exe'
if (-not (Test-Path $VPY)) { & $PY[0] $PY[1..9] -m venv (Join-Path $S '.venv'); if ($LASTEXITCODE) { Die 'Không tạo được Python venv' } }
& $VPY -m pip install -q --upgrade pip
& $VPY -m pip install -q faster-whisper numpy scipy pillow 'rembg[cpu]'; if ($LASTEXITCODE) { Die 'Cài thư viện Python lỗi (xem dòng báo lỗi ở trên)' }
& $VPY -m pip install -q edge-tts; if ($LASTEXITCODE) { Say 'Bỏ qua edge-tts (giọng đọc online, không bắt buộc)' }
Push-Location $S; npm install --silent; $npm = $LASTEXITCODE; Pop-Location
if ($npm) { Die 'npm install lỗi' }
$A = Join-Path $REPO 'assets'
if (-not (Test-Path "$A\sfx\catalog.json")) { & $VPY (Join-Path $S 'gen_sfx.py') "$A\sfx" --ext flac }
if (-not (Test-Path "$A\music\catalog.json")) { & $VPY (Join-Path $S 'gen_music.py') "$A\music" }
if (-not (Test-Path "$A\broll\catalog.json")) { Push-Location $S; & $VPY gen_broll_catalog.py; Pop-Location }

# 3. Gắn thành skill của Claude Code (junction: không cần quyền admin; git pull là cập nhật)
if (-not $NoSkill -and ((Resolve-Path $REPO).Path -ne $SKILL_DIR)) {
  New-Item -ItemType Directory -Force (Split-Path $SKILL_DIR) | Out-Null
  if (Test-Path $SKILL_DIR) {
    $it = Get-Item $SKILL_DIR -Force
    if ($it.LinkType) { $it.Delete() } else { Move-Item $SKILL_DIR ("$SKILL_DIR.backup-" + (Get-Date -Format 'yyyyMMddHHmmss')); Say 'Đã sao lưu bản cũ của skill' }
  }
  New-Item -ItemType Junction -Path $SKILL_DIR -Target $REPO | Out-Null
  Say "Skill: $SKILL_DIR → $REPO"
}

# 4. Dự án clip mẫu
Say "Dựng dự án clip mẫu: $SAMPLE"
$W = Join-Path $SAMPLE 'work'
New-Item -ItemType Directory -Force (Join-Path $W 'frames') | Out-Null
$SRC = Join-Path $REPO 'sample\clip-mau'
if (-not (Test-Path "$SAMPLE\timeline.json")) { Copy-Item "$SRC\timeline.json" $SAMPLE }
if (-not (Test-Path "$W\captions.json")) { Copy-Item "$SRC\work\captions.json" $W }   # giữ phụ đề bạn đã sửa
Copy-Item "$SRC\work\words.json", "$SRC\work\aroll.mp4" $W -Force
if ((Get-ChildItem (Join-Path $W 'frames') -Filter *.jpg).Count -lt 100) {
  ffmpeg -v error -y -i "$W\aroll.mp4" -vf 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280' -q:v 3 "$W\frames\%05d.jpg"
}

# 5. Style người dùng (Tạo style) + skill video-style-* của chúng
try { if ($NoSkill) { node (Join-Path $S 'style_lab.mjs') sync --no-skills *> $null } else { node (Join-Path $S 'style_lab.mjs') sync *> $null } } catch {}

# 6. Lối tắt Desktop + Start Menu
if (-not $NoShortcut) {
  $sh = New-Object -ComObject WScript.Shell
  foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $l = $sh.CreateShortcut((Join-Path $dir 'AI Video Studio.lnk'))
    $l.TargetPath = Join-Path $REPO 'studio.cmd'; $l.WorkingDirectory = $REPO; $l.WindowStyle = 7
    $ico = Join-Path $REPO 'scripts\app\icon.ico'; if (Test-Path $ico) { $l.IconLocation = $ico }
    $l.Description = 'Mở AI Video Studio (http://localhost:5186)'; $l.Save()
  }
  Say 'Đã tạo lối tắt "AI Video Studio" ngoài Desktop và trong Start Menu'
}

Write-Host ''
Write-Host '✅ Cài xong AI Video Studio.' -ForegroundColor Green
Write-Host ''
Write-Host '  Mở Studio với clip mẫu:   bấm đúp "AI Video Studio" ngoài Desktop (hoặc studio.cmd)'
Write-Host "  Mở với video của bạn:     `"$REPO\studio.cmd`" --new C:\đường\dẫn\video.mp4"
Write-Host '  Trình duyệt sẽ mở http://localhost:5186 — giữ cửa sổ đen (server) mở trong lúc dùng.'
Write-Host ''
Write-Host '  Tác giả: Nguyễn Tất Kiểm · Tặng khoá học AI miễn phí: https://nguyentatkiem.com.vn/aiplusntk/' -ForegroundColor Magenta
