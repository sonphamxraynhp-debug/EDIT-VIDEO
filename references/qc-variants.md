# AI tự kiểm tra (QC) · Nhiều phiên bản (A/B)

Code: `scripts/ai_qc.mjs`, `scripts/variants.mjs`, `studio/routes/16_qc.mjs`, `studio/features/16_qc.js`.

## 1. AI tự kiểm tra — `scripts/ai_qc.mjs`
```bash
node scripts/ai_qc.mjs <dự án> [--fix] [--model sonnet] [--no-claude] [--no-audio] [--fresh]
```
Kết quả: `<dự án>/.studio/qc.json` + ảnh `.studio/qc/sheet.jpg` (tổng quan) và `.studio/qc/compare.jpg` (trước/sau, khi `--fix`). Tiến độ in dạng `@@ <0..1> <bước>`, lỗi in tiếng Việt ra stderr, mã thoát ≠ 0.

### Bước 1 — máy tự dò (không cần AI, ~5–10 giây cho clip 30 s)
Mở **một** Chrome headless, nạp engine, render ảnh tại: đầu/giữa/cuối mỗi graphic + mỗi 3 giây + 0,5/1/1,8 s (hook). Mỗi cảnh được bọc `data-qs="<chỉ số>"` (`display:contents`, không đổi bố cục), nên **hộp chữ và hộp phần tử đọc thẳng từ DOM** (toạ độ thiết kế 720×1280 / 1280×720), có trừ phần bị khung cha cắt (marquee, thẻ).

| Loại (`kind`) | Cách dò | Mức |
|---|---|---|
| `text_offcanvas` | hộp chữ ra ngoài khung > 6 px (bỏ qua hiệu ứng vào/ra: phải thấy ở giữa cảnh hoặc ≥ 2 ảnh) | cao |
| `text_unsafe` | chữ ngoài vùng an toàn của Studio (chỉ báo) | thấp |
| `face_cover` | phần tử graphic phủ > 30 % **hộp mặt** khi đang nói. Hộp mặt = YuNet (`face_track.py`) chạy trên ảnh chỉ có lớp nền (không graphic, không phụ đề) | vừa/cao |
| `caption_overlap` | graphic phủ > 25 % dòng phụ đề | vừa |
| `hook_missing` | 2 giây đầu không có chữ cao ≥ 2,8 % khung hoặc graphic lớn | cao |
| `overlap` | 2 cảnh cùng lớp (cùng nhóm track như timeline Studio) chồng > 0,25 s | vừa |
| `empty` | > 6 s không có sự kiện hình (graphic vào/ra, fx, zoom, chuyển cảnh) | vừa/cao |
| `dense` | > 3 graphic bật lên trong 4 s | thấp |
| `caption_long` | dòng phụ đề > 5 từ | thấp/vừa |
| `missing_media` | file trong timeline không có, engine báo tải hỏng, SFX/nhạc/b-roll id không có trong thư viện | cao |
| `loudness`, `true_peak` | trộn thử bằng `mix_audio.py --stems` → `ebur128` (chuẩn −14 LUFS, ≤ −1 dBTP) | vừa/thấp |
| `music_masking` | stem nhạc chỉ thấp hơn stem giọng < 8 dB ở > 20 % lúc nói | vừa/cao |
| `silence` | bản trộn im (< −50 dBFS) > 1,2 s giữa video | thấp |

### Bước 2 — Claude xem (tuỳ chọn)
`claude -p --allowedTools Read --add-dir .studio/qc/review` với ≤ 14 ảnh (hook, chỗ có lỗi, rải đều) + JSON tóm tắt timeline (cảnh `sN`, chữ trên màn hình, phụ đề `cN`, nhạc, lỗi máy đã dò). Claude chấm 0–10: hook, dễ đọc, chính tả (dấu tiếng Việt), đa dạng, nhịp, thương hiệu, và trả về vấn đề kèm **bản sửa trong bộ lệnh an toàn**:

