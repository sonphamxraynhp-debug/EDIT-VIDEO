# EDIT-VIDEO

Repo chứa agent biên tập video talking-head dọc theo phong cách Phòng khám Bác sĩ Phạm Sơn.

- Khi người dùng đưa video thô và muốn edit (cắt lặng, phụ đề, làm giống mẫu): giao cho agent
  `bien-tap-video` (`.claude/agents/bien-tap-video.md`) hoặc dùng skill `/edit-video`.
- Kiến thức phong cách: `docs/PHAN_TICH_VIDEO_MAU.md`; thông số: `editor/style.json` (đổi phong cách = sửa file này).
- Mã nguồn: `editor/vedit/` (Python + ffmpeg). Chạy kiểm thử: `python3 -m pytest -q tests/`.
- Kết quả trung gian để trong `work/` (đã gitignore). Không commit video.
