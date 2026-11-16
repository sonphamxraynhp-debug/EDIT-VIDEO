#!/bin/bash
# AI Video Studio — cài đặt một lệnh (macOS; Linux chạy được phần lõi, không có app Mac).
#   bash install.sh            cài thư viện, gắn làm skill Claude Code, dựng dự án clip mẫu, tạo app Mac
#   bash install.sh --no-app   không tạo app Mac
#   bash install.sh --no-skill không gắn vào ~/.claude/skills
set -e
REPO="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="${AVS_SKILL_DIR:-$HOME/.claude/skills/ai-video-studio}"
HOME_DIR="${AVS_HOME:-$HOME/.ai-video-studio}"
SAMPLE="$HOME_DIR/footage/clip-mau"
APP=1; LINK=1
for a in "$@"; do case "$a" in --no-app) APP=0;; --no-skill) LINK=0;; esac; done

say() { printf '\033[1;35m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

# 1. Kiểm tra công cụ cần có
say "Kiểm tra công cụ"
command -v ffmpeg >/dev/null || die "Thiếu ffmpeg. Cài: brew install ffmpeg"
command -v node >/dev/null || die "Thiếu Node.js ≥ 18. Cài: brew install node"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || die "Node.js quá cũ (cần ≥ 18)"
command -v python3 >/dev/null || die "Thiếu Python 3.10+. Cài: brew install python"
python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' || die "Python quá cũ (cần ≥ 3.10)"
CHROME="${CHROME_PATH:-}"
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" /usr/bin/google-chrome /usr/bin/chromium; do [ -z "$CHROME" ] && [ -x "$c" ] && CHROME="$c"; done
[ -n "$CHROME" ] || die "Thiếu Google Chrome (dùng để render video). Tải tại https://www.google.com/chrome/"
command -v claude >/dev/null && say "Có Claude Code CLI → bật được AI dựng giúp, Tạo style, lồng tiếng…" \
  || say "Chưa có Claude Code CLI (tính năng AI sẽ tắt). Cài: https://docs.claude.com/claude-code"

# 2. Thư viện Python + puppeteer
say "Cài thư viện (Python venv + puppeteer-core) — lần đầu mất vài phút"
bash "$REPO/scripts/setup.sh"

# 3. Gắn thành skill của Claude Code (symlink để git pull là cập nhật)
if [ "$LINK" = 1 ] && [ "$REPO" != "$SKILL_DIR" ]; then
  mkdir -p "$(dirname "$SKILL_DIR")"
  if [ -e "$SKILL_DIR" ] && [ ! -L "$SKILL_DIR" ]; then mv "$SKILL_DIR" "$SKILL_DIR.backup-$(date +%Y%m%d%H%M%S)"; say "Đã sao lưu bản cũ: $SKILL_DIR.backup-…"; fi
  ln -sfn "$REPO" "$SKILL_DIR"
  say "Skill: $SKILL_DIR → $REPO"
fi

# 4. Dự án clip mẫu (video gốc trong sample/) để mở Studio là thấy mẫu ngay
say "Dựng dự án clip mẫu: $SAMPLE"
mkdir -p "$SAMPLE/work/frames"
cp -n "$REPO/sample/clip-mau/timeline.json" "$SAMPLE/" 2>/dev/null || true
cp -n "$REPO/sample/clip-mau/work/captions.json" "$SAMPLE/work/" 2>/dev/null || true # giữ phụ đề bạn đã sửa
cp "$REPO/sample/clip-mau/work/"{words.json,aroll.mp4} "$SAMPLE/work/"
if [ "$(ls "$SAMPLE/work/frames" | wc -l | tr -d ' ')" -lt 100 ]; then
  ffmpeg -v error -y -i "$SAMPLE/work/aroll.mp4" -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280" -q:v 3 "$SAMPLE/work/frames/%05d.jpg"
fi

# 5. Khôi phục các style người dùng (Tạo style) + skill video-style-* của chúng
node "$REPO/scripts/style_lab.mjs" sync $([ "$LINK" = 1 ] || echo --no-skills) >/dev/null 2>&1 || true

# 6. App Mac
if [ "$APP" = 1 ] && [ "$(uname)" = Darwin ]; then
  say "Tạo app ~/Applications/AI Video Studio.app"
  bash "$REPO/scripts/make_app.sh" --skill "$REPO" || say "Không tạo được app (bỏ qua, vẫn mở bằng lệnh được)"
fi

cat <<EOF

✅ Cài xong AI Video Studio.

  Mở Studio với clip mẫu:   bash "$REPO/studio.sh"
  Mở với video của bạn:     bash "$REPO/studio.sh" --new /đường/dẫn/video.mp4
$([ -d "$HOME/Applications/AI Video Studio.app" ] && echo '  Hoặc bấm app "AI Video Studio" trong Launchpad / ~/Applications.')

  Trình duyệt sẽ mở http://localhost:5186

  Tác giả: Nguyễn Tất Kiểm · Tặng khoá học AI miễn phí: https://nguyentatkiem.com.vn/aiplusntk/
EOF
