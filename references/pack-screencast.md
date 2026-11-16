# Gói `screencast` — Quay màn hình hướng dẫn 🖥️

File: `engine/packs/screencast.js` · Ví dụ: `examples/timeline.screencast.json` (8 s ngang, màn hình mẫu `examples/media/sc_demo/` 60 khung 800×500 @ 7,5 fps, đủ 7 module).
Script: `scripts/screen_focus.py` (tự tìm vùng thao tác → khoá zoom + đoán click).

Dùng cho video **hướng dẫn phần mềm / web / thao tác máy tính**, kiểu Screen Studio: màn hình nổi trong khung trình duyệt trên nền gradient, camera **tự zoom và lia tới chỗ đang thao tác**, vòng click, con trỏ to mượt, phím tắt, chú thích số, face-cam tròn.

## Toạ độ — quan trọng
- Mọi điểm của overlay (`focus`, `clicks`, `cursor.keys`, `callout.at`, `highlight.rect`) dùng **pixel MÀN HÌNH của bản ghi** (`sw × sh`, mặc định 1280×800), **không phải** pixel khung video. Engine tự chiếu qua mức zoom hiện tại của `sc_screen` nên overlay luôn dính đúng nút trên giao diện.
- Có nhiều `sc_screen` thì overlay dùng `screen: '<cid>'` để chọn; bỏ trống = màn hình đang hiện.
- Thời gian là **giây tuyệt đối trên timeline** (giống mọi module khác). `screen_focus.py --offset 3.2` khi bản ghi bắt đầu ở 3,2 s.
- Hàm `SC_MAP(t, x, y, cid?)` (global) trả `{x, y, k, vis}` cho gói khác dùng.

## Look
- Nền **wallpaper gradient** (`aurora` tím-hồng-xanh mặc định, `sunset`, `ocean`, `mint`, `dark`, `brand` = màu thương hiệu, hoặc CSS bất kỳ).
- Cửa sổ bo góc 12 px, đổ bóng sâu, thanh trình duyệt có 3 chấm + ô địa chỉ; hoặc `window` (thanh tối), `device` (laptop), `none` (toàn khung).
- Zoom/pan: mỗi khoá tới đúng `t`, chuyển động **easeInOutCubic 0,8 s** trước đó; có motion-blur nhẹ khi camera lia nhanh. Ngang: zoom cả khung (cửa sổ phóng ra ngoài mép như Screen Studio). Dọc: zoom **bên trong** khung cửa sổ (`zoom_mode:'inside'`) để giữ bố cục màn hình trên – phụ đề – face-cam dưới.
- Chữ UI **Inter**, màu từ `timeline.brand` (`primary` = vòng chú thích / tên, `accent` = vòng click, gạch phụ đề, viền highlight).

## Module

| type | Dùng khi | Tham số chính (mặc định) |
|---|---|---|
| `sc_screen` | nền: màn hình + zoom theo thao tác | `media` (`{seq,fps,count}` chuỗi khung — **giữ khung cuối**, không lặp; hoặc ảnh), `in` (giây nguồn bắt đầu), `sw/sh` (1280×800), `frame` (`browser` / `window` / `device` / `none`), `url`, `title`, `bg`, `focus:[{t,x,y,s,dur}]`, `zoom_mode` (`canvas` ngang / `inside` dọc), `x/y/size` (tâm + cỡ cửa sổ, 60 = 100 %), `bottom` (chừa đáy cho phụ đề, 74), `area_h` (dọc, 600), `radius`, `shadow:false`. Không có `media` → vẽ giao diện app mẫu |
| `sc_click` | vòng click | `clicks:[{t,x,y}]`, `color` (accent), `size` (bán kính 44), `screen`. Hai vòng lan + chấm nhấn, to theo mức zoom; điểm ngoài vùng nhìn thì ẩn |
| `sc_cursor` | con trỏ to mượt | `keys:[{t,x,y,dur}]` (tới điểm đúng `t`, di chuyển .55 s trước đó), `clicks:[t…]` (nhún nhỏ khi bấm), `size` (1.5 ×), `style` (`mac` mũi tên / `dot`) |
| `sc_keys` | phím tắt | `keys` (`"⌘ + K"` hoặc `["Ctrl","Shift","P"]`), `label` ("Mở bảng lệnh"), `theme` (`dark` / `light`), `x/y/size` (mặc định giữa, H−200 ngang / 620 dọc). Phím bật lần lượt rồi cùng "nhấn" xuống |
| `sc_callout` | chú thích bước đánh số | `num`, `text`, `at:{x,y}`, `dx/dy` (lệch bong bóng, tự chọn hướng còn chỗ), `color`, `size`. Chấm đích nhịp thở → đường nét đứt → bong bóng trắng số tròn |
| `sc_facecam` | người nói ở góc | `shape` (`circle` / `rounded`), `corner` (`br` ngang, `bc` dọc; `bl/tr/tl`), `size` (210 ngang / 330 dọc), `x/y`, `zoom` (độ sát mặt, 1.7), `face:{x,y}` (mặc định `timeline.face`), `aspect` (tỉ lệ nguồn, 9/16), `name` (nhãn tên). Dùng `arollImg` nên theo cả `TL.clips` |
| `sc_highlight` | làm tối mọi thứ trừ 1 vùng | `rect:{x,y,w,h}`, `dim` (.6), `pad` (8), `color`, `label`, `radius` |