`text {target,from,to}` (phụ đề phải giữ số từ) · `move {dx,dy}` · `resize {scale 0.5–1.5}` · `retime {t0,t1}` · `shorten {t1}` · `delete` (= ẩn, không xoá lớp nền) · `caption_style` (phải có trong engine) · `gain {what:"music", db −12…+6}` · `hook {text ≤ 7 từ}`.
Lệnh sai/thiếu đích bị bỏ (`proposed` giữ lại để xem). Kết quả được cache theo hash timeline (`.studio/qc/claude.json`): bấm “Áp dụng sửa” ngay sau “Kiểm tra” không gọi Claude lần nữa. Prompt/trả lời thô: `.studio/qc/claude_prompt.txt`, `claude_raw.txt`.

### Bước 3 — `--fix`
1. Sao lưu `.studio/qc_backup.json` (+ bản có giờ trong `.studio/qc/`). Hoàn tác: `POST /api/qc/undo` hoặc nút **Hoàn tác sửa**.
2. Áp lệnh Claude (trừ `move/resize` lên cảnh mà máy cũng phải xếp chỗ — bộ xếp chỗ đo thật nên được ưu tiên).
3. Sửa tự động:
   - **Xếp chỗ** (chữ tràn, che mặt, đè phụ đề): tìm dời/thu nhỏ ít nhất để hộp nằm trong khung, tránh hộp mặt lúc nói, dòng phụ đề và logo/badge của lớp nền. Có tham số `size` thì đổi cỡ chữ (không dưới 30 px), còn lại dùng keyframe hằng `kf:[{t, x, y, scale, ease:"hold"}]` (engine `sceneFx`, chạy với mọi module). Chữ quá dài không thu nổi → **dàn lại thành chữ 2 dòng** (cảnh `text`), ẩn cảnh cũ.
   - Hook thiếu → chữ hook (tiêu đề / câu đầu) ở chỗ trống trên/dưới mặt + `punch`.
   - Đoạn trống → chữ từ khoá (từ phụ đề giữa đoạn) + `punch`; bỏ qua nếu Claude đã dời một graphic vào đó.
   - Chồng lớp → cắt ngắn cảnh trước (hoặc ẩn cảnh ngắn hơn). Thiếu file → ẩn cảnh / bỏ SFX. Nhạc át giọng → hạ `gain` nhạc. Phụ đề dài → tách ≤ 4 từ theo mốc từng từ.
4. Kiểm tra lại (tối đa 3 vòng xếp chỗ). Một lỗi máy chỉ được tính **đã sửa** khi lần kiểm tra lại không còn thấy.
5. Mọi phần tử bị đổi có `_qc: true`. Ghi `timeline.json`, phụ đề, và một bản trong `.studio/history/`.

### `qc.json`
```json
{"score": 93, "before": 32, "after": 93, "counts": {"total": 17, "fixed": 16, "high": 0},
 "claude": {"used": true, "scores": {"hook": 4, "spelling": 3, …}, "summary": "…"},
 "audio": {"lufs": -14.3, "true_peak": -4, "music_vs_voice_db": -41.5, "masked_pct": 0},
 "issues": [{"t": 0.5, "kind": "spelling", "kind_vi": "Chính tả", "severity": "high", "msg": "…", "fixed": true, "src": "claude", "fix": {"op": "text", …}}],
 "applied": […], "compare": [{"t", "kind", "before", "after"}], "sheet": ".studio/qc/sheet.jpg", "stills": […], "backup": ".studio/qc_backup.json"}
```
Điểm = 100 − lỗi máy chưa sửa (cao 15, vừa 7, thấp 3; mỗi loại tính tối đa 2 lần) − nhận xét Claude chưa sửa (cao 8, vừa 4, thấp 1,5; tối đa 30; bỏ nhận xét trùng thời điểm với lỗi máy).

