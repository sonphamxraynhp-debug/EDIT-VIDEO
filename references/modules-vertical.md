# Module dọc 9:16 (engine/vertical.js)

Khung thiết kế **720×1280** (render ra `width`×`height`, ví dụ 1080×1920 thì engine tự scale). Mọi toạ độ dưới đây tính trên 720×1280. Thời gian tính bằng giây tuyệt đối trên timeline đã cắt.

## Khai báo gốc
```json
{ "width": 1080, "height": 1920, "fps": 30, "duration": 45.3,
  "aroll": { "frames": "work/frames/%05d.jpg", "cutouts": "work/cutouts/%05d.png" },
  "face": { "x": 362, "y": 540 },
  "caption_style": "tiktok", "captions": "work/captions.json" }
```
- `aroll.frames` phải đúng **tỉ lệ 9:16**. Nếu quay ngang, trích frame bằng `-vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280"`.
- `face` là tâm mặt (giữa mắt và mũi) theo toạ độ 720×1280. Lấy tự động bằng `scripts/find_face.py work/frames`. Bubble, PIP và người ở hook đều căn theo điểm này.
- `cutouts` là ảnh người đã tách nền (`segment.py`). Bubble và hook dùng cutout; frame nào thiếu cutout thì tự lấy frame gốc.
- Style gốc **không có phụ đề**. Muốn có phụ đề thì thêm `captions` và `caption_style: "tiktok"` (chữ trắng viền đen, từ đang nói chuyển vàng, đặt ở y≈1010). Các module bố cục tự ẩn phụ đề, trừ khi khai báo `hideCaptions: false`.

## Dòng chữ — `lines[]` (dùng trong hook_card, spotlight, bubble_screen, text)
`{ text, t, out?, style, size, y, x=360, anim, upper?, weight?, italic?, from_y?, from_scale?, hold?, stagger? }`

| style | dùng cho | trông thế nào |
|---|---|---|
| `white` | label, dòng dẫn | trắng, bóng đen cứng |
| `yellow` | hero, từ khoá | vàng `#FCDB36`, bóng đen cứng |
| `ink` | khối chồng trên màn hình ("/humanizer") | vàng, viền đen 3 px |
| `fire` | cảnh báo, phủ định ("KHÔNG VIẾT…") | đỏ cam, viền trắng |
| `glow` | CTA trên camera | vàng phát sáng cam |
| `neon` | từ khoá comment ("GPT") | trắng, quầng xanh lá |
| `dark` | chữ đen trên nền sáng | |

| anim | thời lượng | khi nào dùng |
|---|---|---|
| `pop` | 0.28 s | mặc định, từ khoá đơn |
| `slide_l` / `slide_r` | 0.35 s | dòng tiêu đề, label |
| `tumble` | 0.06 s/ký tự | hero to (DÒ AI, CỰC ĐỈNH) |
| `fly` | 0.25 + hold + 0.22 s | dòng 2 của hook: bật ở `from_y`, rồi bay về `y` |
| `blur_zoom` | 0.35 s | CTA, câu chốt |
| `drop`, `fade`, `type` | | biến thể |

Chữ hoa được giữ nguyên như khi gõ. Thêm `upper:true` để ép thành chữ hoa.

## Bố cục

### `hook_card` (A, 0–2 s đầu)
`{ type, t0, t1, screen, card?, card_t?, speaker?:{dy=450,z=1}, lines }`
Thẻ trắng bo góc ở trên (x50 y78, 620×407, r38), người tách nền đặt thấp xuống `dy` px, và 2 dòng tiêu đề ở y≈548/602. Nền là lưới đỏ.

### `bubble_screen` (B, đoạn hướng dẫn)
`{ type, t0, t1, enter:"drop"|"push_up"|"fade"|"zoom"|"cut", screen, card?:{x,y,w,h}, bubble?:{cx,cy,d,z,bg}, bubble_t?, lines?, sticker? }`
Nền lưới, bubble vàng tâm (360,315) d=275, thẻ màn hình (8,545) 704×455 viền đen. Chữ chồng lên nên đặt ở y 730–910.

### `spotlight` (C, câu móc / nhấn mạnh)
`{ type, t0, t1, blur=16, pip?:{cx,cy,d,z}, pip_t?, lines, sticker? }`
Camera bị làm mờ, camera tròn sắc nét ở trên (360,330) d=310. Label ở y≈610, hero ở y≈685, sticker ở y≈960.

### `grid_bg`
Nền lưới trơn, dùng cho cảnh chỉ có chữ.

## Nội dung thẻ — `screen`
- `{ "media": "rec.mp4 frames" | {"seq":"rec/%05d.jpg","fps":30,"count":900,"t0":5.2}, "fit":"cover", "pos":"50% 0%" }`: bản quay màn hình thật. Trích frame bằng `ffmpeg -i rec.mp4 -vf scale=704:-1 rec/%05d.jpg`.
- `{ "chat": { font, placeholder, input:{text,t0,t1}, messages:[{role:"user"|"ai", t, text, cps, note}] } }`: **giao diện chat dựng sẵn** (giao diện chung, không sao chép sản phẩm nào). Phần input gõ từng chữ, tin nhắn AI hiện dần theo `cps` ký tự/giây và khung tự cuộn xuống. Hỗ trợ `**đậm**` và dòng bắt đầu bằng `- ` để làm gạch đầu dòng.
- `{ "broll": { template|id, pal, text, num, unit, items } }`: dùng bất kỳ preset nào trong **9.080 b-roll** (`node scripts/broll.mjs search "câu"`), hiển thị co vừa thẻ.
- `pan`: `[{t, s, x, y, ease?}]` phóng to vào vùng đang nói (x/y tính theo % điểm hội tụ). Ví dụ: `{t:10.4, s:1.18, x:20, y:60}`.

## Chi tiết
- `icon_tap` `{ t0, t1, icon:"si:openai"|"logo.png"|"🤖", size=200, x, y=985, taps:[.5,1.0], hand?, color:"#fff"|"#000", stroke }`: logo kèm bàn tay pixel bấm. `si:<slug>` lấy icon từ Simple Icons (CC0, hơn 3.000 thương hiệu). Logo được vẽ trắng, viền đen.
- `sticker` (hoặc `sticker:{}` gắn trong spotlight/bubble_screen) `{ src, t, from:"left"|"right"|"up"|"down"|"pop", size=320, x, y, outline=7|0, bob }`: `src` là PNG hoặc emoji. Với PNG đã tạo bằng `make_sticker.py` thì đặt `outline:0`, vì ảnh đã có viền trắng sẵn.
- `text` `{ t0, t1, lines }`: chữ tự do trên mọi bố cục, kể cả camera thường.
- `follow_cta` `{ t0, t1, keep, label:"Follow", y=858, keyword:{text:"GPT", t} }`: nút Follow mở ra kèm dấu ✓, sau đó từ khoá neon bật lên.
- Hiệu ứng `fx` dùng chung với engine ngang (`punch`, `shake`, `whip`, `glitch`, `flash`, `blur_in`, `zoom_in`). Style gốc chỉ dùng `punch` amp 0.06 khi vào spotlight.

## Tài sản
- `scripts/make_sticker.py frame.jpg out.png --disc "#FFD84A" --emojis "📈,🎵,💰"` tạo sticker die-cut từ chính người nói (tách nền, thêm viền trắng, đĩa màu phía sau, emoji 3D xung quanh). Thay cho sticker hoạt hình AI trong video mẫu.
- Emoji 3D (1.524), b-roll (9.080), SFX (191), nhạc (20) dùng chung với engine ngang. Xem `broll-library.md` và `sound-library.md`.
