# Tự động: b-roll + âm thanh một bấm

Code: `scripts/auto_broll.mjs`, `scripts/auto_sfx.py --level`, `studio/routes/80_autofill.mjs`, `studio/features/80_autofill.js` (panel **Tự động**), ô “Tự thêm b-roll + âm thanh sau khi dựng” trong **AI dựng giúp** (`20_ai.js`). Thư viện: `scripts/gen_sfx.py` (309 SFX), `scripts/gen_music.py` (30 nhạc) — bảng ở `references/sound-library.md`.

## 1. B-roll tự động — `auto_broll.mjs`
```bash
node scripts/auto_broll.mjs <dự án>/timeline.json [--goal auto|banhang|bds|khoahoc|review|tintuc|kechuyen|doanhnghiep|amthuc|giaitri] [--variety 0.6]
    --density vua --src preset,hf,text,emoji,logo,aroll,media,lib[,stock,stockvid,aiimg] [--claude] [--seed 1] [--dry] [--clear]
```
| Tham số | Ý nghĩa |
|---|---|
| `--density` | `thua` ≈ 1 chèn / 8 s · `vua` ≈ 1/5 s · `day` ≈ 1/3 s · `ratday` ≈ 1/2 s |
| `--src` | `preset` (b-roll động, `assets/broll/catalog.json`), `hf` (khối HyperFrames, vars viết từ câu nói), `text` (chữ nổi từ khoá), `emoji` (emoji 3D), `logo` (logo công cụ/thương hiệu được nhắc tên, `assets/broll/logos.json`), `aroll` (hiệu ứng trên người nói: `push`/`punch`/`mono` trong `TL.fx`), `media` (ảnh/clip trong `media/` của dự án), `lib` (thư viện b-roll của tôi), `stock` (ảnh Openverse/Commons + Pexels/Pixabay nếu có key, tối đa 3), `stockvid` (video Pexels/Pixabay, cần key, tối đa 4), `aiimg` (ảnh AI bằng key OpenAI/Gemini, tối đa 2) |
| `--goal` | mục tiêu video (§1b). `auto` = theo gói (`auto_from_pack`), không có thì đếm từ khoá chủ đề trong lời thoại |
| `--variety` | 0 = đều tay (ít đổi nguồn), 1 = đa dạng tối đa (phạt mạnh khi lặp nguồn / template / bố cục) |
| `--claude` | `claude -p --model sonnet` chọn preset (chỉ trong danh sách ứng viên của câu) + chữ IN HOA ≤ 18 ký tự + emoji; lỗi/không có CLI → tự dùng luật offline |
| `--clear` | chỉ xoá cảnh `_auto` |

Luật:
- Gộp phụ đề thành câu (`sentences()` của `ai_broll.mjs`), đặt mốc theo mật độ, bắt đầu đúng từ gần nhất.
- Câu có **số** → template số (`counter_big`/`bar_chart`/`line_chart`, `%` → `pie`/`progress`), `num` đúng số nói; mỗi số dùng một lần.
- Preset chấm điểm theo tag catalog; **không lặp template trong 3 lần gần nhất**; palette chính theo gói (`slate`→ocean, `hypecam`→ember, `luxury`/`realestate`→gold…) hoặc màu `brand.accent` gần nhất, cứ 4 preset có 1 palette phụ.
- Bố cục xoay vòng `card → right → full → pip → person → left`; mọi khung được kiểm tra **không giao vùng mặt** (`TL.face` ± ~150×180 px thiết kế); dọc: thẻ trên đầu hoặc dưới phụ đề, tránh huy hiệu `frame_grid`. `full` chỉ 1–1,5 s. `person` (b-roll nền, người cutout đứng trước) chỉ khi clip có `cutouts` và không dùng `frame_grid`.
- Bỏ 0–1,5 s, thẻ kết/CTA cuối, và mọi cảnh lớn không phải `_auto` (cảnh nền như `frame_grid`, `*_frame`, `*_grade` không chặn).
- Dọc: preset → `media_card` (`screen.broll`); ngang: `broll` (`layout` card/full + `x,y,w,h`); `person` → `broll` `layout:full, person:true` (+ `fit:"cover"` ở khổ dọc — engine phóng preset 16:9 phủ kín khung).
- Mỗi cảnh có `"_auto": true, "note": "tự động"`. Chạy lại chỉ thay cảnh `_auto`; cảnh đã sửa trong Studio (`_orig`) và cảnh của bạn/AI được giữ. Ghi đè tại chỗ, có `timeline.json.bak`. In `@@ <tiến độ> <bước>` và 1 dòng JSON tóm tắt.

