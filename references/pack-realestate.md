# Gói `realestate` — Bất động sản 🏡

File: `engine/packs/realestate.js` · Ví dụ: `examples/timeline.realestate.json` (~20 s, đủ 11 module).

Dùng cho video giới thiệu **căn hộ, nhà phố, đất nền, dự án**: môi giới quay talking-head, xen ảnh/clip căn nhà.

## Look
- **Sang, đáng tin**: thẻ kính (glass) navy đậm `#0F2A3D`, viền và số vàng ấm `#C9A35B`, chữ ngà `#F6F1E7`.
- Tiêu đề **Playfair Display** (serif, có đủ dấu tiếng Việt; *DM Serif Display không có bộ chữ tiếng Việt nên không dùng cho chữ có dấu*), nội dung **Be Vietnam Pro**.
- Chuyển động chậm, êm: thẻ hiện bằng cách mờ dần và trượt lên 40 px, số giá đếm lên (outExpo) rồi có vệt sáng lướt qua, ảnh Ken Burns. Không rung giật, trừ con dấu.
- **Đổi màu theo thương hiệu** bằng `timeline.brand`: `dark` → navy, `accent` → vàng, `light` → ngà, `disp` → font tiêu đề, `font` → font nội dung. `name / phone / logo / website` được dùng cho thẻ môi giới.
- Vùng an toàn dọc: nội dung đặt trong y 130–1000; phụ đề mặc định ở top 925.

## Vị trí và cỡ (Studio)
- Mọi thẻ dùng **`x`, `y` (tâm)** và **`size`** (60 = 100 %, 30 = 50 %). Studio kéo thả/đổi cỡ được.
- Module ảnh (`re_gallery` dạng card, `re_compare`) nhận thêm `card:{x,y,w,h}` (góc trên trái) nếu muốn đặt khung chính xác.
- Video ngang (1280×720): bỏ `x/y/size` thì module tự đặt thẻ sang phải (x≈896) và thu nhỏ còn 90 %.
- Mọi scene có `t0, t1`; `keep:true` để không tự mờ ra ở cuối; `hideCaptions:true/false` để ghi đè việc ẩn phụ đề.
- Ảnh: `images:["media/a.jpg", …]` (đường dẫn tương đối theo dự án) hoặc media item (`{src}`, `{seq,fps,count}`). **Thiếu ảnh hoặc ảnh lỗi** thì module tự vẽ nền gradient navy-vàng kèm icon ngôi nhà, nên không bao giờ có ô trống.

## Module

| type | Dùng khi | Tham số chính (mặc định) | Phụ đề |
|---|---|---|---|
| `re_title` | mở đầu, tên dự án | `tag` ("CĂN HỘ 2PN", `false` để ẩn), `name`, `sub` (dòng nghiêng vàng), `address` (có icon ghim), `shade` (nền tối dưới, mặc định bật), `name_size` | ẩn |
| `re_price` | báo giá | `value` ("3,25"), `unit` ("tỷ"), `decimals` (tự tính), `from` (0), `old` (giá cũ, gạch đỏ), `per_m2` ("~ 43 triệu/m²", `false` để ẩn), `ribbon` ("GIÁ TỐT", `false` để ẩn), `ribbon_color`, `label` ("Giá bán"), `count_dur` (1.4) | hiện |
| `re_specs` | diện tích, phòng ngủ… | `title`, `sub`, `cols` (3), `items:[{icon,value,label,cid}]`. Icon có sẵn: `area bed bath compass doc building calendar pin phone house car key money`, hoặc emoji / `si:` / ảnh | hiện |
| `re_map` | vị trí, khoảng cách | `title` ("Vị trí đắc địa"), `pin:{x,y}` (toạ độ trong bản đồ 640×360), `radius_label` ("3 km", `false` để ẩn), `pois:[{time:"5'", text, icon, mx?, my?}]` (mx/my = chấm trên bản đồ), `stagger` (.35) | ẩn |
| `re_amenities` | tiện ích | `title`, `sub` ("6+ tiện ích"), `cols` (3), `items:[{icon:'🏊', label}]` (emoji 3D Fluent), `stagger` | hiện |
| `re_gallery` | ảnh/clip căn nhà | `images[]`, `labels[]`, `per` (giây mỗi ảnh, mặc định chia đều), `xfade` (.5), `mode:'full'` (toàn màn, có thanh tiến trình kiểu story, nhãn phòng góc dưới trái) hoặc `'card'` (+`x,y,size` hoặc `card`, `w`/`h` 560×700), `label_y`, `label_size`, `progress:false` | hiện |
| `re_compare` | thô → hoàn thiện, trước/sau | `images:[trước, sau]`, `labels` (["THÔ","HOÀN THIỆN"]), `keys:[{t,p}]` (t tính từ đầu scene, p = vị trí thanh 0–1; mặc định .94 → .06 → .5), `title`, `w/h` (600×740) | ẩn |
| `re_floorplan` | mặt bằng | `title`, `sub` ("75 m² · 2PN · 2WC"), `image` (ảnh mặt bằng thật) hoặc `rooms:[{n,a,r:[x0,y0,x1,y1]}]` (sơ đồ SVG 600×420 tự vẽ, tường vẽ dần), `pins:[{x%,y%,label}]` (ghim số vàng bật lên), `stagger` | hiện |
| `re_agent` | CTA cuối, liên hệ | `mode` (`'card'` mặc định, `'lower'` = lower-third), `name`, `role`, `phone`, `avatar` (mặc định `brand.logo`, không có thì hiện chữ viết tắt), `zalo:false`, `cta` ("Gọi ngay"), `website`. Nút "Gọi ngay" có vòng sóng lan ra | card: ẩn · lower: hiện |
| `re_stamp` | ĐÃ BÁN / HOT / CHỈ CÒN 2 CĂN | `text`, `sub` (dòng nhỏ phía trên), `color` (tự chọn: đỏ khi chữ có BÁN/HẾT/HOT, còn lại vàng), `rotate` (-9), `dim` (0–1, phủ tối nền), `shake:false`, `grit:false` (tắt vân mực), `paper` (.9) | hiện |
| `re_loan` | trả góp, vay ngân hàng | `price` ("3,25" tỷ), `ltv` (70 %), `rate` (8 %/năm), `years` (20), `title`, `label`, `note`. **Tự tính** khoản trả mỗi tháng theo dư nợ giảm dần, trả đều (annuity): `M = P·r / (1 − (1+r)^−n)`, rồi đếm số lên và vẽ thanh tỉ lệ gốc/lãi | ẩn |

