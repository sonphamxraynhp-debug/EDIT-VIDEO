#!/bin/bash
# Mở AI Video Studio cho một dự án:  bash studio.sh <thư mục dự án | timeline.json>
# Tạo dự án từ video thô:           bash studio.sh --new <video.mp4> [thư mục dự án]
# Mở trình duyệt tại http://localhost:5186 (đổi cổng: --port 5190)
# Không muốn dùng Terminal? Tạo app Mac một lần:  bash scripts/make_app.sh   (→ ~/Applications/AI Video Studio.app,
#   bấm để mở studio, thả video vào icon để tạo dự án — xem references/app-render.md)
# Không truyền gì: mở dự án clip mẫu (~/.ai-video-studio/footage/clip-mau, do install.sh tạo).
HERE="$(cd "$(dirname "$0")" && pwd)"
SAMPLE="${AVS_HOME:-$HOME/.ai-video-studio}/footage/clip-mau"
if [ $# -eq 0 ] && [ -f "$SAMPLE/timeline.json" ]; then set -- "$SAMPLE"; fi
exec node "$HERE/studio/server.mjs" "$@" --open
