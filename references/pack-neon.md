# Gói `neon` — Phụ đề neon AI

Port **phần nhìn** của skill `video-ai-caption-neon` sang engine HTML. File: `engine/packs/neon.js`. Ví dụ: `examples/timeline.neon.json`.
Hợp với video bán hàng, giới thiệu sản phẩm, tin công nghệ: nhịp nhanh, chữ đè lên người, nền đổi màu theo đoạn.

## Phần nhìn

| Yếu tố | Chuẩn |
|---|---|
| Khung | dọc 720×1280 (ngang cũng chạy nhờ `DIMS()`) |
| Nền | gradient chéo phủ lên **phông sau người**, người giữ màu thật. Tím `#5F4DFC → #9F6AFD` (mở, giải pháp, chốt) · Hồng `#C4226E → #FE2B6D` (bằng chứng, số liệu) · Xanh `#0B3E6F → #1B6FB8` (đoạn nghiêm túc) · nền tối thẻ `#0C0422` |
| Màu nhấn | vàng chanh `#FFFF6B` (quầng `#FFE11A`) và hồng nhạt `#FFBCFF` (quầng `#BA50FF`), **luân phiên theo từng nhóm phụ đề**, không theo màu nền. Ruột chữ nhạt, độ rực nằm ở quầng sáng |
| Font | Be Vietnam Pro 800 (từ khoá) / 700 (từ thường). Tiếng Anh có thể truyền `font` khác |
| Chữ trắng | `#FFFFFF` + bóng `0 2px 14px rgba(0,0,0,.62)` |
| Brand | `TL.brand.accent` (+ `primary`) thay cặp màu nhấn; `BR().logo` dùng cho logo chip khi không truyền `text`/`icon` |

**Lớp nền:** nếu `TL.aroll.cutouts` có ảnh tách người thì phủ màu cả nền rồi đặt người lên trên (kèm hắt viền `rim`). Không có thì khoét một elip mềm quanh người (`person:{x,y,rx,ry}` theo %, mặc định 50/64/34/50) và giảm phủ từ `floor` trở xuống.

### Kiểu phụ đề `caption_style: "neon"`
- Từ có `hl` liền nhau gộp thành **một dòng từ khoá** cỡ 1,92× (mặc định 92px), gõ dần từng chữ trong 0,18 s, bật `scale .72 → 1`.
- Từ thường gom **2 từ một dòng** (48px). Các dòng xếp lệch trái/phải theo nhiễu tất định, không tràn lề 34px (tự hạ cỡ nếu dài).
- Mỗi dòng hiện đúng lúc từ đầu của nó được nói. Tâm khối ở **61%** chiều cao (y≈780).
- Trường thêm trên chunk: `doodle: "ellipse"|"underline"|"strike"` (nét tay bám từ khoá đầu), `hl_color`, `glow`. Studio chỉnh được `x, y, size, font, color, weight`. `w.br` bị bỏ qua.
- 70–90% nhóm nên có từ khoá; đọc riêng chuỗi từ khoá vẫn phải ra thông điệp.

## Module

Tham số chung: `t0, t1, keep` (giữ đến hết, không mờ ra), `x, y` = tâm, `size`.

### `neon_frame` — khung + nền gradient (cover)
| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `theme` | `purple` | `purple`/`pink`/`blue`; hoặc `grad:[a,b]` |
| `preset` | `punch` | `full` 1,0 · `wide` 1,22 · `punch` 1,45 · `punch_hard` 1,70 · `card` / `card_tall` (thẻ video viền neon trên nền tối) |
| `zoom` | theo preset | số phóng tuỳ ý |
| `pan_y`, `pan_x` | .34, .5 | điểm neo khi phóng |
| `shots` | `[]` | `[{t, preset|zoom, pan_y, flash}]` — đổi khung **cắt cứng** mỗi 1–2,3 s |
| `wash` | .85 tím / .9 hồng | độ mạnh phủ màu |
| `floor`, `floor_keep` | .6, .22 | từ mốc này trở xuống bớt phủ |
| `rim` | .45 | hắt viền (chỉ khi có cutout) |
| `person` | `{x:50,y:64,rx:34,ry:50}` | vùng giữ màu thật khi không có cutout |
| `flash` | false | loá trắng 0,3 s ở đầu cảnh |
| `card`, `frame_color`, `no_frame` | `{128,292,464,824,r20}`, `#B388FF` | thẻ cho preset card |
| `contrast`, `saturation`, `drift` | 1.1, 1.12, true | grade + trôi nhẹ 2% |

