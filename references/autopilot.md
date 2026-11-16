# Tự lái · Hồ sơ kênh · Hàng đợi nền · Thư mục tự động

Thả video thô → nhận MP4 hoàn chỉnh + ảnh bìa + phụ đề .srt + nội dung đăng, không cần mở timeline.

| Phần | File |
|---|---|
| Chuỗi tự lái (CLI) | `scripts/autopilot.mjs` |
| Tạo dự án từ video (dùng chung với `/api/new`) | `scripts/new_project.mjs` |
| Cắt ripple ngoài trình duyệt (chạy chính `studio/clips.js` trong `node:vm`) | `scripts/ripple.mjs` |
| Nội dung đăng (dùng chung với nút **Đăng**) | `scripts/publish_texts.mjs` |
| Hồ sơ kênh + học từ chỉnh sửa | `scripts/profile.mjs` |
| Hàng đợi, thư mục tự động, LaunchAgent | `scripts/queue.mjs` |
| Thông báo macOS | `scripts/notify.mjs` |
| Studio | `studio/routes/15_autopilot.mjs`, `studio/features/15_autopilot.js` (rail **Tự lái**, nút **Tự lái** trên thanh trên) |

Dữ liệu nằm trong `~/.ai-video-studio/` (đổi bằng `AVS_HOME`): `profiles.json`, `queue.json`, `autopilot.json` (cài đặt), `queue.lock`, `autopilot/projects/` (dự án do Tự lái tạo), `autopilot/inbox/` (video kéo thả vào Studio).

## 1. Chuỗi tự lái
```bash
node scripts/autopilot.mjs <video | thư mục dự án> [--profile <id>] [--out <thư mục giao>] [--project <dir>] [--restart] [--from <bước>]
node scripts/autopilot.mjs --steps
```
| Bước | Làm gì | Tắt bằng (hồ sơ) |
|---|---|---|
| `new` * | whisper (`whisper`, `lang`) → cắt lặng → khung hình (`orient`: theo video / dọc / ngang) → mặt → phụ đề | — (bỏ qua nếu đầu vào là dự án) |
| `brand` | brand kit (`brand`) + CTA (`cta` → `brand.outro`) | để trống cả hai |
| `clean` | `TL.audio.clean = {preset}` (áp khi trộn) | `clean: off` |
| `fillers` | `fillers.py` (+ `--claude`), cắt các chỗ conf ≥ 0,6 (đúng mức UI chọn sẵn) bằng ripple trên `TL.clips` | `fillers: false` |
| `ai` | `ai_edit.mjs --apply` (mục tiêu, giọng điệu, gói, mật độ, yêu cầu thêm + CTA) **hoặc** template (`template`) qua `window.applyTemplate` trong Chrome headless; ép `caption_style` nếu có | `ai: false` và không có template |
| `broll` | `auto_broll.mjs --density --src [--claude]` | `broll_density: off` |
| `sfx` | `auto_sfx.py --level` (+ `--music auto` khi AI chưa chọn nhạc), nhạc `off`/mood cố định, chỉnh dB đã học | `sound: off` |
| `qc` | `ai_qc.mjs --fix` (A2) nếu có file; không có thì bỏ qua | `qc: false` |
| `export` * | lưu `.studio/autopilot_result.json` → `mix_audio.py` → `render.mjs --audio` (giống nút Xuất) → khổ phụ bằng `export_multi.deriveAspects` + `.srt` | — |
| `publish` | `publish_texts.mjs` (claude -p) → `publish/<nền tảng>.txt` | `platforms: []` |
| `cover` | `render.mjs --still` tại `thumb_time` AI gợi ý → `out/cover.jpg` | — |
| `deliver` * | `out/summary.json` (thời gian từng bước, file, QC…), chép kết quả vào `--out`, thông báo | — |

`*` = bắt buộc: lỗi thì dừng, báo lỗi tiếng Việt, mã thoát ≠ 0. Bước tuỳ chọn lỗi → ghi `warn` và chạy tiếp.

