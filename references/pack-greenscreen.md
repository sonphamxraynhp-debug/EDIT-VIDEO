# Gói `greenscreen` — Green screen / react tin tức

File: `engine/packs/greenscreen.js` · type `gs_*` · phụ đề `caption_style: "greenscreen"` · mẫu: `examples/timeline.greenscreen.json`.

Người nói được **tách nền** (PNG từng khung) rồi đặt ở **đáy khung hình** trên một nền mới: ảnh, chuỗi frame, b-roll preset, màu đơn, gradient, bài báo trong trình duyệt, bài đăng mạng xã hội hoặc website cuộn. Kiểu "react tin tức", "green screen TikTok".

## 1. Tạo cutout (bắt buộc để có hiệu ứng thật)

```bash
SK=<thư mục ai-video-studio>
# frames: thư mục JPG 00001.jpg… (đã tách từ video), out: thư mục PNG
$SK/scripts/.venv/bin/python -I $SK/scripts/segment.py work/frames work/cutouts --ranges 0-20.3
# chỉ một số đoạn (giây): --ranges 0-6,11-15.5   ·  fps khác 30: --fps 25  ·  model: --model u2net_human_seg (mặc định)
```
- Dùng rembg (CPU). Khoảng 600 khung (20 s) mất ~2 phút trên Mac M-series. File đã có thì bỏ qua, chạy lại an toàn.
- Khai báo trong timeline: `"aroll": { "frames": "work/frames/%05d.jpg", "cutouts": "work/cutouts/%05d.png" }`.
  Với track nhiều clip (`TL.clips`) thì đặt `cutouts` trong từng clip; engine tự dùng `'@cut'`.
- Khung nào **không có** PNG → tự lùi về ảnh gốc có mặt nạ elip mềm (`TL.person = {x,y,rx,ry}` theo % ảnh). Không có cutout nào → toàn bộ dùng elip mềm (vẫn xem được, nhưng kém đẹp).
- Có thể ghi đè từng scene: `gs_backdrop.cutouts: "cut2/%05d.png"`.

## 2. Bố cục mặc định
| | Dọc 720×1280 | Ngang 1280×720 |
|---|---|---|
| Thẻ nền (bài báo / website) | x28 y118, rộng 664, cao 400–470 | x40 y40, 760×570 |
| Người | giữa, đáy khung, cao 52 % | x≈985, đáy khung, cao 92 % |
| Phụ đề | tự đặt ngay trên đầu người (≈y 600) | vùng bên trái người, y 600 |

Thẻ `gs_article / gs_tweet / gs_screen` nằm **sau** người khi có `gs_backdrop` đang chạy (`layer:"auto"`), nên người luôn đứng trước nội dung. Không có backdrop thì thẻ nằm trên video gốc. Ép bằng `layer:"back"|"front"`.

## 3. Module

### `gs_backdrop` — nền + người tách nền
`{ bg, kb=.08, kb_dir=1, ox, oy, pan_x, bg_blur, bg_filter, dim, ground=true, x, y, size, shadow=true, rim=.35, outline, outline_color, flip, enter=true, cutouts, person=true, fade, keep }`
- `bg`: `"media/x.jpg"` · `{src}` · `{seq:"dir/%05d.jpg",fps,count}` · `{broll:{template|id,pal,text}}` (preset b-roll, cắt vừa khung) · `{color:"#123"}` · `{gradient:["#0B1E3A","#123E6B","#0A1426"], angle, glow, glow2}` (mặc định: gradient xanh, đốm sáng trôi + lưới mờ).
- Ken Burns: `kb` (độ phóng), `kb_dir` (1 vào, −1 ra), `ox/oy` (%), `pan_x` (px).
- Người: `x` = tâm ngang, `y` = mép dưới, `size` = chiều cao % khung. Kéo/đổi cỡ trong Studio tác động lên người. `outline: 4` = viền trắng kiểu sticker; `shadow` đổ bóng, `rim` viền sáng mờ.
- Đổi nền giữa video: đặt nhiều `gs_backdrop` nối nhau.

