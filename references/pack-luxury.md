# Gói `luxury` — Tối giản sang trọng

Port phần **giao diện** của skill `video-edit-minimal-luxury` (kiểu edit Iman Gadzhi cho short-form) sang engine HTML. File: `engine/packs/luxury.js`. Ví dụ: `examples/timeline.luxury.json`.
Khung 720×1280 (dọc). Các module toàn khung tự căn theo `DIMS()` nên vẫn dùng được khi xuất ngang, nhưng bố cục được thiết kế cho dọc.

## Diện mạo
| Yếu tố | Chuẩn |
|---|---|
| Màu | trắng `#F5F5F5` · mực `#0C0B0B` · giấy `#F2F2F2` · **một** sắc đỏ `#A8203A` · nâu đỏ `#3A2219` (đĩa) · outro `#0E0E1A`. Không có màu thứ ba |
| Ghi đè | `TL.brand.primary` thay màu đỏ (vòng cutout, thoi, chấm bullet); `brand.font` thay Inter; `brand.name` / `brand.handle` / `brand.logo` cho outro |
| Font | Inter 400–900 (gói tự nạp thêm 300/900). Chữ đậm, letter-spacing âm nhẹ |
| Nền quay | grade ấm hơi tối, vignette, hạt film 10 %, drift phóng chậm 3–5 %, nhảy zoom 1,0 ↔ 1,08 ở ranh giới câu |

### Phụ đề `caption_style: "luxury"`
- Chữ trắng Inter 600, 38 px, bóng mềm; mỗi từ **nảy lên** đúng lúc nói (0,16 s: trồi 8 px, scale 0,92 → 1,08 → 1), chữ cũ giữ nguyên, hết cụm thì cắt.
- Từ có `hl: true` → **hero** 72 px / 800. Từ có chữ số (`2`, `90%`) → **big** 104 px / 700. Khi cụm có hero/big: xếp **stack** (từ thường co 24 px ở trên/dưới, từ nhấn một dòng riêng; hai từ nhấn liền nhau thì chung dòng).
- `w.cls` ép kiểu: `big | hero | sm | muted`. Cụm có `layout`: `row` (không stack) · `stack` · `wide` (28 px / 500, các từ cách xa nhau).
- Vị trí mặc định: ngang ngực = `TL.caption_y` hoặc `face.y + 340` (kẹp 650–1000). Khi có `luxury_pillars` / `luxury_blackout` thì phụ đề tự lên y 640; `luxury_blackout` không có `text` thì phụ đề chuyển sang `wide`; `luxury_diamonds` thì phụ đề xuống dưới hàng thoi. Mọi scene `luxury_*` có `cap_y` sẽ đặt y phụ đề.
- Tôn trọng `c.x / y / size / font / color / weight`, thêm `hl_color`.

## Module
Mọi module có `t0`, `t1`, `hideCaptions?`. Thời gian con (`t` của item) là giây tuyệt đối; `*_at` là giây tính từ `t0`.

### `luxury_frame` — nền cho toàn bài (che video gốc, tự vẽ lại)
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `zooms` | `[{t:t0,s:1}]` | các bước zoom cứng `{t,s}` (1 ↔ 1,08 ở đầu câu) |
| `drift` | .04 | phóng thêm trong mỗi đoạn |
| `pan_x`,`pan_y` | .5, .42 | tâm phóng |
| `grade`,`vignette`,`grain` | bật | `false` để tắt; `grain_opacity` .1, `vignette_opacity` 1 |

### `luxury_zoomblur` — cú nhấn 0,3–0,35 s
Phóng +22 %, nhoè 14 px, tối 45 % ở giữa (hình sin). `strength` (1). Đặt đúng lúc từ hero bật, chỉ khi mặt người đang hiện.

### `luxury_dip` — fade đen hai chiều 0,4 s
Dùng khi vào/ra b-roll hoặc trước outro.

### `luxury_cutout` — chân dung trên nền giấy (toàn khung, ẩn phụ đề)
Trình tự: ảnh hiện → đĩa đỏ nở → bullet trượt vào → cả cụm thu nhỏ → tiêu đề blur-in từng từ → phụ đề.
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `img` | — | PNG đã tách nền (đẹp nhất, đúng mẫu). Không có thì dùng khung A-roll ở `frame_t` (có `TL.aroll.cutouts` → tách nền thật; không có → chân dung tròn đen trắng, đĩa đỏ lệch phía sau) |
| `x`,`y`,`r` | 265 (có bullet) / 360, 520, 185 | tâm và bán kính đĩa đỏ (= đầu) |
| `bullets` | [] | chuỗi hoặc `{text,cid}`; `bullets_pos:{x,y}` |
| `title`,`subtitle` | — | `title_y` mặc định `y + r + 210` |
| `circle_at`,`bullets_at`,`shrink_at`,`title_at`,`subtitle_at` | .5, 1, 2.4, 2.6, 3.3 | nhịp (giây từ `t0`) |
| `shrink_to` | .8 | `shrink_at:false` để không thu |
| `size` | 64 | cỡ tiêu đề gốc (mọi chữ co giãn theo) |
| `frame_t`,`frame_scale`,`focus:{x,y}`,`disc_offset`,`color`,`bg` | | tinh chỉnh |

