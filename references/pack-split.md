# Gói `split` — Chia đôi màn hình 🪟

File: `engine/packs/split.js` · ví dụ: `examples/timeline.split.json` (~20 s, đủ 6 module, nguồn thứ hai là chuỗi frame `media/split_clip/%03d.jpg`) · phụ đề: `caption_style: "split"`.

Dùng cho video người nói kèm một nguồn thứ hai: quay màn hình, clip gốc đang bình luận (reaction), b-roll, ảnh minh hoạ, so sánh hai thứ.

## Phong cách
- Nền khe **gần đen `#0B0D12`**, một **đường chia phát sáng** màu `accent` (mặc định vàng `#FFD84A`), chip nhãn kính mờ chữ **Montserrat 800** in hoa.
- **Người nói thu nhỏ từ toàn khung vào ô của mình** (0,55 s) trong khi nguồn kia trượt vào từ mép đối diện; lúc kết thúc thì phóng ngược lại về toàn khung. Vì ở toàn khung ô người nói trùng khít với video gốc, đoạn chia đôi nối liền với đoạn chỉ có người nói, không cần chuyển cảnh.
- Mặt người nói được giữ ở khoảng 40–45 % chiều cao ô, theo `TL.face` (đổi bằng `speaker:{fx, fy, zoom}`).
- Khung dọc 720×1280 là chính. Ngang 1280×720 cũng chạy được (`split_side`, `split_pip`, `split_compare` dạng trái/phải, `split_focus` ngang).

**Brand kit** (`TL.brand`): `accent` → đường chia + chip, `primary` → màu nhãn A, `good` → màu nhãn B, `dark` → nền khe, `disp` → font nhãn. Mỗi scene ghi đè được bằng `color`, `color_a`, `color_b`, `bg`, `font`.

## Nguồn (source)
Mọi chỗ nhận nguồn (`a`, `b`, `src2`) đều dùng chung định dạng:

| Giá trị | Nghĩa |
|---|---|
| `'speaker'` hoặc `{speaker:true, zoom, fx, fy, fpy, filter}` | người nói (track chính, có cắt/tốc độ/màu của clip) cắt vừa ô |
| `"media/x.jpg"` | ảnh |
| `{seq:"media/clip/%03d.jpg", fps, count, t0}` | chuỗi frame (video đã tách khung). `t0` = giây tuyệt đối mà frame 1 bắt đầu, hết `count` thì lặp |
| `{media, fit:'cover'\|'contain', pos:'50% 50%', kb:false, filter}` | ảnh/chuỗi có tuỳ chọn. Mặc định có Ken Burns phóng nhẹ 6 % |
| `{screen:{broll:{…}}}` / `{broll:{id:'ai--neural--ember'}}` | b-roll động: `id` theo catalog `chủ-đề--template--bảng-màu`, hoặc `template`, `pal`, `text`, `sub`, `icon`. Gói tự **cover-fit** b-roll vào ô (không viền đen) |
| `{screen:{chat:{…}}}` / `{screen:{media}}` | giao diện chat hoặc media như `media_card` |
| `{color:'#123'}` | màu trơn |

Với `split_stack/side/pip/focus`, nguồn thứ hai lấy theo thứ tự `src2` → `screen` → `media` (+ `fit`, `pos`, `kb`) → b-roll `ai--neural--ember` mặc định.

## Module

| type | Dùng khi | Tham số chính |
|---|---|---|
| `split_stack` | chia **trên / dưới**: màn hình ở trên, người nói ở dưới | `speaker_pos:'bottom'\|'top'`, `ratio` (phần của người nói, 0,25–0,75, mặc định 0,5), `media`/`screen`/`src2`, `fit`, `pos`, `label`, `speaker_label`, `speaker:{zoom,fx,fy}`, `gap` (độ dày đường chia, 6), `dock` (phụ đề bám đường chia, true) |
| `split_side` | chia **trái / phải** (đẹp nhất ở 16:9) | `speaker_side:'left'\|'right'`, `ratio`, nguồn thứ hai, `label`, `speaker_label` |
| `split_pip` | nguồn thứ hai **toàn khung**, người nói trong **khung nhỏ ở góc** | `corner:'tr'\|'tl'\|'br'\|'bl'` (dọc mặc định `tr`, ngang `br`), hoặc kéo `x`,`y` (tâm khung), `size` (%), `shape:'round'\|'circle'`, `aspect` (cao/rộng), `ring` (màu viền), `label`, `speaker_label` (chip có chấm nhấp nháy, ví dụ `LIVE`) |
| `split_compare` | **A vs B**: hai nguồn bất kỳ, nhãn màu + huy hiệu **VS** trên đường chia | `a`, `b`, `label_a`, `label_b`, `layout:'stack'\|'side'` (dọc mặc định stack), `ratio`, `vs:false`, `vs_text`, `color_a`, `color_b` |
| `split_focus` | hai ô **đổi tỉ lệ** theo nhịp nói (70/30 ↔ 30/70); ô nhỏ tối đi một chút, nhãn ô lớn chuyển sang nền đặc | `axis:'v'\|'h'`, `speaker_pos`, `keys:[{t, v, dur}]` (v = phần của người nói, 0,2–0,8; `t` là giây tuyệt đối; mặc định 50 → 70 → 30), nguồn thứ hai, `label`, `speaker_label` |
| `split_label` | chip nhãn rời: hook, CTA, "Đây là…" | `text`, `icon` (emoji / `si:` / ảnh), `x`, `y`, `size`, `color`, `solid`, `dot` (mặc định true khi không có icon), `align:'center'\|'left'\|'right'`, `font_size`, `upper:false` |

