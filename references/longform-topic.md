# Video dài → clip ngắn · Chủ đề → video

Code: `scripts/highlights.mjs`, `scripts/topic_video.mjs`, `studio/routes/17_longform.mjs`, `studio/features/17_longform.js` (panel **Video dài / Chủ đề**).
Cả hai là CLI chạy được không cần Studio, in tiến trình `@@ <0..1> <bước>`, dòng cuối `RESULT {…, outputs:[…]}` (hàng đợi Tự lái đọc dòng này), lỗi → mã ≠ 0 + `LỖI: …` tiếng Việt.

## 1. Video dài → nhiều clip ngắn
```bash
node scripts/highlights.mjs live.mp4 --out ~/Desktop/clips [--n 6] [--min 20 --max 60] [--orient vertical|horizontal]
     [--model large-v3-turbo|small] [--claude-model sonnet] [--chunk 480] [--min-score 40] [--pack slate] [--export] [--quality 1080]
node scripts/highlights.mjs --export ~/Desktop/clips [--only 1,3]      # xuất (trộn tiếng + render) các dự án trong highlights.json
```
1. **Nhận giọng một lần** (`transcribe.py`), lưu ở `$AVS_HOME/cache/transcripts/<hash>.json` (theo đường dẫn + cỡ + giờ sửa file + model) kèm ranh giới câu của whisper (tiếng Việt gần như không có dấu câu). Khoảng lặng: `ffmpeg silencedetect`.
2. **Chia phần** ≤ `--chunk` giây (mặc định 8 phút, ≤ 15k ký tự, gối 60 s) → mỗi phần một lần `claude -p` (3 phần song song), đề xuất k đoạn `[from..to]` theo số câu, kèm `title`, `hook` (chữ 2 giây đầu), `score`, `reason`. Video 90 phút ≈ 12 lần gọi + 1 lần **xếp hạng lại** (chỉ gửi tóm tắt ứng viên) → prompt luôn có giới hạn.
3. **Kiểm tra**: số câu trong phần, nới/thu theo cả câu cho vừa `--min/--max`, bỏ đoạn trùng (chồng thời gian > 30 % hoặc trùng chữ > 60 % — nội dung lặp lại chỉ lấy một lần), lọc `score ≥ --min-score`. Mép cắt **bám từ + khoảng lặng** (không cắt giữa chữ).
4. **Mỗi đoạn = một dự án** như “Video mới” (`newProject`): cắt nguồn chính xác → `cut.py` → khung hình → `captions.py`. Không nhận giọng lần hai (dùng lại từ đã có). Nguồn ngang + khung dọc → `TL.clips` + `clip.reframe` từ `face_track.py` (người nói luôn ở giữa); nguồn dọc + khung ngang → `fit: blurfill`; còn lại cắt giữa như cũ + `find_face.py`. Có `_starter` (Studio dựng theo gói khi mở) và `_highlight` {source, t0, t1, title, hook, score, reason, mode}.
5. Ghi `<out>/highlights.json` `[{dir, title, hook, t0, t1, dur, score, reason, text, mode, thumb, mp4?}]`, `candidates.json` (mọi ứng viên + trả lời thô của Claude), ảnh xem trước `<dự án>/.studio/thumb.jpg`.

## 2. Chủ đề → video
```bash
node scripts/topic_video.mjs "Kinh nghiệm mua căn hộ chung cư lần đầu" --out ~/Desktop/can-ho [--dur 45] [--voice Linh|edge:vi-VN-HoaiMyNeural]
     [--rate 190] [--orient vertical|horizontal] [--images dir|a.jpg,b.jpg] [--stock] [--handle @kenh] [--script script.json] [--export]
```
1. Claude viết kịch bản JSON (`script.json`): hook (lời + chữ màn hình), 3–5 ý (`say`, `screen`, `sub`, `visual` = broll | number | words | versus | list, `broll` mô tả hình, `num`, `items`, `emoji`), CTA, `title`, `caption`, `hashtags`, `mood`. `--script` dùng lại kịch bản có sẵn (không gọi Claude).
2. **Giọng**: mỗi câu một file (`say -v Linh` offline; `edge:<giọng>` nếu đã cài `edge-tts`, cần Internet, không có thì quay về Linh), cắt lặng đầu/cuối, đo độ dài thật, ghép thành `work/voice.wav` (nghỉ 0,28 s). Dài quá `--dur` 10 % → đọc lại nhanh hơn một lần (≤ 240 từ/phút).
3. **Căn chữ**: `transcribe.py` nghe lại bản đọc, khớp từng chữ kịch bản với từ nghe được (LCS sau khi bỏ dấu); chữ không khớp chia theo số ký tự giữa hai chữ khớp. Phụ đề dùng **đúng chữ kịch bản** (≤ 4 từ/dòng). Thử thật: 153/161 chữ lấy giờ trực tiếp từ whisper.
4. **Hình** (không có A-roll): track chính là một ảnh nền (`media/bg.jpg`, khung của preset `blobs`) mang giọng; mọi khoảnh khắc có cảnh full-frame của gói `kinetic`: hook (`kinetic_hook` trên `sunburst`), mỗi ý theo `visual` (`kinetic_broll` preset tìm trong `assets/broll/catalog.json` + từ khoá Anton, `kinetic_slam` đếm số, `kinetic_words`, `kinetic_diamonds`, checklist), ý dài > 4,6 s có cảnh thứ hai, CTA (`kinetic_cta`), `kinetic_progress` theo chương. Bỏ các preset in số mẫu (bar/pie/counter…: thành số liệu bịa) và preset có nội dung mẫu riêng (chat, đơn hàng, địa danh). `--images` / `--stock` (`broll_fetch.py`, cần mạng) thay b-roll bằng ảnh.
5. `auto_sfx.py --level vua --music auto` (nhạc giữ ≤ −20 dB, hạ khi nói), ảnh bìa `.studio/thumb.jpg`, `--export` → `out/<tên>.mp4`.
Nếu `--out` là thư mục đã có thứ khác (vd thư mục chung của hàng đợi), dự án nằm trong `<out>/<tên chủ đề>`.

## Studio
Panel **Video dài / Chủ đề** (thanh trái, cây kéo): tab *Video dài* (thả/tải lên hoặc đường dẫn, số clip, độ dài, khung, model → danh sách clip: ảnh, tiêu đề, hook, mốc giờ, điểm, “bám mặt”; **Mở**, **Xem**, **Tự lái tất cả** → `/api/autopilot/enqueue` từng dự án, **Xuất tất cả**), tab *Chủ đề* (chủ đề, độ dài, khung, giọng, tên kênh, xuất luôn → **Mở dự án** / **Xem video**, danh sách gần đây). Kết quả lưu ở `$AVS_HOME/longform/{highlights,topics,_uploads}`. Tác vụ dùng ô job chung của Studio (`/api/job`, Dừng được).

## Giới hạn
- Chất lượng chọn đoạn phụ thuộc nội dung: thử trên video ghép 6,8 phút từ 4 clip ngắn đã dựng sẵn (lặp lại) → 5 đoạn khác nhau (điểm 40–88). Video dài thật (livestream, podcast có nhiều ý) sẽ có nhiều ứng viên tốt hơn.
- Whisper `small` trên CPU: ~1 phút cho 5 phút video; 90 phút ≈ 15–20 phút (chỉ lần đầu).
- Giọng Linh nghe máy; thời lượng thực tế lệch `--dur` ±10 %. Preset b-roll 16:9 trong khung dọc bị cắt hai bên (chữ sát mép có thể mất).
