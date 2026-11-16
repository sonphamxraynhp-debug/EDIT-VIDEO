# Gói `kinetic`: chữ động + b-roll dồn dập (short-form)

File `engine/packs/kinetic.js`, ví dụ `examples/timeline.kinetic.json` (20 s). Gói này gộp hai skill `video-edit-kinetic-broll` (bản After của video "POV: your content after I edit it") và `taki-video-edit-reference-shortform` (bản TAKI).

## Phong cách
- **Dọc 9:16** (khung 720×1280) là chính. Ngang 16:9 vẫn chạy: thẻ split chuyển thành trái/phải, cung tròn tính theo cạnh ngắn.
- **Chữ:**
  - Tiêu đề và từ khoá dùng **Anton**, màu vàng kem `#F6E7A2`, viền đen 4–5 px, bóng đậm.
  - Chữ kinetic dùng **Inter Tight**: từ khoá nét 900, từ nối nét 500, chữ trắng viết thường.
  - Phụ đề dùng **Montserrat ExtraBold** viền đen.
  - Gói tự nạp Anton và Inter Tight từ Google Fonts.
- **Màu:**
  - Nền đen `#0A0A0A`.
  - Cung tròn đỏ sẫm `rgb(68,20,14)`, viền trắng phát sáng.
  - Hình thoi tô `rgb(60,20,16)`, viền `rgb(190,72,62)`.
  - Thẻ chân dung dùng nền giấy `#F3F3F3` và vòng tròn `rgb(163,46,64)`.
  - Màu nhấn đỏ `#E0362C`.
  - `TL.brand` ghi đè được: `accent` thay màu vàng kem, `primary` thay màu đỏ, ngoài ra có `dark`, `font` và `disp`.
- **Chuyển cảnh:**
  - Cảnh đồ hoạ vào bằng **cắt cứng**, có một chớp trắng 0,1 s và cú trầm.
  - Quay lại người nói bằng **mờ nét** (`fx: blur_in`).
  - Muốn nhấn mạnh thì dùng `punch`, `shake` hoặc `whip` ngắn. Đồ hoạ biến mất tức thì, không fade.

## Kiểu phụ đề `caption_style: "kinetic"`
- Mỗi lần hiện một nhóm 1–3 từ, nhóm sau thay nhóm trước. Nhóm mới bắt đầu khi đã đủ 3 từ, khi gặp từ nhấn hoặc khi có khoảng lặng hơn 0,4 s.
- Mỗi từ hiện trong 0,2 s: mờ nét giảm dần, độ đục tăng, trồi nhẹ. Từ chưa nói thì chưa chiếm chỗ.
- **Từ nhấn** gồm từ có `hl:true`, từ có chữ số và từ có chữ hoa (iRobot, OpenAI). Từ nhấn được viết bằng Anton vàng kem, cỡ ×1,7, nằm riêng một dòng và bật vào. Tắt chế độ tự nhận bằng `TL.kinetic_auto_hl = false`.
- Vị trí mặc định là 69% chiều cao, tức nằm dưới cằm. Spec gốc đặt ở 54,5%, nhưng mức đó đè lên miệng ở cảnh quay cận. Studio chỉnh được `x`, `y`, `size`, `font`, `color` và `weight`.

## Module (mọi `type` đều có tiền tố `kinetic_`)
| type | dùng khi | tham số chính |
|---|---|---|
| `kinetic_words` | Khái niệm đứng riêng: khối chữ nhiều tầng như "thậm chí / **khủng khiếp** / hơn" | `words:[{text,t,tier:xs\|s\|m\|l\|xl,align,hl,row}]`, `x,y,size` (px của tầng l, mặc định 104), `bg: arc\|dark\|dim\|none`, `arc_corner: bl\|br\|tl\|tr` |
| `kinetic_slam` | Con số hoặc một từ đập vào màn hình | `text` hoặc `count:{to,prefix,suffix,dur}`, `top`, `bottom` (nhãn), `x,y,size`, `bg` (mặc định dark, có tia sáng xoay) |
| `kinetic_diamonds` | Hai khái niệm hoặc thương hiệu đối lập | `items:[{text,icon,t}]` (2 mục), `title`, `vs`, `y,size,gap`, `bg` |
| `kinetic_portrait` | Nhắc tên người hoặc thương hiệu | `img` (PNG tách nền, chỉ dùng ảnh có quyền) hoặc `icon` (`si:slug`/emoji), `name`, `role`, `tags[]`, `tag_t[]`, `x,y,size`. Mở bằng zoom ×2,35→1 trong 0,6 s |
| `kinetic_broll` | Minh hoạ, bằng chứng, reset sự chú ý | `layout: full\|split\|card`, `broll:{id\|template,pal,text,items,…}` (preset động) hoặc `media`, `fit: blend\|cover\|contain`, `keyword`, `sub`, `kw_t`, `kw_y`, `zoom` |
| `kinetic_zoomcut` | Câu cảm xúc ("đáng sợ", "shock") | `word`, `word_t`, `word_y`, `scale` (1,45), `grade: bw\|red\|hot`, `fx,fy` (tâm phóng, mặc định `TL.face`). Dài 0,6–1,5 s |
| `kinetic_emoji` | Phản ứng, cảm xúc | `emojis[]`, `x,y,size`, `n` (số mảnh), `spread` |
| `kinetic_hook` | Hai giây đầu: câu hook đọc được cả khi tắt tiếng | `text`, `text2` (dòng trên băng đỏ), `text2_t`, `y,size`, `upper` |
| `kinetic_progress` | Thanh tiến trình chạy suốt video, giữ chân người xem | `chapters:[{t,text}]`, `pos: top\|bottom`, `height`. Đặt **cuối** danh sách scenes để nằm trên cùng |
| `kinetic_cta` | Kết video bằng một hành động duy nhất | `text`, `button`, `done`, `handle` (mặc định `BR().handle`), `tap_t`, `y` |

