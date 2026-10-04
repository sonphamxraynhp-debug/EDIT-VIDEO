---
name: edit-video-ai
description: EDIT VIDEO AI – biên tập video talking-head dọc 9:16 theo phong cách Phòng khám Bác sĩ Phạm Sơn và RENDER ra file MP4 hoàn chỉnh. Nhận video THÔ (chưa cắt, chưa phụ đề) → cắt bỏ khoảng lặng cho liền mạch, giữ nguyên chất lượng/độ phân giải, tự tạo phụ đề tiếng Việt (hộp trắng bo góc, chữ serif đậm đen), tiêu đề bong bóng thoại mở đầu, zoom đổi khung giấu jump-cut, ảnh minh hoạ dải trên. PHẢI dùng skill này khi người dùng tải lên video bác sĩ nói trước camera và nói "edit video", "edit giúp", "cắt khoảng lặng", "cắt lặng", "làm phụ đề", "tạo sub", "làm giống video mẫu", "dựng video bác sĩ Sơn", "EDIT VIDEO AI", hoặc chỉ "làm cho video này hoàn chỉnh" – kể cả khi không nói rõ phong cách.
---

# EDIT VIDEO AI

Biến video thô quay bác sĩ nói trước camera thành video ngắn hoàn chỉnh, đúng phong cách các video mẫu của
Phòng khám Bác sĩ Phạm Sơn. Bộ công cụ dựng sẵn nằm trong `scripts/` (Python + ffmpeg); phần việc của bạn là
điều phối, **soát phụ đề bằng hiểu biết ngôn ngữ/chuyên môn**, chọn tiêu đề và kiểm tra kết quả bằng mắt.

Trong tài liệu này `$SKILL` là thư mục chứa file SKILL.md này (vd. `/mnt/skills/user/edit-video-ai`).
Làm việc trong một thư mục ghi được (vd. `/tmp/edit` hoặc thư mục output), không ghi vào `$SKILL`.

## Kiến thức nền
- `references/PHAN_TICH_VIDEO_MAU.md` – phân tích chi tiết phong cách mẫu (nhịp cắt, zoom, hook, phụ đề, b-roll,
  âm thanh). Đọc khi cần quyết định về thẩm mỹ hoặc người dùng hỏi "vì sao làm thế này".
- `scripts/style.json` – toàn bộ thông số đã học. Chỉ sửa (bản sao, truyền bằng `--style`) khi người dùng muốn đổi phong cách.
- Nếu có skill `dna-phong-kham-pham-son`: dùng để nắm giọng điệu, thuật ngữ và ranh giới y khoa.

## Đầu vào – đầu ra
- **Vào**: video thô (mp4/mov…); tuỳ chọn: ảnh minh hoạ, nhạc nền, chữ tiêu đề mong muốn, file phụ đề .srt có sẵn.
- **Ra**: `<tên>_final.mp4` cùng độ phân giải và tốc độ khung với video gốc + báo cáo ngắn.

## Quy trình

### 0. Môi trường
```bash
ffmpeg -version | head -1
pip install -q -r $SKILL/scripts/requirements.txt
```
Nhận dạng giọng nói (`--asr auto`, mặc định): thử faster-whisper (tải mô hình từ huggingface.co); nếu không
được sẽ **tự chuyển sang Zipformer tiếng Việt** của sherpa-onnx (≈ 250 MB, tải từ GitHub Releases, rất nhanh trên CPU;
mốc thời gian từ kém chính xác hơn nên chỉ dùng cho phụ đề). Nếu cả hai đều không tải được: đề nghị người dùng gửi
file phụ đề `.srt` (xuất từ CapCut/Premiere…) rồi chạy với `--transcript file.srt`, hoặc chỉ cắt lặng với `--no-asr`.
Đừng tự bịa lời thoại – bạn không nghe được âm thanh.

### 1. Chuẩn bị: cắt lặng + nhận dạng
```bash
python3 $SKILL/scripts/edit_video.py prepare "<video>" -w "<work>/<tên>"
```
Tạo `<work>/<tên>/edit_plan.json` (và cache `transcript_source.json`). Đọc log: ngưỡng lặng, thời lượng trước → sau.
Phòng quay ồn, cắt chưa đủ → chạy lại với `--threshold-db -40` (số càng lớn càng cắt mạnh).

