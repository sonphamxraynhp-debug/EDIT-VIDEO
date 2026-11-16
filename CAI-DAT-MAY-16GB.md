# Cài AI Video Studio trên máy của bạn (RAM 16 GB)

> Bản này **dựa trên AI Video Studio của Nguyễn Tất Kiểm** – <https://github.com/nguyentatkiem/ai-video-studio> (giấy phép MIT).
> Repo `EDIT-VIDEO` giữ nguyên toàn bộ mã nguồn và lịch sử gốc, cộng thêm các bản sửa ở cuối trang.

Hướng dẫn đầy đủ nằm trong [README.md](README.md) (mục 3). Trang này là bản rút gọn cho máy **16 GB RAM**.

---

## Windows 10/11 (cách dễ nhất)

1. Mở **PowerShell** (bấm Start, gõ `powershell`, Enter) rồi chạy từng lệnh:

   ```powershell
   winget install --id Git.Git -e
   ```

   ```powershell
   git clone -b claude/clever-keller-m4yr5k https://github.com/sonphamxraynhp-debug/EDIT-VIDEO.git C:\AI\ai-video-studio
   ```

   (Khi nhánh này đã gộp vào `main` thì bỏ phần `-b claude/clever-keller-m4yr5k`. Repo riêng tư thì Git sẽ hỏi đăng nhập GitHub.)

2. Mở thư mục `C:\AI\ai-video-studio`, **bấm đúp `install.cmd`**.
   - Thiếu ffmpeg / Node.js / Python thì trình cài hỏi *"Cài tự động bằng winget? (Y/n)"* → bấm **Y**.
   - Cài xong công cụ mà vẫn báo thiếu: đóng cửa sổ, bấm đúp `install.cmd` lần nữa.
   - Lần đầu mất khoảng 10–20 phút (thư viện Python + model nhận giọng nói ~1,6 GB).

3. Bấm đúp lối tắt **AI Video Studio** ngoài Desktop → trình duyệt mở <http://localhost:5186>.
   Giữ cửa sổ đen (server) mở trong lúc dùng.

4. (Nên có) Cài **Claude Code** để bật các tính năng AI (dựng giúp, cắt lỗi nói, tạo style…), rồi chạy `claude` một lần để đăng nhập:

   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```

## macOS

```bash
brew install ffmpeg node python git && brew install --cask google-chrome
```

```bash
git clone -b claude/clever-keller-m4yr5k https://github.com/sonphamxraynhp-debug/EDIT-VIDEO.git ~/ai-video-studio
```

```bash
cd ~/ai-video-studio && bash install.sh
```

Mở bằng app **AI Video Studio** trong Launchpad, hoặc `bash studio.sh`.

---

## Máy 16 GB chạy thế nào

Đã đo thực tế trên máy 16 GB, video mẫu 31,6 giây khổ 1080×1920:

| Việc | RAM dùng | Ghi chú |
|---|---|---|
| Render 1080p, 6 luồng | ~5,9 GB đỉnh | mỗi luồng là một Chrome ẩn, ~0,95 GB |
| Nhận giọng nói whisper `large-v3-turbo` (int8, CPU) | ~1,5–2 GB | chỉ chạy trước khi render, không chồng lên nhau |
| Render 4K | ~2,7 GB / luồng | tự giới hạn 2 luồng trên máy 16 GB |

Số luồng render giờ **tự tính theo RAM** (tối đa ~45 % RAM, và trên Windows còn xét RAM đang trống), nên máy 16 GB
không bị tràn bộ nhớ kể cả khi đang mở nhiều ứng dụng khác. Hàng đợi tự lái chạy từng video một.

### Chỉnh tay nếu máy vẫn chậm / đứng

Đặt biến môi trường (Windows: *Start → "Edit environment variables for your account"*; macOS: thêm vào `~/.zshrc`), rồi mở lại Studio:

| Biến | Ví dụ | Tác dụng |
|---|---|---|
| `AVS_RENDER_WORKERS` | `3` | số Chrome render song song (ít hơn = nhẹ RAM hơn, chậm hơn) |
| `AVS_WHISPER_MODEL` | `medium` | model nhận giọng nói nhẹ hơn (`small` nhẹ nhất, kém chính xác hơn) |
| `AVS_WHISPER_THREADS` | `4` | số nhân CPU cho whisper (mặc định: số nhân − 1, tối đa 8) |
| `AVS_SKIP_MODEL` | `1` | lúc cài không tải sẵn model whisper |

Gợi ý: máy 16 GB + CPU 4 nhân → để mặc định; nếu vừa render vừa mở nhiều tab Chrome/Zalo/Photoshop → `AVS_RENDER_WORKERS=3`.

---

## Những gì đã sửa / bổ sung so với bản gốc

1. **Xuất video lỗi trên ffmpeg 6** – trộn âm thanh (`mix_audio.py`) và cắt khoảng lặng (`cut.py`) dùng cú pháp
   `-/filter_complex` chỉ có ở ffmpeg 7+, trong khi README ghi hỗ trợ ffmpeg ≥ 6 (Ubuntu 24.04, một số bản winget/brew cũ
   vẫn là ffmpeg 6). Thêm `scripts/ffmpeg_compat.py` tự chọn đúng cú pháp theo phiên bản ffmpeg.
2. **Số luồng render theo RAM** (`scripts/render.mjs`) + biến `AVS_RENDER_WORKERS`.
3. **Whisper**: giới hạn số luồng CPU để Studio không bị đơ, biến `AVS_WHISPER_MODEL` / `AVS_WHISPER_THREADS`,
   thông báo lỗi tiếng Việt rõ ràng khi chưa tải được model (lần đầu cần mạng).
4. **Tải sẵn model whisper lúc cài** (`scripts/prefetch_model.py`, gọi từ `install.cmd` / `install.sh`) để video đầu tiên
   không phải chờ tải 1,6 GB.
5. **Chrome trên Linux chạy quyền root** (Docker, máy chủ, WSL) không khởi động được → tự thêm `--no-sandbox`
   (biến `AVS_NO_SANDBOX=1` để ép bật). Không ảnh hưởng Windows/macOS.

Đã kiểm tra: tự kiểm tra engine 621/621 mục OK (28 gói style, 325 module, 39 kiểu phụ đề), giao diện Studio mở không lỗi,
xuất video qua Studio có tiếng (−14 LUFS), cắt khoảng lặng chạy đúng trên ffmpeg 6.
Chưa kiểm tra được trong máy cloud: tải model whisper (máy cloud chặn huggingface.co) và các tính năng cần đăng nhập Claude.

---

Tác giả gốc: **Nguyễn Tất Kiểm** · Tặng khoá học AI miễn phí: <https://nguyentatkiem.com.vn/aiplusntk/>
