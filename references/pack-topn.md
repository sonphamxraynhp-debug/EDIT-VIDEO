# Gói `topn` — Top N / đếm ngược 🏆

File: `engine/packs/topn.js` · ví dụ: `examples/timeline.topn.json` (20,2 s, "Top 5 điểm đến Việt Nam", đủ 7 module, ảnh mẫu `media/top_*.jpg`) · phụ đề: `caption_style: "topn"` · nhạc gợi ý: `hype` (đếm ngược sôi động), `epic` (xếp hạng "khủng").

Dùng cho video **listicle**: Top 5 món ăn, Top 3 app, Top 10 điểm đến, "5 sai lầm…", bảng xếp hạng sản phẩm. Cảm giác: nhanh, dứt khoát, có màu theo hạng.

## 1. Nhận diện
| Thành phần | Mặc định | Ghi đè |
|---|---|---|
| Màu theo hạng | #1 vàng `#FFC83D`, #2 bạc `#D9E1EC`, #3 đồng `#E8894B`, #4 xanh ngọc `#4FD3EA`, #5 tím `#B793FF`, hạng >5 dùng `brand.primary` | `scene.color`, `TL.brand.ranks = {"1":"#…"}` |
| Vàng chủ đạo (title, phụ đề) | `#FFC83D` | `brand.accent` |
| Số hạng | Anton (gói tự nạp từ Google Fonts) | — |
| Chữ tiếng Việt | Be Vietnam Pro 800–900 | `brand.font` |
| Nền thẻ | kính tối `rgba(26,28,40,.94)` + viền màu hạng | — |

Khung dọc 720×1280 là chính; mọi module tự đổi bố cục khi khung ngang 1280×720 (`DIMS()`). Thẻ mục neo **mép dưới** ở y=985 (dọc), nên nằm gọn trong vùng an toàn y 130–1000.

## 2. Module
Tham số chung: `t0, t1, x, y, size, keep, hideCaptions`. Gốc mỗi module có `data-cid`; từng dòng của `top_recap` cũng có cid nếu `items[]` có `cid`.