**Chạy tiếp được** (đã thử `kill -9` giữa lúc render rồi chạy lại: bỏ qua 8 bước đã xong, xoá file tạm/MP4 dở, xuất lại trong 33 s): trạng thái ở `<dự án>/.studio/autopilot.json`. Chạy lại cùng lệnh sẽ bỏ qua bước đã xong. Bước sửa `timeline.json` có bản sao `.studio/autopilot/pre_<bước>.json`; nếu bước đó bị ngắt giữa chừng thì timeline được khôi phục trước khi làm lại. Video cùng đường dẫn + dung lượng luôn vào cùng thư mục `autopilot/projects/<tên>-<hash>`. `--restart` làm lại từ đầu, `--from ai` làm lại từ một bước.

Đầu ra: dòng `@@ <0..1> [k/12] <bước>: <chi tiết>`, `PROJECT <dir>`, cuối cùng `RESULT {json}`. Với `--out`, thư mục giao có `<tên> 9x16.mp4` (+ `1x1`, `16x9`), `<tên> - ảnh bìa.jpg`, `<tên>.srt`, `<tên> - nội dung đăng.txt`, `summary.json`.

## 2. Hồ sơ kênh (`profiles.json`)
`{version, default, profiles: [ {id, name, brand, pack ('auto' = AI chọn), template, caption_style, goal, tone, ai, ai_density, extra, broll_density, broll_src[], broll_claude, sound, music ('auto'|'off'|mood), clean, fillers, fillers_claude, whisper, lang, orient, aspects[], quality, qc, cta, platforms[], slot, learn, learned} ]}`.
Studio: tạo / sửa / nhân bản / xoá / đặt mặc định trong thẻ **Hồ sơ kênh**. CLI: `node scripts/profile.mjs list | show [id] | default <id> | learn <dự án> | reset-learned <id>`. `slot` (giờ đăng mặc định) được ghi vào `summary.json` để Lịch đăng (A4) dùng.

### Học từ chỉnh sửa
- Khi Studio đang mở một dự án do Tự lái làm và bạn **lưu** nó (kiểm tra mỗi 15 s, hoặc bấm **Học từ dự án này**), Studio so `timeline.json` với `.studio/autopilot_result.json` (bản Tự lái giao) và ghi một *quan sát* vào `learned.projects[<dự án>]`: số cảnh Tự lái chèn (`_auto` của b-roll + `_ai` của AI dựng giúp, trừ nền `_base`) theo loại (emoji / chữ / ảnh / graphic khác) trước–sau, riêng graphic AI trước–sau, SFX tự động trước–sau, nhạc bị tắt / đổi dB, kiểu phụ đề / gói bị đổi, số cảnh tự động bị chỉnh (`_orig`). Lưu lại cùng dự án chỉ **thay** quan sát cũ, không cộng dồn.
- Luật (trên ≤ 10 quan sát mới nhất, cần **≥ 2 video**): xoá ≥ 60 % emoji / chữ nổi / ảnh tự động (≥ 4 cái) → bỏ nguồn đó khỏi b-roll và dặn AI “không chèn …”; xoá ≥ 45 % b-roll tự động → giảm mật độ một bậc; xoá ≥ 45 % graphic AI → AI thưa hơn một bậc; xoá ≥ 50 % SFX → giảm mức âm thanh; tắt nhạc ở ≥ 60 % video → không nhạc; luôn chỉnh nhạc cùng chiều → áp dB trung bình; 2–3 video gần nhất cùng đổi sang một kiểu phụ đề / gói → dùng luôn (trừ khi hồ sơ đã ép).
- Điều đã học hiện trong thẻ hồ sơ (câu tiếng Việt), được ghi vào `autopilot.json`/`summary.json` (`learnedApplied`) mỗi lần chạy; **Quên điều đã học** (cục tẩy) xoá `learned`. Tắt hẳn: `learn: false`.

## 3. Hàng đợi nền (`queue.json`)
Mục: `{id, kind, input, opts, source, state: queued|running|done|error|cancelled, progress, step, created, started, finished, outputs[], error, attempt, project}`.

