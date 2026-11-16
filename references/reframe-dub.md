# Bám mặt tự động · Xuất nhiều khổ · Dịch & lồng tiếng

## 1. Tự đổi khung bám mặt (`clip.reframe`)

Dùng khi đặt **clip ngang vào video dọc** (hoặc ngược lại): khung cắt "Lấp đầy" tự dời theo mặt người nói thay vì luôn cắt giữa.

```json
{ "src": {"seq": "media/wide_frames/%05d.jpg", "fps": 30, "count": 659}, "in": 0, "out": 21.9, "fit": "cover",
  "ar": 1.7778, "reframe": [{"t": 0, "ox": 61.9, "oy": 37.2}, {"t": 0.2, "ox": 61.9, "oy": 37.2}], "reframe_off": false }
```

| Trường | Ý nghĩa |
|---|---|
| `reframe` | danh sách `{t, ox, oy}`: tâm mặt theo **% ảnh nguồn**, `t` là **giây nguồn** (nên cắt/tốc độ/tách clip không làm lệch) |
| `ar` | tỉ lệ rộng/cao của nguồn (job tự điền) |
| `reframe_off` | `true` = tạm tắt, giữ dữ liệu |

- Engine (`reframeCss`, `fixReframe` trong `engine/engine.js`) nội suy tuyến tính giữa các điểm, đặt `object-position` sao cho mặt ở giữa ngang và ~42% chiều cao, kẹp trong mép ảnh. Thuần hàm của t.
- Chỉ có tác dụng với `fit: "cover"` (Lấp đầy). Khi bật, **Tâm X/Y** của clip bị thay bằng vị trí mặt; **Phóng to > 1** zoom quanh mặt.
- Sau khi bố cục xong, `renderFrame` tính lại theo kích thước hộp thật, nên module tự vẽ track chính trong thẻ (vd. `frame_grid` của slate) cũng bám mặt, miễn ảnh đó `object-fit: cover` và không tự đặt `object-position`.
- Không áp cho: ảnh tĩnh, chế độ Vừa khung / Nền mờ, module tự đặt `object-position` riêng (vd. bong bóng mặt dùng `TL.face`).

**Script** `scripts/face_track.py <video | thư_mục_khung> [--fps 5] [--src-fps 30] [--from s] [--to s] [--out track.json]`
- Dò mặt bằng **YuNet** (`assets/models/face_detection_yunet_2023mar.onnx`, MIT, OpenCV Zoo) qua onnxruntime, offline. ~2 s cho 1 phút video 720p.
- Chọn mặt to + chắc + gần mặt đang theo; bỏ mặt quá nhỏ (ảnh trong ảnh) hoặc quá to (nhận nhầm).
- Phát hiện **cắt cảnh** (chênh lệch ảnh thu nhỏ): không lia qua chỗ cắt mà nhảy thẳng; khung không thấy mặt thì nội suy/giữ nguyên; cảnh không có mặt giữ khung cảnh trước.
- Chống rung: vùng chết ±3% (giống người quay: chỉ dời khi mặt ra khỏi vùng) + làm mượt giảm chấn tới hạn hai chiều (không trễ pha), `--tau 0.45` s.
- Kết quả `{w, h, fps, found, cuts, keys:[{t, ox, oy, fs}]}` (`fs` = chiều cao mặt %).

**Studio**: chọn clip → tab **Bám mặt** → **Bám mặt tự động** (job `POST /api/reframe {src}`, cache `.studio/facetrack/`). Áp cho mọi clip cùng nguồn (kể cả các đoạn đã tách), có Tắt/Bật, Dò lại, Xoá; hoàn tác được.

## 2. Xuất nhiều khổ một lần

Hộp **Xuất** có mục *Xuất thêm khổ khác*. Engine chỉ thiết kế 720×1280 và 1280×720, nên khổ gốc của dự án là bản render thật; khổ còn lại là **bản phái sinh** từ chính file vừa xuất (`scripts/export_multi.mjs`, gọi trong `exportVideo` của `server.mjs` khi body có `aspects`):

| Dự án | Khổ thêm | Cách làm | Mất gì |
|---|---|---|---|
| 16:9 | 9:16 | cắt dọc bám mặt (face_track trên bản đã xuất), phóng lên 1080×1920 | chữ/graphic hai bên trái-phải; ảnh phóng ~1,8× nên kém nét |
| 16:9 | 1:1 | cắt vuông 1080×1080 bám mặt | phần hai bên |
| 9:16 | 1:1 | cắt vuông 1080×1080: giữ mặt + vùng phụ đề (~74% chiều cao) nếu vừa, không thì ưu tiên mặt | tiêu đề sát mép trên, CTA/nút/logo sát mép dưới |
| 9:16 | 16:9 | video dọc đặt giữa 1920×1080, hai bên là chính nó phóng to + làm mờ | không cắt gì, nhưng chữ nhỏ hơn |

