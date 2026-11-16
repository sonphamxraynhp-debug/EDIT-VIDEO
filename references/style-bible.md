# STYLE BIBLE — "AI HYPE CAM"

Mọi số đo dưới đây theo khung **1280×720**. Với 1920×1080 nhân 1.5; với dọc 1080×1920 xem mục 8.
Engine (`engine/`) đã cài sẵn toàn bộ thông số này — chỉ đọc file này khi cần chỉnh tay.

## 1. Bảng màu (đo pixel từ video gốc)

| Token | Hex | Dùng cho |
|---|---|---|
| `--accent` | `#F0543A` | chữ hero cam, chip, số trong vòng, thanh tiến độ, viền PiP, stamp (đo: #EF533A, #EA5735, #F15433) |
| `--accent-glow` | `rgba(255,96,56,.75)` | text-shadow glow cho "100%", "30–40 PHÚT", "RÕ NHẤT" |
| `--hi` | `#F6E08C` | từ đang nói trong phụ đề, dòng "→ giữ lại…" |
| `--white` | `#FFFFFF` | label, phụ đề |
| `--muted` | `#8C8480` | mục list chưa active, chữ phụ trong cửa sổ |
| `--panel-bg` | `#120C0A` | nền panel (góc: #0A0607) |
| `--panel-glow` | `#4B2016` | quầng sáng radial góc trái trên panel |
| `--card` | `#1C1411` | cửa sổ "Bàn dựng", thẻ step |
| `--glass` | `rgba(30,22,20,.72)` + `backdrop-filter: blur(12px)` | pill câu hỏi, thanh compare, prompt box |
| `--line` | `rgba(255,255,255,.08)` | viền card, lưới nền |
| `--end-grad` | `linear-gradient(90deg,#FFC9AE,#F0543A)` | "100% BỞI AI" end card |

Nguyên tắc: **chỉ 1 màu nhấn (cam)**. Không dùng xanh/tím trừ emoji và cảnh disco.

## 2. Font

| Vai trò | Font | Weight / style | Size @720p | Ghi chú |
|---|---|---|---|---|
| Hero (CHƯA BIẾT, BỞI AI, RẤT NHIỀU…) | **Be Vietnam Pro** | 900 *italic*, UPPERCASE | 56–64 px | line-height .98, letter-spacing -0.01em |
| Mega (100%, HOÀI NGHI!?, 30–40 PHÚT) | Be Vietnam Pro | 900 *italic* | 120–190 px | glow cam hoặc trắng + shadow |
| Label (Video này được edit, Thay vì trước đây…) | Be Vietnam Pro | 700 | 30–34 px | sentence case |
| Sub-label (về khả năng edit…, 1 video ngắn) | Be Vietnam Pro | 600 | 20–22 px | |
| Phụ đề karaoke | Be Vietnam Pro | 600 | 30 px | xem mục 3 |
| HUD | Be Vietnam Pro | 600 | 14–16 px | UPPERCASE |
| Mood (buồn…, du dương) | **Playfair Display** | 500 *italic* | 64–72 px | sentence case, có "…" |
| End card | Be Vietnam Pro | 700 (KHÔNG nghiêng) | 64 px + label 20 px | gradient text |

Cả hai font đều có trên Google Fonts, hỗ trợ đủ dấu tiếng Việt. Engine nạp sẵn qua `<link>`; nếu render offline, cài font vào máy (`~/Library/Fonts`).

## 3. Phụ đề karaoke

- Vị trí: căn giữa, **baseline y ≈ 670 px** (93% chiều cao), không nền, không viền.
- `text-shadow: 0 2px 6px rgba(0,0,0,.65), 0 0 2px rgba(0,0,0,.5)`.
- **3–6 từ/khối** (trung bình 4.3), ngắt theo cụm nghĩa; không vượt 60% bề ngang. Viết thường như lời nói, giữ số ("1 video", "3").
- Từ đang phát chuyển `--hi` ngay tại `word.start` (không fade), các từ khác trắng.
- Khối đổi tức thời (hard swap), không animation vào/ra.
- **Ẩn phụ đề** khi: hook 0–5.5 s, cảnh `mega` chiếm màn, `mosaic`, `mosaic_wall`, `orbit`, `end_card`, và mọi lúc label/hero đang nói **đúng câu đó** ở đầu cảnh (tránh lặp chữ hai lần).

## 4. Bố cục

- **Lề trái chữ**: x = 75 px (5.9%). Cột chữ rộng tối đa 520 px — luôn đặt **phía đối diện người nói** (người ngồi giữa-phải → chữ bên trái).
- Khối kinetic: [emoji 48 px] → label (y≈205) → hero ngay dưới (gap 4 px) → sub-label (gap 10 px) → widget (ring/bar/prompt) gap 24 px.
- Mega word: căn trên (top 40–60 px), có thể đè lên đầu người (khi có mask thì nằm SAU đầu).
- Safe area: 40 px mọi cạnh; HUD góc ngoặc cách mép 22 px, dài 30 px, dày 2 px.
- PiP tròn: Ø230, tâm (1117, 570), viền 3 px `--accent`. PiP chữ nhật: 380×520 tại (862,74), bo 12, viền 2 px trắng 85%.

## 5. Chuyển động (easing chuẩn)

| Hành vi | Thời lượng | Easing | Chi tiết |
|---|---|---|---|
| Label vào | 0.18 s | easeOutCubic | opacity 0→1, y +8→0 |
| Hero vào | 0.28 s | easeOutBack(1.6) | blur 12→0 px, y +14→0, scale 1.06→1 |
| Mega vào | 0.35 s | easeOutExpo | scale 1.25→1, blur 18→0, glow nhấp nháy 1 lần |
| Từng từ label (hook) | theo `word.start` | — | từ mới opacity .55 → 1 trong 0.12 s |
| Pop (pill, chip, emoji, card) | 0.30 s | easeOutBack(2.2) | scale 0.4→1 |
| Stamp | 0.22 s | easeOutBack(2.5) | scale 1.6→1, rotate -8°, sau đó rung 2 px 0.1 s |
| Thoát | 0.15 s | easeInCubic | opacity→0 (không bay) |
| Bập bềnh (? / emoji) | chu kỳ 2.4 s | sin | y ±6 px, rotate ±4° |
| Counter | theo khoảng | easeInQuad (tăng tốc) | số nguyên + "%", hoặc HH:MM:SS |

Thoát luôn **nhanh hơn** vào. Chữ cũ biến mất đúng lúc câu kết thúc; không để chữ "sống" quá câu nói của nó > 0.3 s (trừ list/panel).

## 6. Grade màu A-roll

- Mặc định: contrast 1.06, saturate 1.08, ấm nhẹ (giữ tông gỗ).
- `bw`: grayscale 1, contrast 1.18, brightness .92.
- `sad`: saturate .35, hue-rotate 190° nhẹ (sepia .1 + brightness .85), vignette 45%.
- `mellow`: sepia .25, saturate 1.15, brightness 1.05 + bokeh cam/kem.
- `blur_bg`: blur 28 px, brightness .55 — nền cho `ui_showcase`.
- Punch zoom ẩn: mỗi jump cut đổi scale 1.00 ↔ 1.06 để giấu cắt.

## 7. Sticker / emoji
Dùng emoji **3D kiểu Microsoft Fluent** (⏰ ⌛ 💯 ✨ 🤖 🎞️ 🎬 🚀 🎵 👀 ⭐ 🔥 💥 🪄). Engine tự tải PNG Fluent 3D từ jsDelivr (`fluentui-emoji`); không có mạng → fallback emoji hệ thống.

## 8. Khung dọc 9:16 (1080×1920)
Giữ nguyên hệ: chữ lên vùng trên (y 18–38%), người giữa, phụ đề y = 72% (tránh UI TikTok/Reels), size × 1.5 so với bảng trên, mega × 1.2, panel chuyển thành xếp dọc (list trên, cửa sổ giữa, PiP tròn dưới-phải).
