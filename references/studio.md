# AI Video Studio — phần mềm edit (studio/)

Một editor chạy local trong trình duyệt. Preview dùng **chính engine render**, nên khung hình nhìn thấy giống hệt khung hình xuất ra. Studio đọc và ghi trực tiếp `timeline.json` + `captions.json` của dự án: Claude dựng bản đầu tiên, người dùng tinh chỉnh bằng chuột, rồi ghi chú lại để Claude sửa tiếp.

## Chạy
```bash
bash <skill>/studio.sh <thư mục dự án>          # mở dự án có sẵn → http://localhost:5186
bash <skill>/studio.sh --new raw.mp4 [thư mục]   # video thô → dự án khởi đầu → mở luôn
```
Cần Node ≥ 18, ffmpeg, Chrome (để xuất video), và `scripts/.venv` (whisper, nếu dùng "Video mới"). Khi Claude mở Studio cho người dùng thì chạy nền (`run_in_background`), rồi đưa link `http://localhost:5186`.

## Màn hình (v2 — giao diện tối kiểu editor chuyên nghiệp)
Code: `studio/index.html`, `studio.css` (theme tối, accent tím), `clips.js` (track chính + ripple), `library.js` (thanh icon trái + thư viện), `studio.js` (preview, inspector, timeline, phát, lưu/xuất). Icon: tabler-icons webfont (jsdelivr).
- **Thanh trên**: tên dự án + trạng thái Đã lưu / Chưa lưu, hoàn tác ↶ / làm lại ↷, nhãn khổ hình (9:16 / 16:9), **Vừa khung** (fit preview + timeline), **Lịch sử** (60 bản lưu trong `<dự án>/.studio/history/`), **Video mới**, **Lưu** (⌘S), **Xuất** (nút chính).
- **Thanh icon trái** mở thư viện:
  - **Mẫu**: gallery từ `GET /api/templates` (lọc theo BĐS, Khoá học, Review, Chia sẻ, Tin tức, Bán hàng, AI, Khác + ô tìm). Rê chuột = phát preview mp4. **Dùng mẫu** gọi `win.applyTemplate(TL, tpl, CAP, title)` của engine (`packs/core.js`): gói, kiểu phụ đề, brand (gộp, giá trị của người dùng thắng), theme, nhạc, fx, cảnh của recipe (`_recipe`) + cảnh của mẫu (`_tpl`, dời theo `base_dur`). Dùng lại mẫu khác sẽ thay chứ không chồng. **Lưu thành mẫu** → `POST /api/templates/save` → `templates/user/<id>.json` + ảnh bìa `templates/previews/<id>.jpg`.
  - **Media**: “Của tôi” (tải lên bằng nút hoặc kéo thả, `/api/upload`) — bấm **Track chính** để chèn ảnh/video làm clip vào chỗ nối gần playhead nhất (phần sau tự dồn), hoặc **Lớp phủ** để chèn cảnh `photo` như cũ; file nhạc → nhạc nền. “B-roll động”: gõ chủ đề + Enter, bấm để chèn `media_card`.
  - **Âm thanh**: nhạc nền theo mood (▶ nghe thử, + thêm từ playhead) và 191 SFX (▶ nghe thử, bấm để thêm tại playhead), nút Tự đặt SFX.
  - **Chữ**: + Thêm chữ, 14 mẫu chữ (style/font/hoạt ảnh), danh sách **kiểu phụ đề** (mọi `CAPTION_STYLES` + Karaoke cơ bản + Tắt).
  - **Sticker**: lưới emoji 3D Fluent → cảnh `emoji_pop` tại playhead.
  - **Hiệu ứng**: mọi item của mọi gói trong `window.PACKS`, nhóm theo gói, có ảnh thu nhỏ `studio/thumbs/<packid>__<index>.jpg` (thiếu thì hiện icon gói).
  - **Chuyển cảnh**: 15 kiểu (rê chuột để xem demo). Bấm = áp cho clip đang chọn; hoặc kéo thả vào chỗ nối giữa hai clip trên timeline. Có thời lượng và “Áp dụng cho mọi clip”.
  - **Bộ lọc**: 8 LUT (`clip.filter.preset`) xem trước trên khung của clip; áp cho clip đang chọn (hoặc clip tại playhead), hoặc mọi clip.
  - **Thành phần**: danh sách cũ với tab **Tại đây / Tất cả / Đã chỉnh**, ô tìm, ô tick ẩn/hiện.