Mọi phần tử con (ô thông số, ô tiện ích, dòng POI, ghim mặt bằng) nhận `cid` để Studio chọn riêng.

## Kiểu phụ đề `realestate`
Dải navy mờ hai đầu, có viền tóc vàng trên và dưới. Chữ trắng Be Vietnam Pro 600, cỡ 30. Từ có `hl` đổi sang **Playfair nghiêng, màu vàng, to hơn 16 %**. Từ hiện dần theo lời nói (`TL.caption_reveal`). Tôn trọng `c.x / y / size / font / color / weight`.

## Recipe (bản đầu tự động) và quy tắc "lời nói → module"
| Lời nói có… | Module | Độ dài |
|---|---|---|
| (0 s) | `re_title` (name = `ctx.title` hoặc "Căn hộ cao cấp") | 2,8 s |
| "phòng ngủ", "diện tích", "mét vuông", "m2" | `re_specs` | 3,2 s |
| "giá", "tỷ" | `re_price` | 3 s |
| "vị trí", "cách", "gần" | `re_map` | 3,6 s |
| "tiện ích" | `re_amenities` | 3,2 s |
| 3,5 s cuối | `re_agent` (card) | đến hết |

Graphic xếp theo thời điểm từ khoá, không chồng lên nhau (cách nhau 0,2 s). Graphic nào không còn đủ 1,6 s trước CTA thì bỏ. Nhạc: `inspire`; với dự án lớn hoặc chủ đầu tư thì đổi sang `corporate`.

Khi tự dựng tay, nên thêm:
- "giá cũ / giảm / chiết khấu" → `re_price` có `old`; "chỉ còn / sắp hết" → `re_stamp` đặt trên thẻ giá (y ≈ 420, size 48).
- "vay / trả góp / ngân hàng hỗ trợ" → `re_loan`.
- "phòng khách, phòng ngủ, bếp…" (lúc đi tour) → `re_gallery` với `labels` đúng tên phòng.
- "bàn giao thô / sau khi hoàn thiện / cải tạo" → `re_compare`.
- "mặt bằng / layout / bố trí" → `re_floorplan`.
- Giữa video, khi người nói xuất hiện lần đầu → `re_agent` `mode:'lower'` trong 3–4 s.
- Từ khoá nên `hl` trong phụ đề: con số (giá, m²), tên dự án, "sổ hồng", hướng nhà.

## Mẹo quay và dựng video môi giới
- **Quay**: dọc 9:16, máy ngang tầm mắt, mặt ở khoảng 1/3 trên khung (y ≈ 400–550) để thẻ ở nửa dưới không che mặt. Nên dùng micro cài áo, ánh sáng cửa sổ chiếu bên mặt.
- **Ảnh căn nhà**: chụp ngang tầm ngực, góc rộng, bật hết đèn, mở rèm. Mỗi phòng 1 ảnh đẹp nhất. Ảnh dọc ≥ 1080×1350 thì Ken Burns không bị vỡ.
- **Thứ tự kể chuyện**: hook (giá hoặc điểm nổi bật) → tiêu đề và địa chỉ → thông số → tour ảnh → vị trí và tiện ích → giá và trả góp → CTA môi giới. Tổng 30–60 s.
- **Con số phải khớp lời nói**: giá, m², số phòng trong module phải đúng lời. Tính `per_m2` bằng giá ÷ diện tích.
- **Pháp lý**: chỉ ghi "Sổ hồng" khi đã có sổ. Thẻ trả góp chỉ để **tham khảo**, nên giữ `note`.
- Gallery toàn màn ẩn video nền nhưng vẫn giữ giọng nói và phụ đề. Mỗi ảnh nên dài 0,6–2 s và khớp nhịp nhạc.

## QC
Ảnh trong `examples/timeline.realestate.json` trỏ tới `media/living.jpg, bedroom.jpg, kitchen.jpg, facade.jpg, raw.jpg`. Bạn cần thay bằng ảnh thật của dự án. Khi QC, các ảnh này là **ảnh placeholder do Python/PIL tự tạo** (phòng gradient vẽ khối đơn giản), không phải ảnh thật. Thiếu file thì module vẫn vẽ placeholder có icon ngôi nhà, và console chỉ báo lỗi tải ảnh (ERR_FILE_NOT_FOUND).
