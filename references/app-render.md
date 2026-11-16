# Render song song + App Mac

## 1. Render nhanh (`scripts/render.mjs`)

```bash
node scripts/render.mjs timeline.json out.mp4 [--from 0] [--to 10] [--audio mix.wav] [--workers N] [--fast]
node scripts/render.mjs timeline.json x --still 12.5 still.jpg
```

- `--workers N`: N Chrome headless (mỗi worker một Chrome riêng) render các đoạn liền nhau → mỗi đoạn một file mp4 tạm
  (`<thư mục out>/.render_xxx/`), nối **không nén lại** (`ffmpeg concat -c copy`), âm thanh ghép một lần ở cuối.
  Mặc định `min(6, số nhân CPU − 2)`; tự giảm để mỗi worker có ≥ 1 giây. `--workers 1` = chạy tuần tự như cũ.
- Chụp khung bằng CDP `Page.captureScreenshot` (jpeg, `optimizeForSpeed`, `captureBeyondViewport:false`); nếu khung chụp
  sai kích thước thì tự quay về `page.screenshot`.
- `--fast`: x264 `-preset veryfast` (mặc định `medium`, CRF 17 giữ nguyên) — file to hơn một chút, nhanh hơn ~10–15%.
- Dòng tiến độ giữ dạng `X.Xs / Ys` (studio đọc để vẽ thanh tiến độ); cuối cùng in `done -> out.mp4 (n frames, N workers, fps)`.
- Huỷ (SIGTERM từ nút Huỷ của studio) sẽ tắt mọi Chrome/ffmpeg con và xoá file tạm.

**Đo trên dự án demo 1080×1920, 30 fps (máy 15 nhân, đang có tải khác):**

| | 10 s (300 khung) | cả video 22,7 s (681 khung) |
|---|---|---|
| bản cũ (tuần tự, page.screenshot) | 18,2 s · 16 fps | 46,7 s · 15 fps |
| `--workers 1` (CDP capture) | 15,0 s · 20 fps | 32,9 s · 21 fps |
| mặc định 6 workers | 5,6 s · 54 fps | 8,3–8,7 s · ~80 fps |
| 6 workers `--fast` | 4,9 s · 61 fps | 7,9 s · 88 fps |

Chất lượng: cùng đoạn 3 s render 1 worker và 6 workers → SSIM 0,995, PSNR trung bình 49,6 dB (thấp nhất 47,7 dB) — khác biệt
chỉ do x264 đặt keyframe ở đầu mỗi đoạn. `--workers 1` cho ra khung giống hệt bản cũ (PSNR ∞).

Giới hạn: mỗi worker là một Chrome (~250–400 MB RAM); trên 1080p (vd. 4K) mặc định tối đa 3 workers. Engine phải là hàm thuần của `t`
(đã đúng với mọi pack) vì các đoạn được render độc lập.

## 2. App Mac — mở studio không cần Terminal

```bash
bash scripts/make_app.sh                       # → ~/Applications/AI Video Studio.app
bash scripts/make_app.sh --dest /Applications  # nơi khác
# tuỳ chọn: --skill <thư mục skill> (ghim), --port 5186, --no-browser (để test)
```

- **Bấm mở app**: kiểm tra `node`, `ffmpeg`, Google Chrome, thư viện render; thiếu gì thì hiện hộp thoại tiếng Việt chỉ cách cài.
  Nếu cổng 5186 chưa chạy thì khởi động `studio/server.mjs` (mở lại dự án dùng lần trước), rồi mở `http://localhost:5186`.
- **Thả video vào icon** (Dock/Finder, hoặc `open -a "AI Video Studio" clip.mp4`): tạo dự án mới cạnh video
  (`<tên>_studio/`, giống `studio.sh --new`), trình duyệt hiện tiến độ rồi tự mở dự án. Đang bận tác vụ khác → báo bận.
- **Bấm icon trên Dock khi app đang chạy**: hộp thoại *Mở Studio* / *Mở thư mục dự án* / *Thoát Studio*.
  Trong studio cũng có nút thư mục (cạnh nút Xuất) để mở thư mục dự án trong Finder.
- **Thoát app** (⌘Q / Thoát trên Dock): dừng máy chủ **nếu chính app đã khởi động nó**; máy chủ chạy từ `studio.sh` được để nguyên.
  App phải đang chạy (icon trên Dock) thì máy chủ mới chạy theo app.
- Thư mục skill: `~/.claude/skills/ai-video-studio`, dự phòng đường dẫn ghi lúc build (`--skill` thì ưu tiên đường dẫn đó).
- Nhật ký: `~/Library/Logs/AIVideoStudio.log`. Trạng thái (pid, dự án gần nhất): `~/Library/Application Support/AIVideoStudio/`.

Cấu tạo: applet AppleScript stay-open (`scripts/app/AIVideoStudio.applescript`, biên dịch bằng `osacompile -s`) gọi
`Contents/MacOS/avs-launch.sh` (`scripts/app/launcher.sh`: `start | new <video> | reveal | stop | status`); icon từ
`scripts/app/icon_1024.png` (vẽ lại bằng `node scripts/app/make_icon.mjs`) qua `sips` + `iconutil`; Info.plist khai báo
`CFBundleDocumentTypes` cho `public.movie`; ký ad-hoc (`codesign -s -`). Route phụ: `studio/routes/90_app.mjs`
(`GET /api/app/info`, `POST /api/app/reveal`), giao diện: `studio/features/90_app.js`.

Giới hạn: app chỉ chạy trên máy đã build (ký ad-hoc, không notarize). Không có menu riêng — dùng hộp thoại khi bấm icon Dock.
