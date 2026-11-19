# Bộ infographic hạ tầng — Phòng khám Bác sĩ Phạm Sơn

3 sơ đồ phong cách infographic (icon, tầng 3D, trụ dữ liệu, vòng phản hồi):

1. `1-he-thong-du-lieu-dna-pham-son.png`: Nguồn dữ liệu → Nạp dữ liệu → Bộ não thứ 2 → Ứng dụng điều hành
2. `2-cau-truc-tang-ai-agent.png`: 7 tầng Multi-Agent + Feedback Loop
3. `3-mini-app-dashboard-admin.png`: 12 Mini App hội tụ về Dashboard Admin chính

## Sửa và xuất lại

Nội dung nằm trong `src/*.html`. Icon viết dạng `[[ten-icon]]` (tên theo bộ Lucide).

```bash
npm i lucide-static@0.460.0
ICON_DIR=node_modules/lucide-static/icons node src/build.js src/2-tang-ai-agent.html 2-cau-truc-tang-ai-agent.png 2
```
