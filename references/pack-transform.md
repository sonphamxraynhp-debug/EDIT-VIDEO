# Gói `transform` — Biến đổi trước / sau ✨

File: `engine/packs/transform.js` · ví dụ: `examples/timeline.transform.json` (~20 s, đủ 6 module, ảnh `media/tf_before.jpg`, `tf_step2.jpg`, `tf_step3.jpg`, `tf_after.jpg`) · phụ đề: `caption_style: "transform"`.

Dùng cho makeover, cải tạo nội thất, làm đẹp, giảm cân / tập luyện, chỉnh màu ảnh, dọn dẹp, "30 ngày thay đổi".

## Phong cách
- Thẻ **tím than `#120D18`** bo 28–30 px, viền trắng mảnh. Khi lộ "SAU" thì có viền và quầng sáng **hồng → vàng** (`#FF3D8B → #FFC23D`).
- **TRƯỚC** = chip xám lạnh `#8E97A8`. **SAU** = chip gradient hồng → vàng có ngôi sao 4 cánh.
- Số liệu dùng **Lexend 900**, nhãn và con dấu dùng **Montserrat 900**, nội dung dùng **Be Vietnam Pro**. Line-height ≥ 1.28 để giữ dấu tiếng Việt.
- Chuyển động: thẻ bật lên (outBack), thanh trượt quét qua lại, loé trắng + lấp lánh + vòng sáng khi lộ kết quả, số đếm lên, con dấu đập xuống rồi rung kèm pháo giấy.
- Khung dọc 720×1280 là chính. Ngang 1280×720 chạy qua `DIMS()`, khi ngang nên để `size` ≈ 80.

**Brand kit** (`TL.brand`): `primary` → màu "sau" (hồng), `accent` → vàng, `dark` → nền thẻ, `good` / `bad` → màu tăng/giảm, `light`, `muted`, `font`, `disp`. Mỗi scene ghi đè được bằng `color`, `gold`, `bg`, `good`, `bad`, `before_color`, `font`.

## Nguồn trước / sau
`before`, `after`, `items[].src` nhận: `"media/x.jpg"`, `{seq, fps, count, t0}`, `{media, fit, pos, filter}`, `'speaker'` hoặc `{speaker:true, filter, zoom, fx, fy}`, `{color}`.
**Bỏ trống thì dùng chính người nói**: "trước" là bản xám, tối, nhạt; "sau" là bản rực, sáng, tương phản. Nhờ vậy recipe vẫn chạy được khi chưa có ảnh. Lưới tiến trình không có ảnh cũng tự nội suy độ "lên màu" qua từng ô.

## Vị trí chung
`x`, `y` = **tâm** khối, `size` = **%**. Gốc khối có `data-cid`, và mục con (`items[i]`, `rows[i]`) nhận `cid` riêng. `frame:'full'` (slider, flash) phủ toàn khung ở lớp `back`. Vùng an toàn dọc: y 130–1000. Phụ đề `transform` ở y = 880, nên đáy thẻ để ≤ 860 (thẻ mặc định 600×700 ở y = 500 thì nằm trong 150–850). `backdrop:'dim'` (mặc định cho slider/flash/grid dạng thẻ) làm tối và mờ video phía sau, `'none'` thì bỏ.

## Module

| type | Dùng khi | Tham số chính |
|---|---|---|
| `tf_slider` | so **trước / sau** bằng thanh trượt dọc có tay nắm | `before`, `after`, `frame:'card'\|'full'`, `keys:[{t, v, dur}]` (v = vị trí đường 0…1 tính từ trái, `t` là giây tuyệt đối; mặc định quét 0,94 → 0,06 → 0,5 rồi đung đưa nhẹ), `before_label:'TRƯỚC'`, `after_label:'SAU'`, `handle_y:.5`, `w`, `h` |
| `tf_flash_reveal` | **lộ kết quả**: trước (phóng chậm) → loé trắng + lấp lánh + vòng sáng → sau (đập vào, viền gradient) | `before`, `after`, `flash` (giây tuyệt đối, mặc định `t0 + 1,3`), `frame`, `before_label`, `after_label`, `sparkles:10` |
| `tf_timer` | **đếm ngày** "Ngày 1 → Ngày 30" với vòng tiến độ, xong thì có dấu ✓ | `from:1`, `to:30`, `unit:'Ngày'` (Tuần, Tháng, Buổi…), `title`, `count` (số giây đếm, mặc định theo độ dài cảnh), `from_label`, `to_label`, `w` |
| `tf_grid` | **lưới tiến trình** 2×2 (4 ảnh) hoặc 1×3 (3 ảnh). Ô hiện lần lượt kèm loé, ô cuối có viền gradient + "KẾT QUẢ" | `items:[{media\|src, label, t, cid}]`, `cols`, `title`, `final_label`, `stagger:.45`, `w`, `cell_h` |
| `tf_stats` | **chỉ số trước → sau**: số cũ xám bị gạch, mũi tên vẽ dần, số mới đếm, chip chênh lệch ▲/▼ | `title`, `rows:[{label, from, to, unit, better:'down'\|'up', dec, t}]`, `stagger:.55`, `w`. Đi đúng hướng `better` thì xanh `good`, ngược hướng thì đỏ `bad`. Số thập phân hiện bằng dấu phẩy (72,5) |
| `tf_stamp` | **con dấu** cuối: `style:'stamp'` (thẻ gradient "KẾT QUẢ" + tia + pháo giấy) hoặc `'wow'` (nổ sao truyện tranh "WOW!") | `text`, `sub`, `style`, `rotate`, `confetti:true`, `font_size`, `backdrop:'dim'` |

