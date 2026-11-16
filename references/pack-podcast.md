# Gói `podcast` — Podcast / phỏng vấn (port từ video-edit-ai-podcast, "AI Dark Keynote")

File: `engine/packs/podcast.js` · ví dụ: `examples/timeline.podcast.json` (20 s) · phụ đề: `caption_style: "podcast"`.

## Look
- **Nền**: đen ấm `#0F0E0C` (không đen tuyệt đối), lưới mờ 90 px `rgba(150,145,120,.10)`, 2 quầng vàng nhoè (trên-trái 28%/20%, dưới-phải 86%/78%).
- **Người** nằm trong **thẻ video bo góc** (viền vàng rất mảnh `rgba(255,241,150,.14)` + quầng vàng nhẹ + bóng đen), **đổi khung tại điểm chuyển ý** (5–8 s/lần), chuyển mượt 0,35 s.
- **Màu**: vàng `#F7D33B` (viền, số, nút, dòng đang chọn) · vàng sáng `#FFF160` (chữ trong nhãn) · nền thẻ `#1F1C13` · chữ kem `#F4F2E5` · đỏ `#FF4D3D` chỉ cho gạch `myth` · chữ trên nền vàng luôn tối `#0B0A08`.
- **Bảng màu khác**: `TL.podcast_theme` (hoặc `theme` từng scene) = `gold` (mặc định) · `blue` · `red` · `green` · `cinematic` · `white`. `TL.brand.primary` hoặc `color` của scene ghi đè màu vàng; `TL.brand.font` ghi đè font.
- **Font**: Be Vietnam Pro 600/700/800. Nhãn viết hoa giãn chữ 0.13–0.3em.
- **Chuyển động**: khối hiện 0,30 s trượt lên 16 px (outCubic), biến mất 0,22 s trượt lên 8 px (xong đúng `t1`); mục con hiện lần lượt 0,26 s, trượt 12 px, phóng 0.94→1, cách nhau `stagger`.
- **Phụ đề `podcast`**: tấm nền tối bo góc `rgba(9,9,12,.60)`, chữ kem 44 px/700, rộng tối đa 610 px, tâm y = 1058 (dải 1010–1105). **Từ đang đọc chuyển vàng** (karaoke từng từ); từ có `hl:true` luôn vàng + quầng sáng + nảy nhẹ khi được đọc. Tôn trọng `x/y/size/font/color/weight` của caption.

## Bố cục dọc 720×1280
Lề an toàn 68 px (rộng nội dung 584). Không đặt đồ hoạ vào dải phụ đề 1010–1105. Khung có sẵn (`preset`):

| preset | x, y, w, h, r | chỗ trống cho đồ hoạ |
|---|---|---|
| `full` | 0,0,720,1280,0 | không |
| `tall` | 68,150,584,880,44 | 24–140 |
| `tall-low` | 68,300,584,760,44 | 24–290 |
| `hero` | 68,80,584,584,40 | **680–1000** (dùng nhiều nhất) |
| `hero-low` | 68,330,584,584,40 | 24–320 |
| `mid` | 170,430,380,470,34 | 24–420 và 910–1000 |
| `mini-left/center/right` | 210×280 ở y 560 | 24–550 |

Ngang 1280×720 (`DIMS()`): `hero` = thẻ trái, đồ hoạ mặc định ở nửa phải (x 940); `hero-low` = thẻ phải; phụ đề y 668.

## Module (mọi phần tử định vị bằng `x`,`y` = tâm, `size` = cỡ chữ gốc; trường chung `t0,t1,color,theme,keep,stagger`)