Nhãn (`label`, `speaker_label`, `label_a`, `label_b`) nhận chuỗi hoặc `{text, icon, color, solid, dot, cid}`. Chip đặt ở góc trên-trái của ô, luôn nằm trong vùng an toàn dọc (y ≥ 140).

Ghi chú:
- Các module chia đôi đều trả về lớp `back` phủ kín khung, nên chữ, sticker và phụ đề vẫn nằm trên. Không cần `cover`.
- `keep:true` thì không phóng ngược về toàn khung ở `t1` (dùng cho cảnh cuối).
- Khi ngang mà footage là video dọc, ô người nói sẽ cắt sát mặt. Nên đặt `TL.face` đúng toạ độ khung thiết kế ngang, ví dụ `{x:640, y:250}`.

## Phụ đề `split`
Thanh kính tối bo tròn, chữ trắng **Montserrat 800** cỡ 36 (ngang 34). **Từ đang đọc** đổi sang màu `accent` và có gạch chân chạy. Từ `hl` nằm trong ô `accent` chữ đen. Mặc định ở y = 862 (dọc) hoặc 560 (ngang). Khi có `split_stack` (hoặc `split_focus` dọc), phụ đề **tự trượt lên nằm đè đúng đường chia**, không che mặt ở ô dưới và không che nội dung ô trên. Nếu đặt `c.y` thì phụ đề nằm cố định ở đó. Phụ đề tôn trọng `c.x/y/size/font/color/weight`.

## Lời nói → module
| Khi người nói… | Đặt |
|---|---|
| "nhìn nè", "các bạn xem", "thấy chưa" | `split_stack` (dọc) / `split_side` (ngang), có nhãn "Nhìn nè" |
| "đây là…", "như thế này", "cái này" | `split_pip`: đưa thứ đang nói lên toàn khung, người nói lui vào góc |
| "ví dụ", "chẳng hạn" | `split_stack` hoặc `split_focus` (nhấn vào ví dụ: v = 0,3) |
| "so sánh", "so với", "A hay B", "trước / sau" | `split_compare` |
| đang giải thích rồi chỉ vào màn hình, và ngược lại | `split_focus` với `keys` khớp lúc chuyển ý |
| câu hook đầu video, CTA cuối | `split_label` |

`recipe(ctx)`: `split_label` hook 0,25–2,4 s (`ctx.title` hoặc "Xem đến cuối nhé"). Sau đó tìm các từ "so sánh / so với", "ví dụ / chẳng hạn", "đây là / như thế này / cái này", "nhìn / xem / thấy", cộng thêm 3 nhịp dự phòng ở 18 %, 45 %, 70 % thời lượng (chỉ khi không có từ khoá nào gần đó). Từ đó đặt tối đa 4 đoạn chia đôi dài 3,6–4 s, **xen kẽ** với ít nhất 1,6 s chỉ có người nói. "So sánh" thì dùng `split_compare`, còn lại xoay vòng `split_stack` → `split_pip` → `split_focus` (ngang: `split_side` → `split_pip` → `split_focus`). Cuối video là `split_label` CTA (`brand.handle` hoặc "Theo dõi để xem phần 2"). Nguồn thứ hai là `ctx.media` nếu có, không thì b-roll `ctx.broll` / `ai--neural--ember`. Nhạc là `tech`.

## Mẹo dựng
- Quay màn hình dọc thì dùng `split_stack` với `fit:'contain'` hoặc `pos` để giữ phần quan trọng. Clip ngang trong khung dọc thì dùng `fit:'cover'` và `pos:'50% 50%'`.
- Reaction/bình luận clip người khác: `split_pip` (clip toàn khung) hoặc `split_stack`. **Chỉ dùng clip bạn có quyền dùng** (của mình, được cấp phép, hoặc trích ngắn có bình luận theo đúng chính sách nền tảng), và ghi nguồn bằng `label`.
- SFX gợi ý: `whoosh` khi chia, `pop` khi chip hiện, `swoosh` lúc `split_focus` đổi tỉ lệ.
