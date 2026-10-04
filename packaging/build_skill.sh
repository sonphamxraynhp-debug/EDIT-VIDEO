#!/usr/bin/env bash
# Đóng gói agent thành skill "EDIT VIDEO AI" (edit-video-ai.skill) để tải lên tài khoản Claude.
# Dùng: bash packaging/build_skill.sh [thư_mục_ra]   (mặc định: dist/)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist}"
BUILD="$(mktemp -d)"
SKILL="$BUILD/edit-video-ai"
mkdir -p "$SKILL/scripts" "$SKILL/references" "$OUT"
cp "$ROOT/packaging/SKILL.md" "$SKILL/SKILL.md"
cp -r "$ROOT/editor/edit_video.py" "$ROOT/editor/style.json" "$ROOT/editor/requirements.txt" \
      "$ROOT/editor/vedit" "$ROOT/editor/assets" "$SKILL/scripts/"
cp "$ROOT/docs/PHAN_TICH_VIDEO_MAU.md" "$SKILL/references/"
# Đường dẫn trong tài liệu phân tích trỏ tới style.json bên trong skill
sed -i 's#(../editor/style.json)#(../scripts/style.json)#; s#`editor/style.json`#`scripts/style.json`#g' \
    "$SKILL/references/PHAN_TICH_VIDEO_MAU.md"
find "$SKILL" -name __pycache__ -prune -exec rm -rf {} +
(cd "$BUILD" && rm -f "$OUT/edit-video-ai.skill" && zip -qr "$OUT/edit-video-ai.skill" edit-video-ai)
rm -rf "$BUILD"
echo "Đã tạo $OUT/edit-video-ai.skill"