### `neon_flash` — loá trắng
`peak` (.94), `dur` (≤ .33). Bùng 22% đầu, tắt dần, nhoè chuyển động và **một khung âm bản**. Luôn kèm SFX whoosh.

### `neon_bigtype` — chữ lớn phát sáng
`text` (`\n` xuống dòng), `size` 108, `color` `#FFFF6B`, `glow`, `type_on` (true), `type_dur` .28, `font`. Mặc định y 400.

### `neon_scatter` — cụm chữ rải tự đặt
`text` dạng `"a |từ khoá| b"`, `size` (từ thường, 48), `hl`, `glow`, `doodle`, `step` (giãn cách dòng), `seed`. Ẩn phụ đề trong lúc chạy.

### `neon_emoji` — cụm emoji
`burst: ['🤯','🍿','🤯']` hoặc `[{char,x,y,size,rot}]` (vị trí tuyệt đối, mặc định 3 góc quanh khung), `x,y` dời cả cụm (gốc 360,640), `size` (150 = 100%), `stagger` .07. Sống 0,3–1,2 s; được tràn mép.

### `neon_counter` — số chạy tăng
`from`, `to`, `decimals`, `unit`, `prefix`, `label`, `icon` `eye|play|heart|up|''`, `pupil` (`#FF2B6D`), `dur_roll` 1,4, `size` 86, mặc định x 470 y 250. **Chỉ dùng số thật.**

### `neon_logochip` — ô logo bo góc
`text` hoặc `icon` (`si:slug`, emoji, ảnh), `label` dưới chip, `color` viền (`#B388FF`), `bg` (`#0E0A18`), `size` 120, mặc định y 1000.

### `neon_doodle` — nét khoanh tay độc lập
`kind` `ellipse|underline|strike`, `w` 420, `h` 110, `color` trắng, `width` 5, `draw` .38 s. Dùng để khoanh một vật trong khung; với từ khoá thì dùng `doodle` của phụ đề.

## Lời nói → module
| Khi người nói… | Dùng |
|---|---|
| Câu mở / lời hứa / con số đầu video | `neon_bigtype` (0–2 s) hoặc `neon_scatter` hook |
| Sang ý mới (mỗi 5–15 s) | `neon_frame` mới đổi `theme` + `neon_flash` trước 0,05 s + whoosh |
| Khoảnh khắc "điên rồ", sốc, wow | `neon_frame preset:"card"` + `neon_emoji` |
| Nêu số liệu thật (view, %, doanh thu) | `neon_counter` (nền hồng) |
| Nhắc tên sản phẩm/thương hiệu | `neon_logochip` **đúng câu đó**, không sớm hơn |
| Từ quan trọng nhất của đoạn | `doodle` trên chunk phụ đề (ellipse), hoặc `neon_doodle` |
| Câu chốt | `punch_hard` + `doodle` + `neon_bigtype` CTA |

## Nhịp
- Một nhóm phụ đề 1,0–2,3 s, 4–9 từ, có thể 2 từ khoá; màu nhấn đổi mỗi nhóm.
- Đổi khung (`shots`) mỗi 1,0–2,3 s; mặc định `punch`. Clip quay cận sẵn (như clip QC) thì hạ một bậc: `full`/`wide`, `punch` cho câu nhấn.
- Cứ 1–1,5 s phải có một sự kiện thị giác mới; đừng loá mỗi nhóm — 3–4 cú loá/phút.
- `punch_hard` 1–2 lần/video. Emoji sống ≤ 1,2 s. Bộ đếm chạy 1,4 s rồi giữ.
- Âm thanh: whoosh đúng cú loá, tiếng đập trầm (impact/sub_drop) đúng từ khoá, nhạc nền chìm (−20 dB).