Ghi chú về `kinetic_broll`:
- `broll.id` có dạng `chủ-đề--template--pal`; module tự tách template và bảng màu từ id. Tìm id bằng `node scripts/broll.mjs search "<câu tiếng Việt>"`.
- `split` dọc: b-roll ở nửa trên, người nói được canh lại vào nửa dưới, đường nối màu đỏ. Ở khung ngang, b-roll nằm bên trái.
- Khi có `keyword`, phụ đề tự ẩn.

## Lời nói → module
| Câu nói | Module |
|---|---|
| 2 s đầu: câu hỏi hoặc con số gây chú ý | `kinetic_hook`, `fx: punch` ở từ nhấn |
| Con số, phần trăm, "hai công ty" | `kinetic_slam` (`count` nếu muốn đếm lên) |
| Tên người hoặc thương hiệu (một bên) | `kinetic_portrait` kèm 2 từ khoá |
| Hai bên đối lập hoặc so sánh (A và B, trước/sau) | `kinetic_diamonds` |
| Khái niệm trừu tượng, câu kết luận | `kinetic_words` trên nền `arc` |
| Nhắc công cụ, thao tác, kết quả, ví dụ, "tin tức" | `kinetic_broll` (preset đúng chủ đề) + `keyword` |
| Cảm xúc mạnh: sợ, shock, khủng khiếp | `kinetic_zoomcut` + `kinetic_emoji` + `fx: glitch` |
| Kết bài | `kinetic_cta` trên cảnh người nói toàn khung |

## Nhịp dựng (lấy từ hai spec)
- Cứ 0,7–2,5 s phải có một thay đổi thị giác. Cảnh người nói đứng yên **không quá 2,8–3 s**; mỗi 4–8 s cần một lần reset sự chú ý.
- B-roll chèn nhanh dài 0,6–1,2 s; b-roll có chữ cần đọc dài 1,2–2,5 s. Cảnh đồ hoạ nền đen **không quá 4,5 s**.
- Cấu trúc 6 chặng (theo tỷ lệ thời lượng):

  | Chặng | Tỷ lệ | Module |
  |---|---|---|
  | Hook | 0–18% | `kinetic_hook` |
  | Dẫn chứng | 18–31% | `kinetic_portrait` |
  | Chuyển ý | 31–42% | `kinetic_broll` |
  | Giải thích | 42–58% | `kinetic_words`, `kinetic_diamonds` |
  | Nhấn mạnh | 58–74% | `kinetic_slam`, `kinetic_zoomcut` |
  | Minh hoạ và CTA | 74–100% | `kinetic_broll`, `kinetic_cta` |

- **Âm thanh:**
  - Mỗi điểm cắt có một cú trầm (`boom`, `impact`), cú mạnh nhất đặt ở cảnh nền đen.
  - Đặt `riser` 0,5–0,65 s trước cảnh chân dung hoặc hình thoi; `pop` cho từ; `whoosh` khi quay lại người nói.
  - Nhạc tech nhẹ, thấp hơn giọng 18–26 dB (`gain` khoảng −24).

## Recipe tự động
`recipe(ctx)` dựng bản đầu theo thứ tự sau:
1. Hook 0–2,2 s.
2. Số đầu tiên → `kinetic_slam`.
3. Tên thương hiệu → `kinetic_diamonds` (hai tên trong vòng 3 s) hoặc `kinetic_portrait` (một tên).
4. Từ cảm xúc → `kinetic_zoomcut` + `kinetic_emoji` + `fx: glitch`.
5. Lấp mọi khoảng trống dài hơn 2,2 s bằng `kinetic_broll` (xen kẽ split và full). Từ khoá là từ có chữ hoa/số, nếu không có thì lấy từ dài nhất (bỏ hư từ).
6. CTA ở 2,4 s cuối, `kinetic_progress` chạy cả bài.

Recipe trả thêm `fx` (glitch, blur_in).
