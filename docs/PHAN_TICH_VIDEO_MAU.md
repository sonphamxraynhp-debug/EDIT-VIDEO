# Phân tích video mẫu – phong cách edit "Bác sĩ Phạm Sơn"

Tài liệu này là **kiến thức gốc** mà agent `bien-tap-video` dùng khi edit. Mọi thông số ở đây đã được
chuyển thành cấu hình trong [`editor/style.json`](../editor/style.json).

Nguồn phân tích (3 mẫu do người dùng cung cấp):

| # | Mẫu | Thời lượng | Định dạng |
|---|-----|-----------|-----------|
| 1 | `mẹ bầu nghén.mp4` | 33.3 s | 1080×1920, 30 fps, HEVC 7.2 Mbps, AAC 44.1 kHz stereo |
| 2 | `tăng cân.mp4` | 26.2 s | 1080×1920, 30 fps, HEVC 7.0 Mbps, AAC 44.1 kHz stereo |
| 3 | Ảnh khung hình "mẹ bầu mệt nhưng không dám nghỉ ngơi" | – | 1080×1920 |

Bố cục chung: video dọc 9:16, bác sĩ ngồi giữa khung (áo blouse trắng, nền logo phòng khám, mic thu âm,
máy siêu âm bên phải), nói thẳng vào camera. Không có nhạc nền rõ rệt – giọng nói là trung tâm.

---

## 1. Nhịp cắt (cắt khoảng lặng)

- Video đã được cắt rất sát: **không còn khoảng lặng nào > 0.3 s** (đo bằng `silencedetect -35 dB`).
  Khoảng nghỉ còn lại giữa các câu chỉ ≈ 0.2–0.4 s → nghe liền mạch nhưng vẫn có "hơi thở".
- Mẫu 2 gần như không có khoảng lặng nào > 0.15 s; mẫu 1 còn vài khoảng 0.3–0.44 s ở chỗ chuyển ý.
- Cách làm tương ứng trong công cụ:
  - Ngưỡng lặng **tự tính theo từng video** (nền nhiễu + 40% khoảng cách tới mức giọng nói) thay vì cố định.
  - Khoảng lặng ≥ 0.3 s bị cắt; giữ lại 0.10 s trước và 0.14 s sau mỗi cụm nói → khoảng nghỉ ≈ 0.24 s.
  - **Không bao giờ cắt vào giữa một từ**: mốc thời gian từng từ của Whisper được hợp nhất vào vùng giữ lại.
  - Điểm cắt được **căn đúng khung hình** và âm thanh có fade 12 ms ở mỗi mối nối → không "tách", không lệch tiếng.

## 2. Đổi khung / zoom (giấu jump-cut)

- Phát hiện cảnh (`scdet`) trên mẫu 1: đổi khung tại 3.7 s, 9.0 s, 16.4 s, 21.2 s, 25.6 s, 30.7 s
  → **mỗi khung giữ 4–7 s**, lần đổi đầu tiên đúng lúc tiêu đề mở đầu biến mất.
- Có 3 cỡ khung xen kẽ: **rộng (1.0)** – thấy trọn logo; **trung (~1.12)**; **cận (~1.28–1.35)** – mặt to, logo bị cắt.
- Zoom luôn hướng về **khuôn mặt** (mặt giữ nguyên vị trí tương đối trong khung).
- Mỗi chỗ cắt khoảng lặng là một "jump-cut" → đổi cỡ khung tại đó để người xem không thấy giật.
- Công cụ: tự dò mặt (OpenCV), đổi khung tại điểm cắt nếu đã giữ ≥ 1.6 s, hoặc ở ranh giới câu nếu đã giữ quá 6.5 s;
  chu kỳ cỡ khung `rộng → cận → trung → cận → …`.

## 3. Tiêu đề mở đầu (hook) – bong bóng thoại

Xuất hiện ngay giây 0, kéo dài **1.5–3.7 s** (hết câu nói đầu tiên), trong lúc này **không có phụ đề chạy**.

| Thành phần | Mô tả |
|-----------|-------|
| Khung | Bong bóng thoại nền **kem** `#FBF3DE`, viền **tím** `#8E5CD6` nét "vẽ tay" hơi lượn sóng, dày ~8 px |
| Lớp sau | Một bong bóng **tím nhạt** `#BA96F0` cùng hình, lệch lên-phải ~25 px tạo chiều sâu |
| Đuôi | Mũi nhọn ở cạnh dưới, ~20% từ trái sang, chỉ xuống |
| Rộng | ~84% chiều ngang khung |
| Vị trí | Trên cùng (tâm ~14% chiều cao, che một phần logo) – 2/3 mẫu; hoặc dưới (~74%) – mẫu 1 |
| Chữ | Tối đa 2 dòng, cỡ lớn (~92–100 px ở 1080p) |
| Hiệu ứng vào | Bong bóng hiện trước, chữ **mờ (blur) → nét** trong ~0.3 s |