| type | dùng khi | tham số chính |
|---|---|---|
| `podcast_frame` | nền + thẻ video, cả bài | `framing:[{t (giây tuyệt đối), preset \| x,y,w,h,r, pan_y=.42, zoom=1}]`, `morph`=.35, `card` (ghi đè), `grid`=90 (0 = tắt), `glows`, `no_frame`, `enter:'cut'`, `drift:false` |
| `podcast_tag` | đặt tên đoạn nội dung / chốt ý | `text`, `variant:'tag'` (viền vàng + chấm) \| `'solid'` (viên vàng đặc, chốt cụm) \| `'ghost'`, `sub`, size 18 |
| `podcast_chips` | liệt kê nhanh / câu hỏi / chuỗi | `items` (chuỗi hoặc `{text,icon}`), `mode:'plain'\|'q'\|'icon'\|'flow'`, `stagger`; ≤4 mục, mỗi mục ≤3 từ; size 20 |
| `podcast_rows` | danh sách thẻ dọc (khối chính) | `items:[{text,icon}]`, `active` = chỉ số hoặc `[{t,v}]` (giây tuyệt đối), `w`=584, `stagger`; ≤5 dòng, cao `n×70−8` px; size 26 |
| `podcast_bigtype` | con số / lời hứa | `kicker`, `big`, `sub` (hỗ trợ `\|…\|` tô vàng); cao ~200 px; size 96 |
| `podcast_lockup` | giới thiệu chương trình (1 lần/video) | `l1` (nhỏ vàng), `l2` (trắng), `l3` (to vàng), `rule`=210 (gạch chân tự kéo); size 56 |
| `podcast_steps` | lộ trình / các tập / các buổi | `items` (≤4, nhãn ≤2 từ), `stagger`, `w`; cao ~85 px; size 17 |
| `podcast_chart` | tăng trưởng (`kind:'line'`) / số lượng, nhân bản (`kind:'grid'`) | line: `kicker,label,h=90,draw=1.4,path`; grid: `kicker,unit,total=18,count,suffix,cols=6,draw=1.6`; minh hoạ, không phải số liệu thật; size 22 |
| `podcast_myth` | phủ định một hiểu lầm (1 lần) | `text` (1 dòng ≤8 từ), `strike` = giây sau `t0` lúc gạch đỏ (trùng lúc nói "không"); size 24 |
| `podcast_cta` | kêu gọi hành động cuối video | `text`, `sub`, `icon`='link'; nút đập nhẹ; size 31 |

Icon: bộ của nguồn `doc img vid chart clock bolt user shop link check folder phone laptop spark gear` + `mic alert`; hoặc `si:<slug>`, emoji, đường dẫn ảnh.

## Lời nói → module
| Người nói đang… | Dùng |
|---|---|
| nêu con số / lời hứa | `podcast_bigtype` |
| gọi tên một nhóm, một chủ đề | `podcast_tag` rồi `podcast_rows` bên dưới |
| liệt kê việc làm được | `podcast_rows`, `stagger` = nhịp liệt kê (0,8–1,1 s), `active` theo từng ý |
| chốt lợi ích cả cụm | `podcast_tag variant:'solid'` ngay dưới cụm |
| tăng trưởng / số lượng | `podcast_chart` line / grid |
| phủ định hiểu lầm | `podcast_myth`, `strike` đúng giây phủ định |
| giới thiệu chương trình / khách mời | `podcast_lockup` rồi `podcast_steps` |
| trình tự, nhân quả | `podcast_chips mode:'flow'` (≤3 mắt xích) |
| kể tên công cụ | `podcast_chips mode:'icon'` hoặc `'plain'` có icon |
| câu hỏi trong đầu người xem | `podcast_chips mode:'q'` |
| kêu gọi | `podcast_cta` |
Không có ô phù hợp → để trống (chỉ mặt + phụ đề), không nhồi khối vô nghĩa.

## Nhịp
- Mỗi phần tử hiện đúng lúc ý được nói (sai số < 0,3 s); cụm đồ hoạ sống 6–12 s rồi thay cụm, luôn kết thúc trước khi khung đổi.
- Đổi `framing` 5–8 s/lần, tại đầu câu; luân phiên đồ hoạ trên thẻ / dưới thẻ.
- Phụ đề 3–6 từ, 0,8–1,3 s/dòng; 60–80% dòng có 1 từ `hl` (động từ, con số, tên công cụ) — không tô 2 cụm/dòng.
- Tối đa 3 họ hiệu ứng; nhạc `corporate` ~ −20 dB dưới giọng.
- `recipe` tự dựng: khung đổi ~7 s tại đầu câu (`hero-low → hero → tall → hero`), nhãn mở đầu, `bigtype` theo từ `hl` đầu tiên, myth/chart/steps/chips theo từ khoá, CTA 3 s cuối.
