# Gói `course` — Khoá học / bài giảng 🎓

File: `engine/packs/course.js` · Ví dụ: `examples/timeline.course.json` (20 s, dùng 10/11 module + phụ đề `course`).

## Phong cách
- **Giảng viên cao cấp, đáng tin**: thẻ trắng bo 20–22 px, bóng mềm, chữ đậm tương phản cao.
- Màu lấy từ brand kit (`TL.brand.primary / accent / dark`). Mặc định của gói: xanh đậm `#2B59FF` + vàng `#FFC83D`, chữ mực `#0E1A3A`.
- Font: **Lexend** (tiêu đề, số, nút) + **Be Vietnam Pro** (nội dung). Code dùng **JetBrains Mono** (gói tự chèn link Google Fonts; nếu chưa tải kịp thì dùng monospace hệ thống). Ghi đè bằng `brand.disp` / `brand.font`.
- Chèn `*từ khoá*` vào text của keypoint / steps / term / board / chapter để **tô dạ quang** (vàng accent, vẽ dần).
- Bố cục **split** (mặc định cho quiz, steps, term, code): video người nói thu lại thành thẻ bo góc ở trên (y 196–576), nội dung là thẻ trắng ở dưới (y 600–990), nền xanh nhạt chấm bi. Các cảnh split nối tiếp nhau (t1 cảnh trước = t0 cảnh sau) **không phóng to/thu nhỏ lại** video giữa chừng mà chỉ đổi thẻ. `layout:"overlay"` để đặt thẻ đè lên video.
- Vùng an toàn dọc: mọi thứ nằm trong y 130–1000 (thanh tiến độ ở 126–178, phụ đề từ 868).
- Ngang (1280×720): mọi module tự đổi bố cục qua `DIMS()` (split = video trái, thẻ phải; phụ đề y 626).

## Phụ đề `caption_style: "course"`
Chữ trắng Be Vietnam Pro 700 trong viên thuốc nền tối mờ (`rgba(9,14,34,.84)`), mỗi dòng một viên. **Từ đang nói** có ô màu primary (chữ trắng); từ `hl` màu accent (đang nói thì ô accent chữ mực). Từ chưa nói mờ 62 % nên dòng không nhảy. Tôn trọng `c.x / y / size / font / color / weight`, thêm `c.bg` để đổi nền. Mặc định dọc: top 868, cỡ 34.

## Module

### `course_chapter` — thẻ chương / bài
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `num` | `"BÀI 1"` | huy hiệu (số trong đó thành số lớn mờ phía sau) |
| `title` | — | tiêu đề, `*từ*` = tô màu accent |
| `subtitle` | `""` | dòng phụ |
| `cover` | `true` | `true` = phủ toàn khung nền primary (ẩn phụ đề); `false` = thẻ trắng đè lên video |
| `x, y` | 60 / 47 % H (cover) · 360 / **200 = mép trên** (overlay) | vị trí |
| `size` | 66 | cỡ tiêu đề (tự thu nhỏ để ≤ 3 dòng) |
| `w` | 640 | rộng thẻ overlay |
Vào: quét từ trái, huy hiệu bật, tiêu đề trượt lên, gạch vàng chạy. Ra (cover): kéo màn lên lộ video.

### `course_progress` — thanh tiến độ bài
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `idx`, `total` | 1, — | "BÀI idx/total" |
| `title` | — | tên bài (tự cắt "…") |
| `from`, `to` | 0, 1 | phần trăm đầu/cuối, chạy đều theo thời lượng cảnh |
| `x, y, w` | 360, 152 (tâm), 640 | vị trí |

### `course_keypoint` — Ghi nhớ / Lưu ý
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `kind` | `remember` | `remember` 📌 GHI NHỚ (primary) · `note` 💡 LƯU Ý (accent) · `warn` ⚠️ CHÚ Ý (đỏ) · `tip` ✨ MẸO (xanh lá) |
| `text` | — | nội dung, `*từ*` tô dạ quang |
| `key_t` | `t0` | thời điểm bật ra (đặt đúng lúc nói từ khoá) |
| `label, icon, color` | theo kind | ghi đè |
| `x, y, w, size` | 360, 770 (tâm), 640, 32 | vị trí, cỡ chữ |

