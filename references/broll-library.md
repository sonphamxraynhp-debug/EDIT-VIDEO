# B-ROLL LIBRARY

Ba nguồn, dùng theo thứ tự ưu tiên:

| Nguồn | Số lượng | Khi nào |
|---|---|---|
| **Procedural** (`engine/broll.js`) | 55 template × 10 palette → **9.080 preset** trong `assets/broll/catalog.json` (307 chủ đề tiếng Việt) + vô hạn khi đổi `text/num/items/seed` | số liệu, khái niệm, UI, cảm xúc, nền — render thẳng trong timeline, không cần file |
| **Stock thật** (`scripts/broll_fetch.py`) | Pexels / Pixabay (key miễn phí), Wikimedia Commons + Openverse (không key) | cảnh đời thực: văn phòng, thành phố, đồ ăn, người… |
| **Từ chính clip** | A-roll, ảnh chụp màn hình | bằng chứng, hậu trường |

## 1. Tìm preset theo câu nói
```bash
node scripts/broll.mjs search "tháng này doanh thu tăng gấp đôi" --n 8        # id tốt nhất (≤2 mỗi template)
node scripts/broll.mjs sheet qc/broll.jpg --q "thời gian" --limit 24           # xem thử dạng lưới
node scripts/broll.mjs sheet qc/all.jpg --pal neon                             # 55 template trong 1 palette
```
Dùng trong `timeline.json` — chép các field của preset, sửa chữ cho đúng câu nói:
```json
{ "t0": 15.0, "t1": 18.6, "type": "broll", "template": "bar_chart", "pal": "ember",
  "text": "DOANH THU", "num": 200, "layout": "full" }
```
`layout`: `full` (thay cả khung, stack theo thứ tự timeline) · `card` (900×506 giữa) · `right` / `left` (580×326) · `pip` (380×214 góc phải trên) · hoặc `x,y,w,h` tuỳ ý; `rot` nghiêng thẻ; `person: true` = b-roll làm nền, người (cutout) đứng trước — như `slam_bg`.
B-roll `full` tự crossfade 0.25 s sang cảnh sau (kể cả b-roll full khác) — đặt các cảnh nối đuôi nhau, không cần chừa khoảng.
**Card/pip không được che mặt**: lấy vị trí đầu từ still, đặt thẻ phía đối diện hoặc phía trên vai.

Muốn dùng preset như *media* (trong `mosaic.columns`, `slam_bg.tiles`, `step_cards.images`…): render ra chuỗi ảnh
`node scripts/broll.mjs render <id> --frames broll/<id> --dur 3` → `{"seq":"broll/<id>/%05d.jpg","fps":30,"count":90}`.
Gói mẫu để xem/dùng lại: `node scripts/broll.mjs pack broll_pack --per-template 2 --limit 86` (≈ 1,3 s/clip).

Khổ dọc: `{"type":"broll","layout":"full","fit":"portrait"}` = nền preset kéo hết 9:16, nội dung giữ ở giữa (không viền đen, không cắt chữ; `zoom` phóng thêm). `fit:"cover"` cũ vẫn chạy nhưng cắt hai bên.