Mọi module có `cid`.

## Kiểu phụ đề `screencast`
Nền tối bo góc `rgba(14,16,24,.82)` ôm chữ, Inter 600 trắng; từ đang nói có **gạch chân accent** chạy ra. Ngang: neo **đáy 26 px** (xuống dòng không tràn); dọc: top 760 (giữa màn hình và face-cam). Tôn trọng `c.x / y / size / font / color / weight`; từ `hl` màu accent.

## Recipe
`ctx.opts = {screen, sw, sh, focus, clicks, cursor, frame, url, bg, facecam}`:
- `sc_screen` suốt video (`cid:'scr'`) với `opts.focus`;
- `sc_click` / `sc_cursor` nếu có `opts.clicks` / `opts.cursor`;
- `sc_facecam` tròn nếu dự án có A-roll hoặc phụ đề (`opts.facecam:false` để tắt);
- `sc_keys` tại **phím tắt được nói ra**: "control shift p", "command k", "phím tắt Ctrl C"… (Ctrl/Control, Cmd/Command → ⌘, Shift, Alt, Option → ⌥, Enter, Tab, Esc, Space, chữ/số, F1–F12);
- `sc_callout` đánh số ở mỗi lần nói "bước", chỉ vào điểm focus lúc đó;
- nhạc `lofi`, phụ đề `screencast`.

## `scripts/screen_focus.py`
```bash
PY="scripts/.venv/bin/python -I"
$PY scripts/screen_focus.py ghi_man_hinh/frames -o focus.json --fps 30        # thư mục khung jpg/png
$PY scripts/screen_focus.py quay.mp4 -o focus.json --fps 15                    # video: ffmpeg tách khung
#   [--zoom-max 1.8] [--min-dwell 0.45] [--idle 1.6] [--lead 0.15] [--thresh 14] [--offset 0]
```
Kết quả: `{sw, sh, fps, dur, focus:[{t,x,y,s}], clicks:[{t,x,y}], cursor:[{t,x,y}], activity:[{t0,t1,box,big}]}` → chép `focus` vào `sc_screen.focus`, `clicks` vào `sc_click.clicks`, `cursor` vào `sc_cursor.keys` (thêm 1 khoá đầu), `sw/sh` vào `sc_screen`.

Cách làm: khung → xám 320 px → `|khung − khung trước| > thresh` → giãn nở, bỏ vết nhỏ → mỗi khung lấy hộp thay đổi và **thành phần mạnh nhất** (độ tương phản × √diện tích: nút đổi màu thắng viền focus mờ).
- **Đoạn hoạt động**: gom khung có thay đổi; tách đoạn khi có khởi phát mới (sau ≥ 0,15 s yên) ở chỗ khác; phản ứng ngắn (viền focus) mà ngay sau đó có thao tác bên trong (gõ chữ) thì gộp làm một, khoá bắt đầu từ phản ứng.
- **Khoá zoom**: mỗi đoạn có thời gian dừng (tới đoạn sau) ≥ `min-dwell` → 1 khoá, khung hình theo hộp hẹp (bỏ viền rộng cả hàng), `s` = vừa hộp × 2,2 lề, kẹp 1…1,8; khoá tới sớm `lead` s. Thay đổi > 45 % màn (chuyển trang, mở modal) → về toàn cảnh `s=1`. Rảnh > `idle` s → về toàn cảnh.
- **Đoán click**: khởi phát sau ≥ 0,25 s yên, diện tích nhỏ (0,05–12 % màn); bỏ phím gõ đầu tiên ngay sau click cùng hàng và việc gõ vào modal vừa mở; mục tiêu rộng (ô nhập) thì lấy vị trí con trỏ chữ / ký tự đầu gõ vào.
- **Con trỏ**: tới mỗi điểm click sớm 0,35 s.

Thử trên bản ghi tổng hợp (form web 1280×800, 248 khung @ 30 fps, có đáp án): **4/4 click đúng thời điểm (≤ 0,03 s)**, vị trí lệch 0–34 px; khoá zoom: ô tên (0,65 s), ô email (2,85 s), chọn ngân sách (4,1 s), toast kết quả (5,0 s), toàn cảnh khi mở bảng lệnh ⌘K (6,2 s), ô tìm lệnh (6,65 s). Chạy lại ở 7,5 fps (60 khung 800×500) vẫn ra 4/4 click.

## Giới hạn
- Bản ghi có con trỏ hệ thống di chuyển liên tục sẽ tạo "thay đổi" nhỏ khắp nơi → tăng `--thresh` hoặc quay ẩn con trỏ rồi dùng `sc_cursor`.
- Video cuộn trang liên tục (scroll) bị coi là thay đổi lớn → về toàn cảnh; chỉnh khoá tay nếu muốn bám theo.
- Click không làm đổi giao diện (bấm vào vùng trống) không đoán được.
