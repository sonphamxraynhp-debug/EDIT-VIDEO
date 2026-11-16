#!/usr/bin/env bash
# Cài AI Video Factory trên Linux (Ubuntu/Debian, Fedora, Arch) — tối ưu cho máy RAM 16 GB.
#
#   ./scripts/install-linux.sh            # hỏi từng phần tải lớn (giọng 63 MB, Whisper 574 MB, LLM 5,2 GB)
#   ./scripts/install-linux.sh --yes      # đồng ý tải tất cả, không hỏi
#   ./scripts/install-linux.sh --minimal  # chỉ phần bắt buộc + giọng đọc (không AI viết kịch bản, không nghe lời thoại)
#
# Script KHÔNG tự chạy lệnh sudo: thiếu gói hệ thống thì in ra lệnh để bạn tự chạy rồi chạy lại script này.
# Chạy lại bao nhiêu lần cũng được — phần nào đã cài sẽ bỏ qua.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
YES=0; MINIMAL=0
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    --minimal) MINIMAL=1 ;;
    -h|--help) sed -n 2,10p "$0"; exit 0 ;;
  esac
done

ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✘\033[0m %s\n' "$*"; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ask()  {   # ask "câu hỏi" → 0 nếu đồng ý
  [ "$YES" = 1 ] && return 0
  [ -t 0 ] || return 1
  read -r -p "  $1 [Y/n] " r; [[ -z "$r" || "$r" =~ ^[YyCc] ]]
}

[ "$(uname -s)" = "Linux" ] || { echo "Script này dành cho Linux. macOS/Windows: xem CAI-DAT.md"; exit 1; }
DATA="${AVF_DATA_DIR:-$ROOT/data}"
MODELS="$DATA/models"
BIN="$HOME/.local/bin"
mkdir -p "$MODELS/piper" "$BIN"
export PATH="$BIN:$PATH"

# ------------------------------------------------------------------ 0. máy
step "0. Kiểm tra máy"
RAM_GB=$(awk '/MemTotal/ {printf "%.0f", $2/1048576}' /proc/meminfo)
CORES=$(nproc)
FREE_GB=$(df -Pk "$ROOT" | awk 'NR==2 {printf "%.0f", $4/1048576}')
ok "RAM ${RAM_GB} GB · ${CORES} nhân CPU · ổ trống ${FREE_GB} GB"
LLM_MODEL="${AVF_OLLAMA_MODEL:-qwen3:8b}"
if [ "$RAM_GB" -lt 12 ]; then
  LLM_MODEL="${AVF_OLLAMA_MODEL:-qwen3:4b}"
  warn "RAM dưới 12 GB → dùng model nhẹ $LLM_MODEL (đặt AVF_OLLAMA_MODEL=$LLM_MODEL khi chạy app)"
fi
[ "$FREE_GB" -ge 15 ] || warn "Nên còn trống ≥ 15 GB (model AI + video xuất)"

# ------------------------------------------------------------------ 1. gói hệ thống
step "1. Công cụ nền (Python, Node, FFmpeg, giọng đọc, OCR, công cụ build)"
PM=""
command -v apt-get >/dev/null && PM=apt
command -v dnf >/dev/null && [ -z "$PM" ] && PM=dnf
command -v pacman >/dev/null && [ -z "$PM" ] && PM=pacman
need_req=(); need_opt=()
have() { command -v "$1" >/dev/null 2>&1; }

pyok=0
for py in python3.13 python3.12 python3.11 python3; do
  if have "$py" && "$py" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
    PY="$(command -v "$py")"; pyok=1; break
  fi
done
if [ "$pyok" = 1 ] && "$PY" -c 'import venv, ensurepip' 2>/dev/null; then ok "Python $("$PY" -V | cut -d' ' -f2)"
else need_req+=(python); err "Thiếu Python 3.11+ (kèm venv)"; fi
if have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then ok "Node $(node -v)"
else need_req+=(node); err "Thiếu Node.js 18+"; fi
if have ffmpeg && have ffprobe; then ok "FFmpeg $(ffmpeg -version | head -1 | cut -d' ' -f3)"
else need_req+=(ffmpeg); err "Thiếu FFmpeg"; fi
if have espeak-ng; then ok "espeak-ng (giọng dự phòng)"; else need_opt+=(espeak); warn "Thiếu espeak-ng (giọng dự phòng)"; fi
if have tesseract; then
  tesseract --list-langs 2>/dev/null | grep -qx vie && ok "Tesseract + tiếng Việt" || { need_opt+=(tessvie); warn "Tesseract thiếu gói tiếng Việt"; }
