# Gói `share` — Chia sẻ / kể chuyện 💬

File: `engine/packs/share.js` · ví dụ: `examples/timeline.share.json` (~20 s, đủ 12 module) · phụ đề: `caption_style: "share"` · nhạc gợi ý: `mellow` (kể chuyện, tâm sự) hoặc `inspire` (bài học, động lực).

Dùng cho video **chia sẻ kinh nghiệm, kể chuyện, quan điểm cá nhân, bài học cuộc sống/kinh doanh, trả lời bình luận**. Cảm giác: ấm, gần gũi, như trang sổ tay, không ồn ào.

## 1. Nhận diện (look)
| Thành phần | Mặc định | Ghi đè |
|---|---|---|
| Giấy (thẻ) | kem `#F4EDE2` + vân giấy (SVG noise + gradient) | `TL.brand.paper`, `scene.palette.paper` |
| Mực (chữ) | `#1D1B19` | `brand.ink` / `brand.dark` |
| Nhấn | cam đất `#D9653B` | `brand.primary` |
| Phụ | xanh xô thơm `#8FA98F` | `brand.sage` / `brand.accent` |
| Chữ serif | Playfair Display (có đủ dấu tiếng Việt); số và ngoặc kép dùng DM Serif Display | `brand.serif` |
| Chữ thường | Be Vietnam Pro | `brand.font` |
| Chữ viết tay | Pacifico (chú thích ảnh polaroid, ghi chú ở thẻ bài học) | — |

- Thứ tự ưu tiên màu: mặc định của gói < `TL.brand` (chính object mà `BR()` gộp vào) < `scene.palette` (`{paper, paper2, ink, accent, sage, muted, serif, sans}`).
- **Chữ nhấn trong mọi text**: bọc từ khoá bằng dấu sao, ví dụ `"Đi chậm cũng được, miễn là *đừng dừng lại*."`. Từ được bọc chuyển sang serif nghiêng màu cam đất; riêng `sh_quote` và `sh_lesson` còn được gạch chân kiểu viết tay.
- Chữ hiện dần **từng từ** (mờ → rõ, trượt nhẹ lên). Tốc độ đặt bằng `wps` (số từ mỗi giây).
- Khung dọc 720×1280 là chính. Các thẻ ở nửa dưới được **neo theo mép dưới**: `y` là mép dưới của thẻ, mặc định 985, nên thẻ dài thêm thì mọc lên trên và không tràn khỏi vùng an toàn (y 130–1000). Khung ngang (1280×720) dùng chung code, toạ độ lấy từ `DIMS()`.

## 2. Module
Tham số chung: `t0, t1, x, y, size` (cỡ chữ chính), `w` (độ rộng thẻ), `tilt` (độ nghiêng), `keep` (không mờ đi khi kết thúc), `palette`, `hideCaptions`. Gốc mỗi module và từng mục con (`items[]`, `options[]`, `images[]`) đều có `data-cid` để chọn trong Studio.

| type | Dùng khi | Tham số riêng |
|---|---|---|
| `sh_quote` | trích một câu nói, câu mở đầu "đinh" | `text`, `author`, `wps`=5, `full:true` (trang giấy phủ toàn khung) |
| `sh_stat` | nói một con số: "3 năm", "1,2 tỷ", "90%" | `value` (giữ nguyên chữ, phần số tự đếm lên), `label`, `kicker`, `count`=1.1 s, `card:false` (chữ kem nổi trên video), `color` |
| `sh_list` | "3 điều / 3 bài học" | `title`, `items:[{text,t}]` hoặc mảng chuỗi (tự giãn theo `gap`=1.3 s), `kicker`. Mục đang nói được tô đậm, số nền cam; mục đã qua mờ đi và có dấu ✓ xanh; mục chưa tới chỉ hiện vòng số nét đứt |
| `sh_timeline` | kể hành trình theo năm | `items:[{year,text,t}]`, `title`, `orient:'v'|'h'` (dọc mặc định khi khung dọc), `gap`=1 s, `card:false` |
| `sh_comment` | "Trả lời bình luận của @user" | `user`, `text`, `avatar` (ảnh, không có thì dùng chữ cái đầu), `avatar_bg`, `likes`, `reply_label`, `bg`. Trượt xuống từ phía trên, mặc định y=228 |
| `sh_poll` | tranh luận A/B: "làm thuê hay ra riêng?" | `question`, `options:[{text,pct,color?}]` (2–3 lựa chọn), `note`, `kicker`, `count`. Lựa chọn thắng tô cam, còn lại xanh xô thơm |
| `sh_chapter` | chuyển phần/chương | `num`='PHẦN 2', `title`, `sub`, `big` (số rỗng nét phía sau, mặc định lấy từ `num`), `mode:'full'` (trang giấy quét lên phủ khung) hoặc `'overlay'` (dải giấy ở 1/3 dưới, vẫn hiện phụ đề) |
| `sh_lesson` | chốt "Bài học" | `text`, `note` (dòng viết tay Pacifico), `kicker`='Bài học', `wps`. Bóng đèn sáng dần, gạch chân viết tay dưới các `*từ khoá*`; không có từ khoá thì gạch dưới cả đoạn |
| `sh_source` | nhắc tới sách/nguồn | `title`, `author`, `note`, `cover` (ảnh bìa; không có thì tự dựng bìa sách màu `color`), `kicker` |
| `sh_memory` | kể kỷ niệm, "ngày đó…" | `images:[{src,caption,date}]` (tối đa 3, xoè quạt); không có ảnh thì **dừng hình người nói** ở `freeze` (mặc định `t0`). `caption`, `date` (dấu ngày kiểu máy film), `stagger`, `backdrop:false` |
| `sh_cta` | 3 s cuối | `title`, `kicker`, `save`/`share` (nhãn nút), `save_at`/`share_at` (lúc nút "bấm"), `handle` (mặc định `brand.handle`), `wps` |
| `sh_grade` | **phủ cả video** để tạo màu phim ấm | `mode:'warm'|'film'|'soft'`, `intensity`=1, `vignette`=.5, `grain` (.3, riêng film là .5), `tint`, `leak:true` (vệt sáng loé ở góc), `fade:false`. **Đặt đầu tiên trong `scenes`** để nằm dưới mọi graphic khác |

