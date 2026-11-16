# Decode — video mẫu "3 mã lệnh ép ChatGPT viết như người thật" (9:16)

Nguồn: Facebook Reel, 720×1280, 30 fps, 45,37 s, AAC 44,1 kHz stereo. Đo bằng ffmpeg (scene detect, khung 10 fps), lấy mẫu màu pixel, whisper word-timestamps, phổ âm thanh.

## 1. Cấu trúc (giây trên video)

| # | t0 → t1 | Bố cục | Lời thoại (rút gọn) | Trên màn hình | Vào cảnh |
|---|---|---|---|---|---|
| 1 | 0.00 → 1.72 | **A · hook_card** | "Đây là cách bắt ChatGPT viết như người thật…" | thẻ trắng bo 38 px chứa màn hình chat cuộn; dòng 1 trắng "3 MÃ LỆNH ÉP CHATGPT" trượt từ trái (0.0); dòng 2 vàng "VIẾT NHƯ NGƯỜI THẬT" bật ở dưới (y≈712, 0.5) rồi bay lên y≈602 (0.7); người tách nền ở đáy | mở thẳng |
| 2 | 1.72 → 3.68 | **C · spotlight** | "…qua mặt mấy công cụ dò AI luôn nha" | camera blur ~16 px; camera tròn sắc nét d≈310 ở trên; "DÒ AI" vàng to lật từng chữ 3D (1.8); "QUA MẶT CÔNG CỤ" trắng trượt từ phải (2.25); sticker người + kính lúp + ✔ trượt từ trái có motion blur (2.4) | cắt cứng + punch nhẹ |
| 3 | 3.68 → 5.25 | camera | "Đầu tiên anh em vô ChatGPT…" | logo trắng viền đen ở ngực + bàn tay pixel bấm 2 lần (3.85) | cắt cứng |
| 4 | 5.25 → 24.2 | **B · bubble_screen** | bước 1 (/humanize) + bước 2 (Wikipedia) | nền lưới đỏ-cam-vàng; bubble vàng #F7BE48 d≈275 tâm (360,315) chứa người tách nền; thẻ màn hình viền đen 3 px y 545→1000; zoom vào đoạn đang nói (10.4, 17.8); chữ lửa "KHÔNG VIẾT CÁI TỪ NGỮ / NHƯ CHATBOT" (19.9–20.3) | bubble bật lên trên mặt, nền + thẻ **rơi từ trên xuống** 0.3 s |
| 5 | 24.2 → 25.45 | camera | "Nghe vô lý mà có thiệt đó" | — | cắt cứng |
| 6 | 25.45 → 26.95 | **C · spotlight** | "Mà bước cuối này mới đỉnh nè" | "CỰC ĐỈNH" vàng lật 3D, "BƯỚC CUỐI" trắng trượt phải; sticker người ăn mừng + 📈 🎵 💰 trồi từ dưới | cắt + punch |
| 7 | 26.95 → 38.25 | **B · bubble_screen** | bước 3: đóng gói thành Skill "humanizer" | gõ prompt → trả lời; chồng chữ "ink" vàng viền đen: "/humanizer" (33.95), "Văn bản như người viết" (35.2), "Hạn chế AI quét" (36.6) — mỗi dòng vào **đúng lúc nói** | mờ dần 0.25 s |
| 8 | 38.25 → 45.37 | camera + CTA | "Anh em muốn lấy trọn bộ hướng dẫn… follow… bình luận chữ GPT" | "TRỌN BỘ HƯỚNG DẪN / VIẾT NHƯ NGƯỜI THẬT" vàng phát sáng cam, vào từ mờ+to (39.6–42.15); nút đen "Follow" mở ngang (42.4) + dấu ✓ xanh; "GPT" trắng phát sáng xanh neon (43.55) | cắt cứng |

Nhịp: đổi bố cục lớn **8 lần / 45 s** (trung bình 5.6 s), mỗi bố cục có ≥ 1 sự kiện chữ/sticker mỗi 1–2 s. **Không có phụ đề chạy chữ**. Thay vào đó, mỗi cảnh chỉ hiện 1–3 cụm từ khoá.

## 2. Bảng màu (lấy mẫu pixel)

