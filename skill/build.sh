#!/usr/bin/env bash
# Đóng gói skill "editvideoai" (để lưu vào tài khoản Claude) từ mã nguồn trong editor/ + docs/.
# Dùng: bash skill/build.sh  -> output/editvideoai.skill
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)/editvideoai"
mkdir -p "$STAGE/scripts" "$STAGE/references" "$ROOT/output"
cp "$ROOT/skill/SKILL.md" "$STAGE/SKILL.md"
cp -r "$ROOT/editor/edit_video.py" "$ROOT/editor/style.json" "$ROOT/editor/requirements.txt" \
      "$ROOT/editor/vedit" "$ROOT/editor/assets" "$STAGE/scripts/"
sed 's#\[`editor/style.json`\](../editor/style.json)#`scripts/style.json`#' \
    "$ROOT/docs/PHAN_TICH_VIDEO_MAU.md" > "$STAGE/references/PHAN_TICH_VIDEO_MAU.md"
find "$STAGE" -name __pycache__ -prune -exec rm -rf {} +
(cd "$(dirname "$STAGE")" && rm -f "$ROOT/output/editvideoai.skill" && \
 python3 -c "import shutil; shutil.make_archive('$ROOT/output/editvideoai', 'zip', '.', 'editvideoai')" && \
 mv "$ROOT/output/editvideoai.zip" "$ROOT/output/editvideoai.skill")
echo "Đã tạo $ROOT/output/editvideoai.skill"