Tên file: `out/<dự án>_<giờ>_1x1.mp4`, `_16x9.mp4`, `_9x16.mp4`; âm thanh copy nguyên. Job trả `job.outs = [{aspect, out, w, h, note}]`, hộp "Xuất xong" liệt kê từng file kèm ghi chú phần bị cắt. Muốn bản khổ khác "thật" (graphic đặt lại) thì làm dự án riêng ở khổ đó.

CLI: `node scripts/export_multi.mjs video.mp4 --aspects 9:16,1:1,16:9 [--out-dir dir]`.

## 3. Dịch & lồng tiếng, phụ đề song ngữ

```json
"sub2": {"lang": "en", "on": true, "style": "plain", "size": 27, "y": null},
"lang": "vi",
"audio": { "voice_gain": 0.15, "dub": {"file": "work/dub_en.wav", "lang": "en", "voice": "Samantha", "engine": "say"},
           "tracks": [{"id": "dub", "name": "Lồng tiếng EN", "items": [{"file": "work/dub_en.wav", "t0": 0, "in": 0, "out": 24.4, "gain": 0}]}] }
```
và mỗi đoạn phụ đề có thêm `"tr": "bản dịch"`.

- **Phụ đề song ngữ**: `sub2HTML` (engine.js) thêm dòng `#sub2` dưới phụ đề đang chạy; sau bố cục, `placeSub2` dời nó sát dưới `#cap` (lên trên nếu sát đáy), nên chạy với mọi kiểu phụ đề có `#cap`. `style`: `plain` (chữ trắng viền tối), `box` (nền đen), `yellow`. `y` cố định vị trí nếu muốn. Ẩn cùng lúc với phụ đề.
- **Dịch** (`scripts/dub.py`): gom phụ đề thành câu (khoảng lặng < 0,45 s, ≤ 5 s, ≤ 6 đoạn), dịch cả câu bằng `claude -p … --model sonnet` (lô 40 câu, JSON), rồi chia lại khớp từng đoạn; sai số đoạn thì chia theo tỉ lệ số từ. Ngôn ngữ: en, zh, ja, ko, th, vi, fr, de, es, id, ru, it, pt; gốc lấy `TL.lang` (mặc định vi), dịch sang tiếng Việt cũng được. Thiếu CLI `claude` thì báo lỗi tiếng Việt.
- **Lồng tiếng**: mỗi câu đọc bằng macOS `say` (offline, tự chọn giọng theo ngôn ngữ: Samantha, Tingting, Kyoko, Yuna, Kanya, Linh…) hoặc `edge-tts` (giọng Microsoft, **cần Internet**, gửi câu chữ lên dịch vụ của Microsoft). Cắt khoảng lặng đầu/cuối, tăng tốc bằng `atempo` tối đa 1,35× để vừa đến câu sau; dài hơn thì lấn sang và đẩy câu sau (báo trong `overruns`). Ghép thành `work/dub_<lang>.wav` theo thời gian đầu ra, ghi vào track `id: "dub"` của `TL.audio.tracks` (mix_audio.py trộn) — chạy lại sẽ thay track này.
- **Giọng gốc**: `TL.audio.voice_gain` (0 = tắt, 1 = giữ nguyên) áp trong `mix_audio.py` lúc xuất. Preview trong Studio vẫn phát giọng gốc; nghe thử bản lồng tiếng ở panel.

CLI: `python scripts/dub.py timeline.json --lang en [--tts say|edge] [--voice NAME] [--voice-gain .15] [--no-translate] [--no-tts] [--force]`; `python scripts/dub.py --voices ja` liệt kê giọng.

**Studio**: panel trái **Dịch & lồng tiếng**: chọn ngôn ngữ, bật/tắt song ngữ, kiểu/cỡ chữ, **Dịch phụ đề**, chọn giọng, thanh **Giọng gốc**, **Tạo lồng tiếng**, nghe thử, sửa từng dòng dịch.

## Giới hạn
- Bám mặt theo một người (mặt to, gần nhất với mặt đang theo); cảnh hai người nói xen kẽ sẽ theo người chiếm khung nhiều hơn.
- Bản 9:16 cắt từ 16:9 chỉ có ~608 px ngang thật nên mềm hơn; graphic thiết kế cho khung ngang có thể bị cắt.
- Giọng `say` nghe máy hơn giọng thật; không nhái giọng người nói. Bản dịch do AI làm, nên soát lại trước khi đăng.
