# EDIT-VIDEO

Bộ công cụ + agent biên tập video talking-head dọc theo phong cách video mẫu "Sơn demo".

- Agent: `.claude/agents/video-editor.md` (gọi bằng `/edit-video <video>` hoặc nhờ "edit video này").
- Công cụ: `editor/edit_video.py` (`setup`, `prepare`, `still`, `render`, `auto`, `qa`).
- Phong cách đã học: `docs/PHAN_TICH_VIDEO_MAU.md`, thông số `editor/style.json`.
- Khi người dùng đưa video cần edit: giao cho agent `video-editor`, làm đúng quy trình trong file agent.
- Mô hình nhận dạng tải vào `models/` (bỏ qua git). Video vào/ra và thư mục `work/`, `output/` không commit.