Ba kiểu chữ quan sát được (`hook.style`):

| Kiểu | Mẫu | Font gần nhất | Màu |
|------|-----|---------------|-----|
| `clean` | "Bước lên cân mà mẹ bầu hồi hộp" | Be Vietnam Pro ExtraBold | Chữ đen, viền trắng |
| `neon` | "MẸ BẦU NGHÉN" | Montserrat ExtraBold, IN HOA | Chữ trắng, viền đen, phát sáng hồng `#FF2896` |
| `elegant` | "mẹ bầu mệt nhưng không dám nghỉ ngơi" | Playfair Display Black Italic | Chữ đen, viền trắng, phát sáng hồng |

Nội dung hook = **câu nói mở đầu** (mẫu 2, mẫu 3) hoặc **chủ đề ngắn gọn** (mẫu 1 "MẸ BẦU NGHÉN").

## 4. Phụ đề chạy

| Thuộc tính | Giá trị |
|-----------|---------|
| Hộp | Chữ nhật **trắng** bo góc lớn (~34 px), không viền, đệm ~34 px ngang / 20 px dọc |
| Font | Serif đậm (gần Merriweather ExtraBold), **đen**, cỡ ~58 px ở 1080p |
| Vị trí | Căn giữa ngang, tâm hộp ở **~77.5% chiều cao** (ngang ngực/tay bác sĩ, không che mặt) |
| Dòng | Tối đa **2 dòng**, mỗi dòng ≤ ~820 px; dòng trên dài hơn hoặc bằng dòng dưới |
| Chữ | **Chữ thường**, **không dấu câu**; giữ hoa cho tên riêng (Phạm Sơn, Hưng Yên…), số viết bằng chữ số ("2 mẹ con") |
| Độ dài câu | Mỗi câu là một **cụm ý ngắn** 3–11 từ, hiện ~0.8–2.8 s |
| Ngắt câu | Ở chỗ ngừng nói (≥ 0.25 s), dấu câu, hoặc trước từ nối (*nhưng, mà, thì, vì vậy…*); không để câu kết thúc bằng từ lửng (*của, là, và…*) |
| Chuyển câu | Cắt thẳng, không hiệu ứng; câu sau thay câu trước ngay lập tức |

Ví dụ ngắt câu thật trong mẫu 2:
```
như chờ điểm thi
tăng cân thì sợ béo
không tăng cân lại sợ / con thiếu chất
mẹ bầu biết làm sao cho vừa
có mẹ đi khám không / dám nhìn cân
bác sĩ cần xem thể / trạng tuổi thai
vì vậy mẹ đừng lấy cân nặng / của người khác làm mục tiêu
```
> Lưu ý lỗi trong mẫu gốc: "tuổi **Thai**" bị viết hoa sai (lỗi nhận dạng). Agent phải soát và sửa những lỗi kiểu này.

## 5. Ảnh minh hoạ (B-roll)

- Ảnh minh hoạ (ảnh AI: mẹ bầu buồn nôn bên bàn ăn, mẹ bầu trong phòng ngủ, mẹ bầu đi siêu âm…) **phủ dải trên cùng
  ~27% chiều cao**, bác sĩ vẫn hiện bên dưới, phụ đề vẫn chạy.
- Ảnh hơi trong suốt (~93%), **mờ dần ở mép dưới** nên logo phòng khám phía sau lộ nhẹ.
- Mỗi ảnh hiện 5–12 s, khớp với đoạn đang nói về tình huống đó.
- Công cụ: khai báo trong `edit_plan.json` → `"broll": [{"file": "anh.jpg", "start": 7.5, "end": 15}]`.

## 6. Âm thanh & xuất file

- Giọng rõ, to đều (đỉnh ~0 dB). Công cụ chuẩn hoá về **−14 LUFS** (chuẩn TikTok/Reels), lọc ù < 70 Hz.
- Xuất **giữ nguyên độ phân giải & tốc độ khung** của video gốc, H.264 CRF 16 (gần như không mất chất lượng),
  AAC 192 kbps, `faststart` để đăng mạng xã hội. Toàn bộ cắt + zoom + chữ được dựng trong **một lần mã hoá**.

## 7. Cấu trúc nội dung (để agent viết/chọn hook)

1. **Hook** (0–3 s): câu nói chạm nỗi lo của mẹ bầu ("Bước lên cân mà mẹ bầu hồi hộp").
2. **Đồng cảm**: liệt kê tình huống thật ("có mẹ… có mẹ…").
3. **Giải thích/khuyên**: điều bác sĩ muốn mẹ hiểu.
4. **Kêu gọi**: "lần khám tới hãy hỏi với em…", câu hỏi tương tác cuối ("mẹ thuộc hội… hay hội…?").