### 2. Biên tập `edit_plan.json` – phần quan trọng nhất
1. **`captions[].text`** – soát từng câu, đối chiếu `words` và ngữ cảnh:
   - Sửa dấu tiếng Việt, từ nghe nhầm, thuật ngữ sản khoa (nghén, thai nhi, tam cá nguyệt, NIPT, siêu âm 4D, ối, nhau thai…).
   - Chữ thường, không dấu câu; viết hoa tên riêng (Phạm Sơn, Khoái Châu, Hưng Yên). Không viết hoa sai kiểu "tuổi Thai".
   - Trung thành với lời nói: không tóm tắt, không thêm thông tin y khoa bác sĩ không nói.
   - Cách sửa nhanh nhất: viết lại toàn bộ phụ đề vào một file văn bản, **mỗi dòng một câu** (cụm ý 3–10 từ,
     ngắt ở chỗ người nói ngừng), rồi chạy
     `python3 $SKILL/scripts/edit_video.py recaption "<work>/<tên>/edit_plan.json" cau.txt` – công cụ tự căn thời gian
     từng câu theo lời nói. Ép xuống dòng trong một câu bằng `\n`.
2. **Nói lặp / nói hỏng**: tìm thời gian GỐC trong `transcript_source.json`, chạy lại bước 1 với
   `--remove "A-B"` (giây gốc, dùng nhiều lần được). Transcript được cache nên chạy lại rất nhanh.
3. **`hook`** (tiêu đề bong bóng 0–4 s đầu, phụ đề tự ẩn trong lúc này):
   - `text`: ≤ 2 dòng ngắn, chạm nỗi lo của mẹ bầu; mặc định là câu nói đầu – giữ nếu hay, rút gọn nếu dài.
   - `style`: `clean` (câu nói, mặc định) · `neon` (chủ đề 2–4 từ, IN HOA, phát sáng hồng) · `elegant` (câu cảm xúc, serif nghiêng).
   - `position`: `top` (mặc định) hoặc `bottom`.
4. **`broll`** – chỉ khi người dùng đưa ảnh: `[{"file": "/path/anh.jpg", "start": s, "end": e}]`, 4–12 s mỗi ảnh,
   đặt đúng đoạn đang nói về nội dung ảnh.
5. **`music`** – chỉ khi người dùng đưa nhạc: `{"file": "nhac.mp3", "db": -24}` (tự giảm khi bác sĩ nói).
6. **`zoom`** – thường để nguyên (1.0 / 1.12 / 1.28, zoom về phía mặt).

### 3. Bản xem nhanh + kiểm tra bằng mắt
```bash
python3 $SKILL/scripts/edit_video.py render "<work>/<tên>/edit_plan.json" -o "<work>/<tên>/preview.mp4" --preview
python3 $SKILL/scripts/edit_video.py qa "<work>/<tên>/preview.mp4" --source "<video>" --sheet "<work>/<tên>/sheet.jpg"
```
- Xem ảnh `sheet.jpg` (12 khung hình): hook đọc được không, phụ đề có che mặt/tràn khung không, zoom có mất đầu không.
- `issues` trong báo cáo QA phải rỗng. `long_pauses` > 0.5 s: kiểm tra – thở dài/kéo chữ thì chấp nhận được.
- Xem 1 thời điểm cụ thể: `ffmpeg -ss 12.3 -i preview.mp4 -frames:v 1 frame.jpg`.

### 4. Bản cuối
```bash
python3 $SKILL/scripts/edit_video.py render "<work>/<tên>/edit_plan.json" -o "<output>/<tên>_final.mp4"
python3 $SKILL/scripts/edit_video.py qa "<output>/<tên>_final.mp4" --source "<video>"
```
Render một video 30 s mất khoảng 30–60 s trên CPU.

### 5. Báo cáo cho người dùng
Gửi file kết quả, kèm: thời lượng trước → sau, số câu phụ đề, tiêu đề đã dùng, các chỗ phụ đề còn nghi ngờ
(nghe không rõ) để người dùng kiểm tra, và nhắc nội dung y khoa nên được bác sĩ Sơn duyệt trước khi đăng.

## Chế độ nhanh
Người dùng nói "làm tự động, không cần duyệt":
`python3 $SKILL/scripts/edit_video.py auto "<video>" -o "<tên>_final.mp4" -w "<work>/<tên>"` –
vẫn xem `sheet.jpg` (lệnh `qa --sheet`) trước khi báo xong. Nhiều video: lặp lại cho từng file.

## Nguyên tắc
- Không ghi đè video gốc; không đổi độ phân giải/tỉ lệ khung; chỉ mã hoá một lần.
- Không thêm nội dung y khoa, giá, cam kết mà bác sĩ không nói.
- Lỗi ffmpeg: render lại với `--keep-temp` rồi đọc `<work>/<tên>/render_tmp/filter_graph.txt`.
