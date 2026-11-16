# Gói `review` — Review sản phẩm ⭐

File: `engine/packs/review.js` · ví dụ: `examples/timeline.review.json` (~20 s, đủ 11 module) · phụ đề: `caption_style: "review"`.

Dùng cho video review công nghệ, mỹ phẩm, đồ gia dụng, so sánh A vs B, unbox, đánh giá có chấm điểm.

## Phong cách
- Thẻ **gần đen `#0E0E10`** bo 28 px, viền mảnh, đổ bóng sâu, nền mờ (backdrop blur).
- **Xanh điện `#00E08A`** = ưu điểm / thắng / tốt. **Đỏ `#FF4D4D`** = nhược điểm / không nên. **Vàng `#FFE14D`** = tiêu đề nhỏ, giá, từ khoá.
- Chữ **Montserrat 900** cho số, tiêu đề, con dấu. **Be Vietnam Pro 700** cho nội dung. Line-height ≥ 1.25 để dấu tiếng Việt không bị cắt.
- Chuyển động nhanh và dứt khoát: thẻ trượt lên 0,3 s, mục con hiện lần lượt, số đếm lên, con dấu đập xuống rồi rung.
- Khung dọc 720×1280 là chính. Ngang 1280×720 chạy qua `DIMS()`; khi ngang, `size` mặc định còn 82 %.

**Brand kit** (`TL.brand`) ghi đè bảng màu: `dark` → nền thẻ, `good` (hoặc `primary`) → xanh, `bad` → đỏ, `accent` → vàng, `light` → chữ, `muted`, `font`, `disp`. Mỗi scene cũng ghi đè được bằng `good`, `bad`, `hl`, `bg`, `color`, `font`.

## Vị trí chung
Mọi module có `x`, `y` là **tâm** khối (px trong khung thiết kế) và `size` là **tỉ lệ %** (100 = cỡ thiết kế). Studio kéo thả và đổi cỡ trực tiếp. `make()` luôn ghi sẵn x/y/size. Gốc khối và từng mục con (`pros[i]`, `rows[i]`, `shops[i]`, …) đều có `data-cid`.
- Vùng an toàn dọc: y 130–1000. Phụ đề `review` mặc định ở y = 872, nên giữ đáy thẻ ≤ 850.
- `keep:true` thì khối không mờ dần ở `t1` (dùng cho cảnh cuối).
- Mục con nhận `t` riêng (giây tuyệt đối). Nếu không có `t`, mục tự hiện lần lượt theo `stagger`.

## Module

| type | Dùng khi | Tham số chính |
|---|---|---|
| `rv_product` | mở đầu, giới thiệu sản phẩm | `image`, `name`, `brand`, `logo:'si:samsung'`, `price`, `old_price`, `badge:'MỚI'`, `backdrop:'dim'\|'none'`, `spin`, `img_w/img_h`, `name_size` |
| `rv_score` | điểm tổng | `score:8.6`, `max:10`, `stars` (0–5, mặc định score/2, hỗ trợ nửa sao), `label` (mặc định theo điểm), `title`, `color` |
| `rv_proscons` | ưu / nhược | `pros:[…]`, `cons:[…]` (chuỗi hoặc `{text,t}`), `pros_title`, `cons_title`, `title`, `stagger`, `item_size`, `w` |
| `rv_specs_vs` | bảng so sánh A vs B | `a:{name,image,icon}`, `b:{…}`, `rows:[{label,a,b,win:'a'\|'b'\|'',t}]`, `title`, `value_size`, `stagger` |
| `rv_bars` | kết quả test, benchmark | `title`, `unit`, `bars:[{label,value,icon,color,suffix,t}]`, `best:'max'\|'min'\|index\|'none'`, `best_label`, `max`, `decimals`, `note` |
| `rv_verdict` | con dấu kết luận | `verdict:'buy'\|'consider'\|'skip'` → ĐÁNG MUA / CÂN NHẮC / KHÔNG NÊN MUA, `text`, `color`, `sub`, `rotate`, `backdrop:'dim'`, `font_size` |
| `rv_price_compare` | so giá các sàn | `shops:[{shop,icon:'si:shopee',price,note,bg,t}]`, `best` (mặc định: rẻ nhất), `best_label`, `title`, `note` |
| `rv_unbox` | "Trong hộp có" | `items:[{icon:'📱',text,t}]`, `title`, `icon`, `stagger` |
| `rv_coupon` | mã giảm giá | `discount:'15%'`, `discount_label`, `sub`, `code`, `label`, `copy`, `expiry`, `logo`, `shop` |
| `rv_rating_bar` | điểm thành phần | `items:[{label,score,icon,color,t}]`, `max`, `title`, `label_w` |
| `rv_callout` | chỉ vào chi tiết trên sản phẩm/video | `px,py` (điểm chỉ), `x,y` (tâm nhãn), `text`, `sub`, `color`, `w` |