Các module dạng thẻ (quote, stat, list, timeline, poll, lesson, source, memory, cta) **mặc định ẩn phụ đề** để không chồng lên nhau. Đặt `hideCaptions:false` nếu muốn giữ phụ đề, nhớ dời thẻ lên bằng `y`.

## 3. Phụ đề `share`
Biên tập, điềm tĩnh: chữ màu kem `#FBF6EE`, Be Vietnam Pro 600, cỡ 34, đổ bóng mềm cùng một lớp mực loang mờ phía sau nên vẫn đọc được trên áo trắng. Chữ viết hoa đầu câu (sentence case), mỗi từ hiện mờ dần đúng lúc được nói. Từ có `hl` đổi sang Playfair nghiêng, màu cam đất sáng. Vị trí mặc định ở dọc là `top: 905`. Chỉnh được `x, y, size, font, color, weight, hl_color, hl_font`.

## 4. Lời nói → module (recipe tự động & khi dựng tay)
| Nghe thấy | Đặt module |
|---|---|
| mở đầu 0–2,5 s | `sh_chapter` overlay ("CÂU CHUYỆN" + tiêu đề) hoặc `sh_quote full` với câu hook |
| "<số> năm / tỷ / tỉ / triệu", "<số>%" | `sh_stat` ngay lúc nói con số, giữ 2,5 s |
| "3 điều", "bài học", "lý do" | `sh_list`, mỗi mục xuất hiện đúng lúc nói mục đó |
| "năm 2019…, rồi 2021…" | `sh_timeline` |
| "có bạn hỏi", "bình luận", "@…" | `sh_comment` ở đầu video |
| "nên hay không", "A hay B", "các bạn chọn gì" | `sh_poll` |
| "phần 2", "chuyện thứ hai", đổi chủ đề | `sh_chapter` (full nếu là bước ngoặt lớn) |
| "sách", "đọc được", "theo …" | `sh_source` |
| "hồi đó", "ngày đầu", "kỷ niệm" | `sh_memory` (có ảnh thật thì đưa vào `images`) |
| câu chốt / "điều quan trọng nhất là" | `sh_lesson`, khoảng 3–7 s trước khi hết video |
| 3 s cuối | `sh_cta` |
| cả bài | `sh_grade` (warm; dùng film cho chuyện ngày xưa) |

Recipe (`PACKS.share.recipe`) làm đúng bảng trên ở mức cơ bản. Nó không đặt hai graphic chồng thời gian lên nhau: nếu `sh_list` rơi trúng lúc `sh_stat` đang hiện thì list được dời ra sau stat. Các mục list lấy từ những câu nói ngay sau từ khoá, còn thẻ bài học lấy lời nói ở đoạn cuối, nên bạn nên sửa lại cho gọn.

## 5. Mẹo cấu trúc kể chuyện (60 s)
1. **Hook (0–3 s)**: một câu gây tò mò hoặc một con số gây sốc: "Mình từng nợ *1,2 tỷ* ở tuổi 24". Dùng `sh_quote full`, `sh_stat` hoặc `sh_comment` (khi trả lời bình luận). Không chào hỏi dài.
2. **Bối cảnh (3–12 s)**: ai, khi nào, ở đâu. Dùng `sh_timeline` hoặc `sh_memory`, chỉ chọn 1–2 chi tiết thật cụ thể.
3. **Xung đột (12–30 s)**: thất bại, khó khăn, cái giá phải trả. Chuyển cảnh bằng `sh_chapter` ("PHẦN 2 · Thất bại đầu tiên"), có thể đổi `sh_grade` sang `film`. Đây là đoạn nên nói chậm lại.
4. **Bước ngoặt (30–45 s)**: điều gì đã thay đổi, ai giúp, đọc được gì (`sh_source`), quyết định nào (`sh_poll` để người xem tự đặt mình vào chỗ đó).
5. **Bài học (45–55 s)**: 1 câu ngắn dễ nhớ (`sh_lesson`) hoặc 3 ý (`sh_list`). Mỗi ý không quá 7 từ.
6. **CTA (3 s cuối)**: "Lưu lại & gửi cho người cần" (`sh_cta`) hợp với nội dung chia sẻ hơn là "Follow". Có thể kết bằng câu hỏi để kéo bình luận.

Nhịp: mỗi 4–6 s nên có một graphic, nhưng không để hai thẻ giấy cùng hiện một lúc. Riêng `sh_comment` (ở trên) có thể đi cùng một thẻ ở dưới.
