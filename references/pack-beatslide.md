# Gói `beatslide` — Ảnh theo nhịp nhạc 🥁

File: `engine/packs/beatslide.js` · Ví dụ: `examples/timeline.beatslide.json` (~14 s, dọc, nhạc `hype` 128 BPM, đủ intro → slideshow → collage → chữ theo nhịp → outro).
Script: `scripts/beats.py` (phân tích nhịp) · `scripts/beat_project.py` (thư mục ảnh + nhạc → dự án dựng sẵn).

Dùng khi **không cần người nói**: giới thiệu căn hộ / nhà phố bằng ảnh, showcase sản phẩm, ảnh sự kiện, recap chuyến đi. Mọi cú cắt rơi **đúng phách nhạc**.

## Look
- Năng lượng cao, kiểu Reels/TikTok: cắt cứng theo phách, mỗi cú cắt một kiểu chuyển cảnh xoay vòng **zoom-punch → trượt → chớp trắng → glitch**, giữa hai phách ảnh trôi Ken Burns (zoom 1.04↔1.16 + pan nhẹ, đổi hướng mỗi ảnh).
- Chữ **Montserrat 900 in hoa**, nhấn màu `accent` (mặc định vàng `#FFD84A`), viền tối dày để đọc được trên mọi ảnh.
- Màu, font, logo, liên hệ lấy từ `timeline.brand` (`primary, accent, dark, light, disp, font, logo, name, phone, website, handle`).

## Nguồn nhịp (dùng chung cho mọi module)
Thứ tự ưu tiên khi module cần thời điểm phách:
1. `scene.beats: [t…]` (giây tuyệt đối trên timeline),
2. `timeline.beats = {bpm, beats, downbeats, levels, fps}` — do `beat_project.py` ghi sẵn (đã dời theo `offset` của nhạc),
3. lưới đều từ `scene.bpm` (hoặc `timeline.beats.bpm`, mặc định 120) bắt đầu ở `t0 + offset`.
`downbeats_only:true` = chỉ dùng phách mạnh (nhịp 1 của ô nhịp). Mọi module là hàm thuần của `t`.

## Module

| type | Dùng khi | Tham số chính (mặc định) | Phụ đề |
|---|---|---|---|
| `beat_slideshow` | ảnh chạy theo nhịp | `images[]` (đường dẫn / media item), `every` (1 = cắt mỗi phách; 2 khi BPM ≥ 110), `skip` (bỏ n phách đầu), `trans` (`'mix'` = zoom/slide/flash/glitch xoay vòng, hoặc 1 kiểu, hoặc mảng; thêm `'cut'`), `labels[]` (nhãn theo ảnh, gạch vàng chạy), `label_pos` (`'bl'` / `'tc'`), `label_y`, `label_size`, `counter` (01 / 05, mặc định bật), `progress` (thanh story), `fit` (`cover` / `blurfill` cho ảnh dọc trong video ngang), `kenburns:false`, `filter`, `logo` (mặc định `brand.logo`) | hiện |
| `beat_pulse` | nền nhún theo nhịp | `media` (bỏ trống = A-roll / main track), `amp` (.06 scale), `bright` (.25), `decay` (.16 s), `edge` (viền sáng accent, `false` tắt), `downbeats_only` | hiện |
| `beat_text` | chữ hiện từng từ theo phách | `words[]` (hoặc `text`), `*từ*` = màu accent, `mode` (`'single'` 1 từ to / `'stack'` xếp chồng), `every`, `delay`, `x/y/size` (118 dọc), `colors[]`, `box` (nền tối), `upper:false`, `font` | ẩn |
| `beat_frame` | collage polaroid / thẻ bo góc | `images[]`, `labels[]` (chữ viết tay Pacifico), `style` (`'polaroid'` / `'rounded'`), `bg` (`'blur'` ảnh mới nhất làm mờ / `'paper'` / màu CSS), `title`, `every`, `delay`, `size` (rộng thẻ 300), `cards:[{x,y,w,r,cid}]` (ghi đè bố cục), `max` (6) | ẩn |
| `beat_bars` | cột EQ theo âm lượng | `mode` (`'bars'` đáy / `'mirror'` giữa / `'circle'` vòng quanh logo), `levels[]` + `levels_fps` (mặc định lấy `timeline.beats.levels`), `n` (32 / 48), `x/y` (tâm hoặc đường đáy), `w/h`, `r` (bán kính vòng), `colors:[from,to]`, `opacity`, `logo`, `text` | hiện |
| `beat_intro` | mở đầu theo 4 phách | phách 1 logo bật, phách 2 tag, phách 3 tiêu đề **đập** vào (blur → nét + chớp trắng), phách 4 dòng phụ. `title` (`*accent*`), `tag` (`false` ẩn), `sub`, `image` (nền Ken Burns tối), `logo`, `x/y/size` | ẩn |
| `beat_outro` | liên hệ cuối | phách 1 logo, phách 2 tên, phách 3 các dòng liên hệ (so le .1 s), phách 4 nút CTA rồi **nhún mỗi phách**. `name`, `sub`, `phone/website/handle` (mặc định từ brand), `cta` (`false` ẩn), `image`, `logo`, `x/y/size` | ẩn |

Mọi module có `cid` để Studio chọn; vị trí dùng `x/y` (tâm) và `size`. Thiếu ảnh → khung gradient có số thứ tự (không bao giờ trống).