### `luxury_callout` — hộp viền trắng có icon (ẩn phụ đề)
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `icon` | `chest` | `chest, key, bolt, star, eye, check, money, brain, clock, warn`, hoặc emoji / `si:` |
| `l1`,`l2` | | dòng đậm 38 px / dòng phụ 24 px (`l2:""` để bỏ) |
| `l1_at`,`l2_at` | .4, 1.0 | từng từ cách 0,14 s |
| `x`,`y`,`size` | 360, ngang ngực, 38 | tâm hộp, cỡ dòng 1 |
Hộp bật 0,35 s (scale 0,6 → 1) rồi trôi ±4 px.

### `luxury_pillars` — nền mực, hai đĩa nâu đỏ ở góc, cung trắng có chấm sáng chạy (toàn khung)
`discs:[{x,y,r}]` (mặc định 2 đĩa r300 ở hai góc đối), `disc` (màu), `text` (chữ giữa, khi đó ẩn phụ đề), `size`, `y`, `fade_out` (mặc định cắt cứng). Phụ đề giữ ở y 640.

### `luxury_diamonds` — hình thoi viền đỏ (toàn khung, tối đa 3)
`items` (chuỗi hoặc `{text,t,cid}`; `t` = lúc từ đó được nói), `stagger` (.6), `y` (560), `x`, `size` (190), `gap`, `color`. Phụ đề tự xuống dưới hàng thoi.

### `luxury_blackout` — nền đen chỉ chữ (1–2 s, toàn khung)
Không có `text` → phụ đề chuyển sang `wide` ở y 640 (đúng mẫu). Có `text` → chữ thưa 28 px hiện từng từ (`stagger` .18, `size`, `y`), phụ đề ẩn.

### `luxury_labels` — clip đen trắng viền đỏ phát sáng + nhãn hai dòng hai bên
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `items` | | `{x, y(700), l1, l2, t, align:'l'|'r'|'c', size(40), cid}`; x > 360 tự căn phải |
| `media` | A-roll | ảnh / chuỗi frame b-roll thay nền |
| `outline` | true | có `TL.aroll.cutouts` → viền đỏ bám người; không có → khung đỏ phát sáng lồng trong |
| `dip` | true | mở bằng 0,2 s đen; `bg:false` để chỉ hiện nhãn trên nền hiện tại |
| `drift`, `inset`, `rim` | .05, 34, `rgb(200,30,50)` | |

### `luxury_outro` — thẻ kết (≥ 1,8 s)
Logo chữ 64 px / 900 → thanh handle (bóng xanh/hồng hai mép) mở ra +0,35 s → CTA +0,9 s. `logo` (mặc định `brand.name`), `icon` (hoặc `brand.logo`), `handle` (`brand.handle`), `cta`, `y`, `size`, `bg`.

## Lời nói → module
| Lời thoại có | Dùng |
|---|---|
| Con số, phần trăm | không rời mặt: viết số bằng chữ số trong caption (`2`, `90%`) → tự thành **big** |
| Từ khoá mang thông điệp (3–4 từ/video) | `hl:true` → hero, kèm `luxury_zoomblur` đúng mốc |
| Tên người / thương hiệu / sản phẩm | `luxury_cutout` (title = tên, bullets = 2 đặc điểm) |
| "bí mật", "công thức", "chìa khoá", "lưu ý", "tin sốc" | `luxury_callout` (icon hợp nghĩa) |
| Bắt đầu liệt kê "hai/ba yếu tố", "trụ cột" | `luxury_pillars` → `luxury_diamonds` (mỗi thoi bật đúng lúc từ được nói) |
| Câu kết luận ngắn, mang tính tuyên bố | `luxury_blackout` (phụ đề wide) |
| Khái niệm trừu tượng, cần minh hoạ | `luxury_labels` (b-roll hoặc chính người nói đen trắng) |
| Kết video | `luxury_dip` + `luxury_outro` |

## Nhịp
- Mỗi **3–5 s** phải có một thứ mới bật lên (chữ nhấn, hộp, hoặc đổi cảnh).
- Rời mặt người 35–45 % thời lượng, mỗi cảnh 2,5–5,5 s, **không quá 5,5 s liên tục**; giữa hai cảnh toàn khung nên có 1–2 s mặt người (trừ chuỗi `pillars → diamonds → blackout`).
- Chữ nhấn (hero/big) chỉ ở 15–25 % số cụm, mỗi cụm tối đa một.
- Cụm phụ đề lý tưởng 1–4 từ, 0,6–1,6 s.
- Trong lúc `callout`/`cutout` hiện: không phụ đề (module tự ẩn).
- SFX gợi ý: `whoosh` khi đổi cảnh/dip, `impact` khi zoom-blur/hero, `tick` khi hộp bật, `pop` khi thoi bật, `riser_1s` 1 s trước outro. Nhạc: `mellow` hoặc `corporate`, −11 … −12 dB.

## Không port được
- Tách nền ảnh bằng rembg và rotoscope viền đỏ bám người: engine không tự tách nền. Dùng PNG có sẵn (`img`) hoặc `TL.aroll.cutouts`; nếu thiếu thì gói tự chuyển sang chân dung tròn hoặc khung đỏ phát sáng.
- Tự dò mặt (`face_y.py`): dùng `TL.face` / `TL.caption_y`.
- Bố cục Before/After "POV" (`compare`) và việc tự sinh SFX: không thuộc phần giao diện.
