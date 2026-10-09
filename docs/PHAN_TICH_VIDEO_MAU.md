# Phân tích video mẫu "Sơn demo"

Tài liệu này là **kiến thức gốc** của agent `video-editor`. Mọi con số dưới đây được **đo trực tiếp** trên video mẫu
(tách khung hình, đo vị trí/kích thước chữ, đo màu điểm ảnh, đo phóng to bằng so khớp đặc trưng nền, đo âm thanh)
và đã được chuyển thành cấu hình trong [`editor/style.json`](../editor/style.json).

| Thuộc tính | Giá trị |
|---|---|
| File | `Sơn demo.mp4` – 41.5 s |
| Hình | 1080×1920 (9:16), 30 fps, H.264 ~4.8 Mbps, yuv420p |
| Tiếng | AAC 44.1 kHz stereo ~197 kbps, độ lớn −18.7 LUFS, LRA 5.5 LU |
| Bố cục | Một người ngồi giữa khung, áo đen, nền phòng khách sáng (rèm, đèn, cây, kệ gỗ), nói thẳng vào camera, không nhạc nền |
| Chủ đề | "Vợ chồng có cần kể cho nhau hết mọi chuyện không?" – chia 4 mục + câu kết |

---

## 1. Nhịp cắt – cắt khoảng lặng

- `silencedetect -35 dB / 0.15 s` trên toàn video chỉ tìm thấy **một** khoảng lặng 0.27 s (ngay sau câu đầu).
  → Video được cắt rất sát: giữa các câu chỉ còn **≈ 0.2 s** "hơi thở", nghe liền mạch, không giật.
- **Không có zoom/đổi khung ở các điểm cắt** (so khớp đặc trưng nền tường/kệ cho tỉ lệ phóng = 1.000 suốt video):
  jump-cut được để nguyên vì người nói gần như bất động, nền tĩnh.
- Công cụ tương ứng:
  - Ngưỡng lặng tự tính theo từng video (nền nhiễu + 40 % khoảng cách tới mức giọng), **ngưỡng kép** (thấp hơn 8 dB)
    để không xén âm đầu/âm cuối nhỏ của từ.
  - Khoảng lặng ≥ 0.25 s bị cắt, giữ đệm 0.08 s trước và 0.12 s sau mỗi cụm nói → khoảng nghỉ còn ≈ 0.2 s như mẫu.
  - Điểm cắt căn đúng khung hình, âm thanh fade 8 ms ở mỗi mối nối (không tiếng "tách"); đã kiểm chứng
    khung hình đầu ra trùng khớp từng khung với video gốc (lệch 0 khung) → khớp môi tuyệt đối.
  - Cắt lặng dựa trên **năng lượng âm thanh**, không dựa vào mốc thời gian của nhận dạng giọng nói
    (mốc từ có thể lệch ±0.3 s quanh chỗ ngừng).

## 2. Chuyển cảnh (đo bằng so khớp nền)

| Thời điểm | Hiện tượng |
|---|---|
| 0.00 s | Mở đầu: cả khung **mờ mạnh → nét** trong ~0.2 s, kèm phóng nhẹ (≈1.06 → 1.0) |
| 10.2 / 21.4 / 29.4 / 37.4 s | Đúng lúc **sang mục mới**: cùng hiệu ứng mờ + phóng nhẹ ~0.2 s; tên mục cũ biến mất, tên mục mới hiện mờ→nét |

Ngoài 5 thời điểm đó khung hình đứng yên hoàn toàn.

## 3. Hệ chữ – một "look" duy nhất cho mọi chữ

Font gần nhất: **Be Vietnam Pro** (geometric sans, dấu tiếng Việt chuẩn). Mọi chữ dùng chung một kiểu tô:

| Thành phần | Giá trị đo |
|---|---|
| Ruột chữ | Gradient dọc: **trắng `#FFFFFF`** ở trên → **kem vàng `#FFE496`** ở dưới (dòng dưới vàng hơn dòng trên) |
| Quầng sát chữ | Kem `#FFECAA`, bán kính ~3 px |
| Phát sáng | **Vàng cam `#FFAA1E`**, mờ ~9 px + lớp rộng ~23 px – giúp đọc được cả trên nền tường sáng |
| Viền / hộp nền | **Không có** |
| Hiện / ẩn | **Mờ → nét** (Gaussian blur + mờ dần) ~0.13 s; ẩn ngược lại ~0.1 s |

## 4. Năm loại chữ trên màn hình

### 4.1 Phụ đề chạy (dưới ngực)
| Thuộc tính | Giá trị |
|---|---|
| Font / cỡ | Be Vietnam Pro ExtraBold ~78–80 px (ở 1080p) |
| Vị trí | Căn giữa ngang; **dòng cuối cố định ở ~83 % chiều cao** (y ≈ 1595), câu 2 dòng mọc lên trên (khoảng dòng ~100 px) |
| Dòng | Tối đa 2 dòng, rộng ≤ ~900 px |
| Cụm | 2–8 từ (thường 3–6), hiện 0.7–2 s, cách nhau một khoảng trống rất ngắn |
| Chữ | Chữ thường, **viết hoa chữ đầu khi bắt đầu câu mới** ("Nhưng có hôm đi làm về", "Thay vì hỏi"), không dấu câu, số viết bằng chữ số ("cả 2") |

