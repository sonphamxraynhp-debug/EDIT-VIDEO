# Style "BĐS Đen Gold" (`u_bds_den_gold`)

> Gói dựng video bất động sản cao cấp với tông đen – vàng gold, chữ serif Playfair và khung viền mảnh bao quanh toàn bài. Có intro tên dự án, thẻ giá đếm số, bản đồ vị trí, chip tiện ích, wipe vàng và CTA gọi điện, phụ đề thanh mảnh viền vàng dưới mặt người nói.

Nguồn: Video bất động sản sang trọng tông đen–vàng gold, chữ serif, intro tên dự án, thẻ giá, bản đồ vị trí, CTA gọi điện. Tạo bởi Style Lab (Claude Code CLI).

## Bảng màu
- `#0B0B0B` Đen tuyền (ink) – nền thẻ, panel CTA, wash intro, màu chữ trên nút.
- `#C9A44C` Vàng gold (gold) – viền khung, kẻ ngang, kicker, pin bản đồ, chữ nhấn.
- `#F3E3B0` Vàng sáng (hi) – điểm sáng của chữ gradient ánh kim, tâm sheen.
- `#7A5A1C` Vàng tối (lo) – mép tối của gradient ánh kim.
- `#F4EEE0` Kem (cream) – chữ thường, phụ đề, tên đơn vị.
- `rgba(244,238,224,.6)` Kem mờ – ghi chú, website.
- A-roll được grade ấm: contrast 1.07, saturate .88, sepia .14, brightness .95 + vignette đen 62% + tint gold soft-light 16%.
- `TL.brand.accent` ghi đè màu gold; `TL.brand.font` ghi đè font sans; `TL.brand.disp` chứa "serif/playfair" thì ghi đè font serif.

## Font
- Tiêu đề, số giá, số điện thoại, chữ nhấn: **Playfair Display** 600–700, nghiêng 400–500 cho dòng phụ.
- Kicker, label, phụ đề, chip: **Be Vietnam Pro** 500, letter-spacing .3–.5em in hoa cho label.
- Chữ ánh kim: gradient lo → gold → hi → gold → lo, sheen trượt ping-pong theo t (không dùng state).

## Phụ đề
- Kiểu `u_bds_den_gold`: hộp đen 72% trong suốt, kẻ trên/dưới 1px vàng, bo góc 0, bóng đổ mềm.
- Dọc: tâm x = 360, top y = 1060, rộng 600, cỡ 30px. Ngang: x = 640, top 622, rộng 900, cỡ 26px.
- Từ chưa nói hiện mờ 18%, từ đến lượt (w.s) fade + trượt lên 6px trong .22 s.
- Từ `hl`: Playfair nghiêng 600, chữ gradient vàng ánh kim.
- Tôn trọng c.x / c.y / c.size / c.font / c.color / c.weight; `w.br` xuống dòng khi dọc.

## Graphic
- **Khung sang trọng** (cả video): viền mảnh 1.2px vàng vẽ dần trong 1.4 s, 4 hoa văn góc chữ L + hình thoi, tên thương hiệu in hoa cắt ngang viền trên, vignette + grade ấm. Không che mặt.
- **Intro tên dự án** (0–2.5 s, full-frame ngắn): wash đen 82%, kicker "DỰ ÁN" giữa 2 kẻ vàng, từng chữ tiêu đề hiện từ mờ (blur) trượt lên, kẻ vàng mở ra, dòng vị trí nghiêng. Ẩn phụ đề.
- **Thẻ giá** (3–3.5 s): thẻ đen viền vàng, thanh vàng dọc trái, label "GIÁ CHỈ TỪ", số đếm từ 0 lên trong 1.3 s (outExpo) chữ ánh kim 80px, đơn vị nghiêng, ghi chú thanh toán, badge ưu đãi góc. Dọc: tâm (360, 880) 580×200. Ngang: góc phải (960, 420) 500×190.
- **Bản đồ vị trí** (3.5–4 s): thẻ chia 2: trái là bản đồ SVG đen (đường phố vẽ dần, sông, trục chính vàng, pin rơi outBack, 2 vòng sóng lan theo t, tên dự án), phải là danh sách "15 phút · Sân bay…" hiện lần lượt mỗi .28 s. Dọc: (360, 905) 620×250. Ngang: (940, 420) 560×240.
- **Chip tiện ích** (3 s): 3–4 chip đen viền vàng, icon + chữ, bật ra outBack lệch nhau .22 s. Dọc: hàng ngang y = 790. Ngang: cột trái x = 230.
- **Wipe vàng** (.6–.8 s): tấm đen nghiêng 14° quét ngang, mép dẫn là dải gradient vàng, kèm loé vàng nhẹ toàn khung.
- **CTA gọi điện** (3–4 s cuối): panel đen dâng từ dưới (dọc) hoặc từ phải (ngang), kicker "LIÊN HỆ TƯ VẤN", icon ống nghe rung theo nhịp, số hotline Playfair ánh kim 56px, tên đơn vị nghiêng, website, nút "GỌI NGAY" vàng pulse + glow. Ẩn phụ đề.

## Chuyển cảnh & hiệu ứng
- Cuối intro: `flash` (.5) rồi `zoom_in` (.35) nhẹ để mở cảnh người nói.
- Mỗi thẻ xuất hiện: `punch` .45 (thẻ giá, chip), `zoom_in` .45 (bản đồ).
- Trước CTA: `u_bds_den_gold_wipe` + `whip` .6.
- Không glitch/rgb — style chậm, sang; mọi chuyển động dùng outCubic/outExpo/outBack 0.6–1.4 s.

## Nhạc & SFX
- Mood `corporate` (thay thế: `inspire`, `mellow`), âm lượng nền thấp, ducking khi nói.
- SFX gợi ý: whoosh mềm khi wipe, "ting" kim loại nhẹ khi số giá dừng, chuông điện thoại ngắn khi CTA xuất hiện.

## Nhịp dựng
- 0–2.5 s intro full-frame → flash mở người nói.
- Thân bài: mỗi 25–35% thời lượng một thẻ (giá → tiện ích → vị trí) đặt theo từ khoá nói; các thẻ nằm dưới mặt (y ≥ 780 dọc) hoặc bên phải/trái (ngang), cách nhau ≥ .6 s.
- 4 s cuối: wipe vàng → CTA hotline giữ đến hết.
- Graphic không bao giờ chồng vùng mặt y 330–700 trừ intro (full-frame ngắn).

## Module của gói
- `u_bds_den_gold_frame` → `inset`, `vignette`, `grade:false`, `name`.
- `u_bds_den_gold_intro` → `kicker`, `title`, `sub`, `x`, `y`, `size`, `w`, `wash`, `hideCaptions`.
- `u_bds_den_gold_price` → `label`, `value` ("3,2"), `unit`, `note`, `badge`, `x`, `y`, `w`, `h`, `size`.
- `u_bds_den_gold_map` → `place`, `label`, `pois:[{name,min}]`, `x`, `y`, `w`, `h`.
- `u_bds_den_gold_chips` → `title`, `items:[{icon,text}]`, `x`, `y`, `size`.
- `u_bds_den_gold_wipe` → `dir:'left'|'right'`.
- `u_bds_den_gold_cta` → `kicker`, `phone`, `name`, `web`, `btn`, `x`, `y`, `size`, `hideCaptions`.
