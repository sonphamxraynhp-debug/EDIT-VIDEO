# Module style "slate grid" (engine/slate.js)

Khung thiết kế 720×1280. Thời gian là giây tuyệt đối trên timeline. Tất cả module đều chọn và kéo thả được trong AI Video Studio.

## Gốc timeline
```json
{ "width": 1080, "height": 1920, "fps": 30, "duration": 22.7,
  "aroll": { "frames": "work/frames/%05d.jpg" },
  "caption_style": "slate", "captions": "work/captions.json", "caption_reveal": true }
```

## Phụ đề `caption_style: "slate"`
Mỗi chunk trong `captions.json`:
`{ t0, t1, words:[{w,s,e,hl?,br?}], x?, y?, size?, font?, color?, weight?, hl_font?, hl_bg?, hidden? }`
- `hl:true`: từ khoá trong ô vàng serif. Gộp nhiều từ vào 1 word, ví dụ `{"w":"gây shock","hl":true}`.
- `br:true`: xuống dòng sau từ này.
- Từ hiện dần đúng lúc nói (`caption_reveal:false` để hiện cả câu một lần).
- Viết chữ thường, bỏ dấu câu cuối, tối đa 2 dòng, mỗi dòng ≤ 4 từ.
- Trong Studio gõ: `những thông tin / *gây shock*` (dấu `/` = xuống dòng, `*…*` = ô vàng).

## Bố cục
### `frame_grid`: thẻ video trên nền lưới
`{ type, t0, t1, card?:{x,y,w,h,r}, badge?:{icon,bg,size,x,y}|false, blur?, dim?, zoom?, enter:"cut"|"blur"|"zoom", drift?, grid?:{bg,color,cell}, lines?, hideCaptions? }`
- `blur`, `dim` nhận số hoặc keyframe `[{t, v, dur?}]`. Ví dụ làm mờ khi vào sơ đồ: `"blur":[{"t":11.1,"v":0},{"t":11.45,"v":18,"dur":.35}]`.
- `zoom`: `[{t, s, x, y}]` (x/y = % điểm hội tụ).
- Phụ đề tự ẩn khi `blur > 6`.
- `badge.icon`: `si:<slug>` (Simple Icons v15, ví dụ `si:claude`, `si:openai`), emoji, hoặc đường dẫn ảnh.
- Mỗi shot nói thẳng vào camera = 1 `frame_grid`. Đổi shot bằng `enter:"blur"` kèm `fx punch amp .04`.

### `title_card`: thẻ kết
`{ type, t0, t1, title:[{text,color,font,italic,weight}], size=50, y=560, pill:{icon,text}|false, question, bg }`

## Graphic
| module | tham số | dùng khi |
|---|---|---|
| `led_text` | `text, x=360, y=400, size=74, color, cps=14, panel` | tiêu đề "giật gân": TIN SHOCK, CẢNH BÁO, BREAKING |
| `neon_text` | `text, x, y, size=80, color=#FF3348, core, rotate=-3, flicker, font` | 1 từ cảm xúc: đáng sợ, điên rồ, wow |
| `logo_row` | `icons:["si:openai",…] hoặc {icon,dark}, y=310, size=60, gap, stagger` | nhắc nhiều công cụ hay thương hiệu cùng lúc |
| `media_card` | `card:{x,y,w,h,r}, media \| screen:{broll\|chat\|media}, pan, lines` | dẫn chứng: phim, ảnh, bài báo, quay màn hình |
| `diagram` | `nodes, edges, lines` (xem dưới) | quan hệ, nguyên nhân → kết quả, so sánh 2 bên |
| `text` | `lines` | chữ tự do ("Chữ thêm" trong Studio) |

Module của style bubble (`spotlight`, `bubble_screen`, `icon_tap`, `sticker`, `follow_cta`…) và style ngang Hype Cam vẫn dùng chung được.

### `diagram`
```json
{ "type":"diagram","t0":11.1,"t1":18.3,
  "nodes":[ {"id":"r","kind":"person","text":"nhà nghiên cứu","x":360,"y":470,"t":11.7,"out":12.95},
            {"id":"o","kind":"chip","text":"OpenAI","icon":"si:openai","t":12.95,
             "keys":[{"t":12.95,"x":272,"y":590},{"t":15.4,"x":262,"y":790},{"t":16.8,"x":278,"y":690}]},
            {"id":"p","kind":"pill","text":"siêu trí tuệ","x":360,"y":560,"t":16.6,"ring":true},
            {"id":"ai","kind":"big","text":"AI","x":360,"y":420,"t":17.0},
            {"id":"c","kind":"pill_outline","text":"tự cải thiện","x":360,"y":840,"t":17.55} ],
  "edges":[ {"from":"o","to":"p","t":15.4,"dur":.6} ] }
```
- `kind`:
  - `person`: icon người + nhãn
  - `chip`: ô logo + tên
  - `pill`: vàng
  - `pill_outline`: viền vàng
  - `big`: chữ to gradient (`style`: `grad_teal`/`grad_blue`)
  - `label`: chữ trơn
- `keys`: nút trượt sang vị trí mới đúng lúc nói (mỗi lần 0,45 s). Kéo nút trong Studio sẽ sửa mốc đang có hiệu lực.
- `edges`: đường cong tự vẽ ra từ `from` tới `to`.
- Đặt sơ đồ trên `frame_grid` đã làm mờ (`blur` 18, `dim` .38).

## Kiểu chữ thêm cho `lines[]`
`clean` (trắng sạch), `muted`, `grad_blue` ("iRobot"), `grad_teal` ("AI"), `hl` (ô vàng chữ đen). Dòng chữ cũng nhận `font`, `color`, `weight`, `italic:false`, `hidden`.
Ví dụ chữ phẳng, không nghiêng: `{"text":"viễn cảnh phim","style":"clean","font":"var(--sans)","italic":false,"weight":700,"size":24,"y":292}`.

## Bộ não dựng (lời nói → graphic)
| Dấu hiệu trong lời | Dùng |
|---|---|
| nhắc tên phim, sách, sự kiện, bằng chứng | `frame_grid` mờ + `media_card` + `lines` (nhãn nhỏ `clean` + tên `grad_blue`) |
| "tin shock", "cảnh báo", "mới nhất" | `logo_row` (các bên liên quan) + `led_text` |
| tính từ cảm xúc mạnh ở cuối câu | `neon_text` đúng từ đó |
| câu kể có nhân vật và quan hệ ("A và B đang đua tới C") | `diagram`, nút xuất hiện đúng lúc nói tên |
| từ khoá quan trọng trong câu thường | phụ đề `hl` |
| kết video | `title_card` + câu hỏi kéo bình luận |

Nhịp: mỗi 2–3 s có 1 sự kiện hình. Không đặt 2 graphic to trùng nhau. Graphic nằm trong y 250–900 (vùng an toàn), không che mặt khi video đang rõ.
