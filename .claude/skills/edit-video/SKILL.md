---
name: edit-video
description: Edit video talking-head thô thành video hoàn chỉnh theo phong cách Phòng khám Bác sĩ Phạm Sơn – cắt khoảng lặng liền mạch, giữ nguyên chất lượng, tự tạo phụ đề tiếng Việt hộp trắng, tiêu đề bong bóng mở đầu, zoom đổi khung, ảnh minh hoạ. Dùng khi người dùng gõ /edit-video <video> hoặc nhờ "edit video", "cắt lặng làm phụ đề", "làm giống video mẫu".
---

# /edit-video

Giao việc cho agent **`bien-tap-video`** (định nghĩa tại `.claude/agents/bien-tap-video.md`).

1. Xác định danh sách video đầu vào từ tham số hoặc file người dùng vừa tải lên
   (kèm ảnh minh hoạ / nhạc nền / chữ hook nếu người dùng có đưa).
2. Gọi Agent với `subagent_type: "bien-tap-video"`, truyền đủ: đường dẫn video, tài nguyên kèm theo,
   yêu cầu riêng của người dùng (kiểu hook, có duyệt hay tự động hoàn toàn, nơi lưu kết quả).
3. Khi agent xong: gửi file `*_final.mp4` cho người dùng, tóm tắt thời lượng trước → sau, hook đã dùng
   và các chỗ phụ đề còn nghi ngờ cần bác sĩ duyệt.

Nếu không gọi được subagent, tự làm theo đúng quy trình trong `.claude/agents/bien-tap-video.md`.