## Phụ đề `transform`
Chữ trắng **Montserrat 900** cỡ 42 (ngang 40) có viền tối mềm. **Từ đang đọc** chuyển vàng, nhô lên, phóng 1,1, có vạch gradient hồng → vàng bên dưới. Từ `hl` nằm trong **ô gradient nghiêng** chữ trắng. Từ "trước" luôn tô xám xanh, còn "sau", "kết", "quả" tô vàng, để người xem nhận ra mạch trước/sau ngay trong phụ đề. Phụ đề tôn trọng `c.x/y/size/font/color/weight`.

## Lời nói → module
| Khi người nói… | Đặt |
|---|---|
| "hành trình", "sau 30 ngày", "mỗi ngày", "tuần 1" | `tf_timer` (hook 0–3 s) |
| "trước đây", "lúc đầu", "ban đầu", "trước khi" | `tf_slider` (bắt đầu ở trạng thái gần như toàn "trước", rồi quét) |
| "sau khi", "bây giờ", "kết quả là", "và đây là" | `tf_flash_reveal`, đặt `flash` đúng từ "đây" / "kết quả" |
| kể từng giai đoạn ("tuần đầu… tuần thứ hai…") | `tf_grid` |
| nói số: "từ 72 ký xuống 64", "giảm 12 cm", "tăng gấp đôi" | `tf_stats` (mỗi số là một hàng) |
| chốt: "kết quả", "quá đỉnh", "wow" | `tf_stamp` (`style:'wow'` cho giọng vui) |

`recipe(ctx)`: `tf_timer` 0,2–3 s (đặt thấp, y = 700, để không che mặt). Sau đó `tf_slider` ở từ "trước / lúc đầu / ban đầu" (không có thì ở 20 %), rồi `tf_flash_reveal` ở "kết quả / sau khi / sau / bây giờ" xuất hiện sau đó (không có thì 5,6 s sau slider). Nếu lời nói có **chữ số** thì dùng `tf_stats` (hai số đầu tiên làm from → to), không thì `tf_grid` 4 bước. Cuối video là `tf_stamp` "KẾT QUẢ" 2,4 s. Khối nào trùng giờ sẽ được dời sang chỗ trống gần nhất, cách nhau ít nhất 0,4 s và dài tối thiểu 2,2 s. Ảnh lấy từ `ctx.before` / `ctx.after`, không có thì dùng người nói xám → rực. Nhạc là `inspire`.

## Trung thực khi làm trước / sau
- Ảnh "trước" và "sau" phải là **cùng một đối tượng**, chụp thật. Không làm xấu ảnh "trước" để phóng đại kết quả. Nếu có chỉnh màu hay hậu kỳ, hãy ghi rõ (ví dụ `sub:'Ảnh đã chỉnh màu'`).
- Với giảm cân, làm đẹp, sức khoẻ: số liệu phải đo thật, nêu khung thời gian, và không hứa kết quả cho mọi người. Nên thêm câu "kết quả mỗi người khác nhau". Quảng cáo sản phẩm/dịch vụ thì tuân theo quy định quảng cáo và chính sách nền tảng về nội dung trước/sau.
- Ảnh người khác (khách hàng) phải có sự đồng ý của họ.

SFX gợi ý: `whoosh` khi thanh trượt quét, `sparkle`/`shimmer` lúc loé, `tick` khi đếm ngày, `pop` cho từng ô lưới, `boom` khi con dấu đập.
