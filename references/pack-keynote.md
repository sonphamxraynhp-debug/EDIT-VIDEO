# Gói `keynote` — AI Dark Keynote

Port phần **giao diện** từ skill `video-edit-ai-keynote`. File: `engine/packs/keynote.js`. Ví dụ: `examples/timeline.keynote.json` (20 giây, dùng đủ 10 module).
Khung dọc 720×1280. Ở khung ngang, `keynote_frame` có bảng preset riêng; các module khác căn theo `DIMS()`.

## Nhận diện
| Yếu tố | Giá trị |
|---|---|
| Nền | đen ấm `#0F0E0C`, lưới 90px `rgba(150,145,120,.10)`, 2 quầng vàng (trên trái 28%/20%, dưới phải 86%/78%) |
| Vàng chủ đạo | `#F7D33B` (viền, số, nút, dòng đang chọn). Vàng sáng `#FFF160` dùng cho chữ trong nhãn |
| Thẻ | nền `#1F1C13`, viền `rgba(255,241,150,.14)`, bo 14–20px |
| Chữ | trắng kem `#F4F2E5`; đỏ `#FF4D3D` chỉ dùng cho gạch `myth`; chữ trên nền vàng là `#0B0A08` |
| Font | Be Vietnam Pro 500–800 |
| Chuyển động | hiện 0,30s trượt lên 16px (outCubic); tắt 0,22s trượt lên 8px; từng mục con 0,26s trượt 12px, phóng .94→1 |

**Màu thương hiệu:** `brand.primary` thay cho vàng, `brand.accent` thay cho vàng sáng, `brand.dark` thay cho nền, `brand.font` thay cho font. Từng scene cũng nhận `color`, `color2` và `font` riêng.

**Phụ đề `caption_style: "keynote"`:** hiện cả dòng một lần (fade 0,09s) trên tấm nền tối `rgba(9,9,12,.6)` bo 16px. Chữ 44px đậm 700, giãn dòng 1.24, rộng tối đa 610px. Từ `hl` tô vàng. Mặc định `top` = 1010. Nhận các trường `x/y/size/font/color/weight`. Đặt `TL.caption_reveal: true` nếu muốn hiện từng từ.

## Quy ước chung
Mọi module (trừ khung) dùng `x`,`y` làm **tâm** khối và `size` làm cỡ chữ gốc; cả khối phóng to/thu nhỏ theo `size`. `w` là bề rộng khối, mặc định 584 (lề 68). Thêm `keep:true` thì khối không tắt ở `t1`.
Vùng phụ đề nằm ở y 1010–1105, không đặt đồ hoạ vào đây.

## Module
### `keynote_frame` — nền + thẻ video đổi khung
| tham số | ý nghĩa |
|---|---|
| `shots` | `[{t, preset, pan_y?, zoom?, card?}]`. Preset có sẵn: `full, tall, tall-low, hero, hero-low, mid, mini-left, mini-center, mini-right` |
| `morph` | số giây thẻ biến hình sang khung mới, mặc định .35; đặt 0 để cắt cứng |
| `preset`/`card` | dùng khi chỉ có một khung; `card:{x,y,w,h,r}` tính từ góc trên trái |
| `grid`, `glow`, `glows`, `glow_rgb` | chỉnh lưới và quầng sáng (`grid:0` tắt lưới) |
| `drift`, `no_frame`, `enter` | phóng chậm 3% mỗi khung / bỏ viền / `cut` để bỏ hiệu ứng hiện |

Mặt người tự căn theo `TL.face`, trừ khi khung có đặt `pan_y`. Chỗ trống của từng khung: hero 680–1000, hero-low 24–320, tall 24–140, mid 24–420 và 910–1000, mini 24–550 và 850–1000.

### `keynote_tag` — nhãn chương (size 18)
`text`. Viên thuốc viền vàng, chữ in hoa giãn rộng, có chấm nhấp nháy. Dưới 4 từ.
### `keynote_rows` — danh sách thẻ dọc (size 26)
| `items` | `["chữ" | {text, icon}]`, tối đa 5 dòng; mỗi dòng cao 62, cách nhau 8 |
|---|---|
| `stagger` | số giây giữa các dòng, đặt bằng nhịp người nói liệt kê |
| `active` | chỉ số dòng, hoặc `[{t,i}]` để dòng chuyển vàng đúng lúc được nhắc |
| `summary` | `{text, sub?, t?, ghost?}`: viên vàng chốt ý, nằm dưới danh sách |

`icon` nhận icon nét có sẵn: `doc img vid chart clock bolt user shop link check folder phone laptop spark gear alert globe brain up x`. Ngoài ra nhận `si:<slug>`, emoji hoặc đường dẫn ảnh.
### `keynote_chips` — hàng chip (size 20)
`items`, `stagger`, `align`, `mode`:
- `chip`: thẻ thường
- `question`: thêm dấu "?" vàng, dùng cho câu hỏi trong đầu người xem
- `flow`: viên viền vàng nối bằng mũi tên, tối đa 3 mắt, mỗi mắt dưới 3 từ
- `icon`: ô chỉ có icon

