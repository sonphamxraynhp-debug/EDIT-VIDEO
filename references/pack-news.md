# Gói `news` — Bản tin thời sự

File: `engine/packs/news.js` · type `news_*` · phụ đề `caption_style: "news"` · mẫu: `examples/timeline.news.json`. Chạy cả **dọc 9:16** và **ngang 16:9**.

Màu mặc định: đỏ tin `#D90F1A`, xanh navy `#0A1C44`, xanh `#1556D8`, vàng `#FFC21A`. Brand kit ghi đè: `primary` (đỏ), `dark` (navy), `secondary` (xanh), `accent` (vàng), `logo`, `name` (tên kênh), `font`, `disp`. Riêng từng scene: `color`, `navy`, `accent`.

**Logo slot**: `logo` (ảnh, `si:<slug>`, emoji) hoặc chữ viết tắt tên kênh — "TIN TỨC 24H" → ô đỏ "TT" + nhãn trắng "24H".

## Bố cục (không chồng nhau)
| Vùng | Dọc 720×1280 | Ngang 1280×720 |
|---|---|---|
| Badge TRỰC TIẾP | trái, y 162 | trái, y 46 |
| Banner TIN NÓNG | y 330 (trên trán) | y 300 |
| Thẻ: lower-third / tiêu đề / bản đồ / trích dẫn | tâm ~y 760–790 | lower-third y 548, tiêu đề 520, bản đồ 470, trích dẫn 360 |
| Phụ đề | top 868 (1 dòng) | top 606 |
| Ticker | 944–1000 (trong safe zone) | đáy 670–720 |

`x` của `news_live` và `news_lowerthird` là **mép trái**; các module khác `x,y` là tâm. `size` = % tỉ lệ.

## Module
- **`news_intro`** — ident kênh ~2 s, phủ toàn khung: nền navy, quả cầu kinh tuyến quay, dải đỏ/vàng quét, logo bật + vệt sáng, tên kênh, thanh vàng tên chương trình, dòng phụ. 0,4 s cuối quét thanh đỏ lộ video. `{ channel, name, sub, logo }`. Ẩn phụ đề.
- **`news_live`** — `{ label:"TRỰC TIẾP"|"LIVE", clock:"20:15:00", place, logo, x, y, size }`. Chấm trắng nhấp nháy; đồng hồ **chạy theo t** từ giờ `clock` (HH:MM hoặc HH:MM:SS).
- **`news_lowerthird`** — `{ name, title, tag, logo, x, y, size }`. Ô logo lật vào, vạch vàng, thanh trắng tên (in hoa), thanh navy chức danh, nhãn vàng `tag`. Vào/ra bằng wipe.
- **`news_breaking`** — `{ label:"TIN NÓNG", sub:"BREAKING NEWS", text, y, size, siren=true }`. Dải sọc đỏ chạy, chữ đập vào (stamp + blur + rung), chớp trắng, 🚨 hai bên, viền đỏ/xanh nhấp nháy kiểu còi; `text` là thanh trắng bên dưới.
- **`news_headline`** — `{ tag, text, sub, x, y, size, w, text_size }`. Thẻ navy→xanh, vạch đỏ trái, nhãn chuyên mục đỏ, gạch chân đỏ→vàng chạy.
- **`news_map`** — `{ place, sub, label:"ĐỊA ĐIỂM", coord, seed, x, y, size }`. Bản đồ cách điệu SVG (đất, sông, đường) zoom vào, ghim đỏ rơi xuống + sóng lan.
- **`news_quote`** — `{ text, source, role, avatar, x, y, size, w, text_size }`. Thẻ trắng viền đỏ, ô dấu “ đỏ, chữ hiện theo từ. **Mặc định ẩn phụ đề** (trích dẫn chính là lời nói); đặt `hideCaptions:false` để hiện.
- **`news_ticker`** — `{ label:"TIN NÓNG", items:[…], speed=110 (px/s), y, h, right (mặc định tên kênh), logo, size }`. Chạy chữ vô tận, nối liền không giật (CSS animation dừng + delay âm theo t → mọi khung render độc lập).

## Phụ đề `news`
Một dải navy trong suốt có tab đỏ bên trái, chữ trắng 700, từ đang đọc vàng, từ `hl` nền đỏ; dải mở bằng wipe. Tôn trọng `x/y/size/font/color/weight`.

## Recipe (bản đầu)
1. `news_intro` 0–2 s (tên kênh = `brand.name`, tên chương trình = `ctx.title`).
2. `news_live` + `news_ticker` từ hết intro đến cuối (ticker lấy 3 câu trong phụ đề).
3. `news_lowerthird` ngay sau intro (≥ 1 s): `brand.presenter|name`, `brand.handle`.
4. `news_breaking` khi nói "nóng | khẩn | mới nhất | khẩn cấp | sốc | shock".
5. `news_headline` ở từ `hl` đầu tiên (né banner).
6. Lower-third "Theo dõi …" 3 s cuối.
Tìm từ khoá phân biệt dấu và khớp cả token nhiều từ ("gây shock").

## Mẹo
- Video ngang: giữ nguyên các module, mọi vị trí tự đổi theo `VERT()`.
- Có logo PNG nền trong → `brand.logo` để logo hiện ở intro, lower-third, badge, ticker.
- Ảnh mẫu: `examples/media/news_avatar.jpg`.