Ghi chú:
- **Ảnh sản phẩm**: nên dùng PNG nền trong suốt (`media/x.png`). Thiếu ảnh hoặc ảnh lỗi thì tự vẽ ô gradient + 📦 (`icon` đổi được emoji).
- **Logo**: `si:<slug>` lấy từ Simple Icons v15. Shopee, TikTok, Apple, Samsung, Xiaomi, Oppo có sẵn. **Lazada, Tiki, Sendo không có** trong Simple Icons, nên khi slug lỗi ô logo tự hiện chữ viết tắt trên màu thương hiệu (có bảng màu cho shopee, lazada, tiki, tiktok, sendo, cellphones, fptshop, thegioididong…). Cũng dùng được emoji hoặc đường dẫn ảnh.
- Giá được tách số để tìm "rẻ nhất" (`12.490.000đ`, `12,9tr`, `399K` đều đọc được). Các giá nên cùng đơn vị.
- `rv_verdict` tự chọn cỡ chữ theo độ dài, nên "KHÔNG NÊN MUA" vẫn nằm trong khung.

## Phụ đề `review`
Chữ trắng Montserrat 900 cỡ 42, viền đen dày + bóng đổ cứng. **Từ đang đọc** đổi sang xanh và phóng 1,1. Từ có `hl:true` nằm trong **ô vàng nghiêng** chữ đen. Phụ đề tôn trọng `c.x/y/size/font/color/weight`. Đặt `TL.caption_reveal = true` thì chữ hiện dần theo lời; mặc định hiện cả cụm.

## Lời nói → module
| Khi người nói… | Đặt |
|---|---|
| tên sản phẩm, "hôm nay review…", "mở hộp…" (0–3 s) | `rv_product` (+ `rv_callout` chỉ vào camera/cổng sạc) |
| "ưu điểm", "điểm cộng", "nhược điểm", "điểm trừ" | `rv_proscons` |
| "so sánh", "so với", "đối thủ", "A hay B" | `rv_specs_vs` |
| "pin", "test", "benchmark", "điểm Antutu", "sạc từ 0 đến 100" | `rv_bars` |
| "thiết kế … điểm", "camera … điểm", chấm từng mục | `rv_rating_bar` |
| "trong hộp có", "phụ kiện", "unbox" | `rv_unbox` |
| "giá", "ở Shopee/Lazada/TikTok", "chỗ nào rẻ" | `rv_price_compare` |
| "mã giảm", "giảm giá", "voucher", "link ở bio" | `rv_coupon` |
| "chấm", "tổng điểm", "mình cho … điểm" | `rv_score` |
| "có nên mua", "kết luận", "chốt lại" | `rv_verdict` |
| chỉ vào một chi tiết ("chỗ này", "cụm camera") | `rv_callout` |

`recipe(ctx)` tự làm như sau: `rv_product` 0–3 s; `rv_proscons` khi nghe "ưu điểm / nhược điểm / điểm cộng / điểm trừ"; `rv_specs_vs` khi nghe "so sánh / so với"; `rv_coupon` khi nghe "mã giảm / giảm giá / voucher". Khối nào trùng giờ thì được lùi ra sau khối trước. Ở 4 s cuối có `rv_score`, và 2,2 s cuối thêm `rv_verdict`. Nhạc là `hype` (video công nghệ điềm đạm thì đổi sang `tech`). Nội dung trong recipe chỉ là chỗ trống, cần điền theo lời thật.

## Cấu trúc video review (30–90 s)
1. **Hook (0–3 s)**: sản phẩm xoay + giá + một câu gây tò mò ("12 triệu mà pin 2 ngày?"). Không chào hỏi dài.
2. **Demo / trải nghiệm**: b-roll dùng thật, `rv_callout` chỉ chi tiết, `rv_bars` cho số liệu test (ghi điều kiện test trong `note`).
3. **Ưu / nhược**: 2–4 ý mỗi bên, ý ngắn ≤ 5 từ. Luôn có nhược điểm.
4. **So sánh** (nếu có): 3–5 hàng, chỉ đánh `win` khi có số liệu.
5. **Chấm điểm + kết luận**: `rv_rating_bar` → `rv_score` → `rv_verdict` kèm `sub` nói *ai nên mua*.
6. **CTA**: `rv_price_compare` / `rv_coupon` + lời kêu gọi follow.

SFX gợi ý: `whoosh` khi thẻ vào, `pop` cho từng mục, `cash_register` cho giá/mã, `boom` khi con dấu đập.

## Review trung thực và dùng logo
- Điểm và kết luận phải khớp với lời nói. Không tô xanh mọi mục, và không giấu nhược điểm. Nếu là bài **tài trợ hoặc có link affiliate**, hãy ghi rõ (ví dụ `note:'Video có link tiếp thị liên kết'` hoặc một dòng chữ trong video), đúng theo quy định quảng cáo.
- Số liệu test phải đo thật và ghi điều kiện. Giá và mã giảm phải đúng tại thời điểm đăng, kèm `expiry`.
- Logo thương hiệu/sàn chỉ dùng để **nhận diện** (đây là sản phẩm gì, bán ở đâu). Không làm như thể thương hiệu đó tài trợ hay xác nhận video, không chế logo, và không dùng logo làm nhận diện kênh. Ảnh sản phẩm nên tự chụp hoặc lấy ảnh press kit được phép dùng.