| type | Dùng khi | Tham số riêng |
|---|---|---|
| `top_title` | 0–2,5 s: thẻ mở đầu "TOP 5" | `count` (số khổng lồ, mặc định 5), `title` (dải ruy băng), `sub`, `kicker`='TOP', `color`, `title_size`. Nền tối + tia sáng xoay, số đập vào có rung + loé |
| `top_number` | đúng lúc nói "số 3 / thứ ba" | `rank`, `name` (viên thuốc trắng dưới số), `hold`=1,15 s (thời gian số đứng giữa), `corner`='tl'\|'tr', `bx/by` (vị trí huy hiệu), `badge_name:false` (huy hiệu không kèm tên). Số đập vào giữa (rung, loé, vòng sóng), rồi thu nhỏ bay về góc thành huy hiệu vuông màu hạng tới hết `t1`. Ẩn phụ đề chỉ trong lúc số đứng giữa |
| `top_item` | ngay sau số hạng, mô tả mục | `rank`, `name`, `reason` (1 dòng lý do), `image` (đường dẫn/media item) **hoặc** `emoji`/`icon` (`si:…`), `price` (chip màu hạng), `score` (sao + "9.1/10"; >5 tự hiểu thang 10, đổi bằng `max`), `kicker` (mặc định "Hạng N", `''` để bỏ), `w`, `img_size`, `compact:true` (ảnh 130 px và **giữ phụ đề**, phụ đề tự nhấc lên ngay trên thẻ). Thẻ thường ẩn phụ đề |
| `top_progress` | cả phần đếm ngược | `count`, `marks:[{rank,t}]` (thời điểm từng hạng xuất hiện, giây tuyệt đối), `current` (đặt cứng), `names:{rank:tên}` (nhãn cạnh hạng đang nói), `side`='right' (dọc) / 'left' (ngang), `gap`. #1 ở trên cùng, hạng đã qua có ✓, hạng chưa tới vòng nét đứt, đường ray tô màu tới hạng hiện tại |
| `top_podium` | công bố #1 | `name`, `reason`, `image`/`emoji`, `second`, `third` (tên trên bục 2 và 3), `kicker`='TOP 1', `crown:false`, `confetti` (số mảnh, mặc định 90), `img_size`. Bục 3-2-1 mọc lên, ảnh #1 bật ra có loé, vương miện, pháo giấy, tia vàng. Ẩn phụ đề |
| `top_recap` | 3 s cuối | `items:[{rank,name,image?,emoji?,note?}]` (tự sắp #1 lên đầu), `title`, `kicker`='TỔNG KẾT', `w`, `row_h`, `stagger`=0,14 s. Ẩn phụ đề |
| `top_badge` | huy hiệu góc suốt video | `label`='TOP 5', `title`, `corner`='tr'\|'tl', `marks:[{rank,t}]` (có thì huy hiệu lật sang "#n" theo hạng đang nói), `names`, `color` |

Ghi chú bố cục dọc: `top_number` để huy hiệu góc trái trên (92,196), `top_badge` ở góc phải trên (y=150), `top_progress` ở mép phải giữa khung (y 320–620). Ba thứ này không chồng nhau. Khi dùng `top_badge` có `marks` cùng với `top_number` thì cùng một hạng hiện hai lần; recipe chỉ dùng `top_badge` dạng tĩnh "TOP 5 + tiêu đề".

## 3. Phụ đề `topn`
Be Vietnam Pro 900, **VIẾT HOA**, chữ trắng viền đen dày, cỡ 44 (dọc) / 40 (ngang). Từ đang nói nằm trong khối vàng (`color_hi`, mặc định `brand.accent`), nghiêng nhẹ, nảy lên. Từ `hl` có màu vàng. Mặc định `top: 880` (dọc) / 590 (ngang), rộng 600 px. Khi có `top_item` dạng `compact` (hoặc `hideCaptions:false`), phụ đề tự neo **ngay trên thẻ**. Chỉnh được `x, y, size, font, color, weight, color_hi`.

## 4. Lời nói → module (recipe)
| Nghe thấy | Đặt module |
|---|---|
| 0–2,5 s | `top_title` (`count` = số sau chữ "top" nếu có nói "top 5/top 10", không thì 5; `title` = tiêu đề dự án) |
| "số 3", "top 3", "hạng 3", "hạng ba" | `top_number` rank 3 đúng lúc nói, rồi `top_item` (compact) từ +1,2 s tới mục kế tiếp |
| "thứ nhất / đầu tiên", "thứ hai"…, "cuối cùng" | thứ tự nói → hạng **đếm ngược**: mục nói đầu tiên là #N, "cuối cùng" là #1 |
| mục #1 còn ≥ 2,4 s | `top_podium` thay cho số + thẻ |
| suốt phần giữa | `top_badge` (TOP N + tiêu đề) + `top_progress` (theo `marks`), dừng lúc bục #1 xuất hiện |
| 3 s cuối | `top_recap` với tên các mục |

Không tìm thấy từ thứ tự nào thì recipe chia đều N mục từ 2,5 s tới (cuối − 3 s). Tên mục lấy 4 từ đầu sau từ thứ tự, lý do lấy từ câu nói tiếp theo; **nên sửa lại tên, ảnh và lý do cho đúng nội dung**.

## 5. Mẹo dựng tay
- Mỗi mục: `top_number` (t → mục kế) + `top_item` (t+1,2 → mục kế). Đặt SFX `whoosh`/`impact` đúng `t` của số hạng, `stinger_happy` hoặc `shimmer` khi bục #1 bật ảnh (t0 + 0,85 s).
- Ảnh mục nên vuông ≥ 400 px. Không có ảnh thì dùng `emoji` (emoji 3D Fluent) hoặc `icon:"si:<slug>"`.
- Ảnh trong `examples/timeline.topn.json` là **ảnh placeholder vẽ bằng PIL** (`media/top_halong.jpg, top_dalat.jpg, top_hoian.jpg, top_sapa.jpg, top_phuquoc.jpg`), không phải ảnh thật.
