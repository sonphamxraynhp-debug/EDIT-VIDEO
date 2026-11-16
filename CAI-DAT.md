# Cài đặt AI Video Factory

File này viết cho trợ lý AI (Claude Code) đọc và làm theo để cài app lên máy người dùng.
Người dùng chỉ cần mở thư mục này bằng Claude Code rồi gõ: **"Đọc CAI-DAT.md và cài giúp tôi"**.

## App này là gì

Phần mềm chạy hoàn toàn trên máy (không gửi video lên mạng): thả video quay thật vào, máy tự nghe lời thoại,
viết kịch bản, đọc giọng, dựng nhiều bản video dọc 9:16 để người dùng chọn và xuất.

Các chế độ: Chế độ AI, Chế độ Manual, Tin tức, Bán hàng, Review người thật, Cắt video dài, Kể chuyện bằng ảnh,
Trích dẫn; kèm Sản xuất hàng loạt (nhập bảng sản phẩm, hàng đợi chạy nền), Thư viện nhạc, và Phong cách & phụ đề
(10 phong cách edit, 12 kiểu phụ đề chạy chữ theo giọng, 19 font tiếng Việt đóng kèm sẵn).
Sau khi cài, app mở ở địa chỉ http://127.0.0.1:8765 trên trình duyệt.

## Quy tắc cho trợ lý AI khi cài

1. Làm theo đúng thứ tự các bước. Sau mỗi bước chạy lệnh kiểm tra ghi kèm, đạt mới sang bước sau.
2. Trước khi tải thứ gì lớn (model 5 GB, bộ giọng 1 GB), báo người dùng dung lượng và hỏi có tải không.
3. Không chạy lệnh cần mật khẩu quản trị thay người dùng. Nếu lệnh đòi mật khẩu, đưa lệnh cho họ tự chạy.
4. Không sửa mã nguồn trong thư mục này để "cho chạy được". Gặp lỗi thì báo nguyên văn lỗi và nêu cách xử lý.
5. Cuối cùng báo lại bằng tiếng Việt, ngắn gọn: thành phần nào đã cài, thành phần nào bỏ qua và hệ quả.

## Cần gì trên máy

| Thành phần | Mức độ | Dung lượng tải | Thiếu thì sao |
|---|---|---|---|
| Python 3.11 trở lên (nên 3.12) | Bắt buộc | khoảng 100 MB | App không chạy |
| Node.js 18 trở lên | Bắt buộc | khoảng 100 MB | Không dựng được giao diện |
| FFmpeg (kèm ffprobe) | Bắt buộc | khoảng 100 MB | Không phân tích và xuất được video |
| Ollama + model `qwen3:8b` | Nên có | 5,2 GB | Kịch bản viết theo khuôn mẫu, không phải AI |
| whisper-cli (whisper.cpp) | Nên có | nhỏ | Không nghe được lời thoại trong clip |
| Model nghe lời thoại | Nên có | 574 MB | Tải bằng nút trong app sau khi mở |
| Giọng Piper tiếng Việt (chỉ Linux) | Nên có | 63 MB | Linux đọc bằng giọng máy espeak-ng (nghe robot) |
| Bộ giọng VieNeu | Nên có (hiện chỉ macOS, Linux) | khoảng 1 GB | Mất 10 giọng có sẵn và giọng nhái, chỉ còn giọng máy |
| Tesseract | Tuỳ chọn | nhỏ | Không đọc chữ trên hình |
| Thư viện nhạc nền | Nên có | 305 MB | Tải bằng nút trong app; thiếu thì video không có nhạc nền |

Font chữ phụ đề đã nằm sẵn trong mã nguồn (`services/api/avf/fonts`), không cần cài thêm.

Máy nên có RAM từ 16 GB và còn trống ít nhất 15 GB ổ đĩa. RAM dưới 16 GB vẫn chạy được nhưng bước viết kịch bản bằng AI sẽ chậm.

### Máy RAM 16 GB — app đã tự cấu hình

| Phần | Dùng RAM | App làm gì để vừa 16 GB |
|---|---|---|
| Ollama + `qwen3:8b` | ~6–7 GB khi đang viết kịch bản | Ngữ cảnh 8192 (`AVF_OLLAMA_NUM_CTX`), nhả model khỏi RAM sau 3 phút rảnh (`AVF_OLLAMA_KEEP_ALIVE`); `start.sh` bật Ollama với 1 model, 1 yêu cầu, KV cache nén |
| Whisper large-v3-turbo (nén) | ~1 GB | Chạy tối đa 8 luồng, chừa 1 nhân cho giao diện |
| Mỗi job dựng video 1080×1920 | ~1–2 GB | Worker tự giới hạn số job render song song theo RAM: 16 GB → tối đa 3 (`AVF_RAM_PER_RENDER_GB`, mặc định 4); RAM trống dưới 1,5 GB thì tạm chưa nhận job mới (`AVF_MIN_FREE_RAM_GB`) |

