# DECODE VIDEO MẪU — "Video này được edit 100% bởi AI"

Nguồn: `1793459683677_…mp4` — 1280×720, 30 fps, H.264 ~2 Mbps, AAC 44.1 kHz stereo, **74.67 s**.
Âm lượng: **-14.4 LUFS integrated**, LRA **3.2 LU** (nén rất chặt), true peak < -1 dBTP.
Lời thoại: 342 từ / 71 s = **4.8 từ/giây**, khoảng trống giữa hai từ **≤ 0.16 s** → cắt lặng sạch 100%, không còn hơi thở dài.
Dựng bằng Claude + HyperFrames (HTML→video) — thấy rõ trong cảnh quay màn hình ở 10–20 s và 63–67 s.

## 1. Cấu trúc kể chuyện (8 nhịp)

| # | Thời gian | Nhịp | Câu nói (đã sửa lỗi whisper) | Module hình |
|---|---|---|---|---|
| 1 | 0.0–2.6 | HOOK tuyên bố | "Video này được edit 100% bởi AI" | `slam_bg` + `hud` + `counter` 1→100% + `kinetic_title` |
| 2 | 2.6–10.0 | Pain / nghi ngờ | "Nhiều anh chị em có thể chưa biết về khả năng edit video của AI… thậm chí hoài nghi… có đáng ổn hay không" | `kinetic_title` → `big_word` HOÀI NGHI!? + `question_marks` + `question_pill` |
| 3 | 10.0–14.3 | Proof sớm | "thì mình sẽ làm 1 clip này để chia sẻ với anh chị em là AI có thể edit như thế nào" | `ui_showcase` (ảnh chụp Claude đang dựng) + chip "• ĐANG DỰNG" + PiP |
| 4 | 14.3–27.7 | Before → After | "Thay vì trước đây mất rất nhiều thời gian… 1 video ngắn 1–1,5 phút… mất tới tận 3–4 tiếng. Bây giờ AI tự động edit 100%… chỉ 30–40 phút" | `kinetic_title` + emoji ⏰⌛ → `bw_timer` → `ring_progress` 6→100% → `compare_bar` → `slam_bg` "30–40 PHÚT" |
| 5 | 27.7–37.2 | Liệt kê việc thủ công | "Ngày xưa phải chọn rất nhiều: nhạc, hiệu ứng, cắt cảnh thừa, phần nói lặp, sound effect" | `iris` → `checklist_panel` 5 mục, cửa sổ "Bàn dựng thủ công" đổi nội dung theo mục |
| 6 | 37.2–45.3 | Giải pháp | "Tại thời điểm này chỉ cần ra lệnh cho AI, nó tự động 100%" | `kinetic_title` + `prompt_box` gõ chữ + thanh tiến trình + `stamp` "TỰ ĐỘNG 100%" |
| 7 | 45.3–63.3 | Demo năng lực (show, don't tell) | "hiệu ứng bay quanh đầu… cảnh buồn, nhạc buồn… nhạc vui, sôi động… nhạc du dương… cảnh trám tăng tính sinh động… hình ảnh minh hoạ… người xem nhìn nhận giá trị video rõ nhất" | `orbit` (chữ sau đầu) → `mood` buồn → `mood` VUI! → `mood` du dương → `mosaic` 3 cột → `mosaic_wall` SINH ĐỘNG → `step_cards` 01-02-03 + RÕ NHẤT |
| 8 | 63.3–74.7 | Recap + chốt | "Tất cả hiệu ứng và tất cả phần edit trong video này 100% mình làm bằng AI, AI tự động 100%" | `ui_showcase` + `tag_pills` → `slam_bg` "100%" + "Mình làm bằng AI" + `stamp` → `end_card` "100% BỞI AI" |

Quy luật: **mỗi câu nói = 1 trạng thái hình mới**; trung bình đổi "lớp thông tin" mỗi **1.2–2.0 s**, đổi "cảnh lớn" mỗi **3–8 s**. Không có cảnh talking-head trơn quá **3 s**.

## 2. Timeline từng giây (chi tiết)

| t (s) | Hình | Chữ trên hình | Âm thanh |
|---|---|---|---|
| 0.00 | Mở bằng **flash trắng + vòng tròn sóng xung kích** quanh mặt (ring trắng dày ~24 px nở ra 0→1.2× khung, 0.25 s) | — | riser/whoosh cao tần (HF spike 0.3 s) |
| 0.03–1.3 | Người đã tách nền; nền = **tường video nghiêng 3D** (thumbnail b-roll tối, tint đỏ) + **tia sáng cam** toả từ sau đầu + **lưới sàn phối cảnh cam** + hạt bụi trắng. **HUD**: 4 góc ngoặc vuông trắng, "● AI EDIT · 00:00:00:12" (timecode chạy), khung khoá mặt cam 4 góc, nhãn "AI ĐANG EDIT / KHOÁ MẶT ✓ / PHÂN TÍCH 39%" | "Video" → "Video này" → "Video này được" → "Video này được edit" (hiện từng từ, trắng, từ mới hơi xám rồi trắng) | giọng |
| 1.0–1.4 | Khung khoá mặt biến mất, **counter "1% → 11% → 44% → 100%"** cực lớn, cam, nghiêng, glow; thumbnail dọc bay vào bên phải | | tick đếm |
| 1.4 | **Flash trắng + ring** lần 2 khi chạm 100% | "100%" | **impact/whoosh** (HF -18 LUFS) |
| 1.5–2.6 | Sticker 3D: 💯✨, robot, film-strip + clapperboard trôi nhẹ; **dải waveform** ngang đáy (trắng, đoạn đang phát cam) | "BỞI AI" cam đậm nghiêng pop vào dưới label | |
| 2.6 | **Hard cut** về talking-head thật (tủ gỗ), không hiệu ứng | "Nhiều anh chị em" (trái, y≈290) | |
| 4.3 | | "CHƯA BIẾT" cam vào bằng **blur→nét + trượt lên 12 px** | whoosh nhẹ |
| 4.8 | | dòng phụ trắng nhỏ "về khả năng edit video của AI" | |
| 5.6 | Bắt đầu **phụ đề karaoke** đáy (từ đang nói vàng nhạt) | | |
| 7.6 | Jump cut | | |
| 8.9 | | **"HOÀI NGHI!?"** khổng lồ, trắng nghiêng, chữ "I" + "?" cam, chiếm 70% bề ngang, đỉnh khung | HF spike 9.0 |
| 9.0–10 | 3–4 dấu **"?" cam** nổi lên bập bềnh quanh trái | pill tối viền cam "Có đáng ổn hay không?" | pop |
| 10.0 | Chuyển: **nền = chính A-roll blur mạnh + tối**, ảnh chụp màn hình Claude (card trắng, nghiêng 3D ~8°) **trượt từ trái vào** | | whoosh |
| 10.5–12 | | chip cam "● ĐANG DỰNG" → "Claude đang edit" → "100% VIDEO" (cam) → "này" → **PiP** A-roll viền trắng trượt lên | pop từng phần |
| 14.3 | Cut về talking-head | "Thay vì trước đây" | |
| 14.7 | Emoji 3D ⏰ ⌛ pop phía trên | "RẤT NHIỀU / THỜI GIAN" cam 2 dòng | |
| 16.3 | | "1 video ngắn" | |
| 17.6 | | "1 – 1,5 PHÚT" trắng nghiêng đậm | |
| 19.3 | Toàn bộ chữ biến mất; **vệt light-leak cam dọc mép trái** | | whoosh |
| 19.6–22.0 | **Đen trắng** (desaturate 100%, tương phản ↑) | **đồng hồ chạy "00:00:44 → 04:00:00"** trắng nghiêng (tăng tốc), "3–4 TIẾNG" blur-in phía trên | **tick tick** đồng hồ, HF 21.0 |
| 22.0 | **Light-leak cam quét dọc mép phải** → trả màu | chữ mờ ra | whoosh (loudness đỉnh -9.5 LUFS) |
| 23.0 | | "Bây giờ AI" | |
| 24.3 | | "TỰ ĐỘNG EDIT" cam | |
| 24.4–25.6 | **Vòng tiến độ** (ring) trái giữa: 6% → 100%, viền cam chạy | | |
| 26.0–27.3 | **Compare bar**: thanh xám kính "Trước đây · 3–4 tiếng" (dài) + thanh cam "30–40 phút" → co lại còn "2 tiếng"… | | |
| 27.3 | `slam_bg` lần 2 (nền tường video + tia cam) | "30–40 PHÚT" khổng lồ cam glow | HF 28.3, boom |
| 27.7 | Trở về A-roll, chữ "30–40 PHÚT" mờ dần (opacity 40%) | | |
| 27.9 | **Iris**: hình tròn nâu đen nở từ mặt ra phủ kín màn | | swoosh trầm |
| 28.0–37.2 | **Panel tối** (nền #120C0A, quầng cam nâu góc trái trên, lưới mờ 48 px). Trái: "Ngày xưa phải chọn / RẤT NHIỀU" + list 01–05. Phải: cửa sổ "Bàn dựng thủ công". Góc phải dưới: **PiP tròn** 230 px viền cam 3 px | list xám; mục đang nói: số tô cam, chữ trắng, dịch phải 12 px | |
| 29.4 | Cửa sổ: 3 dòng "Nhạc 01/02/03" + waveform đỏ cam (bar chạy) | mục 01 Nhạc | |
| 31.6 | Cửa sổ: lưới emoji hiệu ứng ✨💥🔥🪄🎞️🎬 pop | 02 Hiệu ứng | pop×6 |
| 32.6 | Waveform 1 dòng bị cắt + **đếm "125 s → 71 s"** | 03 Cắt cảnh thừa | tick |
| 34.0 | 4 câu bị **gạch ngang cam** lần lượt + "→ giữ lại lần nói ổn nhất" vàng | 04 Phần nói lặp | scratch |
| 35.5 | Lưới 6 ô SFX: whoosh / impact / pop / riser / glitch / click (mỗi ô có mini waveform) | 05 Sound effect | mỗi SFX phát mẫu (HF 35.5) |
| 37.2 | Cut về talking-head | "Tại thời điểm này" | |
| 39.0 | **Prompt box** kính mờ + nút gửi cam | "CHỈ CẦN / RA LỆNH" cam | |
| 39.5–41 | Gõ chữ "Edit video này một cách xuất sắc nhất" (typewriter) | | click phím |
| 41.5 | Thanh tiến độ cam chạy dưới prompt | | |
| 42.2 | **Stamp** "TỰ ĐỘNG 100%" xoay -8°, viền cam, pop scale 1.4→1 | | **impact** HF 42.2 |
| 43.0–45.3 | `orbit`: nền đỏ tối + elip quỹ đạo cam có chấm, ảnh b-roll bo góc bay vòng quanh đầu (trước & sau người), emoji 🚀✨🎵 | "HIỆU ỨNG" chữ **viền trắng rỗng** sau đầu → "BAY QUANH ĐẦU" cam đặc **sau đầu** | **boom LF 45.3** |
| 45.8 | Cut về A-roll, **chuyển sang tông lạnh + tối dần** | | nhạc đổi |
| 47.0–48.6 | `mood: sad` desaturate 70%, xanh lạnh, vignette | "buồn…" serif nghiêng xám trắng | nhạc piano buồn, loudness tụt -19.6 |
| 48.6–49.6 | `mood: happy` nền **sân khấu disco** (đèn laser xanh/cam, quả cầu disco, sàn sọc) tách người | "VUI!" trắng nghiêng cực đậm | nhạc sôi động, HF 49.5/50.1 |
| 49.6–52.7 | Về A-roll ấm hơn, nốt nhạc 🎵 tím trôi | | |
| 52.0–53.0 | `mood: mellow` grade vàng ấm + bokeh mờ | "du dương" serif nghiêng vàng kem | nhạc du dương |
| 53.8–55.9 | `mosaic`: chia **3 cột dọc** b-roll, mỗi cột đổi clip lệch nhịp (~0.7 s) | | whoosh mỗi lần đổi |
| 56.0–57.6 | `mosaic_wall`: **tường ~30 ô** nghiêng 3D (rotateX 20°, rotateZ -12°) trôi chéo | "SINH ĐỘNG" trắng nghiêng giữa | HF 56.9 |
| 57.6 | Panel tối + **PiP chữ nhật** (bo 12, viền trắng mảnh) bên phải | | |
| 58.3–61.5 | `step_cards`: thẻ 01 "Hình ảnh minh hoạ" (ảnh xếp chồng) → nối "^" cam → 02 "Người xem nhìn nhận" (emoji 👀) → 03 "Giá trị video" (ngôi sao vàng) | | pop mỗi thẻ |
| 62.0 | Thẻ 03 **glow cam** + scale 1.08 | "RÕ NHẤT" cam glow | ding |
| 62.8 | `ui_showcase` lần 2 (card Claude nghiêng, nền blur) | "Tất cả hiệu ứng" | |
| 63.5–66 | `tag_pills` pop lần lượt: Cắt lặng · Bỏ câu lặp · Chữ sau đầu · Bay quanh đầu · Đổi nhạc · Cảnh trám · Minh hoạ | "TẤT CẢ PHẦN EDIT" cam | pop×7 |
| 66.5 | Cut talking-head | | |
| 67.2 | `slam_bg` lần 3 | "100%" glow cam lớn | **HF 67.4** whoosh+impact |
| 67.9 | | "Mình làm bằng" → "AI" cam | |
| 68.8 | | stamp "TỰ ĐỘNG 100%" | impact |
| 69.0 | **Fade qua đen** 0.4 s | | |
| 69.4–73.8 | `end_card`: nền tối quầng nâu, "Video này được edit" + "100% BỞI AI" (gradient đào→cam, không nghiêng) fade-up | | nhạc outro nổi lên (-17 LUFS, LF tăng 71.5–72.5), HF 70.2 shimmer |
| 74.0–74.67 | Đen | | fade-out |

## 3. Các phép chuyển cảnh đã dùng

1. **Flash ring** (0.0, 1.4): khung trắng 80% + vòng tròn trắng dày nở từ mặt → mở/đóng hook.
2. **Hard cut** (đa số, giữa các câu A-roll) — jump cut không che.
3. **Blur-slide** (10.0, 62.8): A-roll blur 0→30 px trong 0.2 s + card trượt vào.
4. **Light-leak line** (19.3, 22.0): vệt sáng cam dọc 8–30 px quét/chớp ở mép.
5. **Grade switch** (19.6 B&W, 47 lạnh, 52 ấm) — đổi màu tức thời theo ý nghĩa câu.
6. **Iris** (27.9): tròn tối nở từ mặt.
7. **Background swap** (0, 27.3, 43, 48.6, 67.2): giữ nguyên người, thay nền (cần mask người).
8. **Fade to black** (69.0, 74.0).

## 4. Lỗi whisper cần sửa tay (để Claude tự sửa khi dựng)
chơi biết→chưa biết · rưu rương→du dương · sao y phách→sound effect · ra lại→ra lệnh · cảnh tráng→cảnh trám · sin động→sinh động · cảnh thường→cảnh thừa · của đang ổn→có đáng ổn · 1 trong 100%→edit 100%.