## Kiểu phụ đề `beatslide`
Một dòng chữ Montserrat 900 in hoa, viền tối dày; từ đang nói **bật lên màu accent** (scale 1.22 → 1.1). Từ `hl` luôn màu accent. Mặc định top 900 (dọc) / 590 (ngang). Tôn trọng `c.x / y / size / font / color / weight`.

## Recipe (Video mới → chọn gói)
- **Không có phụ đề / giọng** (montage nhạc): `beat_intro` (1 ô nhịp, dừng ở downbeat) → `beat_slideshow` từ `ctx.opts.images` cắt theo `ctx.opts.beats` (`{bpm, beats, downbeats, levels}` hoặc mảng) với `every` tự chọn để mỗi ảnh ≥ ~0,9 s → `beat_bars` mờ ở đáy → `beat_outro` (~2 ô nhịp cuối). `caption_style:'none'`, nhạc `hype`.
- **Có người nói**: `beat_text` tiêu đề 0–2,6 s, `beat_pulse` nhẹ trên A-roll theo downbeat, `beat_frame` ảnh (nếu có `opts.images`) giữa bài, `beat_outro` 3 s cuối.

## `scripts/beats.py` — phân tích nhịp
```bash
PY="scripts/.venv/bin/python -I"
$PY scripts/beats.py nhac.mp3 -o beats.json            # {bpm, beats, downbeats, levels, fps, dur}
$PY scripts/beats.py nhac.mp3 --start 12 --dur 30      # một đoạn
$PY scripts/beats.py nhac.mp3 --bpm-max 100            # nhạc chậm (tránh đọc gấp đôi)
$PY scripts/beats.py nhac.mp3 --bpm 128                # biết BPM rồi, chỉ dò pha
$PY scripts/beats.py --test                            # chạy trên 20 track thư viện, so với catalog.json
```
Cách làm (numpy/scipy, không cần librosa): STFT 1024/hop 256 → **spectral flux** trên 40 dải log → trừ trung bình trượt 0,4 s → **tự tương quan** chọn tempo (cộng điểm bội 2×, ½×, prior log-Gauss quanh 120 BPM) → **quy hoạch động Ellis** dò phách → downbeat = pha (0..3) có năng lượng onset dải trầm (< 200 Hz, tiếng kick) lớn nhất → BPM cuối = hệ số góc hồi quy thời điểm phách. `levels` = RMS mỗi 1/30 s kéo giãn giữa phân vị 5–98, gamma 0,8.

Kết quả `--test` (40 s đầu mỗi track): **20/20 trong 3 %** — 18 track đúng BPM (hype 128.0, hype_2 124.0, tech 110.0, tech_2 116.0, happy 118.0, happy_2 122.0, mellow 80.0, mellow_2 76.1, lofi 84.0, lofi_2 72.1, epic 90.0 ×2, suspense 100.0 ×2, corporate 112.0 ×2, inspire 96.0 ×2); 2 track piano buồn (`sad` 70, `sad_2` 66) đọc gấp đôi 140/132 → dùng `--bpm-max 100` sẽ ra 70.0.
Kiểm tra trên MP4 đã render: khung hình đổi cảnh lệch phách nghe được **−3…+53 ms** (≤ 1,5 khung ở 30 fps).

## `scripts/beat_project.py` — thư mục ảnh → dự án dựng sẵn
```bash
$PY scripts/beat_project.py <thư_mục_ảnh> <thư_mục_dự_án> --music hype --dur 20 \
    --title "The *Riverside*" --sub "Căn hộ view sông" --labels "Phòng khách,Phòng ngủ,Bếp" \
    [--mode scene|clips] [--every 2] [--horizontal] [--fit blurfill] [--bars] \
    [--name "Liên hệ *ngay*"] [--phone ...] [--website ...] [--no-intro] [--no-outro] [--offset auto|1.2]
$PY scripts/mix_audio.py <dự_án>/timeline.json
node scripts/render.mjs <dự_án>/timeline.json out.mp4
```
- `--music`: mood thư viện (`assets/music/<mood>.mp3`) hoặc file mp3/wav.
- Nhạc được **dời `offset`** để downbeat mạnh đầu tiên (trừ 1 phách dẫn) rơi vào đầu video; mọi phách đã dời ghi vào `timeline.beats`. Tổng thời lượng bắt vào downbeat gần `--dur` nhất (+0,4 s đuôi).
- `--mode scene` (mặc định): 1 cảnh `beat_slideshow` giữa `beat_intro` (1 ô nhịp) và `beat_outro` (1 ô nhịp nếu < 16 s, 2 ô nếu dài hơn). Ken Burns + nhãn + đếm ảnh.
- `--mode clips`: ảnh thành **`TL.clips`** trên track chính (mỗi clip = khoảng giữa hai phách cắt, `transition` xoay vòng zoom / slide_l / flash / glitch), sửa được như clip trong Studio. Không có Ken Burns.
- Ảnh ngoài thư mục dự án được chép vào `<dự_án>/media/`. Video ngang tự dùng `fit: blurfill` cho ảnh dọc.

## Giới hạn
- Không tách được phách khi nhạc không có nhịp rõ (ambient, piano rubato) → truyền `--bpm` hoặc đặt `beats[]` tay.
- Downbeat đoán theo năng lượng kick, nhạc không có trống có thể lệch pha ô nhịp (phách vẫn đúng).
- `beat_bars` là phổ giả lập từ âm lượng tổng (không có FFT theo dải trong JSON).