### `gs_article` — bài báo trong trình duyệt (nội dung tự viết)
`{ source, logo, url, category, headline, date, author, image, image_h, lead, before, highlight, after, hl_t, hl_dur=.9, hl_color, theme:"light"|"dark", headline_size, body_size, card:{x,y,w,h,r}, full, scroll, layer }`
- Câu `highlight` được **tô marker vàng** chạy từ trái qua phải, từng dòng, bắt đầu ở `hl_t` (giây tuyệt đối).
- Có `image` thì trang tự cuộn xuống qua ảnh trước khi tô. Tự cuộn: `scroll: 120` hoặc `[{t, v:px}]`.
- `full:true` = trang báo phủ cả khung (không có thanh trình duyệt).
- Thanh trình duyệt là giao diện chung chung, không giả mạo trang thật; hãy ghi đúng nguồn tin.

### `gs_tweet` — thẻ bài đăng mạng xã hội
`{ name, handle, avatar, verified=true, time, text, image, image_h, platform:"si:x"|emoji, stats:{replies,reposts,likes,views}, like_t, theme, x, y, size, w, text_size, layer }`
- Số trong `stats` là số → tự đếm lên và rút gọn (25,6K · 1,2Tr); chuỗi thì giữ nguyên. Tim đỏ bật lên ở `like_t`. Chữ hiện dần theo từ.

### `gs_pointer` — mũi tên / khoanh / chỉ tay
`{ kind:"arrow"|"circle"|"box"|"underline"|"hand", x, y, w, h, from:{x,y}, label, label_x, label_y, color, width=7, size }`
- `x,y` = tâm vùng, `w,h` = kích thước vùng. Nét vẽ tay, tự vẽ ra trong 0,5 s, có bóng.
- `arrow` mặc định xuất phát từ **đỉnh đầu người** (lấy từ backdrop đang chạy).

### `gs_zoomfocus` — zoom nền vào một vùng
`{ keys:[{t, x, y, s}], cy, brackets=true }` — `t` giây tuyệt đối, `x/y` điểm cần xem (% khung), `s` độ phóng. Zoom áp lên backdrop và mọi thẻ `gs_*` nằm sau người (người và phụ đề giữ nguyên). Điểm được đưa về `cy` (mặc định nửa trên, trên đầu người). Góc khung trắng mờ hiện khi đang zoom.

### `gs_screen` — website / ảnh chụp màn hình cuộn dọc
`{ image (ảnh dài), url, from=0, to=1, scroll:[{t,v}] (v 0…1), device:"browser"|"phone", card, theme, site, layer }`
- Cuộn mượt từ `from` đến `to` trong thời gian scene. Không có ảnh → trang mẫu dạng khối.

## 4. Phụ đề `greenscreen`
Chữ trắng Be Vietnam Pro 900 viền đen dày, từ đang đọc vàng (phóng nhẹ), từ `hl` nền đỏ nghiêng. Tự đặt **ngay trên đầu người** khi có backdrop; ngang thì canh giữa vùng trái. Tôn trọng `x/y/size/font/color/weight`.

## 5. Recipe (bản đầu)
- `gs_backdrop` cả video (nền `ctx.image` / `brand.background` / gradient).
- `gs_article` 0 → ~6 s: tiêu đề và câu tô lấy từ phụ đề đầu; `gs_zoomfocus` vào câu tô từ 2,6 s.
- `gs_tweet` khi nói "đăng | bài viết | bài đăng"; nếu không có thì đặt ở chỗ nói "đây | nhìn" (sau bài báo) hoặc giữa video.
- `gs_pointer` khi nói "đây | nhìn": mũi tên vào bài báo, hoặc khoanh bài đăng.
- Tìm từ khoá **phân biệt dấu** (đăng ≠ đang) và khớp cả token nhiều từ ("gây shock").
- Nhớ chạy `segment.py` cho cả video trước khi render.

## 6. Mẹo
- Nền ảnh tối/mờ giúp người nổi bật; `dim: .2` hoặc `bg_blur: 6` với ảnh rối.
- Người to hơn (`size: 60`, `outline: 4`) cho đoạn kết/CTA.
- Ảnh mẫu: `examples/media/gs_bg_city.jpg`, `gs_hero.jpg`, `gs_site.jpg`, `gs_avatar.jpg`.