Máy chỉ có 8 GB: đặt `AVF_OLLAMA_MODEL=qwen3:4b` (script Linux tự chọn khi RAM dưới 12 GB) và để Cài đặt → Hiệu năng ở "Tiết kiệm".

## macOS

### Bước 1. Kiểm tra công cụ nền

```bash
python3 --version; node --version; ffmpeg -version | head -1; brew --version | head -1
```

- Thiếu Homebrew: hướng dẫn người dùng tự cài theo trang https://brew.sh (lệnh cài đòi mật khẩu máy).
- Thiếu Python, Node hoặc FFmpeg:

```bash
brew install python@3.12 node ffmpeg
```

### Bước 2. Cài phần AI (hỏi người dùng trước vì tải 5,2 GB)

```bash
brew install ollama whisper-cpp
```

```bash
brew services start ollama
```

```bash
ollama pull qwen3:8b
```

Kiểm tra: `ollama list` phải có dòng `qwen3:8b`, và `which whisper-cli` phải ra đường dẫn.

### Bước 3. Cài bộ giọng (hỏi người dùng trước vì tải khoảng 1 GB ở lần chạy đầu)

```bash
./scripts/setup-voice.sh
```

Kiểm tra: có thư mục `.venv-voice` trong thư mục dự án.

### Bước 4. Mở app

```bash
./scripts/start.sh
```

Lần đầu lệnh này tự tạo môi trường Python, cài thư viện và dựng giao diện, mất vài phút.
Lệnh này chạy liên tục, không tự kết thúc: hãy chạy nền, chờ dòng `AI Video Factory: http://127.0.0.1:8765`.

### Bước 5. Kiểm tra app đã sống

```bash
curl -s http://127.0.0.1:8765/api/v1/system/health
```

```bash
curl -s http://127.0.0.1:8771/health
```

Lệnh đầu phải trả về JSON. Lệnh thứ hai (máy chủ giọng) phải có `"ready": true` và danh sách `presets` gồm 10 giọng;
nếu không kết nối được nghĩa là bước 3 chưa xong, app vẫn dùng được với giọng máy.

## Linux (Ubuntu/Debian, Fedora, Arch)

### Bước 1. Chạy script cài đặt

```bash
./scripts/install-linux.sh
```

Script kiểm tra máy, cài thư viện Python (kèm Piper TTS), dựng giao diện, rồi **hỏi trước** từng phần tải lớn:
giọng Piper tiếng Việt (63 MB), dựng `whisper-cli` từ mã nguồn + model nghe 574 MB, model `qwen3:8b` 5,2 GB.
Thêm `--yes` để đồng ý tất cả, `--minimal` để chỉ cài phần bắt buộc + giọng đọc.

Script **không tự chạy sudo**. Thiếu gói hệ thống thì nó in ra lệnh (ví dụ Ubuntu:
`sudo apt update && sudo apt install -y python3 python3-venv python3-pip nodejs npm ffmpeg espeak-ng tesseract-ocr tesseract-ocr-vie git cmake build-essential`)
để người dùng tự chạy, rồi chạy lại script. Ollama cũng do người dùng tự cài:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Sau đó chạy lại `./scripts/install-linux.sh` để tải `qwen3:8b`. Script chạy lại bao nhiêu lần cũng được.

### Bước 2. Mở app

```bash
./scripts/start.sh
```

Chờ dòng `AI Video Factory: http://127.0.0.1:8765`, mở địa chỉ đó trên trình duyệt. Script cài cũng tạo lối tắt
"AI Video Factory" trong menu ứng dụng. Nếu Ollama đã cài mà chưa chạy, `start.sh` tự bật kèm.

Kiểm tra: `curl -s http://127.0.0.1:8765/api/v1/models` — dòng `tts` phải có `"installed": true`.
Nếu đang dùng eSpeak (giọng máy), vào **Nâng cao → Quản lý mô hình AI** bấm "Tải giọng Piper tiếng Việt".

Bộ giọng VieNeu (10 giọng có sẵn + giọng nhái, ~1 GB) trên Linux cài giống macOS: `./scripts/setup-voice.sh`.

## Windows (PowerShell)

Lưu ý thật: mã nguồn đã được rà cho Windows nhưng **chưa từng chạy thử trên máy Windows thật**.
Bộ giọng VieNeu chưa có script cài cho Windows, nên trên Windows app đọc bằng giọng máy.

### Bước 1. Cài công cụ nền

```powershell
winget install Python.Python.3.12 OpenJS.NodeJS.LTS Gyan.FFmpeg
```

