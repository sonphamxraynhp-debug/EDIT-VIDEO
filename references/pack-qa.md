# Gói `qa` — Hỏi đáp / phỏng vấn đường phố / trả lời câu hỏi

File: `engine/packs/qa.js` · ví dụ: `examples/timeline.qa.json` (20 s) · phụ đề: `caption_style: "qa"`.

## Look
- Kiểu **sticker đường phố**: thẻ trắng có viền mực dày 4 px và bóng cứng lệch `8px 10px 0`. Màu vàng `#FFD60A` (`TL.brand.primary` hoặc `color` của scene ghi đè), mực `#111216`, hồng `#FF3D7F` cho chữ nhấn trong câu hỏi, xanh lá `#22C55E` cho nhãn "TRẢ LỜI" và đáp án "Có", đỏ `#FF4D4D` cho "Không". Font Be Vietnam Pro 800/900.
- `|từ|` trong chữ: ở câu hỏi thì tô **hồng**, ở trả lời / bình luận / khảo sát thì có **vệt bút dạ vàng** bên dưới.
- Chuyển động: khối nảy vào bằng outBack (.82→1, .38 s) và mờ ra .22 s trước `t1`. Câu hỏi **gõ từng ký tự** (`cps` = 30 ký tự/s) có con trỏ. Phần chưa gõ để trong suốt nên khung không nhảy và dấu tiếng Việt không bị tách.
- **Phụ đề `qa`**: chữ trắng 900 cỡ 46 px, viền mực dày (size/9) và bóng cứng. **Từ đang đọc nằm trong ô vàng nghiêng −2°**, từ `hl` màu vàng. Câu kết thúc bằng `?` có thêm huy hiệu "?" vàng bên trái. Tâm y = 960 (dọc) / 630 (ngang).

## Module (`x`,`y` = tâm, `size` = cỡ chữ gốc; trường chung `t0,t1,color,font,keep`)

| type | dùng khi | tham số chính |
|---|---|---|
| `qa_question` | đặt câu hỏi | `text` (`\|từ\|` = hồng), `label`='Câu hỏi', `num` (hiện "#3"), `cps`=30, `type_delay`=.3, `variant:'card'\|'full'` (full = làm tối và mờ video phía sau, thẻ ở y 560), `w`=600; y 340 (dọc) / 240 (ngang). Câu hỏi nên ≤ 55 ký tự (3 dòng) |
| `qa_mic` | giới thiệu người trả lời (phỏng vấn đường phố) | `name`, `age`, `job`, `brand` (chữ trên hộp micro, mặc định `BR().name` hoặc 'Q&A'), `mic_x`,`mic_y` (đầu micro, mặc định 455, 730), `mic_rot`=−14, `mic_size`=1; nhãn tên tại `x`,`y` (250, 830). Micro trồi lên từ dưới và lắc nhẹ |
| `qa_answer` | ý trả lời đánh số | `items` (chuỗi hoặc `{text,num}`), `title`, `label`='TRẢ LỜI', `stagger`=.7, `active` (dòng tô hồng), `w`=620; thẻ cao dần theo từng dòng; y 740 (dọc) / (900, 380) (ngang). ≤ 4 dòng, mỗi dòng ≤ 40 ký tự |
| `qa_poll_result` | kết quả khảo sát Có / Không (hoặc nhiều lựa chọn) | `question`, `total` ('1.248 lượt bình chọn'), `label`='KẾT QUẢ KHẢO SÁT', `items:[{label,pct,emoji,color}]` (mặc định 👍 Có / 👎 Không), `grow`=.9; thanh chạy dần và đếm %, lựa chọn thắng phát sáng và emoji nhún; y 330 |
| `qa_comment_q` | câu hỏi của người xem trong bình luận | `user`='@…', `text`, `avatar` (ảnh / emoji / bỏ trống = chữ cái đầu), `label`='Trả lời bình luận của'; trượt vào từ trái kèm đuôi bong bóng; y 300 (dọc) / 200 (ngang). **`variant:'input'`** = ô gõ bình luận: chữ tự gõ, nút gửi nảy, dòng `label` vàng bên dưới ('HỎI TIẾP Ở BÌNH LUẬN', đặt `''` để ẩn); y 770 (dọc) / 560 (ngang) |
| `qa_counter` | "Câu 3/10" khi có loạt câu hỏi | `num`, `total`, `label`='Câu'; chip vàng có chấm tiến độ (≤ 12 câu); y 150 (dọc) / 50 (ngang) |
| `qa_reveal` | lộ đáp án / chốt ý | `text` (1–2 từ, viết hoa), `kicker`='ĐÁP ÁN' (đặt `''` để ẩn), `sub` (dòng phụ, có `\|…\|`), `emoji`, `word_color`, `rot`=−3, `flash:false` (tắt chớp trắng); chữ đóng dấu từ 1.7→1 kèm tia sáng xoay; size 92, y 380 (dọc) / 300 (ngang) |

**Bố cục dọc 720×1280** (vùng an toàn y 130–1000): counter 150 · câu hỏi / bình luận / khảo sát 300–340 · đáp án 380 · micro + tên 730–870 · thẻ trả lời 740 · ô bình luận 770 · phụ đề 960. Không dùng câu hỏi và khảo sát cùng lúc vì cùng vùng.

## Recipe (bản đầu tự động)
`ctx.opts = { guest?, age?, job?, question?, reveal?, max_q?=6, music? }`.
1. **Tìm câu hỏi** trong `captions`: đoạn kết thúc bằng `?`, hoặc chứa *tại sao, vì sao, như thế nào, thế nào, có nên, làm sao, sao, bao nhiêu, có phải* (so khớp không dấu). Đoạn đó được ghép với 1 đoạn trước nếu liền mạch và với đoạn sau cho tới dấu `?`, cắt ở 56 ký tự, viết hoa chữ đầu và thêm `?`. Các câu hỏi phải cách nhau > 3,5 s.
2. Mỗi câu hỏi có `qa_question` (gõ chữ, hiện ít nhất 2,8 s) và `qa_counter` "Câu k/N" (khi có ≥ 2 câu).
3. Sau câu hỏi đầu tiên: `qa_mic` (3 s, tên lấy từ `opts.guest`), rồi `qa_answer` lấy 3 đoạn phụ đề kế tiếp làm ý (≤ 5 s). Các câu sau thì vào thẳng `qa_answer`.
4. Nếu có từ *đáp án / câu trả lời là / sự thật là / thực ra* thì thêm `qa_reveal`.
5. 3,2 s cuối: CTA `qa_comment_q` variant `input` "Hỏi tiếp ở bình luận nhé 👇".
6. Không tìm thấy câu hỏi nào: một câu hỏi ở 0,2 s lấy từ `opts.question`, `ctx.title` hoặc "Bạn nghĩ sao về điều này?".
Các ý trả lời tự động là đoạn phụ đề gốc, nên **sửa lại thành ý ngắn** trong Studio. Phụ đề `qa`, nhạc `happy`.

## Lời nói → module
| Người nói đang… | Dùng |
|---|---|
| đọc câu hỏi / người phỏng vấn hỏi | `qa_question` (+ `qa_counter` nếu là loạt câu) |
| người được hỏi bắt đầu trả lời | `qa_mic` (tên, tuổi, nghề) |
| liệt kê lý do / cách làm | `qa_answer` |
| "70% mọi người nói…" / kết quả bình chọn | `qa_poll_result` |
| "có bạn hỏi…" / trả lời bình luận | `qa_comment_q` |
| "đáp án là…" / chốt | `qa_reveal` |
| kết video | `qa_comment_q` `variant:'input'` |