### `keynote_bigtype` — chữ lớn / lockup (size 96)
| `kicker` | dòng dẫn nhỏ in hoa |
|---|---|
| `big` | chữ hoặc số lớn màu vàng phát sáng; `count:true` đếm số từ 0 lên (`count_dur`) |
| `sub` | dòng phụ, `|từ|` để tô vàng |
| `big2` | nếu có thì thành **lockup**: `big` chuyển trắng, `big2` vàng phát sáng, kèm gạch chân `rule` (px) tự vẽ |
### `keynote_steps` — lộ trình đánh số (size 17)
`items` (3–4 mục, nhãn ≤ 2 từ), `stagger`. Thanh nối tô dần theo nhịp; bước đang nói có vòng sáng.
### `keynote_chart` — biểu đồ đi lên (size 22)
`kicker`, `label`, `value` (nhãn số hiện khi vẽ gần xong), `data` (mảng số, tự vẽ đường cong mượt), `h` (90), `draw` (1,4s). Chỉ để minh hoạ, không dùng cho số liệu cần chính xác.
### `keynote_gridfill` — lưới ô + đếm số (size 40)
`kicker`, `unit`, `total` (số ô), `count` (số đếm tới), `cols` (9), `draw` (1,6s). Nằm trong thẻ, 2 hàng cao khoảng 120px.
### `keynote_myth` — gạch bỏ hiểu lầm (size 24)
`text` (1 dòng, dưới 8 từ), `strike_at` (đúng giây người nói phủ định), `kicker`, `badge` (mặc định "SAI"; đặt `false` để bỏ). Khi gạch: đường đỏ chạy ngang, thẻ rung nhẹ, chữ mờ đi. **Chỉ dùng 1 lần** trong mỗi video.
### `keynote_cta` — nút kêu gọi (size 31)
`text`, `sub`, `icon` (mặc định `link`). Nút vàng bật vào, nhịp nhẹ, có vệt sáng quét qua. Đặt ở cuối video, `y` ≤ 900.

## Lời nói → module
| Người nói đang… | Dùng |
|---|---|
| nêu con số hoặc lời hứa | `bigtype` (có số thì thêm `count`) |
| gọi tên một nhóm, một chủ đề | `tag`, rồi `rows` ngay bên dưới |
| liệt kê việc làm được / đặc điểm | `rows`, `stagger` khớp nhịp nói, `active` vào ý nhấn |
| chốt lợi ích của cả cụm | `rows.summary` |
| nói về tăng trưởng, rủi ro tăng | `chart` |
| nói về số lượng, nhân bản | `gridfill` |
| phủ định một niềm tin sai | `myth` với `strike_at` đúng giây |
| giới thiệu chương trình / cú chốt lớn | `bigtype` có `big2` (lockup), rồi `steps` |
| mô tả trình tự, nhân quả | `chips` `mode:flow` |
| kể tên công cụ | `chips` `mode:icon` hoặc `rows` có `si:` |
| nêu câu hỏi người xem đang nghĩ | `chips` `mode:question` |
| kêu gọi hành động | `cta` (đi kèm khung `full`) |

Nếu không có khối nào minh hoạ đúng ý đang nói thì để trống, chỉ giữ mặt người và phụ đề.

## Nhịp
- Phụ đề: 0,8–1,3s một dòng, 3–6 từ; 60–80% số dòng có **một** cụm vàng.
- Đổi khung 5–8s một lần, đúng điểm chuyển ý, không đổi giữa câu. Chọn khung theo lượng đồ hoạ: không có đồ hoạ thì `tall`/`full`; một cụm phía dưới thì `hero`; một cụm phía trên thì `hero-low`; cả trên lẫn dưới thì `mid`; đồ hoạ gần kín màn hình thì `mini-*`.
- Mỗi phần tử hiện lệch ≤ 0,3s so với lời; các mục con cách nhau 0,5–1,1s. Một cụm đồ hoạ sống 6–12s rồi thay cụm mới. Luôn tắt cụm cũ **trước** khi đổi khung.
- Luân phiên vị trí đồ hoạ: dưới thẻ, trên thẻ, kín màn hình.

## Recipe tự động
`keynote_frame` đổi khung hero → tall → hero-low… mỗi 6,5s, 3s cuối chuyển `full`. Mở đầu bằng `bigtype` lấy từ khoá vàng đầu tiên. Nếu nghe "không tin / sai lầm / lầm tưởng" thì thêm `myth`. Thêm `chips` cho các từ khoá vàng, và `chart` nếu nghe "tăng / doanh thu / lượt xem / cải thiện". Mỗi graphic chỉ nằm trong một khung và không đè lên nhau. Cuối video là `cta` "THEO DÕI NGAY" kèm `brand.handle`. Nhạc `corporate`.
