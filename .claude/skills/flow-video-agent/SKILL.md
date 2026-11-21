---
name: flow-video-agent
description: Vận hành Flow Video Agent trong repo này — quét kênh mẫu Facebook, rút công thức thành công, mỗi ngày viết 10 kịch bản và chấm điểm thang 100, chỉ làm video Google Flow cho kịch bản > 95 điểm (tối đa 3), đăng kênh Bác sĩ Phạm Sơn ở chế độ "Chỉ mình tôi", quét view mỗi 2 giờ và tự học từ số liệu thật. Dùng khi người dùng nói "chạy agent", "quét kênh mẫu", "đề xuất kịch bản hôm nay", "làm video Flow", "đăng video chỉ mình tôi", "xem view", "agent học được gì", "duyệt video", "báo cáo kênh".
---

# Vận hành Flow Video Agent

Mã nguồn ở `flow_agent/`, cấu hình ở `config/config.yaml` (mẫu: `config/config.example.yaml`),
DNA thương hiệu ở `config/brand.md`, dữ liệu ở `data/` (SQLite `data/agent.db`, báo cáo `data/reports/`).

## Lệnh

| Việc | Lệnh |
|---|---|
| Đăng nhập 1 lần | `python -m flow_agent login facebook` · `python -m flow_agent login flow` |
| Học kênh mẫu (quét + phân tích + công thức + skill) | `python -m flow_agent research` |
| Đề xuất 10 kịch bản + chấm + chọn | `python -m flow_agent propose` |
| Xem kịch bản | `python -m flow_agent scripts` · `python -m flow_agent show <id>` |
| Làm video 1 kịch bản | `python -m flow_agent produce <script_id>` |
| Đăng "Chỉ mình tôi" | `python -m flow_agent upload <production_id>` |
| Ghi nhận đã duyệt + đã chuyển Công khai | `python -m flow_agent approve <production_id> [--url <link>]` |
| Trọn 1 ngày | `python -m flow_agent daily` |
| Quét view / tự học / báo cáo | `track` · `learn` · `report` |
| Chạy liên tục theo lịch | `python -m flow_agent run` |

## Quy tắc khi vận hành thay người dùng
- Không hạ `daily.score_threshold` hay sửa rubric mục `safety` để có thêm video — ngưỡng > 95 là yêu cầu của chủ kênh.
- Không tự `approve` video: chỉ chạy khi người dùng xác nhận Bác sĩ Phạm Sơn đã duyệt và video đã chuyển Công khai.
- Video "Chỉ mình tôi" không có view thật; vòng học chỉ dùng video đã `approve`.
- Khi viết/sửa kịch bản bằng tay, dùng skill `cong-thuc-kenh-mau` (agent tự sinh) và `dna-phong-kham-pham-son`.
- Lỗi giao diện Facebook/Flow: xem ảnh chụp trong `data/debug/`, sửa nhãn nút trong `video.flow.selectors`
  hoặc các hằng số đầu file `flow_agent/facebook/uploader.py`.
