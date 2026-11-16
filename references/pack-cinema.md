# Gói `cinema` — Điện ảnh kể chuyện 🎬

File: `engine/packs/cinema.js` · ví dụ: `examples/timeline.cinema.json` (20,2 s, đủ 8 module, không cần ảnh ngoài) · phụ đề: `caption_style: "cinema"` · nhạc gợi ý: `epic` (tuyên bố, tầm nhìn), `sad`/`lofi` (hoài niệm), `suspense` (bí ẩn).

Dùng cho video **kể chuyện kiểu phim**: vlog hành trình, hồi ký, phim ngắn thương hiệu, "một ngày của…", câu chuyện khách hàng. Cảm giác: chậm, sang, có hạt phim, chữ nhỏ và thưa.

## 1. Nhận diện
| Thành phần | Mặc định | Ghi đè |
|---|---|---|
| Thanh letterbox | đen, ngang 2.35:1 (thanh 88 px) / 2:1 (40 px). Dọc: trên 150, dưới 290 (khung hình y 150–990) | `ratio`, `top`, `bottom`, `bar_color`, `brand.bar` |
| Màu phim | `teal` (bóng xanh két, sáng cam) | `grade`: `teal` · `warm` (phim ấm) · `bw` (đen trắng tương phản) · `bleach` (bleach bypass, nhạt màu, gắt) · `none` |
| Chữ tiêu đề / trích dẫn | Playfair Display nghiêng | `brand.serif` |
| Chữ đánh máy / giờ | Space Mono (gói tự nạp, có dấu tiếng Việt) | — |
| Chữ thường, phụ đề | Be Vietnam Pro 400–600, giãn chữ | `brand.font` |
| Màu nhấn | vàng phim `#E9C77B` | `brand.accent` (khi khác mặc định của BR) |

## 2. Module
Tham số chung: `t0, t1, x, y, size, keep, hideCaptions`. Mọi module có `data-cid`. Vị trí mặc định của title, quote, location, type tự tính theo **khung hình bên trong letterbox** (nếu có).

| type | Dùng khi | Tham số riêng |
|---|---|---|
| `cine_letterbox` | **cả video, đặt đầu tiên trong `scenes`** | `ratio`=2.35 (hoặc 2), `grade`, `intro`=0,9 s (thanh trượt vào), `outro` (giây thanh rút ra ở cuối, mặc định không rút), `grain`=.32, `vignette`=.55, `flicker`=.05, `weave:false` (tắt rung khung), `dust:false`, `top/bottom` (px). Vẽ một bản A-roll đã chỉnh màu và rung khung nhẹ (back), rồi vignette, hạt phim, nhấp nháy, bụi, hai thanh đen (front). `cover:false`, không che phụ đề |
| `cine_title` | mở đầu, chuyển chương | `kicker`='CHƯƠNG I' (giữa hai vạch mảnh, `''` để bỏ), `title`, `sub`, `w`, `wash` (độ tối nền, 1). Chữ Playfair nghiêng mờ → nét, giãn chữ co dần. Ẩn phụ đề |
| `cine_type` | dòng ký ức / mốc thời gian: "Hà Nội, 2019" | `text`, `cps`=12 ký tự/giây, `delay`=.2, `align`='center' (dọc) / 'left' (ngang), `bold`, `color`. Con trỏ khối nhấp nháy 2 Hz sau khi gõ xong. Mặc định ở phần trên khung hình |
| `cine_location` | 0,8 s đầu cảnh mới | `place` (chữ hoa giãn rộng, hiện bằng màn trượt), `time` (gõ chữ mono từ +0,8 s), `cps`. Góc dưới trái khung hình, có vạch vàng dọc |
| `cine_quote` | câu "đinh", từ khoá `hl` | `text`, `author`, `wps`=4 từ/giây, `w`. Khung tối 62 % + mờ nhẹ, ngoặc kép vàng, từng từ hiện dần. Ẩn phụ đề |
| `cine_credits` | cuối phim | `title` ('Hết'), `lines:[{role,name}]`, `thanks`, `logo` (`si:…`/ảnh), `mode`: `'card'` (các dòng hiện dần, tự chọn khi < 5 s) hoặc `'roll'` (cuộn lên, tự chọn khi ≥ 5 s). Nền đen nằm **dưới** thanh letterbox. Giữ phụ đề (đặt `hideCaptions:true` nếu không muốn) |
| `cine_flash` | chuyển cảnh, 0,6–0,9 s | `color`: `warm` · `cool` · `white`, `side`='left'\|'right' (hướng quét), `intensity`=1, `over_bars:true` (loé cả lên thanh đen; mặc định chỉ trong khung hình) |
| `cine_slowmo` | khoảnh khắc "chậm lại" | `speed`=1 (chỉ có bóng mờ) hoặc <1 (vd .6: hình chạy chậm thật, tiếng giữ nguyên nên khẩu hình lệch, hợp cảnh không nói), `ghosts`=3, `step`=.05 s, `trail`=.42 (độ đậm bóng). Bóng mờ lấy từ khung t−0,05/−0,1/−0,15 qua `arollImg`, dùng chung màu phim với letterbox đang chạy. `cover:true` |

## 3. Phụ đề `cinema`
Phụ đề phim: Be Vietnam Pro 400, cỡ 26 (dọc) / 22 (ngang), giãn chữ .06em, màu kem `#F2EEE6`, **viết hoa đầu câu** (sentence case), từng từ hiện mờ dần đúng lúc nói. Từ `hl` đổi sang Playfair nghiêng màu vàng phim. Vị trí tự động:
- có `cine_letterbox`: **nằm trong thanh dưới**. Dọc: sát mép trên thanh (≈ y 1012). Ngang: canh giữa thanh, một dòng (bỏ qua `br`);
- không có letterbox: y 930 (dọc) / 640 (ngang).

Chỉnh được `x, y, size, font, color, weight, hl_color`.

## 4. Lời nói → module (recipe)
| Nghe thấy | Đặt module |
|---|---|
| cả bài | `cine_letterbox` 2.35:1, `grade:'teal'` |
| 0,1–2,8 s | `cine_title` "CHƯƠNG I" + tiêu đề dự án (không có thì 6 từ đầu) |
| ≈ 2,5 s | `cine_flash` warm (cắt từ tiêu đề vào chuyện) |
| 0,8–4,6 s | `cine_location` (`brand.city` hoặc "Việt Nam", "Hôm nay") |
| nói một năm "2019", "2024"… | `cine_type` "Năm 2019" đúng lúc nói, 2,5 s |
| câu đầu tiên có từ `hl` (sau 4 s) | `cine_quote` với câu đó + câu kế, ~3,4 s |
| 4 s cuối | `cine_credits` (Đạo diễn = `brand.name`, Dựng phim = AI Video Studio, lời cảm ơn / handle) |

## 5. Mẹo
- Letterbox luôn là scene **đầu tiên** để các graphic khác (title, quote, credits) nằm trên lớp màu phim.
- Đổi màu giữa video: chia thành nhiều `cine_letterbox` liền nhau (`intro:0` cho đoạn sau để thanh không chạy lại), ví dụ đoạn hồi tưởng dùng `bw` hoặc `warm`.
- SFX hợp: `whoosh_slow`/`shimmer` cho `cine_flash`, `vinyl_crackle` dưới đoạn hồi ức, `typewriter`-kiểu `click` cho `cine_type` nếu thư viện có.
- Khung ngang 16:9 là đẹp nhất (thanh 2.35:1 chuẩn). Khung dọc dùng khung hình y 150–990, phụ đề trong thanh dưới, vẫn nằm trên vùng UI của TikTok/Reels.
