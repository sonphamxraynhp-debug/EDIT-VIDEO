# EDIT-VIDEO – Agent biên tập video talking-head

Biến **video thô** (người nói trước camera, chưa cắt, chưa phụ đề) thành **video hoàn chỉnh** theo phong cách video mẫu
"Sơn demo":

- **Cắt bỏ khoảng lặng** → nói liền mạch, khoảng nghỉ còn ~0.2 s, cắt đúng khung hình nên khớp môi tuyệt đối.
- **Không giảm chất lượng**: giữ nguyên độ phân giải & tốc độ khung, mã hoá một lần H.264 CRF 17; âm thanh chuẩn −14 LUFS.
- **Tự tạo phụ đề tiếng Việt** (nhận dạng offline bằng Zipformer tiếng Việt) – chữ trắng-vàng phát sáng, hiện mờ→nét.
- **Tiêu đề mở đầu** 2 dòng có bóng ma, **tên mục** góc trên, **ghi chú** ✅/❌/gạch bỏ/trích dẫn, **câu chốt** ❤️,
  **chuyển cảnh** mờ+phóng nhẹ giữa các mục – đúng như video mẫu.

Phân tích chi tiết video mẫu: [docs/PHAN_TICH_VIDEO_MAU.md](docs/PHAN_TICH_VIDEO_MAU.md).

## Cài đặt
```bash
# cần ffmpeg (apt install ffmpeg / brew install ffmpeg) và Python 3.9+
pip install -r editor/requirements.txt
python3 editor/edit_video.py setup     # tải mô hình nhận dạng tiếng Việt (~200 MB) vào models/
```

## Dùng với Claude Code (khuyến nghị)
Mở repo bằng Claude Code rồi:
```
/edit-video duong/dan/video_tho.mp4
```
hoặc nói "edit video này giống video mẫu". Agent `video-editor` sẽ: cắt lặng → nhận dạng lời → **viết lại phụ đề cho
chuẩn tiếng Việt** → chọn tiêu đề, chia mục, thêm ghi chú theo nội dung → xem ảnh kiểm tra → render → kiểm tra chất
lượng → báo cáo. Kết quả ở `output/<tên>_final.mp4`.

## Dùng tay (không cần agent)
```bash
E="python3 editor/edit_video.py"
$E auto video.mp4 -o output/video_final.mp4 -w work/video        # tự động hoàn toàn

# hoặc từng bước, có chỉnh sửa:
$E prepare video.mp4 -w work/video                               # -> work/video/edit_plan.json
#   sửa captions / hook / sections / notes trong edit_plan.json (xem .claude/agents/video-editor.md)
$E still work/video/edit_plan.json -t 1 5 12 -o work/video/check.jpg
$E render work/video/edit_plan.json -o output/video_final.mp4
$E qa output/video_final.mp4 --source video.mp4 --sheet work/video/sheet.jpg
```
Tuỳ chọn hay dùng: `--remove 12.3-14.0` (bỏ câu nói hỏng, giây gốc), `--threshold-db -40` (cắt lặng mạnh hơn),
`--transcript phude.srt` (dùng phụ đề có sẵn), `--hook "Vợ chồng|có cần kể hết?"`, `--engine whisper`.

## Cấu trúc
```
editor/edit_video.py      CLI
editor/vedit/             cut (cắt lặng) · asr (nhận dạng) · captions (chia câu) · plan · graphics (chữ phát sáng) · render · qa
editor/style.json         thông số phong cách học từ video mẫu
editor/assets/            font Be Vietnam Pro (OFL) + emoji (Noto Color Emoji, OFL)
docs/                     phân tích video mẫu
.claude/agents/           agent video-editor
.claude/commands/         lệnh /edit-video
```