## 1b. Mục tiêu × vai trò câu × 11 nguồn (v5)
- **Mục tiêu** (`assets/broll/goals.json`): Bán hàng, BĐS, Khoá học/Hướng dẫn, Review, Tin tức, Kể chuyện/Chia sẻ, Doanh nghiệp, Ẩm thực/Du lịch, Giải trí. Mỗi mục tiêu có `mix` (trọng số nguồn), `roles` (nguồn ưu tiên theo vai trò câu), `topics`/`templates` được cộng điểm, danh sách khối `hf` dùng được, `pal`, `full` (tỉ lệ b-roll toàn khung).
- **Vai trò câu** (luật offline, `role_words`): con số, giá/tiền, liệt kê, so sánh, bằng chứng/đánh giá (số ≤ 5 + "sao"), nhắc tên công cụ (logo), cảnh thật (từ có trong `keywords_vi_en.tsv`), thời gian, cảm xúc, câu mở (< 4,5 s, câu hỏi, "bạn có biết"…), kêu gọi (≥ 72 % video + từ CTA), ý chung. Phụ đề không có dấu câu: các ý của câu liệt kê lấy theo từng dòng phụ đề, bắt đầu từ "thứ nhất / đầu tiên / bước 1".
- **Ứng viên & điểm**: mỗi nguồn khả dụng tạo 1 ứng viên; điểm = `mix[nguồn]` + (3/2/1 nếu nguồn đứng thứ 1/2/3 trong `roles[vai trò]`) + chất lượng khớp − phạt lặp (cùng nguồn chỗ trước −3×variety, chỗ trước nữa −1,5×variety, mỗi lần trong 5 chỗ gần −0,4×variety) + nhiễu nhỏ × variety. Không lặp template trong 2–5 chỗ, không lặp khối HyperFrames trong 3 chỗ. Preset "theo vai trò" dựng từ chính câu nói: checklist các ý vừa nói, versus 2 vế, star_rating, price_tag (45 nghìn → 45.000đ), gauge cho %.
- **Claude** (`--claude`): nhận vai trò + câu + tối đa 6 phương án mỗi chỗ, chọn `o`, viết `text`, sửa `vars` khối, viết `query` tiếng Anh cho stock/ảnh AI. Kết quả vẫn qua luật chống lặp.
- **Phương án khác**: tối đa 3 ứng viên "rẻ" (preset, hf, text, emoji, logo) được dựng sẵn thành `scene._alts = [{label, scene}]` cùng chỗ, cùng bố cục; Studio (`studio/features/82_broll_alts.js`) đổi 1 bấm, cảnh cũ thành phương án.
- Mỗi cảnh có `_src` (nguồn) và `_role`. `--clear` / chạy lại xoá cảnh `_auto` và `TL.fx` `_auto`.
- Khổ dọc: preset toàn khung dùng `fit:"portrait"` (nền của preset kéo hết khung 9:16, nội dung giữ nguyên ở giữa, không cắt chữ); khối HyperFrames và logo không bao giờ vào ô nhỏ (right/left/pip).
- Stock: ảnh Openverse/Commons chỉ nhận khi tiêu đề có từ trong truy vấn; video chỉ từ Pexels/Pixabay (Commons video quá nhiều bản scan/tài liệu); không tìm được → phương án thay thế.

## 1c. Thư viện b-roll của tôi — `scripts/broll_lib.mjs`
`~/.ai-video-studio/broll_lib/{index.json, <id>.jpg | <id>.mp4 + <id>_frames/}`. Ảnh chuẩn hoá ≤ 1920 px, clip ≤ 8 s 30 fps + chuỗi khung. Thẻ: từ tên file + người dùng gõ + Claude xem ảnh (`claude -p --allowedTools Read`, cwd = thư viện). Nguồn `lib` chọn mục có thẻ xuất hiện trong câu (thẻ 2 chữ được điểm cao hơn), chép vào `media/lib_*` của dự án.
```bash
node scripts/broll_lib.mjs add a.jpg b.mp4 --tags "quán cà phê, buổi sáng" · list · tags <id> "a, b" · rm <id> · tag [--all] · search "câu nói"
```
API: `GET /api/broll/meta` · `GET /api/brolllib` · `GET /api/brolllib/file?f=` · `POST /api/brolllib/upload?name=&tags=` (thân = file) · `/tags {id,tags}` · `/rm {id}` · `/tag {ids?,all?}` (job `brolltag`).