Các cụm phụ đề thật trong mẫu:
```
Là vợ chồng có cần kể | cho nhau hết mọi chuyện không | Tôi nghĩ có những chuyện cần nói rõ
Khoản nợ chuyện sức khỏe | những quyết định | ảnh hưởng đến cả nhà | người kia cần được biết
thì họ cũng cùng mình | chịu trách nhiệm | Nhưng có hôm đi làm về | mặt buồn chưa muốn kể ngay
Đâu phải cứ im lặng | là đang giấu điều | có khi chính mình | còn chưa biết nói từ đâu | Thay vì hỏi
thử bảo khi nào muốn kể thì nói anh | Người đang buồn | cũng nên nói một câu | hôm nay anh hơi mệt
cho anh một lát rồi mình | để người bên cạnh đỡ phải | Và khi đã được nghe | nhớ giữ gìn
Đừng mang ra kể | giữa bữa cơm đông người | hay lôi lại mỗi lần cãi | Muốn người kia mở lòng
thì mình phải giữ | được điều họ tin mà kể | Vợ chồng gần nhau hơn | khi có chuyện khó nói | cả 2 vẫn muốn tìm đến nhau
```
> Lỗi trong mẫu cần tránh: phụ đề tự động **bỏ sót từ** ("…hỏi *dồn có chuyện gì mà không nói*", "…đỡ phải *đoán*",
> "…mỗi lần cãi *nhau*") và ngắt dòng lẻ một từ ("Là vợ chồng có cần / kể"). Agent phải giữ **đủ lời nói** và ngắt dòng cân đối.

### 4.2 Tiêu đề mở đầu (hook) – "Vợ chồng / có cần kể hết?"
| Thuộc tính | Giá trị |
|---|---|
| Thời gian | Hiện từ ~0.6–1.0 s, giữ tới ~3.6 s (hết câu hỏi mở đầu); phụ đề **vẫn chạy** bên dưới |
| Dòng chính | 1–3 từ chủ đề, ExtraBold **~175 px**, lệch trái nhẹ, tâm ở ~60 % chiều cao |
| Dòng phụ | Câu hỏi ngắn, ExtraBold *nghiêng* ~100 px, lệch phải, sát ngay dưới dòng chính |
| Bóng ma | Bản sao chữ **trắng mờ ~40 %** trượt lệch xuống-phải (~14, 40 px) sau ~0.25 s – tạo chiều sâu |
| Hiệu ứng vào | Mờ → nét ~0.2 s |

### 4.3 Tên mục (góc trên trái)
"Cần nói rõ" → "Khi người kia im lặng" → "Khi mình đang buồn" → "Khi đã được nghe".
Be Vietnam Pro Bold ~78 px, x ≈ 55 px, tâm ở ~6.7 % chiều cao. Giữ suốt mục; sang mục mới kèm chuyển cảnh mờ (mục 2).
Mục đầu tiên hiện khi người nói vào ý chính (2.4 s), không kèm chuyển cảnh.

### 4.4 Ghi chú giữa khung (trên phụ đề)
ExtraBold *nghiêng* ~56–58 px, dòng cuối ở ~70 % chiều cao, khoảng dòng ~90 px; **các dòng hiện lần lượt đúng lúc
người nói nhắc tới**, dòng trên giữ nguyên chỗ.

| Kiểu | Ví dụ trong mẫu | Cách khai báo |
|---|---|---|
| Danh sách ✅ (căn trái, x ≈ 108 px) | ✅ Khoản nợ / ✅ Sức khỏe / ✅ Quyết định ảnh hưởng cả nhà | `lines` có `at` |
| Danh sách ❌ | ❌ Kể giữa bữa cơm đông người / ❌ Lôi lại mỗi lần cãi | như trên |
| Gạch bỏ quan niệm sai (căn giữa) | ~~Im lặng = đang giấu~~ → Chưa biết nói từ đâu | `strike_at` (gạch chạy từ trái sang) |
| Trích lời nên nói | 👉 "Khi nào muốn kể thì nói anh nhé" · "Hôm nay anh hơi mệt" | 1 dòng, ngoặc kép cong |
| Ý chốt của mục | Giữ được điều họ tin | 1 dòng căn giữa |

### 4.5 Câu chốt cuối – "❤️ Gần nhau hơn ❤️"
Be Vietnam Pro Bold ~115 px, căn giữa ở ~62 % chiều cao, emoji tim hai bên, có bóng ma trắng lệch xuống; giữ tới hết video.

## 5. Cấu trúc nội dung (để agent chọn tiêu đề, mục, ghi chú)
1. **Câu hỏi mở đầu** (0–3.5 s) → hook 2 dòng: chủ đề + câu hỏi.
2. **Các mục** = các tình huống/luận điểm ("Cần nói rõ", "Khi người kia im lặng", "Khi mình đang buồn", "Khi đã được nghe")
   → tên mục góc trên trái, chuyển cảnh mờ ở đầu mỗi mục.
3. Trong mỗi mục, **những gì có thể liệt kê / trích dẫn / đảo ngược quan niệm** → ghi chú giữa khung.
4. **Câu kết** → chữ to giữa khung kèm emoji.

## 6. Âm thanh & xuất file
- Lọc ù < 70 Hz; chuẩn hoá **tuyến tính** (2 lượt đo) về −14 LUFS, đỉnh −1.5 dBTP – to rõ chuẩn TikTok/Reels mà không
  "bơm" âm thanh.
- Giữ nguyên độ phân giải và tốc độ khung của video gốc; H.264 CRF 17 (gần như không mất chất lượng), AAC 192 kbps,
  `faststart`. Cắt + chữ + hiệu ứng được dựng trong **một lần mã hoá**. Video HDR (iPhone) được chuyển về SDR BT.709.