| kind | lệnh |
|---|---|
| `autopilot` | `autopilot.mjs <input> [--profile] [--out]` |
| `highlights` | `highlights.mjs <video> --out <dir> [--n --min --max --orient]` (A3; mặc định `autopilot/highlights/<tên>-<id>`) |
| `topic` | `topic_video.mjs "<chủ đề>" --out <dir> [--dur --voice --orient]` (A3; mặc định mỗi mục một thư mục `autopilot/topics/<id>`) |
| `variants` | `variants.mjs <dự án> --n 3 [--kind]` (A2) |
| `publish` | `publish.mjs <action> <mp4> [--meta] [--schedule]` (A4) |
`opts.args` (mảng) được nối thêm vào cuối lệnh. Script chưa có → mục báo lỗi rõ “chưa được cài”, không thử lại.

- **Một runner duy nhất** giữ `queue.lock` (pid): lane trong máy chủ Studio (không dùng ô tác vụ chính — Xuất/AI vẫn chạy song song), `node scripts/queue.mjs run [--daemon]`, hoặc LaunchAgent. Tiến trình khác đứng chờ và tự nhận lại khi runner kia tắt. Chỉ chạy **1 mục nặng** một lúc.
- Lỗi → tự thử lại 1 lần (autopilot chạy tiếp từ bước dừng). Huỷ (đang chạy: giết cả nhóm tiến trình), Thử lại, Lên/Xuống, Xoá, Mở dự án trong Studio, Hiện trong Finder. Mục `running` của runner đã chết → tự về `queued`.
- Mỗi 60 s runner gọi `node scripts/publish.mjs run-due` nếu file tồn tại (lịch đăng A4).
- CLI: `node scripts/queue.mjs add autopilot ~/clip.mov [--profile id] [--out dir] | list | cancel|retry|remove|up|down <id> | clear-done | run [--daemon]`.

## 4. Thư mục tự động
Mặc định (tắt sẵn): `~/Movies/AI Video Studio/Thả video vào đây` → kết quả `…/Đã xong/<tên>/`, bản gốc chuyển sang `…/Đã xử lý/`. Thêm nhiều thư mục, mỗi thư mục một hồ sơ. Nhận `.mov .mp4 .m4v .mkv`; bỏ qua file ẩn, `.download/.crdownload/.part` (AirDrop/trình duyệt đang tải); file phải giữ nguyên dung lượng + giờ sửa **5 giây** mới được nhận.
Chạy khi Studio/app mở. **Chạy cả khi tắt app**: cài `~/Library/LaunchAgents/com.aivideostudio.watch.plist` (`queue.mjs run --daemon --role agent`, KeepAlive, nhật ký `~/Library/Logs/AIVideoStudio-watch.log`); bỏ chọn = `launchctl bootout` + xoá plist. Nhờ `queue.lock` không bao giờ có hai runner cùng xử lý. CLI: `node scripts/queue.mjs agent install|uninstall|status`.

## 5. Giao diện
Rail **Tự lái** (biểu tượng tên lửa): vùng thả lớn + **Chọn file** + đường dẫn, chọn hồ sơ; thẻ **Đang làm** với danh sách 12 bước (✓ / đang chạy / bỏ qua / cảnh báo, thời gian từng bước); **Hàng đợi**; **Thư mục tự động** (bật/tắt, ô đường dẫn + Mở trong Finder, hồ sơ cho từng thư mục, Chạy cả khi tắt app, Thông báo, Thả vào app = tự lái); **Hồ sơ kênh** + điều đã học. Nút **Tự lái** trên thanh trên hiện % việc đang chạy. Mở thẳng: `http://localhost:5186/#tu-lai`.
**Thả vào app = tự lái**: thả video vào biểu tượng AI Video Studio → `launcher.sh new` đưa vào hàng đợi (`/api/autopilot/enqueue`) rồi mở Studio ở panel Tự lái.

## 6. Giới hạn
- Cần Claude Code CLI cho AI dựng giúp, câu nói hỏng và nội dung đăng; thiếu CLI → các bước đó ghi cảnh báo, video vẫn xuất (không graphic AI / không caption).
- Thời gian thật (Mac mini M-series, clip 31–46 s, mặc định): ~1,5–2 phút/video; AI dựng giúp 30–45 s, render 1080p 15–25 s.
- “Học từ chỉnh sửa” chỉ đếm thống kê đơn giản, không đoán ý; vị trí cảnh bị kéo chỉ được ghi nhận, chưa tự áp.
- Không tự đăng lên mạng (xem Lịch đăng của A4 cho YouTube).