### `course_steps` — các bước
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `steps` | — | `[{text, t, cid?}]` (hoặc chuỗi → tự cách 0,8 s). Bước hiện ở `t` của nó; bước hiện tại tô nền primary nhạt + vòng sáng; bước trước thành ✓ xanh và mờ |
| `title` | — | tiêu đề thẻ + bộ đếm "2/3" |
| `layout` | `split` | hoặc `overlay` |
| `card` | `{x:40,y:600,w:640,h:390}` | khung nội dung |
| `size` | tự | cỡ chữ bước |
| `video` | `{x:40,y:196,w:640,h:380}` | khung video khi split |

### `course_quiz` — trắc nghiệm
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `question` | — | câu hỏi |
| `options` | 4 đáp án | A–D, lưới 2×2 |
| `correct` | 0 | chỉ số đáp án đúng |
| `reveal_t` | `t1 − 1.2` | lúc lộ đáp án: đúng → xanh lá ✓, sai → mờ 45 % |
| `size`, `opt_size` | 30, 23 | cỡ câu hỏi / đáp án |
| `layout, card, video` | như steps | |
Vòng đếm ngược (giây còn lại) chạy từ `t0+0.6` tới `reveal_t`, đổi đỏ ở 1/3 cuối.

### `course_term` — thẻ thuật ngữ
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `term` | — | thuật ngữ (to, màu primary, ≤ 1 dòng tự co) |
| `en` | — | phiên âm / tiếng Anh (nghiêng, xám) |
| `tag` | `📘 THUẬT NGỮ` | nhãn |
| `definition` | — | định nghĩa, `*từ*` tô dạ quang |
| `example` | — | hộp "Ví dụ:" (tuỳ chọn) |
| `size, def_size` | 58, 27 | |

### `course_code` — code / công thức
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `code` | — | nhiều dòng bằng `\n` |
| `cps` | 32 | ký tự/giây (gõ máy chữ, con trỏ vàng nhấp nháy) |
| `delay` | 0.45 | trễ trước khi gõ |
| `title`, `lang` | `main.py`, `PYTHON` | thanh tiêu đề editor |
| `hl_line`, `hl_t` | —, gõ xong + 0.2 s | dòng (đếm từ 1) được tô vàng |
| `caption` | — | dòng giải thích dưới code |
| `size` | tự (≤ 24) | cỡ chữ code |
Tô màu cú pháp đơn giản: từ khoá, chuỗi, số, comment, tên hàm. Công thức toán cứ viết thẳng vào `code` (vd `S = v × t`) với `lang:"CÔNG THỨC"`.

### `course_annotate` — khoanh / gạch / mũi tên vẽ tay
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `shape` | `circle` | `circle` (vòng tay, vẽ lố 1,1 vòng) · `underline` (gạch đôi lượn) · `arrow` · `box` |
| `x, y, w, h` | tâm khung, 300×200 | **tâm** và kích thước vật cần chỉ (toạ độ thiết kế 720×1280) |
| `flip` | false | arrow: mặc định đi từ góc dưới-trái → đầu mũi ở góc trên-phải; `flip` đảo trái/phải |
| `bend` | 0.25 | độ cong mũi tên |
| `color`, `stroke`, `dur` | accent, 8, 0.55 | màu, độ dày, thời gian vẽ |
| `label`, `size`, `tilt` | —, 30, −4° | nhãn dạng chip (trên vòng, dưới gạch, ở đuôi mũi tên) |

### `course_instructor` — lower-third giảng viên
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `name` | `brand.name` / "Giảng viên" | |
| `role` | "Chuyên gia đào tạo" | chức danh, có dấu ✓ xác thực |
| `avatar` | `brand.logo` / 👨‍🏫 | ảnh (cắt tròn), emoji hoặc `si:slug` |
| `logo` | — | ô logo nhỏ bên phải |
| `x, y, size` | 40 (mép trái), 790 (tâm), 96 | |
Vào: avatar bật, thẻ mở rộng sang phải, gạch gradient chạy. Ra: trượt trái.

### `course_cta` — đăng ký khoá học
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `course` | — | tên khoá |
| `tag` | `KHOÁ HỌC ONLINE` | chip trên |
| `old_price`, `price` | 2.990.000đ, 1.490.000đ | giá cũ bị gạch đỏ (vẽ dần) → giá mới to; tự tính chip "−50%" |
| `countdown` | 86352 | số giây còn lại tại `t0` → "⏰ Còn 23:59:12" đếm lùi theo t; `false` để ẩn |
| `button` | `ĐĂNG KÝ NGAY` | nút vàng có ánh quét + nhịp đập |
| `phone`, `website` | brand | dòng liên hệ |
| `blur_bg` | true | nền = video mờ tối (ẩn video gốc); `false` = thẻ đè lên video |
| `x, y, w` | 360, 600 (tâm), 620 | |

