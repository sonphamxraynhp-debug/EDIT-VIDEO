#!/bin/bash
# Build "AI Video Studio.app" — mở studio không cần Terminal, thả video vào icon để tạo dự án.
# usage: bash scripts/make_app.sh [--dest ~/Applications] [--skill <thư mục skill>] [--port 5186] [--no-browser]
#   --dest     nơi đặt app (mặc định ~/Applications)
#   --skill    ghim thư mục skill (mặc định: ~/.claude/skills/ai-video-studio, dự phòng = thư mục chứa script này)
#   --port     cổng máy chủ (mặc định 5186)
#   --no-browser  (để test) không tự mở trình duyệt
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$HERE/app"
DEST="$HOME/Applications"; SKILL="$(cd "$HERE/.." && pwd)"; PIN=""; PORT=5186; NOBROWSER=""
while [ $# -gt 0 ]; do case "$1" in
  --dest) DEST="$2"; shift 2;; --skill) SKILL="$(cd "$2" && pwd)"; PIN=1; shift 2;; --port) PORT="$2"; shift 2;;
  --no-browser) NOBROWSER=1; shift;; -h|--help) sed -n 2,7p "$0"; exit 0;; *) echo "không hiểu tham số: $1" >&2; exit 1;; esac; done
command -v osacompile >/dev/null || { echo "Cần macOS (osacompile)" >&2; exit 1; }
mkdir -p "$DEST"; APP="$DEST/AI Video Studio.app"; TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1) stay-open AppleScript applet (on run / on open / on reopen / on quit)
rm -rf "$APP"
osacompile -s -o "$APP" "$SRC/AIVideoStudio.applescript"
install -m 755 "$SRC/launcher.sh" "$APP/Contents/MacOS/avs-launch.sh"
R="$APP/Contents/Resources"
printf '%s' "$SKILL" > "$R/avs_skill"; printf '%s' "$PORT" > "$R/avs_port"
[ -n "$PIN" ] && touch "$R/avs_skill_pinned"; [ -n "$NOBROWSER" ] && touch "$R/avs_no_browser"

# 2) icon: icon_1024.png (re-render from the brand mark with make_icon.mjs if missing) -> .icns
PNG="$SRC/icon_1024.png"
if [ ! -f "$PNG" ]; then PNG="$TMP/icon_1024.png"; node "$SRC/make_icon.mjs" "$PNG" >/dev/null; fi
IS="$TMP/AppIcon.iconset"; mkdir -p "$IS"
for s in 16 32 128 256 512; do
  sips -z $s $s "$PNG" --out "$IS/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$PNG" --out "$IS/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$IS" -o "$R/applet.icns"
rm -f "$R/Assets.car" # newer osacompile ships an asset catalog icon that would win over applet.icns

# 3) Info.plist: name, id, video document types (drop onto Dock/Finder icon)
PB=/usr/libexec/PlistBuddy; PL="$APP/Contents/Info.plist"
$PB -c "Set :CFBundleName 'AI Video Studio'" "$PL"
$PB -c "Add :CFBundleDisplayName string 'AI Video Studio'" "$PL" 2>/dev/null || true
$PB -c "Delete :CFBundleIdentifier" "$PL" 2>/dev/null || true; $PB -c "Add :CFBundleIdentifier string com.aivideostudio.studio" "$PL"
$PB -c "Delete :CFBundleIconName" "$PL" 2>/dev/null || true; $PB -c "Set :CFBundleIconFile applet" "$PL" 2>/dev/null || $PB -c "Add :CFBundleIconFile string applet" "$PL"
$PB -c "Add :CFBundleShortVersionString string 4.0" "$PL" 2>/dev/null || $PB -c "Set :CFBundleShortVersionString 4.0" "$PL"
$PB -c "Delete :CFBundleDocumentTypes" "$PL" 2>/dev/null || true
$PB -c "Add :CFBundleDocumentTypes array" -c "Add :CFBundleDocumentTypes:0 dict" \
  -c "Add :CFBundleDocumentTypes:0:CFBundleTypeName string Video" -c "Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Viewer" \
  -c "Add :CFBundleDocumentTypes:0:LSHandlerRank string Alternate" -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes array" \
  -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string public.movie" \
  -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes:1 string public.mpeg-4" \
  -c "Add :CFBundleDocumentTypes:0:LSItemContentTypes:2 string com.apple.quicktime-movie" "$PL"

# 4) re-sign ad hoc (Info.plist changed) and register with Launch Services
codesign --force --deep -s - "$APP" 2>/dev/null || echo "(cảnh báo: codesign lỗi — app vẫn chạy được trên máy này)"
touch "$APP"; /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" 2>/dev/null || true
echo "✓ $APP"
echo "  skill: $SKILL${PIN:+ (ghim)} · cổng $PORT · nhật ký ~/Library/Logs/AIVideoStudio.log"