| Vai trò | Mã |
|---|---|
| nền: rìa đỏ | `#AA2619` |
| nền: giữa cam → vàng (radial, tâm y≈560–600) | `#DE5A1E` → `#E9C21B` |
| đường lưới (đoạn đứt quãng, 2 px, ô ~122 px) | cam `rgba(255,170,70,.55)` |
| bubble | `#F7BE48`, viền `#E3A53A` |
| viền thẻ màn hình | `#0F0E0A` 3 px |
| chữ hero vàng | `#FCDB36` + bóng đen cứng (3,4) |
| chữ "ink" | `#FFE53B` + viền đen 3 px + bóng (5,6) |
| chữ lửa | `#E8432A` + viền trắng 2.5 px + bóng nâu |
| chữ glow | `#FFFF22` + quầng cam `#FF7A00/#FF5A00` |
| neon | trắng + quầng `#9CFF4A` |

## 3. Chữ
- Font hiển thị: sans hình học **siêu đậm nghiêng** (khớp Montserrat 900 italic, đủ dấu tiếng Việt). Chữ hoa cho tiêu đề/hero, chữ thường cho khối "ink".
- Cỡ trên khung 720 px: tiêu đề hook 46, hero 80–84, label 46–56, ink 66/46, glow 44, neon 110.
- Vị trí: luôn **căn giữa ngang**. Tránh vùng mặt (y 400–700 trên camera thường). Trên bố cục B, chữ chồng lên nửa dưới thẻ (y 730–910).

## 4. Chuyển động (đo theo 10 fps)
- slide_l / slide_r: 0.35 s, outExpo, có skew + blur khi vào.
- fly (dòng 2 hook): bật scale .3→.72 tại vị trí thấp, giữ ~0.05 s, rồi bay lên trong 0.22 s.
- tumble (hero): từng ký tự lật rotateX −95°→0 với outBack, giãn 0.05–0.06 s/ký tự.
- blur_zoom (glow CTA): scale 1.7→1, blur 16→0 trong 0.35 s.
- Sticker: trượt ngang 520 px trong 0.3 s, motion blur 18 px → 0; hoặc trồi từ dưới (outBack).
- Follow: viên thuốc mở scaleX .25→1 (0.35 s) → chữ trượt lên → dấu ✓ bật (+0.6 s).
- Chuyển cảnh: chủ yếu cắt cứng. Vào bố cục B bằng cách rơi xuống (drop) hoặc mờ dần. Có punch nhẹ (scale 1.06) khi vào spotlight.

## 5. Âm thanh
- Loudness tổng **−14.1 LUFS**, LRA 3.1 LU (giọng nén đều).
- Có nhạc nền nhẹ suốt video (vẫn nghe được nền trung tần khi giọng nghỉ, khoảng −30 dB). Nhịp tự tương quan ≈ **118 BPM**. Thư viện skill có `happy` (ukulele + clap 118 bpm) khớp nhịp, `corporate` (112 bpm) là phương án thứ hai. Gain −12 trong `audio.music` (sau ducking nền nằm ≈ 16 dB dưới giọng).
- SFX nhẹ, dạng tonal: dải chồng ~1–1.4 kHz / 3.5 kHz / 5.4 kHz ở 0.0 s (vào hook), ~2.2 s (sticker), 22.5 s và 27.3 s (chữ, đổi cảnh), 40.5 s (glow), 43.3 s (Follow/GPT: tiếng "ding" thông báo + lấp lánh). Không có tiếng boom hay impact lớn. Toàn bộ là whoosh mỏng, pop và ding.
- `auto_sfx.py` của skill đặt đúng các loại tiếng này theo module (xem `audio-spec.md`).

## 6. Điều làm nên "chất" của style
1. Ba bố cục lặp lại theo nhịp kể "nói → chứng minh trên màn hình → nhấn mạnh". **Spotlight dùng ở câu "móc"**, **bubble_screen dùng ở đoạn hướng dẫn**.
2. Bubble tròn luôn ở cùng vị trí, nên người xem không bị mất "người nói".
3. Màn hình thật được phóng to vào đúng dòng đang nói tới.
4. Chữ chỉ là từ khoá, mỗi dòng vào đúng từ được nói.
5. CTA cuối gồm nút Follow và từ khoá comment phát sáng, để kéo bình luận.
