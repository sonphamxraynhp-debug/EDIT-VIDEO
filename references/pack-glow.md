# Gói `glow` — Tutorial phát sáng

Port từ skill `video-tutorial-glow`. File: `engine/packs/glow.js`, ví dụ: `examples/timeline.glow.json`.
Khung dọc 720×1280. Hình quay thật để toàn khung (không nền dựng), xen cảnh màn hình laptop "quay bằng điện thoại".

## Diện mạo
| Vai trò | Màu | Ghi đè bằng brand |
|---|---|---|
| Kem: từ khoá, tên công cụ, con số, mốc | `#F5F2CD`, đứng, ExtraBold 800 | `brand.accent` |
| Trắng: diễn giải, liệt kê, dòng chốt | `#FAFAFA`, **nghiêng**, Bold 700 | `brand.light` |
| Quầng vàng sau mọi chữ (không bao giờ là màu chữ) | `#E8C45A` | `brand.primary` |

- Font: **Be Vietnam Pro** (`brand.font` để đổi). Đối lập *kem đứng / trắng nghiêng* quan trọng hơn chọn font.
- Chất chữ: quầng vàng rộng + viền vàng hẹp + bóng đen lệch xuống 5% cỡ chữ.
- Chuyển động nhẹ: khối hiện mờ dần, trượt lên ~14 px trong 0,2 s, quầng loé sáng rồi dịu lại (`flare`, mặc định 0,6). Biến mất mờ đi 0,18 s.
- **Phụ đề `caption_style: "glow"`**: trắng đứng Bold 54 px, từ `hl` màu kem ExtraBold có quầng mạnh hơn; tối đa 2 dòng, cân dòng (`text-wrap: balance`), tự thu nhỏ tới 34 px; dòng cuối kết thúc ở y≈1096 (trên vùng nút app). Cả dòng hiện cùng lúc (không karaoke), trượt lên 8 px. Có tấm tối mờ phía sau: `TL.caption_shade` (mặc định 0,32; 0 = tắt). Studio chỉnh được `x/y/size/font/color/weight`.

## Module
Mọi module có `t0, t1`, `keep` (không mờ đi), `rise` (px trượt lên), `flare`, `shade` (0–1, tấm tối sau chữ khi nền sáng).

| type | Dùng cho | Tham số chính (mặc định) |
|---|---|---|
| `glow_scrim` | Dải tối trên/dưới, nằm dưới mọi chữ. Bắt buộc khi khung sáng (tường/áo/màn hình trắng) | `top` .42, `bottom` .5, `top_h` 420, `bottom_h` 460 |
| `glow_title` | Một cặp tiêu đề: từ kem rất to + cụm trắng nghiêng bên cạnh (tự xuống dưới nếu chật). Mở đầu dùng 2 cảnh: trên đầu và ngang ngực | `big`, `small`, `x` 360, `y` 170, `size` 210, `small_size` (=size×.46), `layout` `right`/`below` |
| `glow_keyword` | Một từ bật lên đúng lúc gọi tên công cụ/con số | `text`, `icon` (`si:openai`, emoji), `x` 360, `y` 150, `size` 112, `align` center/left/right, `color` |
| `glow_marker` | Mốc đoạn góc trên trái + gạch vàng chạy | `text` (Input/Output/Bước 2), `num` ("01"), `x` 76 (mép trái), `y` 100, `size` 68, `bar` |
| `glow_list` | Khối gánh nội dung: dòng đầu kem nghiêng (+icon) và ≤4 dòng trắng nghiêng hiện lần lượt | `header`, `icon`, `items[]` (<34 ký tự), `x` 360, `y` (mặc định đáy khối ở 940), `size` 54, `item_size` 46, `anchor` bottom/top, `stagger` .12 |
| `glow_note` | Như list nhưng không header, nửa trên khung — mẹo phụ | `items[]`, `y` 200, `size` 46 |
| `glow_screen` | Cảnh màn hình chèn: laptop trong phối cảnh, bàn phím tối bên dưới (chỗ đặt chữ), máy rung tay nhẹ + zoom chậm. `layout:"full"` = ảnh/clip phủ toàn khung | `screen` ({broll:{id}} / {chat:{…}} / {media}) hoặc `media`, `x` 360, `y` 470 (tâm màn), `size` 600 (rộng màn), `ratio` .625, `zoom` 1.06, `enter` cut/fade/zoom, `ui_scale` (chat 1.7) |
| `glow_punch` | Punch-in mặt người khi thiếu cảnh màn hình (đổi khung = "cảnh mới") | `size` 1.35 (độ phóng), `drift` .03, `x/y` tâm phóng (mặc định `TL.face`) |
| `glow_endcard` | Dòng chốt ❤️ Like & Cmt nhaaa ❤️ ở mép trên | `text`, `icon`, `x` 360, `y` 110, `size` 52 |

## Lời nói → module
- Câu mở có lời hứa → 2 × `glow_title` (danh từ chính = `big`, lời hứa = `small`), 0,3–4,5 s.
- Gọi tên công cụ/thương hiệu/con số ("ChatGPT", "Canva", "12 trang") → `glow_keyword` (thêm `icon: "si:<slug>"` nếu là thương hiệu), đặt `t0` đúng từ đó.
- "Đầu vào là…", "Kết quả…", "Bước một…" → `glow_marker` (Input / Output / Bước 1). 2–4 mốc mỗi phút.
- Đang giải thích các bước, liệt kê ý → `glow_list` trên nền bàn phím tối của `glow_screen`.
- Mẹo phụ, chú thích ngắn → `glow_note`.
- Nói về thao tác trên phần mềm → `glow_screen` (chat để diễn lại prompt; ảnh chụp/clip màn hình qua `media`). Không có hình màn hình → `glow_punch`.
- Câu chốt "like/comment/follow" → `glow_endcard` 3 s cuối.
- Khung sáng → `glow_scrim` cả bài trước khi nghĩ tới `shade`.

## Nhịp
- Đổi hình 1,5–3 s (trung bình 2,4); 20 s cuối dồn còn ~1,5 s. Tỷ lệ mặt/màn hình ≈ 40/60, một cảnh màn hình ≤ 3 s.
- 3 giây đầu luôn là mặt người.
- Mỗi khối chữ lớn sống 2,5–4 s; **một khối lớn tại một thời điểm** (ngoài phụ đề); không để trống chữ quá 4 s.
- Vùng đặt: y 36–260 keyword/marker/note/endcard · 260–700 mặt (tránh) · 700–940 list/title 2 · 940–1100 phụ đề · >1120 cấm.
- Chữ trên màn hình rút gọn thành nhãn, không chép lời nói. Nhạc gợi ý `corporate`, giọng là chính.
