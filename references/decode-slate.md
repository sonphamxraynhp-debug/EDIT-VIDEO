# Decode — video mẫu "Bảo Claude edit video mà nó làm gì đây????" (TikTok, 9:16)

Nguồn: TikTok, 576×1024, 30 fps, 38,67 s, AAC 44,1 kHz. Đo bằng ffmpeg (scene detect, khung 2 fps và full-res), lấy mẫu pixel, whisper word-timestamps, ebur128.

Video gồm **2 nửa**:
1. **0–18,5 s:** quảng cáo phần mềm. Người nói quay cảnh làm việc trên laptop, màn hình là một **editor chạy local** (`localhost:5186`, "Mike Editor 1.1"). Chỉ có nhạc nền, chữ chú thích để trong ô viền nét đứt màu tím.
2. **18,5–38,67 s:** video thành phẩm do editor đó xuất ra (style "slate grid"), sau đó là thẻ kết.

## 1. Phần mềm editor (thứ được chiếu trong 0–18 s)

| Vùng | Có gì | Ở AI Video Studio |
|---|---|---|
| Thanh trên | tên + phiên bản + tag dự án, "Chưa lưu/Đã lưu", ↶ ↷, "Lịch sử…", **Lưu** (vàng), **Xuất video** (xanh) | giống, thêm "Video mới" |
| Cột trái | tab **Tại đây / Tất cả / Đã chỉnh**, ô "Tìm chữ…", danh sách thành phần (tên · loại · thời điểm, ô tick, chấm màu) | giống; ô tick = ẩn/hiện |
| Giữa | preview 9:16 trên nền xanh nhạt, chọn chữ bằng khung nét đứt + 4 tay nắm, nút **+ Thêm chữ**, ô **Vùng an toàn**, **Vùng mặt**, gợi ý "Space phát · ← → từng khung · Alt+mũi tên dịch 1px" | giống, thêm menu **+ Graphic…** |
| Cột phải | tên + tag (Phụ đề / Chữ thêm) + khoảng thời gian; **Nội dung**; **Font** (VD Playfair Display) + **Độ đậm**; **Màu gốc** + ô màu; **Vị trí và cỡ** X / Y / Cỡ % + thanh trượt; cảnh báo "Chữ ra ngoài vùng an toàn" / "Trong vùng an toàn"; **Kiểu chữ**, **Hiệu ứng**; nút **Ẩn / Xoá / Về thiết kế**; **Ghi chú cho Claude · cảnh này** ("Lần sau nói với Claude 'xem ghi chú trong editor'") | đủ hết, thêm JSON đầy đủ, nhân bản, áp dụng kiểu cho mọi phụ đề |
| Dưới | "Timeline 1:41.43 · 18 shot · 111 thành phần", **Thu phóng**, các track **Cảnh / Chữ / Chữ thêm / Chữ graphic** + waveform, khối hồng/vàng, playhead hồng | giống, thêm track Graphic, B-roll, Âm thanh; kéo khối để dời, kéo mép để cắt, hít vào playhead và mép khối khác |

Ý tưởng cốt lõi: **Claude dựng bản đầu tiên, con người tinh chỉnh từng chi tiết bằng chuột**, rồi ghi chú lại để Claude sửa tiếp. Editor đọc và ghi đúng file dự án mà Claude dùng để render.

## 2. Style thành phẩm "slate grid" (18,5–38,67 s)