- **Giữa**: preview đúng engine. Bấm chữ/graphic để chọn, kéo để dời (hít đường giữa, Alt bỏ hít), kéo góc đổi cỡ, bấm đúp để sửa chữ. Thanh dưới preview: nhãn khổ hình, **Vùng an toàn**, **Vùng mặt**, lùi/tiến 1 khung, phát/dừng, timecode `hiện tại / tổng`, **Phóng to** (ẩn 2 panel bên, Esc để thu lại).
- **Phải — inspector theo tab**:
  - Clip: **Cơ bản** (lấp đầy / vừa khung / nền mờ, phóng to + tâm, lật ngang, điểm vào/ra nguồn có ripple, tách / nhân bản / xoá) · **Tốc độ** (0.5/1/1.5/2× + thanh 0.25–4×) · **Âm thanh** (âm lượng 0–200 %, tắt tiếng) · **Màu** (LUT + độ sáng, tương phản, bão hoà, nhiệt độ, sắc độ, làm mờ) · **Chuyển cảnh**.
  - Chữ: **Cơ bản** (nội dung, font, độ đậm, kiểu chữ, nghiêng, màu) · **Hoạt ảnh** (9 kiểu `anim` có xem trước động + thời lượng hiển thị) · **Vị trí** (X/Y/cỡ, cảnh báo vùng an toàn, thời gian).
  - Phụ đề: **Cơ bản** (`*từ khoá*`, `/` xuống dòng, bấm từ để nổi bật, Shift+bấm xuống dòng, “Áp dụng cho mọi phụ đề”) · **Vị trí**.
  - Graphic/cảnh: **Cơ bản** · **Vị trí** · **Nâng cao** (sửa JSON). Mọi thành phần (trừ clip): Ẩn / Nhân bản / Xoá / **Về thiết kế** + **Ghi chú cho Claude**.
  - Không chọn gì: **Dự án** (gói style + **Dựng tự động theo gói**, kiểu phụ đề, vị trí mặt, Tự đặt SFX, ghi chú chung) · **Thương hiệu** (brand kit).
- **Timeline**: thanh công cụ (tách ⌘B, xoá, nhân bản, nam châm bật/tắt), thanh thu phóng + Vừa timeline (⌘/Ctrl + cuộn cũng zoom). Track: Phụ đề, Chữ thêm, Chữ graphic, Graphic, B-roll, Cảnh (track trống tự ẩn), **Video chính**, Âm thanh, Giọng (waveform theo từng clip). Mỗi track có nút **ẩn** (chỉ ẩn trên preview) và **khoá**.
  - Track chính: mỗi clip là một khối có dải ảnh thu nhỏ, nhãn tốc độ/tắt tiếng/bộ lọc, nút chuyển cảnh ở chỗ nối. Kéo khối để **đổi thứ tự** (phụ đề, SFX, graphic nằm trọn trong clip đi theo). Kéo mép để **cắt có ripple**. Delete = xoá clip có ripple.
  - Khối khác: kéo để dời, kéo mép để cắt, hít vào playhead / mép khối / chỗ nối clip. Bấm thước hoặc khoảng trống để tua, bấm đúp để nhảy tới khối. Kéo mép trên của timeline để đổi chiều cao.
- **Phím tắt**: Space phát/dừng · ← → 1 khung (Shift: 1 giây) · Alt+mũi tên dịch 1 px (Shift: 10 px) · Delete xoá · ⌘D nhân bản · ⌘B tách clip · ⌘Z / ⇧⌘Z · + / − zoom timeline · ⇧Z vừa khung · Esc bỏ chọn / thu preview.

## Track chính trong Studio (`TL.clips`, xem clips.md)
- Mở dự án chưa có `clips` → tự chuyển: một clip `{src:{seq: aroll.frames, fps, count}, audio: audio.voice, in:0, out: min(count/fps, duration)}` (giữ `aroll` để tương thích; chỉ ghi vào file khi bấm Lưu).
- Ripple (`clips.js` → `remapAll`): xoá / cắt mép / đổi tốc độ / chèn / nhân bản clip sẽ dời phụ đề + từ (`words[].s/e`, bỏ từ nằm trong đoạn xoá), scenes (kể cả thời gian lồng bên trong), sfx, nhạc, fx, grade/zoom. `TL.duration` = tổng clip + đuôi của cảnh kết thúc sau đó.
- Khi phát, tiếng của clip phát theo đúng điểm nguồn, tốc độ, âm lượng, tắt tiếng.

Khi phát thử, preview nghe giọng gốc kèm SFX và nhạc phát trực tiếp theo timeline. Bản xuất thì trộn lại toàn bộ (`mix_audio.py`, −14 LUFS).

## Xuất
Trong hộp thoại xuất còn có **Ảnh bìa** (render khung hiện tại ra `out/cover_*.jpg` ở 1080p) và **Phụ đề .srt** (`out/<tên>.srt`, để đăng YouTube/Facebook).
"Xuất video" sẽ lưu dự án, chạy `mix_audio.py` rồi `render.mjs`, và ghi ra `<dự án>/out/<tên>_<thời gian>.mp4`. Chọn được 720p, 1080p hoặc 4K, và có thể chỉ xuất một đoạn từ–đến. Thanh tiến độ hiện ngay trong app, có nút "Hiện trong Finder".