## 2. Âm thanh tự động — `auto_sfx.py --level`
```bash
$PY scripts/auto_sfx.py timeline.json --level nhe|vua|phongphu [--music auto] [--claude] [--clear]
```
Không có `--level` = hành vi cũ, không đổi (đã so 23 timeline mẫu: giống từng byte).
- Luật cũ theo module vẫn chạy, cộng luật chung cho **mọi** loại cảnh (24 gói, gói người dùng `u_*`, broll, text, photo, emoji, sticker): theo tên/field — full-frame → whoosh nặng vào + swoosh ra; thẻ/pip → pop/swipe; hero/hook/title → hit (+ riser/reverse cymbal 0,6 s trước, mức vừa+); chat/điện thoại → notification; tiền/giá → cash/coin; số liệu → ding; gõ chữ (`anim:"type"`, typewriter, search) → typing; ảnh → camera_shutter; emoji/sticker → pop + sparkle; chuyển clip trong `TL.clips` → whip/glitch/whoosh/transition_soft theo `transition.type`.
- Hook: hit ở graphic lớn đầu tiên (< 2,5 s), `sub_drop_short` khi hook kết thúc; outro: `outro_hit` ở thẻ kết.
- Phụ đề: số → ding / coin (nếu kèm đơn vị tiền), từ tiền (“tiền, triệu, tỷ, lương, giá…”) → coin (mức vừa+); từ `hl`, từ cảm xúc, từ khoá → pop/whoosh rất nhẹ −26 dB (phong phú). So khớp **có dấu** (không nhầm “tiến”/“tiền”).
- Limiter: tối đa 2/3/4 tiếng mỗi 1 s và 1/2/2 mỗi 0,5 s (nhẹ/vừa/phong phú), cách nhau ≥ 0,1 s, ưu tiên hit lớn; riser/typing tính riêng. Đang có giọng → giảm 4/3/2 dB (hit lớn −2 dB). Xoay biến thể từng họ âm.
- Chỉ thay mục `_auto`; SFX khác giữ nguyên, hit mới không đặt trùng (±0,15 s) hit đã có.
- `--music auto`: chia đoạn ≥ 8 s, chấm mood theo từ khoá (hoặc Claude với `--claude`), mood gốc = nhạc đang có hoặc theo gói; tối đa 1 lần đổi / 10 s; `xfade` 0,8 s, đoạn sau vào phần “lift” (`offset` = ½ track), fade cuối 1,5 s, gain −18. Nhạc cũ bị thay được cất trong `_was` → “Xoá phần tự động” trả lại. Có nhạc file riêng của bạn hoặc gói `beatslide` → không đụng nhạc. Luôn bật `audio.duck` kiểu object (−10 dB).

## 3. Studio — panel “Tự động”
Mục tiêu video (10 nút) · mật độ · thanh Đều tay ↔ Đa dạng · 12 nguồn (nguồn cần key hiện “cần key”) · Thư viện b-roll của tôi (thêm ảnh/clip, Claude gắn thẻ, sửa thẻ, xoá). Bấm một cảnh tự động → tab **Phương án khác**. Hồ sơ kênh (Tự lái/Telegram) có `broll_goal` (mặc định `auto`, không đặt thì suy từ trường “Mục tiêu”).
Mật độ · nguồn (B-roll động / Chữ nổi / Emoji / Media của tôi / Ảnh stock / Claude chọn) · mức âm thanh · tự chọn nhạc · tự chạy sau AI dựng giúp (lưu trong localStorage). Nút **Tự thêm B-roll + âm thanh**, **Chỉ B-roll**, **Chỉ âm thanh**, **Xoá tự động**. Mỗi lần: lưu → `pushUndo` (⌘Z quay lại) → job `POST /api/autofill {mode, density, src, claude, level, music}` (snapshot `.studio/history/<giờ>_autofill.json`) → `Studio.reload()`. `Studio.autofill.run(mode, {noUndo})` dùng cho AI dựng giúp (chung 1 bước hoàn tác).

## Đo trên clip thật (clip-mau, 31,6 s, dọc slate)
- B-roll: thưa 4 · vừa 5 · dày 9 · rất dày 12 chèn; mặt không bị che ở mọi still (contact sheet).
- Âm thanh (dày): nhẹ 13 / vừa 24 / phong phú 33 SFX (0,41 / 0,76 / 1,05 mỗi giây, đỉnh 1 / 3 / 4 trong 1 s). Bản xuất −14,3 LUFS, true peak −3,4 dBFS. Proxy che giọng (đường bao RMS 50 ms): SFX sát giọng < 6 dB chỉ 0,4–1,5 % thời gian nói (rất dày + phong phú: 3,1 %), trung vị giọng hơn SFX ~25 dB.

## Giới hạn
- Chọn b-roll offline theo từ khoá/tag — đúng ý ở mức “minh hoạ chủ đề”; `--claude` tốt hơn nhưng chậm 20–60 s.
- `TL.face` là một điểm cố định; người di chuyển nhiều có thể bị che một phần. Không có `TL.face` → giả định giữa khung.
- Ảnh stock Commons/Openverse là CC (nhiều ảnh CC BY/BY-SA → **phải ghi nguồn**, xem `media/credits.json`); chất lượng/độ đúng ý không đảm bảo; không có Pexels/Pixabay nếu chưa có key.
- Preset 16:9 trong khung dọc `full` hiện dạng letterbox (nền tối trên/dưới).
- Mood nhạc offline chỉ dựa trên từ khoá; video ngắn thường giữ 1 mood.