## 2. Template (tham số chung: `text`, `sub`, `icon` emoji, `num`, `unit`, `items[]`, `seed`, `pal`)
| Nhóm | Template | Dữ liệu riêng |
|---|---|---|
| Số liệu | `bar_chart` (cột cuối sáng + `+num%`) · `line_chart` (vẽ dần, `num`,`unit`) · `pie` (donut `num`%) · `kpi` (`items:[[nhãn,số,đơn vị]×3]`) · `counter_big` (số khổng lồ đếm lên) · `progress` (`items` thanh chạy) | `items` của bar_chart = mảng số |
| Tiền | `money_rain` (emoji rơi + `num`) | |
| Danh sách | `checklist` · `timeline_steps` · `progress` | `items` = chuỗi |
| Công nghệ / AI | `code_rain` · `matrix` · `neural` · `glitch_text` · `search` (gõ `text`) · `browser` (skeleton → nội dung) · `orbit_icons` (`items` = emoji) | |
| Mạng xã hội | `likes` (tim + đếm) · `phone_feed` · `notifications` (`items`) · `chat` (`items` xen kẽ 2 bên) | |
| Thời gian | `clock` (`num` = vòng/giây) · `calendar` (`num` ngày bắt đầu, `sub` tháng) · `countdown` (3-2-1 → `text`) | |
| Địa điểm | `globe` · `map_pins` (`items` = tên nơi) | |
| So sánh | `versus` (`items:[A,B]`, `icon` trái, `sub` emoji phải) | |
| Cảm xúc / nhấn | `icon_hero` · `emoji_burst` · `sunburst` · `rings` · `spotlight` · `typewriter` (trích dẫn) · `quote_card` · `ticker` (băng chữ chéo) · `rocket` · `files` | |
| Đời sống / bán hàng (v5) | `food_steam` (món + hơi nóng) · `plane_route` (`items:[A,B]`) · `heartbeat` (`num` BPM) · `house_build` · `shopping_cart` (`items` emoji, `num` tổng) · `price_tag` (`sub` giá cũ gạch, `num` giá mới) · `star_rating` (`num` ≤ 5) · `gift_box` · `book_open` · `gauge` (`num` %) · `trophy` · `logo_hero` (`icon:"si:<slug>"`, `hex` màu thương hiệu) | |
| Nền trừu tượng | `particles` · `blobs` · `wave_lines` · `hex_grid` · `grid_tunnel` · `starfield` · `equalizer` | id `bg--<template>--<pal>--<seed>` |

Palette: `ember` (mặc định, khớp video mẫu) · `neon` · `ocean` · `forest` · `gold` · `violet` · `mono` · `sunset` · `light` · `candy` (2 cái cuối nền sáng).
Trong 1 video giữ **1 palette chính** (ember) + tối đa 1 palette phụ cho đoạn mood khác.

## 3. Stock thật
```bash
export PEXELS_API_KEY=…  PIXABAY_API_KEY=…      # tuỳ chọn, miễn phí; không có vẫn chạy Commons/Openverse
$PY scripts/broll_fetch.py "khách hàng vui vẻ ở cửa hàng" broll --n 3 --dur 4            # video 1280×720 30fps
$PY scripts/broll_fetch.py "làm việc với laptop" broll --kind photo --n 4                # ảnh
$PY scripts/broll_fetch.py "x" broll --en "drone city night" --frames                    # tự viết query EN + xuất chuỗi ảnh
```
Câu tiếng Việt được dịch bằng `assets/broll/keywords_vi_en.tsv` (≈ 250 cụm, thêm dòng tuỳ ý). Mỗi file ghi tác giả + license vào `broll/credits.json` —
Commons/Openverse là CC BY/BY-SA → **phải ghi nguồn** (mô tả video hoặc end card). Pexels/Pixabay không bắt buộc.
Kết quả in ra JSON media dán thẳng vào `mosaic.columns`, `slam_bg.tiles`, `ui_showcase.image`…

## 4. Emoji 3D
1.524 emoji Fluent 3D (MIT) — bất kỳ emoji nào trong `icon`, `stickers`, `kinetic.emoji` tự lấy bản 3D (`engine/fluent_index.js`).
Tra theo từ khoá tiếng Anh: `assets/emoji/index.json`. Render offline: `$PY scripts/build_emoji_index.py --download emoji_cache` rồi `"emoji_dir": "emoji_cache"` trong timeline.

## 5. Chọn b-roll cho từng câu (luật)
1. Câu có **con số** → template số (bar/line/counter/pie/kpi); `num` = đúng số trong câu.
2. Câu **liệt kê** → checklist/timeline_steps/progress, `items` = đúng từ người nói.
3. Câu về **công cụ / AI / quy trình** → tech group, ưu tiên ảnh chụp màn hình thật nếu có.
4. Câu **cảnh đời thực** (khách hàng, cửa hàng, thành phố…) → stock thật.
5. Câu **cảm xúc / chốt** → icon_hero, emoji_burst, sunburst + `fx` punch/flash.
6. B-roll full-frame dài 1.5–3.5 s; card/pip 3–6 s; không quá 2 b-roll full liên tiếp — quay về mặt người để giữ kết nối.