## Ghi chú cho Claude
Mỗi lần lưu, Studio ghi `<dự án>/.studio/notes.md`, liệt kê mọi ghi chú kèm đường dẫn JSON (`scenes[3].lines[1]`, `captions[7]`…) và thời điểm. Khi người dùng nói "xem ghi chú trong editor":
1. Đọc `.studio/notes.md`.
2. Sửa `timeline.json` hoặc `captions.json` theo ghi chú.
3. Xoá trường `note` của các mục đã làm.
4. Báo người dùng bấm tải lại trang Studio. Studio chỉ đọc file lúc mở, nên **đừng sửa file khi người dùng đang có thay đổi chưa lưu**. Hỏi trước nếu không chắc.

Trường `_orig` trên một phần tử là bản thiết kế gốc (để dùng cho "Về thiết kế"). Phần tử có `_orig` nghĩa là người dùng đã tự chỉnh tay: khi dựng lại thì **giữ nguyên chỉnh sửa đó** trừ khi được yêu cầu.

## API (cho script)
| Đường dẫn | Việc |
|---|---|
| `GET /api/project` | `{timeline, captions, meta}` |
| `POST /api/save` | `{timeline, captions}` → ghi file + lịch sử + notes.md |
| `GET /api/history`, `GET /api/history/<id>` | lịch sử |
| `GET /api/library` | danh sách SFX / nhạc |
| `GET /api/waveform` | biên độ mỗi 1/50 s |
| `GET /api/broll?q=` | tìm trong 9.080 b-roll |
| `POST /api/autosfx` | chạy `auto_sfx.py --keep-manual` |
| `POST /api/export` | `{quality:"720"\|"1080"\|"4k", from?, to?}` |
| `POST /api/new` | `{video, dir?, model?, pack?, title?, orient?:"vertical"|"horizontal"}` |
| `GET /api/job`, `POST /api/job/cancel` | tiến độ / huỷ tác vụ |
| `POST /api/open` | `{path}` → đổi dự án |
| `GET /api/media`, `POST /api/upload?name=` | thư viện media (body = file) |
| `GET /api/still?t=` | ảnh bìa → `out/cover_*.jpg` |
| `GET /api/srt` | phụ đề → `out/<tên>.srt` |
| `GET /api/templates` | danh sách mẫu: `templates/*.json` + `templates/user/*.json`, kèm `preview:{mp4,jpg}` và `user` |
| `POST /api/templates/save` | `{tpl, t}` → `templates/user/<id>.json` + ảnh bìa `templates/previews/<id>.jpg` |
| `GET /templates/…` | file tĩnh của thư mục mẫu (preview mp4/jpg) |
| `GET /studio/thumbs/…` | ảnh thu nhỏ hiệu ứng + `index.json` |

Server chỉ nghe ở `127.0.0.1` và chỉ phục vụ file trong `studio/`, `engine/`, `assets/`, thư mục mẫu và thư mục dự án. Thư mục mẫu mặc định là `<skill>/templates`, đổi bằng `--templates <dir>` hoặc biến `AVS_TEMPLATES`.

## Ảnh thu nhỏ hiệu ứng
```bash
node <skill>/scripts/thumbs.mjs <dự án có work/frames>/timeline.json            # mọi gói (≈1 phút)
node <skill>/scripts/thumbs.mjs <...>/timeline.json --only news,topn             # chỉ làm lại vài gói
```
Render mỗi item `make(2)` tại 2,7 s lên footage thật → `studio/thumbs/<packid>__<index>.jpg` (180×320, q70) + `studio/thumbs/index.json`. Chạy lại sau khi thêm/sửa gói (thứ tự item đổi thì ảnh cũng đổi theo index).

## Plugin (v4)
Studio tự nạp mọi `studio/routes/*.mjs` (server) và `studio/features/*.js` (giao diện) theo thứ tự tên.
- Route: `export default ctx => async (req, res, p, u) => true|false`. `ctx` có `project, job, startJob, run, json, body, save, readProject, P, PY, SKILL`.
- Feature: dùng đối tượng toàn cục `Studio`: `TL, CAP, addPanel(id, icon, tên, fn), addTopButton(html, fn), addInspectorTab(c => [key, nhãn, html]), onReady, reload, changed, pushUndo, api, pollJob, toast, modal`.
- Tính năng có sẵn:
  - `18_schedule`: Lịch đăng + Kết nối YouTube (`references/publish-schedule.md`).
  - `20_ai`: AI dựng giúp, Cắt lỗi nói, Lời thoại.
  - `30_audio`: Âm thanh+.
  - `40_reframe`: Bám mặt, Lồng tiếng.
  - `50–52`: Hàng loạt, Thương hiệu, Đăng.
  - `60–62`: Keyframe, Mặt nạ / Tách nền, B-roll AI.
  - `90_app`: mở thư mục, tiến trình.