| t (giây video) | Lời | Trên màn hình |
|---|---|---|
| 18,5–23,6 | "viễn cảnh phim iRobot có khả năng xảy ra trong vài năm tới, thậm chí còn khủng khiếp hơn" | nền camera mờ; chữ nhỏ "viễn cảnh phim" + chữ to "iRobot" gradient xanh; **thẻ media bo góc** (cảnh phim); "trong vài năm tới" ô vàng; "thậm chí còn" trắng / "khủng khiếp hơn" vàng to |
| 23,6–29,5 | "nếu bạn không tin thì để mình tổng hợp những thông tin **gây shock**… xem xong sẽ thấy nó thực sự **đáng sợ**" | **thẻ video trên nền lưới xám-xanh** + huy hiệu logo; phụ đề trắng chữ thường; "gây shock" ô vàng font serif; **hàng 5 logo** ô trắng + **chữ LED "TIN SHOCK"** cam hiện từng ký tự; **chữ neon đỏ "đáng sợ"** nhấp nháy |
| 29,5–36,8 | "mấy ngày trước một nhà nghiên cứu… OpenAI và Anthropic… hai công ty đang chạy đua tới siêu trí tuệ có khả năng tự cải thiện" | thẻ video **mờ + tối**; **sơ đồ**: icon người "nhà nghiên cứu" → 2 chip logo OpenAI / Anthropic (di chuyển qua 3 vị trí) → đường cong nối lên **pill vàng "siêu trí tuệ"** có vòng elip nét đứt → **chữ "AI" to gradient xanh ngọc phát sáng** → **pill viền vàng "tự cải thiện"** |
| 36,8–38,3 | "điều này đồng nghĩa với việc…" | thẻ video rõ lại, phụ đề |
| 38,3–38,67 | — | **thẻ kết đen**: "SKILL AI EDIT VIDEO" (2 kiểu chữ trắng / cam), vệt cong tím, nhãn trắng logo + "Claude" serif, "Bạn thấy sao?" serif nghiêng |

### Số đo (đổi sang khung thiết kế 720×1280 = ×1,25)
- Nền: `#45545E`, lưới trắng 7,5 % dày 2 px, ô ≈ 31 px.
- Thẻ video: x 80, y 140, 560×1000 (≈ 9:16), bo 8 px, bóng đổ mềm. Mỗi shot zoom chậm thêm ≈ 2,5 %, đổi shot bằng cách mờ dần (blur dissolve) + punch nhẹ.
- Huy hiệu: ô bo 20 %, 118 px, tâm (360, 140) đè lên mép trên của thẻ, nền `#D97757`, glyph trắng.
- Phụ đề: chữ thường, Be Vietnam Pro 800, 31 px, trắng có bóng mềm, top y ≈ 790, tối đa 2 dòng, **từ hiện ra đúng lúc nói**. Từ khoá: **serif đậm (Playfair Display 800) ×1,45, chữ đen trên ô vàng `#F3E35A`**.
- Hàng logo: ô trắng 60 px, bo 26 %, cách 14 px, y ≈ 310, bật lần lượt (cách 0,07 s).
- LED: chữ 74 px cam `#FF8A1E` dạng chấm (lưới chấm ≈ 7 px), nền bảng đen chấm mờ, gõ ra 14 ký tự/giây, y ≈ 400.
- Neon: `#FF3348`, 80 px, nghiêng −3°, nhấp nháy 0,45 s rồi rung sáng nhẹ.
- Sơ đồ: chip nền `rgba(38,38,40,.82)` viền trắng 16 %, icon trong ô trắng; pill vàng `#F3E35A` chữ đen; pill viền vàng 2,5 px nền đen 75 %; "AI" 120 px gradient `#D9FFF3 → #5EE6C8 → #1F9C86` + quầng sáng; đường cong trắng 75 % tự vẽ ra trong 0,45–0,6 s.
- Khi sơ đồ hiện: video mờ 18 px + tối 38 % trong 0,35 s, ẩn phụ đề.

### Âm thanh
- Tổng **−6,4 LUFS**, LRA 18 LU: video TikTok bị đẩy rất to, phần đầu chỉ có nhạc. Skill xuất theo chuẩn −14 LUFS của Reels/TikTok (nền tảng sẽ tự chỉnh lại độ to).
- Nhạc nền chạy suốt; SFX nhẹ đúng lúc graphic vào (pop, blip, beep LED, static cho neon, sparkle cho pill). `auto_sfx.py` đã có luật cho từng module.

## 3. Điều làm nên "chất"
1. **Khung trong khung**: video nhỏ lại trên nền lưới, thêm huy hiệu thương hiệu. Nhìn như "sản phẩm của một công cụ", rất hợp nội dung tech/AI.
2. **Phụ đề tối giản + 1 từ khoá đổi font hẳn** (serif ô vàng). Mắt người xem dừng đúng chỗ.
3. **Mỗi ý lớn = 1 loại graphic khác nhau** (LED, neon, sơ đồ, thẻ media), không lặp lại.
4. **Sơ đồ kể chuyện**: nút di chuyển theo lời nói (người → 2 công ty → siêu trí tuệ → tự cải thiện).
5. **Kết bằng câu hỏi** ("Bạn thấy sao?") để kéo bình luận.
