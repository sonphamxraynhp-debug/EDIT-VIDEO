# Style "Studio lưới AI" (`u_studio_luoi_ai`)

> Nền lưới xám xanh với video thành thẻ bo góc và ô app cam phía trên, phụ đề trắng trong hộp 'đang chọn' kiểu editor, từ khoá nổi bằng hộp vàng serif, neon đỏ hoặc mint phát sáng. Graphic tin tức: headline LED cam, sơ đồ nhân vật–công ty trên nền mờ, thẻ chủ đề, outro đen chữ cam phát sáng, nhịp fx mỗi 4–5 s theo nhạc tech.

Nguồn: snaptik.vn_7702089090908409095_wm.mp4. Tạo bởi Style Lab (Claude Code CLI).

## Bảng màu
| Hex | Vai trò |
|---|---|
| #3B4751 | Nền lưới xám xanh (bản vẽ), lưới kẻ rgba(255,255,255,.11) ô 28 px |
| #1C1A1A / #050507 | Chữ tối trên hộp vàng, nền outro, chip tối (#2B2B30) |
| #E8703F | Ô app cam (logo), glow outro, được `BR().accent` ghi đè |
| #FFE24D | Hộp nhấn từ khoá, pill ý chính, viền vòng tròn sơ đồ |
| #6FA8E6 | Tiêu đề thẻ chủ đề (xanh dương đậm) |
| #FF8A3D | Chữ LED headline và chữ outro |
| #FF3B5C | Chữ neon đỏ (từ gây sợ) |
| #B8FFE6 | Chữ mint phát sáng (AI) |
| rgba(52,56,86,.86) | Hộp phụ đề kiểu "đang chọn" + viền nét đứt trắng |
| #F1F1F0 / #FFF | Chữ phụ đề, chữ kicker |

## Font
- Be Vietnam Pro 600–800: phụ đề, hook, kicker, chip, tiêu đề thẻ.
- Playfair Display italic 700: chữ trong hộp vàng nhấn từ, câu hỏi outro.
- Bungee (fallback Oswald): LED headline, tiêu đề outro, viết hoa, tracking rộng.

## Phụ đề
- Trắng, 34 px (dọc) / 30 px (ngang), đậm 600, căn giữa, rộng ≤ 600 px, hiện **từng từ theo w.s** với pop outBack (giữ nguyên bố cục dòng, từ chưa nói trong suốt).
- Khi **không** có khung lưới: nằm trong hộp xanh tím mờ, viền 1.5 px nét đứt, 4 ô vuông trắng ở góc (giống text box đang chọn trong editor). Khi có khung lưới: chữ trần có bóng đen, ở 70 % chiều cao thẻ video.
- Khi cảnh `_map` đang chạy, phụ đề dời lên đầu thẻ (y ≈ thẻ + 118 px) như video gốc.
- Từ `hl`: hộp vàng #FFE24D, chữ Playfair italic đậm tối, xoay −2°, bóng.
- Tôn trọng c.x/y/size/font/color/weight; `c.box` ép bật/tắt hộp.

## Graphic
- **Khung lưới + thẻ video** (`_grid`): cả bài từ sau hook. Video zoom-out thành thẻ bo góc 22 px (lề 44 px dọc / 110 px ngang), nền lưới trôi chậm, ô app cam 64 px nhấp nhô phía trên.
- **Hook** (`_hook`): 0–2.5 s. Bảng editor giả (card sáng, 3 chấm, chip timeline hồng/tím/vàng, đầu phát đỏ chạy) trượt xuống từ trên; tiêu đề trong hộp "đang chọn" ở 72 % chiều cao; ô app cam chồng lên góc trái; con trỏ chuột lướt tới rồi kéo nhẹ hộp.
- **Nhấn từ** (`_tag`): 1.5–2 s, ngay tại thời điểm nói, phía trên mặt (y ≈ thẻ + 230). `look`: yellow (hộp vàng serif), neon (đỏ nhấp nháy), glow (mint 110 px blur-in).
- **Thẻ chủ đề** (`_card`): 3–3.5 s, nền mờ tối; kicker nhỏ → tiêu đề xanh 64 px → khung ảnh 16:9 đen trắng (ảnh người dùng qua `img` hoặc hoạ tiết "đám đông robot") → tag vàng.
- **LED headline** (`_led`): 3 s, phía trên mặt: dãy 5 ô icon tối pop lần lượt, chữ Bungee bằng chấm LED cam gõ từng ký tự, chấm chạy, thỉnh thoảng nháy.
- **Sơ đồ** (`_map`): 5–6 s, video mờ tối (focus), kicker trên, vòng tròn người ở giữa → 2 chip → pill vàng ở trên → pill viền ở dưới, dây nối vẽ dần bằng SVG, mỗi bước 0.75 s.
- **Outro** (`_outro`): 3–3.5 s cuối, nền đen: tiêu đề cam phát sáng gõ chữ, pill trắng logo + tên kênh, câu hỏi nghiêng, handle, chữ ma mờ phía sau.

## Chuyển cảnh & hiệu ứng
- Gốc cắt 7 lần / 38 s (trung bình 4.8 s, có cụm 1–2 s). Mô phỏng: `punch` khi vào lưới (2.5 s), mỗi graphic kèm fx (card → whip, tag → punch, led → flash, map → zoom_in, outro → glitch), xen kẽ whip/zoom_in/punch/flash mỗi 4.6 s (2 ô nhịp 105 BPM).
- Focus = blur 14 px + tối 50 % chỉ trong thẻ video; graphic che mặt chỉ trong cảnh focus ngắn.

## Nhạc & SFX
- Mood `tech` (nền điện tử hồi hộp, ~105 BPM). SFX: whoosh ở whip, pop khi tag/chip xuất hiện, click/typing khi LED gõ chữ, riser ngắn trước outro.

## Nhịp dựng
- 0–2.5 s hook full-frame → punch vào thẻ lưới → thẻ chủ đề (≈ 4–7 s) → nhấn từ khoá theo lời nói → LED headline ≈ 45 % → sơ đồ ≈ 62 % (6 s) → tag mint "AI" trước outro → outro 3.5 s. Một fx mỗi 4–5 s, không có graphic nào chồng nhau.

## Module của gói
| type | tham số chính |
|---|---|
| `_grid` | t0,t1, margin, top, bottom, radius, bg, logo:false, x,y (ô app) |
| `_hook` | title, size, x,y, w, panel:false, tile:false |
| `_tag` | text, look: yellow/neon/glow, color, size, x,y |
| `_card` | kicker, title, img, tag, color, size, w, x,y, dim:false |
| `_led` | text, icons[], color, size, cps, x,y |
| `_map` | kicker, center, icon, chips[{icon,label}], top, bottom, step, dim:false, capTop:false, x,y |
| `_outro` | title, sub, name, ghost, color, size, x,y |
