# EDIT-VIDEO – Agent biên tập video "Bác sĩ Phạm Sơn"

Biến **video thô** (bác sĩ nói trước camera, chưa cắt, chưa phụ đề) thành **video ngắn hoàn chỉnh** đúng phong cách
các video mẫu của phòng khám:

| Bước | Làm gì |
|------|--------|
| Cắt khoảng lặng | Tự tính ngưỡng theo từng video, cắt các khoảng lặng ≥ 0.3 s, giữ ~0.24 s "hơi thở" giữa các câu, không cắt vào giữa từ, căn theo khung hình → hình-tiếng luôn khớp |
| Phụ đề tự động | Nhận dạng giọng nói tiếng Việt (Whisper large-v3), chia cụm ý ngắn, hộp trắng bo góc + chữ serif đậm đen, ≤ 2 dòng, chữ thường không dấu câu |
| Tiêu đề mở đầu | Bong bóng thoại nền kem viền tím vẽ tay, chữ mờ→nét, 3 kiểu `clean` / `neon` / `elegant` |
| Đổi khung | Punch-in zoom về phía khuôn mặt tại các điểm cắt (giấu jump-cut), 3 cỡ khung xen kẽ |
| Ảnh minh hoạ | Phủ dải trên ~27% khung, mờ dần mép dưới (khi có ảnh) |
| Âm thanh | Lọc ù, chuẩn −14 LUFS, nhạc nền tự giảm khi nói (tuỳ chọn) |
| Xuất file | Giữ nguyên độ phân giải & fps, H.264 CRF 16, **một lần mã hoá duy nhất** |

Phân tích chi tiết phong cách mẫu: [`docs/PHAN_TICH_VIDEO_MAU.md`](docs/PHAN_TICH_VIDEO_MAU.md).
Toàn bộ thông số đã học: [`editor/style.json`](editor/style.json).

## Cài đặt

```bash
# cần ffmpeg (có libx264) và Python ≥ 3.9
pip install -r editor/requirements.txt
```
Lần đầu chạy, Whisper tự tải mô hình từ `huggingface.co` (large-v3 ≈ 3 GB; `--model medium` ≈ 1.5 GB, nhanh hơn).

## Dùng với Claude Code (khuyên dùng)

Mở repo này trong Claude Code rồi:

```
/edit-video path/to/video_tho.mp4
```
hoặc nói tự nhiên: *"edit giúp tôi video này giống video mẫu"*. Claude sẽ giao cho agent **`bien-tap-video`**
(`.claude/agents/bien-tap-video.md`), agent sẽ: cắt lặng + nhận dạng → **soát và sửa lỗi phụ đề** bằng hiểu biết
ngữ cảnh/thuật ngữ sản khoa → chọn tiêu đề mở đầu → dựng bản xem nhanh → tự xem ảnh kiểm tra → xuất bản cuối.

Có thể gửi kèm ảnh minh hoạ, nhạc nền, chữ tiêu đề mong muốn, hoặc dặn "không cần duyệt, làm tự động".

## Lưu vào tài khoản Claude (skill "EDIT VIDEO AI")

```bash
bash packaging/build_skill.sh        # -> dist/edit-video-ai.skill
```
Tải file `edit-video-ai.skill` lên claude.ai (bấm **Save skill** trên thẻ file, hoặc *Settings → Capabilities → Skills → Upload*).
Sau đó ở bất kỳ cuộc trò chuyện nào: tải video thô lên và nói "edit video này". Nếu môi trường không tải được mô hình
Whisper, gửi kèm file phụ đề `.srt` (vd. xuất từ CapCut) – skill sẽ dùng nó làm lời thoại.

## Dùng bằng dòng lệnh

```bash
# Tự động một mạch
python3 editor/edit_video.py auto video_tho.mp4 -o video_final.mp4

# Hoặc từng bước (để sửa phụ đề/hook trước khi dựng)
python3 editor/edit_video.py prepare video_tho.mp4 -w work/video1
#   -> sửa work/video1/edit_plan.json (hook, broll, music)
python3 editor/edit_video.py recaption work/video1/edit_plan.json cau.txt   # phụ đề viết lại, mỗi dòng 1 câu
python3 editor/edit_video.py render work/video1/edit_plan.json -o video_final.mp4
python3 editor/edit_video.py qa video_final.mp4 --source video_tho.mp4 --sheet sheet.jpg
```

Tuỳ chọn hay dùng của `prepare` / `auto`:

| Tuỳ chọn | Ý nghĩa |
|----------|---------|
| `--hook "Mẹ bầu nghén"` `--hook-style neon` `--hook-position bottom` | Đặt tiêu đề mở đầu |
| `--remove 12.5-15.2` | Bỏ hẳn một đoạn (giây theo video gốc), vd. câu nói hỏng – dùng nhiều lần được |
| `--threshold-db -40` | Ngưỡng lặng cố định (cao hơn = cắt mạnh hơn) khi phòng quay ồn |
| `--model medium` | Mô hình Whisper nhẹ hơn cho máy yếu |
| `--asr sherpa-onnx` | Dùng Zipformer tiếng Việt (nhanh, tải từ GitHub). Mặc định `auto`: Whisper, lỗi thì tự chuyển |
| `--transcript t.json` / `t.srt` | Dùng transcript/phụ đề có sẵn thay cho nhận dạng |
| `--no-asr` | Chỉ cắt lặng, không phụ đề |

Thêm ảnh minh hoạ / nhạc nền trong `edit_plan.json`:
```json
"broll": [{"file": "anh/me_bau_buon_non.jpg", "start": 7.5, "end": 15.0}],
"music": {"file": "nhac_nen.mp3", "db": -24}
```

## Cấu trúc

```
.claude/agents/bien-tap-video.md   Agent biên tập (quy trình + kiến thức)
.claude/skills/edit-video/         Lệnh /edit-video
docs/PHAN_TICH_VIDEO_MAU.md        Phân tích chi tiết 3 video mẫu
editor/edit_video.py               CLI: prepare | render | auto | qa
editor/style.json                  Thông số phong cách đã học
editor/vedit/                      cut (cắt lặng) · asr (Whisper) · captions · graphics · plan · render · qa
editor/assets/fonts/               Font OFL hỗ trợ tiếng Việt
packaging/                         SKILL.md + build_skill.sh → dist/edit-video-ai.skill
tests/                             python3 -m pytest -q tests/
```

## Lưu ý
- Video gốc không bao giờ bị ghi đè; kết quả giữ nguyên độ phân giải/tỉ lệ khung.
- Phụ đề trung thành lời bác sĩ nói; nội dung y khoa nên được bác sĩ Sơn duyệt trước khi đăng.