### `course_board` — bảng trắng + camera tròn
| tham số | mặc định | ý nghĩa |
|---|---|---|
| `num`, `title` | `BÀI 1`, — | chip + tiêu đề (dọc: cột trái 380 px, ≤ 3 dòng) |
| `bullets` | — | `[{text,t}]` hoặc chuỗi (cách 0,7 s); mục mới nhất số nền primary |
| `pip` | `{cx:580, cy:270, d:220, z:.6}` | camera tròn (crop quanh `TL.face`) |
| `size`, `title_size` | 31, 46 | |
Phủ toàn khung (giấy kẻ ô xanh nhạt, viền trái gradient). Phụ đề vẫn hiện (đặt `hideCaptions:true` nếu muốn tắt).

Mọi module có `data-cid` ở phần tử gốc (`cid`), bước/đáp án/bullet có `cid` riêng nếu truyền.

## Lời nói → module (quy tắc dựng)
| người nói… | dùng |
|---|---|
| mở bài, "bài hôm nay / chương 3 / phần 2" | `course_chapter` (cover nếu có 2 s im lặng/intro, overlay nếu nói ngay) |
| cả bài | `course_progress` (từ sau intro tới trước CTA) |
| "quan trọng", "ghi nhớ", "nhớ nhé" | `course_keypoint kind:remember` tại `findWord` |
| "lưu ý" | `kind:note` · "chú ý", "cẩn thận", "đừng" → `kind:warn` · "mẹo", "bí quyết" → `kind:tip` |
| "bước 1… bước 2…", "đầu tiên / tiếp theo / cuối cùng" | `course_steps`, mỗi bước `t` = lúc nói "bước n" |
| "câu hỏi cho bạn", "theo bạn…?", "đố bạn" | `course_quiz`, `reveal_t` = lúc người nói nói đáp án |
| "X là gì?", "khái niệm", "nghĩa là", thuật ngữ tiếng Anh | `course_term` |
| đọc code, cú pháp, công thức, câu lệnh/prompt | `course_code` (cps ≈ tốc độ đọc, 30–90) |
| "nhìn vào đây", "chỗ này", "góc trên" (quay màn hình) | `course_annotate` (circle/arrow), gạch chân cho chữ |
| giới thiệu bản thân (thường 1–5 s đầu) | `course_instructor` |
| tóm tắt / mục lục / "hôm nay mình học 3 ý" | `course_board` |
| "đăng ký", "link ở dưới", "ưu đãi", cuối video | `course_cta` (3–4 s cuối) |

`recipe(ctx)` làm sẵn: chapter overlay 0–2,5 s (tiêu đề = `ctx.title` hoặc 6 từ đầu), progress 0 → trước CTA, instructor 1,0–4,5 s, keypoint tại lần đầu nói "quan trọng / ghi nhớ / nhớ / lưu ý / chú ý / mẹo" (sau 4,6 s), steps nếu có "bước" (tối đa 4), CTA 3,5 s cuối; `caption_style:"course"`, `music:"corporate"`.

## Nhịp cho video bài giảng
- Mỗi thẻ nội dung **≥ 2,5 s** (người học cần đọc); quiz nên 3–5 s, để ≥ 1,5 s im/nhạc trước `reveal_t`.
- Không chồng 2 thẻ lớn cùng lúc; keypoint/instructor/annotate có thể đi cùng phụ đề, các thẻ split thì ẩn phụ đề (thẻ chính là nội dung).
- Nối các cảnh split liền nhau (t1 = t0) để video đứng yên, chỉ thay thẻ — trông như slide bài giảng.
- Đặt `key_t` / `t` từng bước **trễ 0,1–0,2 s** sau khi nói từ khoá cho cảm giác "đúng lúc".
- Âm thanh: nhạc `corporate` nhỏ (−20 dB), SFX nhẹ: pop cho keypoint, tick cho từng bước, "ding" khi lộ đáp án, whoosh khi chapter.
- CTA chỉ một lần ở cuối; dùng brand `phone/website` thật.