Đóng rồi mở lại PowerShell, kiểm tra:

```powershell
python --version; node --version; ffmpeg -version | Select-Object -First 1
```

### Bước 2. Cài phần AI (hỏi người dùng trước vì tải 5,2 GB)

```powershell
winget install Ollama.Ollama
```

```powershell
ollama pull qwen3:8b
```

whisper-cli trên Windows: tải bản dựng sẵn của whisper.cpp từ trang phát hành chính thức
https://github.com/ggml-org/whisper.cpp/releases rồi đặt `whisper-cli.exe` vào một thư mục có trong PATH.
Bỏ qua bước này thì app vẫn chạy, chỉ không nghe được lời thoại.

### Bước 3. Cài giọng đọc tiếng Việt của Windows

Settings → Time & Language → Speech → Add voices → Tiếng Việt. Việc này người dùng tự làm.

### Bước 4. Mở app

```powershell
.\scripts\start.ps1
```

Nếu PowerShell chặn chạy script, người dùng tự chạy lệnh sau một lần rồi thử lại:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Kiểm tra: mở http://127.0.0.1:8765 trên trình duyệt.

## Sau khi mở app lần đầu

1. Vào **Tạo video**. Nếu thấy lời nhắc "Tải bản nghe chính xác" thì bấm tải (574 MB), làm một lần.
2. Chọn **Chế độ AI**, chọn giọng đọc (bấm biểu tượng loa để nghe thử), rồi thả một video quay thật vào.
3. Máy tự chạy tới bản xem thử. Người dùng chọn bản muốn dùng và bấm xuất.

4. Vào **Thư viện nhạc**, bấm tải các bài nhạc (305 MB, giấy phép CC0 dùng thương mại được). Làm một lần.
5. Vào **Phong cách & phụ đề**, chọn phong cách edit và kiểu phụ đề ưng ý rồi bấm "Lưu làm mặc định".

Video xuất nằm trong `data/output/` (video tin tức và các chế độ nhanh ở `data/output/tin-tuc/`, kèm file .txt
chứa mô tả, hashtag, link để dán khi đăng). Toàn bộ dữ liệu của app nằm trong thư mục `data/`.

## Lỗi hay gặp

| Hiện tượng | Nguyên nhân | Cách xử lý |
|---|---|---|
| Cổng 8765 đã có chương trình khác dùng | App khác đang chiếm cổng | Tắt chương trình đó. Cổng này viết cứng ở nhiều chỗ, không đổi bằng một biến được |
| Trên thanh trên cùng báo AI chưa sẵn sàng | Ollama chưa chạy hoặc chưa có `qwen3:8b` | `ollama list` để kiểm tra, `ollama pull qwen3:8b` |
| Mục "Giọng có sẵn" bị mờ | Chưa cài bộ giọng hoặc máy chủ giọng chưa chạy | Chạy `./scripts/setup-voice.sh` rồi mở lại bằng `./scripts/start.sh` |
| Lần nghe thử giọng đầu tiên chậm | Máy đang nạp và tải model giọng | Chờ, các lần sau nhanh |
| Kịch bản ra đều đều theo khuôn | Không có Ollama nên app dùng engine mẫu | Cài Ollama và model như bước 2 |
| Linux: giọng đọc nghe như robot | Chưa có giọng Piper nên dùng espeak-ng | Quản lý mô hình AI → "Tải giọng Piper tiếng Việt", hoặc chạy lại `./scripts/install-linux.sh` |
| Linux: `Không tạo được môi trường Python` | Thiếu gói venv | `sudo apt install python3-venv` |
| Máy chậm/đơ khi vừa viết kịch bản vừa dựng video | RAM đầy | Cài đặt → Hiệu năng → "Tiết kiệm" hoặc giảm số job song song; xem bảng RAM 16 GB ở trên |

## Mở lại app những lần sau

- macOS, Linux: `./scripts/start.sh`
- Windows: `.\scripts\start.ps1`

## Về giọng đọc

Lời do AI viết (tiêu đề, lời đọc, lời bán hàng) phải được người đọc soát trước khi đăng: AI chạy trên máy đôi khi
tự thêm lời khen hoặc công dụng không có trong nội dung gốc. Máy đã chặn con số lạ, nhưng câu chữ thì phải tự soát.

Giọng AI được đóng dấu âm thanh (watermark). Khi đăng lên Meta hoặc TikTok vẫn phải gắn nhãn nội dung AI.
Giọng nhái từ clip chỉ dùng khi người nói trong clip đã đồng ý. Giấy phép dùng thương mại của bộ giọng VieNeu
cần được xác minh với tác giả trước khi dùng cho mục đích bán hàng.