else need_opt+=(tesseract tessvie); warn "Thiếu Tesseract (đọc chữ trên hình)"; fi
if [ "$MINIMAL" = 0 ] && ! have whisper-cli; then
  for t in git cmake g++; do have "$t" || { need_opt+=(build); warn "Thiếu $t (để dựng whisper-cli)"; break; }; done
fi
have curl || need_req+=(curl)

pkgs() {   # tên gói theo trình quản lý gói
  local out=()
  for n in "$@"; do
    case "$PM:$n" in
      apt:python) out+=(python3 python3-venv python3-pip) ;;
      apt:node) out+=(nodejs npm) ;;
      apt:tesseract) out+=(tesseract-ocr) ;;
      apt:tessvie) out+=(tesseract-ocr-vie) ;;
      apt:espeak) out+=(espeak-ng) ;;
      apt:build) out+=(git cmake build-essential) ;;
      dnf:python) out+=(python3) ;;
      dnf:node) out+=(nodejs npm) ;;
      dnf:tesseract) out+=(tesseract) ;;
      dnf:tessvie) out+=(tesseract-langpack-vie) ;;
      dnf:espeak) out+=(espeak-ng) ;;
      dnf:build) out+=(git cmake gcc-c++ make) ;;
      dnf:ffmpeg) out+=(ffmpeg-free) ;;
      pacman:python) out+=(python) ;;
      pacman:node) out+=(nodejs npm) ;;
      pacman:tesseract) out+=(tesseract) ;;
      pacman:tessvie) out+=(tesseract-data-vie) ;;
      pacman:espeak) out+=(espeak-ng) ;;
      pacman:build) out+=(git cmake base-devel) ;;
      *) out+=("$n") ;;
    esac
  done
  printf '%s ' "${out[@]}" | tr ' ' '\n' | awk 'NF && !seen[$0]++' | tr '\n' ' '
}
install_cmd() {
  case "$PM" in
    apt) echo "sudo apt update && sudo apt install -y $(pkgs "$@")" ;;
    dnf) echo "sudo dnf install -y $(pkgs "$@")" ;;
    pacman) echo "sudo pacman -S --needed $(pkgs "$@")" ;;
    *) echo "(cài bằng trình quản lý gói của bạn) $(pkgs "$@")" ;;
  esac
}
if [ ${#need_req[@]} -gt 0 ] || [ ${#need_opt[@]} -gt 0 ]; then
  all=("${need_req[@]}" "${need_opt[@]}")
  if [ "$(id -u)" = 0 ] && [ -n "$PM" ]; then          # đang là root (container/VM) → cài luôn
    warn "Đang chạy bằng root → tự cài: $(pkgs "${all[@]}")"
    case "$PM" in
      apt) apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q $(pkgs "${all[@]}") ;;
      dnf) dnf install -y $(pkgs "${all[@]}") ;;
      pacman) pacman -S --needed --noconfirm $(pkgs "${all[@]}") ;;
    esac
  else
    echo
    echo "  Hãy tự chạy lệnh sau (cần mật khẩu máy) rồi chạy lại script này:"
    echo
    echo "    $(install_cmd "${all[@]}")"
    [ "$PM" = apt ] && printf '%s\n' "${need_req[@]}" | grep -qx node && \
      echo "    (Ubuntu cũ có Node < 18: xem https://nodejs.org/en/download để cài bản LTS)"
    echo
    [ ${#need_req[@]} -gt 0 ] && exit 1
    warn "Thiếu các phần tuỳ chọn ở trên — vẫn cài tiếp phần còn lại"
  fi
fi

# ------------------------------------------------------------------ 2. Python + giao diện
step "2. Thư viện Python và giao diện"
[ -x .venv/bin/python ] || "${PY:-python3}" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r services/api/requirements.txt && touch .venv/.req-stamp
ok "Môi trường Python .venv (kèm Piper TTS)"
(cd apps/desktop && { [ -d node_modules ] || npm install --no-fund --no-audit; } && npm run build >/dev/null)
ok "Đã dựng giao diện (apps/desktop/dist)"

fetch() {   # fetch URL đích — tải vào file .part rồi mới đổi tên, lỗi mạng không làm dừng cả script
  curl -fL --retry 3 --progress-bar -o "$2.part" "$1" && mv "$2.part" "$2" || { rm -f "$2.part"; return 1; }
}

# ------------------------------------------------------------------ 3. giọng đọc tiếng Việt
step "3. Giọng đọc tiếng Việt (Piper, ~63 MB)"
PV="vi_VN-vais1000-medium"
PV_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium"
if [ -s "$MODELS/piper/$PV.onnx" ] && [ -s "$MODELS/piper/$PV.onnx.json" ]; then ok "Đã có giọng $PV"
elif ask "Tải giọng đọc Piper tiếng Việt (63 MB)?"; then
  if fetch "$PV_URL/$PV.onnx.json" "$MODELS/piper/$PV.onnx.json" && fetch "$PV_URL/$PV.onnx" "$MODELS/piper/$PV.onnx"; then
    ok "Đã tải giọng $PV"
  else err "Không tải được giọng (mạng?) — thử lại sau hoặc tải bằng nút trong app; tạm dùng espeak-ng"; fi
else warn "Bỏ qua — app dùng giọng máy espeak-ng (có thể tải sau ở màn Quản lý mô hình AI)"; fi
echo "Xin chào, đây là giọng đọc thử." | .venv/bin/python -m piper -m "$MODELS/piper/$PV.onnx" -f "$DATA/voice_test.wav" >/dev/null 2>&1 \
  && ok "Piper đọc thử thành công ($DATA/voice_test.wav)" || { [ -s "$MODELS/piper/$PV.onnx" ] && warn "Piper đọc thử lỗi — app sẽ dùng espeak-ng"; true; }

if [ "$MINIMAL" = 1 ]; then
  step "Đã cài bản tối thiểu. Mở app: ./scripts/start.sh  →  http://127.0.0.1:8765"; exit 0
fi

# ------------------------------------------------------------------ 4. nghe lời thoại (whisper.cpp)
step "4. Nghe lời thoại trong clip (whisper.cpp + model 574 MB)"
if have whisper-cli; then ok "whisper-cli: $(command -v whisper-cli)"
elif have git && have cmake && have g++ && ask "Dựng whisper-cli từ mã nguồn (vài phút, dùng $CORES nhân)?"; then
  SRC="$HOME/.local/src/whisper.cpp"
  if { [ -d "$SRC/.git" ] || git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$SRC"; } &&
     cmake -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF \
       -DWHISPER_BUILD_EXAMPLES=ON >/dev/null &&
     cmake --build "$SRC/build" -j "$CORES" --config Release --target whisper-cli >/dev/null &&
     install -m 755 "$SRC/build/bin/whisper-cli" "$BIN/whisper-cli"; then
    ok "Đã cài $BIN/whisper-cli"
  else err "Dựng whisper-cli thất bại — app vẫn chạy, chỉ không nghe được lời thoại"; fi
else warn "Bỏ qua whisper-cli — app không nghe được lời thoại trong clip"; fi
WM="ggml-large-v3-turbo-q5_0.bin"
WM_SHA="394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"
if ls "$MODELS"/ggml-*.bin >/dev/null 2>&1; then ok "Đã có model Whisper: $(ls "$MODELS"/ggml-*.bin | xargs -n1 basename | tr '\n' ' ')"
elif have whisper-cli && ask "Tải model nghe tiếng Việt chính xác $WM (574 MB, dùng ~1 GB RAM khi chạy)?"; then
  if fetch "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$WM" "$MODELS/$WM.dl" &&
     echo "$WM_SHA  $MODELS/$WM.dl" | sha256sum -c --quiet -; then
    mv "$MODELS/$WM.dl" "$MODELS/$WM"; ok "Đã tải $WM"
  else rm -f "$MODELS/$WM.dl"; err "Không tải được model Whisper (mạng hoặc sai mã kiểm tra) — thử lại bằng nút trong app"; fi
else warn "Chưa có model Whisper — có thể tải bằng nút trong app (màn Tạo video / Quản lý mô hình AI)"; fi

# ------------------------------------------------------------------ 5. AI viết kịch bản (Ollama)
step "5. AI viết kịch bản (Ollama + $LLM_MODEL, ~5,2 GB, dùng ~6–7 GB RAM khi chạy)"
if ! have ollama; then
  warn "Chưa cài Ollama. Tự chạy lệnh sau (cần mật khẩu máy) rồi chạy lại script này:"
  echo
  echo "    curl -fsSL https://ollama.com/install.sh | sh"
  echo
  warn "Không có Ollama app vẫn chạy, kịch bản viết theo khuôn mẫu"
else
  ok "Ollama $(ollama --version 2>/dev/null | awk '{print $NF}')"
  STARTED=""
  if ! curl -s -m 2 http://127.0.0.1:11434/api/tags >/dev/null; then
    OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 \
      ollama serve >"$DATA/ollama.log" 2>&1 & STARTED=$!
    for _ in $(seq 20); do curl -s -m 1 http://127.0.0.1:11434/api/tags >/dev/null && break; sleep 1; done
  fi
  if ollama list 2>/dev/null | awk '{print $1}' | grep -qx "$LLM_MODEL"; then ok "Đã có model $LLM_MODEL"
  elif ask "Tải model $LLM_MODEL (~5,2 GB)?"; then
    if ollama pull "$LLM_MODEL"; then ok "Đã tải $LLM_MODEL"; else err "Không tải được $LLM_MODEL — thử lại: ollama pull $LLM_MODEL"; fi
  else warn "Bỏ qua — kịch bản viết theo khuôn mẫu"; fi
  [ -n "$STARTED" ] && kill "$STARTED" 2>/dev/null || true
  if [ -d /etc/systemd/system ] && systemctl is-enabled ollama >/dev/null 2>&1 && \
     ! systemctl show ollama -p Environment 2>/dev/null | grep -q OLLAMA_MAX_LOADED_MODELS; then
    warn "Gợi ý cho máy 16 GB — giới hạn Ollama chỉ giữ 1 model, KV cache nén (tự chạy, cần mật khẩu):"
    echo
    echo "    sudo mkdir -p /etc/systemd/system/ollama.service.d && printf '[Service]\\nEnvironment=OLLAMA_MAX_LOADED_MODELS=1\\nEnvironment=OLLAMA_NUM_PARALLEL=1\\nEnvironment=OLLAMA_FLASH_ATTENTION=1\\nEnvironment=OLLAMA_KV_CACHE_TYPE=q8_0\\n' | sudo tee /etc/systemd/system/ollama.service.d/avf.conf && sudo systemctl daemon-reload && sudo systemctl restart ollama"
    echo
  fi
fi

# ------------------------------------------------------------------ 6. lối tắt
step "6. Lối tắt trên menu ứng dụng"
APPS="$HOME/.local/share/applications"
mkdir -p "$APPS"
cat >"$APPS/ai-video-factory.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=AI Video Factory
Comment=Dựng video dọc 9:16 bằng AI chạy trên máy
Exec=bash -c 'cd "$ROOT" && (sleep 6; xdg-open http://127.0.0.1:8765) & exec "$ROOT/scripts/start.sh"'
Icon=$ROOT/apps/desktop/src-tauri/icons/128x128.png
Terminal=true
Categories=AudioVideo;Video;
DESK
ok "Đã tạo lối tắt \"AI Video Factory\" ($APPS/ai-video-factory.desktop)"

step "Xong. Mở app:  ./scripts/start.sh   →   http://127.0.0.1:8765"
