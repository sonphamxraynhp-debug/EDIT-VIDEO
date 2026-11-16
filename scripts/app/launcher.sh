#!/bin/bash
# AI Video Studio.app launcher (copied into the bundle as Contents/MacOS/avs-launch.sh by scripts/make_app.sh).
# usage: avs-launch.sh start | new <video> | reveal | stop | status
# Errors go to stderr in Vietnamese with exit 2; the AppleScript applet shows them in a dialog.
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
PORT=$(cat "$RES/avs_port" 2>/dev/null || echo 5186)
URL="http://localhost:$PORT"
LOG="$HOME/Library/Logs/AIVideoStudio.log"
STATE="$HOME/Library/Application Support/AIVideoStudio"; PIDF="$STATE/server-$PORT.pid"
mkdir -p "$STATE" "$(dirname "$LOG")"
# Apps start with a bare PATH: add Homebrew, ~/.local, Volta and the newest nvm node.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.volta/bin:$PATH:/usr/bin:/bin:/usr/sbin:/sbin"
for d in "$HOME"/.nvm/versions/node/*/bin; do [ -x "$d/node" ] && NVM="$d"; done; [ -n "$NVM" ] && export PATH="$PATH:$NVM"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
die() { log "LỖI: $*"; echo "$*" >&2; exit 2; }
[ -f "$LOG" ] && [ "$(stat -f%z "$LOG")" -gt 5000000 ] && { tail -c 1000000 "$LOG" > "$LOG.tmp"; mv "$LOG.tmp" "$LOG"; }

# Skill folder: installed skill first, then the path recorded at build time (recorded first when built with --skill).
REC="$(cat "$RES/avs_skill" 2>/dev/null)"
CANDS=("$HOME/.claude/skills/ai-video-studio" "$REC"); [ -f "$RES/avs_skill_pinned" ] && CANDS=("$REC" "$HOME/.claude/skills/ai-video-studio")
for c in "${CANDS[@]}"; do [ -n "$c" ] && [ -f "$c/studio/server.mjs" ] && { SKILL="$c"; break; }; done

serving() { [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:$PORT/api/features")" = 200 ]; }
api() { curl -s --max-time 5 "http://127.0.0.1:$PORT$1" "${@:2}"; }
browse() { [ -f "$RES/avs_no_browser" ] && { log "(test) bỏ qua mở trình duyệt $URL"; return; }; open "$URL"; }
remember() { local d; d=$(api /api/app/info | sed -n 's/.*"dir":"\([^"]*\)".*/\1/p'); [ -n "$d" ] && printf '%s' "$d" > "$STATE/last_project"; }

check() {
  local miss=()
  [ -n "$SKILL" ] || die "Không tìm thấy AI Video Studio.
Cần thư mục ~/.claude/skills/ai-video-studio (cài skill trong Claude Code trước), rồi mở lại app."
  command -v node >/dev/null || miss+=("• Node.js (≥ 18): brew install node  hoặc tải ở nodejs.org")
  command -v ffmpeg >/dev/null || miss+=("• ffmpeg: brew install ffmpeg")
  [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || [ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ] || [ -n "$CHROME_PATH" ] \
    || miss+=("• Google Chrome (để render video): tải ở google.com/chrome")
  [ -d "$SKILL/scripts/node_modules/puppeteer-core" ] || miss+=("• Thư viện render: chạy  bash \"$SKILL/scripts/setup.sh\"")
  [ ${#miss[@]} -eq 0 ] || die "AI Video Studio cần cài thêm:
$(printf '%s\n' "${miss[@]}")
Cài xong rồi mở lại app. Nhật ký: ~/Library/Logs/AIVideoStudio.log"
}

start() {
  serving && return 0
  check
  local proj; proj="$(cat "$STATE/last_project" 2>/dev/null)"; [ -f "$proj/timeline.json" ] || proj=""
  [ -n "$proj" ] || { [ -f "${AVS_HOME:-$HOME/.ai-video-studio}/footage/clip-mau/timeline.json" ] && proj="${AVS_HOME:-$HOME/.ai-video-studio}/footage/clip-mau"; }
  log "khởi động máy chủ: $SKILL (cổng $PORT) ${proj:+dự án $proj}"
  cd "$SKILL" || die "Không vào được $SKILL"
  # every fd detached, otherwise AppleScript's "do shell script" waits for the server to exit
  nohup node studio/server.mjs ${proj:+"$proj"} --port "$PORT" >> "$LOG" 2>&1 < /dev/null &
  echo $! > "$PIDF"; disown
  for _ in $(seq 1 60); do serving && return 0; sleep 0.25; done
  die "Không khởi động được máy chủ ở cổng $PORT. Xem nhật ký: ~/Library/Logs/AIVideoStudio.log"
}

case "$1" in
  start) start; browse ;;
  new)
    f="$2"; [ -f "$f" ] || die "Không thấy tệp: $f"
    case "$(echo "${f##*.}" | tr A-Z a-z)" in mp4|mov|m4v|mkv|webm|avi|mts) ;; *) die "Chỉ nhận tệp video (mp4, mov, m4v, mkv, webm…): $(basename "$f")";; esac
    start
    # "Thả vào app = tự lái" (references/autopilot.md): queue the video for the autopilot instead of only building a project
    if api /api/autopilot/state | grep -q '"appDrop":true'; then
      log "tự lái: thêm $f vào hàng đợi"
      r=$(api /api/autopilot/enqueue -H 'Content-Type: application/json' --data-binary "$(F="$f" node -e 'process.stdout.write(JSON.stringify({input: process.env.F, source: "app"}))')")
      echo "$r" | grep -q '"ok":true' || die "Không thêm được vào hàng đợi Tự lái: $(echo "$r" | sed -n 's/.*"error":"\([^"]*\)".*/\1/p')"
      URL="$URL/#tu-lai"; browse; exit 0
    fi
    log "tạo dự án từ $f"
    r=$(api /api/new -H 'Content-Type: application/json' --data-binary "$(F="$f" node -e 'process.stdout.write(JSON.stringify({video: process.env.F}))')")
    echo "$r" | grep -q '"ok":true' || die "Studio đang bận một tác vụ khác (đang tạo dự án hoặc xuất video). Đợi xong rồi thả video lại."
    browse ;;
  reveal)
    serving || die "Studio chưa chạy."
    remember; d="$(cat "$STATE/last_project" 2>/dev/null)"
    [ -d "$d" ] && open "$d" || die "Chưa mở dự án nào." ;;
  stop)
    serving && remember
    pid=$(cat "$PIDF" 2>/dev/null)
    if [ -n "$pid" ] && ps -p "$pid" -o command= | grep -q "studio/server.mjs"; then kill "$pid"; log "dừng máy chủ (pid $pid)"; else log "thoát app (máy chủ không do app khởi động, để nguyên)"; fi
    rm -f "$PIDF" ;;
  status) serving && echo "running $URL" || echo "stopped" ;;
  *) echo "usage: $0 start | new <video> | reveal | stop | status" >&2; exit 1 ;;
esac