## 2. Nhiều phiên bản — `scripts/variants.mjs`
```bash
node scripts/variants.mjs <dự án> --n 3 [--kind hook|style|both] [--export] [--quality 720|1080] [--no-claude]
```
- **hook**: Claude viết N hook (≤ 7 từ, mỗi cái một góc: câu hỏi, con số/tuyên bố, nỗi đau/lợi ích…), mỗi bản một kiểu chữ/hiệu ứng/SFX khác (vàng pop · mực lật chữ · phát sáng zoom…). Hook cũ trong 2,2 s đầu bị thay. Khi lời thoại có một câu mạnh, trọn ý, sau giây 5, 1,5–5 s và nằm trọn trong một clip → tối đa một bản có **teaser (cold open)**: chèn đoạn đó lên đầu, cắt flash về đầu video, mọi thứ dời theo (clip, phụ đề, cảnh, SFX, nhạc).
- **style**: gói khác (theo thứ tự share, neon, luxury, kinetic, glow…), dựng bằng `recipe` của gói (như “Dựng tự động theo gói”), bỏ graphic AI/recipe của gói cũ, giữ chữ/b-roll người dùng thêm.
- **both**: hook i + gói i.
- Mỗi bản là **một dự án đầy đủ** `<dự án>_v1…_vN` (copy bằng APFS clone, không tốn thêm dung lượng), `timeline._variant = {base, i, kind, hook, pack}`. Chạy lại sẽ ghi đè các thư mục `_vN` của chính dự án đó (thư mục trùng tên khác thì đặt `_vN_2`).
- Ảnh hook `.studio/hook.jpg` (t = 1,2 s) cho mỗi bản và bản gốc; `--export` xuất `out/<tên>.mp4` (mix_audio + render như nút Xuất).
- `<dự án>/variants.json`: `{base, kind, base_hook, base_still, base_video, variants:[{dir, name, hook, pack, desc, teaser?, still, video?}]}`.

## 3. Studio
- Panel **AI** → tab “Dựng giúp” có thêm 2 thẻ (chèn bằng MutationObserver, không sửa `20_ai.js`): **Kiểm tra chất lượng** (Kiểm tra · Kiểm tra & tự sửa · Kết quả; bỏ tick “Nhờ Claude” để chỉ dùng máy) và **Nhiều phiên bản (A/B)** (chọn kiểu, tick xuất 720p, **Tạo 3 phiên bản**, **So sánh**).
- Hộp kết quả: điểm trước → sau, nhận xét + điểm từng mục của Claude, danh sách lỗi (bấm = tua tới), ảnh trước/sau, **Áp dụng sửa**, **Hoàn tác sửa**, **Kiểm tra lại**.
- Hộp **Xuất**: ô “AI kiểm tra & sửa trước khi xuất” → chạy `--fix` (có Claude), tải lại dự án rồi xuất với đúng lựa chọn cũ; hộp “Xuất xong” có thẻ điểm QC.
- Hộp **So sánh phiên bản**: các cột Gốc + v1…vN, video (hoặc ảnh hook), hook, mô tả, **Mở** (đổi dự án đang mở), **Phát cùng lúc**.

| API | Việc |
|---|---|
| `POST /api/qc/run {fix, claude, model, fresh}` | job `qc` |
| `GET /api/qc` | `qc.json` + `can_undo` |
| `POST /api/qc/undo` | khôi phục bản trước khi sửa |
| `POST /api/variants/run {n, kind, export, quality}` | job `variants` |
| `GET /api/variants` | `variants.json` (của dự án gốc nếu đang mở một bản) |
| `GET /api/variants/file?dir=&f=` | ảnh/video trong thư mục phiên bản đã liệt kê |
| `POST /api/variants/open {dir}` | mở một phiên bản (chỉ thư mục có trong `variants.json`) |

## Giới hạn
- Hộp mặt chỉ có khi YuNet thấy mặt trên lớp nền; người quay lưng / mặt quá nhỏ (< 3 % khung) thì không kiểm tra che mặt.
- Xếp chỗ dùng hộp đo ở các thời điểm lấy mẫu; hiệu ứng bay dài hơn 0,6 s có thể vẫn chạm mép lúc đang bay vào.
- Claude chỉ thấy ≤ 14 ảnh tĩnh: không nghe tiếng, không thấy chuyển động. Lỗi nhận giọng trong phụ đề chỉ sửa khi Claude chắc và giữ nguyên số từ.
- `delete` của Claude là **ẩn** cảnh (`hidden`), hoàn tác được. Lỗi `dense`, `text_unsafe`, `silence` chỉ báo, không tự sửa.
- Teaser chỉ khi đoạn nằm trọn trong một clip (không vắt qua chỗ cắt); dự án nhiều clip phức tạp có thể không có teaser.
