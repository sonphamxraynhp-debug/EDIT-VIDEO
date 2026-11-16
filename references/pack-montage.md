# Gói `montage` — Montage kể chuyện (5 kiểu)

File: `engine/packs/montage.js` · template: `cs-danh-sach-seoul`, `khac-podcast-result`, `khac-podcast-quanh-mat`,
`cs-pov-hanh-trinh`, `kh-hoat-hinh-giai-thich` · phụ đề: `mt_seoul`, `mt_result`, `mt_pov`, `mt_vec`.

Một gói, năm kiểu dựng. Chọn kiểu bằng `recipe_opts.variant` (hoặc `ctx.opts.variant`): `seoul` · `result` · `face` (mặc định) · `pov` · `vector`.
Module nào cũng là hàm thuần của `t`, đều có tiền tố `mt_`. Khung thiết kế 720×1280. Mọi thời gian *bên trong* scene (`at`, `*_at`, `stagger`, `strike`)
tính **từ đầu scene** (giây tương đối). Thời gian tuyệt đối thì dùng khoá `t` hoặc đuôi `_t` (`freeze_t`, `grow_t`, `leaks:[{t}]`, `cam:[{t}]`), để `applyTemplate` dời theo video.

## Look

| kiểu | ý chính | màu / chữ |
|---|---|---|
| **Danh sách Seoul** | Giọng đọc kể 5–8 ý trên b-roll **cắt cứng nhanh** (~1,4 s/cảnh). Mỗi ý chỉ hiện **MỘT chữ lớn** (~440 px), blur-in đúng lúc nói, và một dòng phụ nhỏ nép dưới đầu phải. Có trang trắng chữ nối, collage mở đầu, danh sách nền xanh kiểu bôi chọn, outro bong bóng chat | Playfair Display nghiêng (cảm xúc, địa danh) đối với Inter Tight 900 (sự thật, VIẾT HOA cho từ phủ định). Trắng có viền mờ tối. Đỏ glitch `#FF3B30`, xanh bong bóng `#0B84FE` |
| **RESULT** | Podcast kể chuyện tông ấm: thẻ toàn màn **navy / kraft / cork / giấy** hai tầng chữ (≤ 2,5 s), polaroid, xấp ảnh lật stop-motion, hạt phim, bụi theo từng khung, **vệt cháy phim** ở chỗ chuyển ý | navy `#14213A`, kraft `#B98E5E`, giấy `#FBF7EC`, mực bút `#1F3B8C`, đỏ dấu `#C8372D`, vàng chữ tay `#FFE2A0` |
| **RESULT quanh mặt** | Mặt người nói luôn trên hình. Đạo cụ giấy (ghi chú, vé, hoá đơn, trích dẫn, biểu đồ kẻ ô, polaroid, băng nhãn) **đặt cạnh, trên hoặc dưới mặt, không bao giờ đè lên mặt**. Vùng đặt tính từ `TL.face` | như RESULT. Không vignette, không vệt cháy trên mặt |
| **POV hành trình** | Clip góc nhìn thứ nhất dựng thành chuyện: khung HUD (REC, timecode, pin, góc ngắm), mở đầu chữ động có cửa sổ tròn, thẻ tua lại "15 PHÚT TRƯỚC" bay ra từ chiều sâu + glitch RGB, huy hiệu số liệu, **khoảnh khắc đóng băng** (giữ khung + đẩy 1,3× + chớp trắng + emoji) | xanh chanh `#A6FF00` trên mực `#111` (`TL.brand.primary` / `color` thay được). Inter Tight 900 + JetBrains Mono |
| **Hoạt hình giải thích** | Không cần camera: giọng kể + **một thế giới SVG tự vẽ**. Đường chân trời giữa khung, trời kem phía trên, đất tối phía dưới. Hạt nứt ra, cây mọc LÊN và rễ đâm XUỐNG bằng `stroke-dashoffset` theo độ sâu nhánh. Lá nở (`r`), mặt trời, vệt sáng, quả, đổi màu ấm, bốn mùa. Có **máy quay** lặn xuống đất rồi vươn lên. Tiêu đề Playfair trên tấm kem, chữ nặng Montserrat 900 | đất `#1B1410/#2A1F18`, rễ `#C9A15B`, trời `#F4EAD8`, mặt trời `#F2B544`, lá `#6E8B3D`, quả `#C0392B`. Hạt giấy + vignette |

**Chữ viết tay:** Caveat (font gốc) **không có glyph tiếng Việt** (ộ, ầ, ư…), nên gói dùng **Pacifico** (có subset vietnamese) cho chữ tay, nhãn polaroid và từ khoá trong phụ đề.

## Phụ đề
- `mt_seoul`: không hiện cả câu thành khối. Chữ thường nhỏ 32 px, mỗi từ blur-in đúng lúc nói. Từ `hl` dùng serif nghiêng to hơn. y 1030.
- `mt_result`: **hai tầng trên thẻ navy dưới cằm**. Dòng nhỏ (Inter Tight 700) đặt trên **một từ lớn** (từ `hl`, nếu không có thì lấy từ dài nhất ≥ 4 ký tự). Từ `hl` viết tay màu vàng. Từ chưa nói hiện mờ. y = `TL.face.y + 450` (kẹp trong 900–1110).
- `mt_pov`: chữ trắng đậm có bóng. Từ đang đọc nằm trên khối xanh chanh, từ `hl` màu chanh. y 1000.
- `mt_vec`: mỗi từ nổi lên từ blur (22→0, 0,3 s) đúng lúc nói, chữ thường, không có hộp, quầng tối. Từ `hl` dùng Playfair nghiêng vàng. Mép dưới ở y 1000.

## Module (trường chung `t0, t1, x, y, size, color, keep, hideCaptions`)

### Danh sách Seoul
| type | dùng khi | tham số chính |
|---|---|---|
| `mt_seoul_shots` | nền b-roll cắt cứng (cover) | `shots:[{src, at, pos, zoom}]` hoặc `images[]` + `every`=1.4, `zoom`=[1,1.06] (đẩy chậm mỗi cảnh), `loop`. `src:'aroll'` = cảnh quay của chính người nói. Không cắt cảnh mới trong 0,36 s cuối |
| `mt_seoul_word` | chữ lớn của mỗi ý | `text`, `family` serif\|sans, `caps`, `width` (440 serif / 410 sans, tự tính cỡ), `sub`, `sub_pos` below-right\|below-left\|above-left\|above-right, `sub_at`, `at`, `stagger`=.1; y 600. Ẩn phụ đề |
| `mt_seoul_flash` | từ nối ("thậm chí", "và rồi") 0,4–0,8 s | `text`, `sub`, `family`; trang trắng chữ đen 900 |
| `mt_seoul_collage` | mở đầu / trang chuyển | `mode:'photo'` (`line` trên, ảnh `src` bay vào nghiêng `tilt`=16 rồi nằm thẳng, `big` serif dưới) hoặc `'shrink'` (cảnh `src`='aroll' thu thành thẻ bo góc, tan khi `big` hạ xuống, `line` chuyển xuống dưới chữ); `glitch` (bóng đỏ/xanh, mặc định bật), `big_at`, `stickers:[{emoji,x,y,size,at}]` |
| `mt_seoul_list` | liệt kê hoạt động | `items:[text\|{text,at,emoji}]`, `variant:'stack'` (chữ trắng xếp chồng) \| `'highlight'` (khối xanh bôi chọn, trái x 56), `stagger`=.55, `size` |
| `mt_seoul_imessage` | outro (chạy đến hết) | `src` (cảnh cuối thu thành thẻ, trôi đi trong 3D), `cards[]` (≤ 3 ảnh nghiêng), `typing_at`=.7 (bóng •••), `word_at`=1.3, `word`, `emoji` (tapback), x 70, y 794 |

### RESULT
| type | dùng khi | tham số chính |
|---|---|---|
| `mt_result_card` | thẻ toàn màn ≤ 2,5 s | `surface` navy\|kraft\|cork\|paper, `kicker` (dòng nhỏ), `big` (chữ đậm) hoặc `script` (chữ tay), `big_at`, `note`, `circle_at` (vòng bút dạ quanh chữ), `stamp:{text,at}`, `captions:true` để giữ phụ đề. Đẩy vào chậm, có hạt phim + bụi |
| `mt_polaroid` | ảnh kỷ niệm | `src` hoặc `images[]`+`every` (lật stop-motion), `label` viết tay lúc `label_at`=.45, `w`=300, `ratio`, `rot`, `tape`, `enter` toss\|slap\|drop\|swing\|rise\|unfold\|fade\|none, `x,y` hoặc `zone` |
| `mt_paper_stack` | xấp ảnh lật nhanh (cover) | `images[]`, `every`=.42, `surface` kraft\|navy, `title` (viết tay), `sub` (chữ máy) |
| `mt_film` | lớp phim cả video | `grain`=.07, `dust` (false = tắt), `vignette` (false cho kiểu quanh mặt), `leaks:[{t, dur}]` (vệt cháy phim ở chỗ chuyển ý) |

### RESULT quanh mặt
Đạo cụ nhận `zone` = `top` (dải trên đầu) \| `right` \| `left` \| `chest` (dải ngực, ẩn phụ đề). Vùng đặt đo từ `TL.face` (`face_r`=180, `face_h`=250 là nửa khung đầu). Nếu không vừa vùng đã chọn, đạo cụ thu nhỏ hoặc chuyển sang vùng vừa nhất (tỉ lệ ≥ .6). Muốn đặt tay thì dùng `x,y` (+`scale`).

| type | dùng khi | tham số chính |
|---|---|---|
| `mt_prop_note` | ghi chú / vé / hoá đơn | `kind` note\|sticky\|ticket\|receipt, `w,h`, `lines:[text\|{text,at,size,color,strike}]` (viết tay; vé / hoá đơn thì chữ máy), `header`, `stamp:{text,at}`, `circle:{line,at}`, `enter` (mặc định slap; hoá đơn tự in từ trên xuống) |
| `mt_quote_card` | câu trích dẫn | `text` (hiện từng từ, `stagger`=.13), `author` (viết tay), `w`=560, `size`=32; thả từ trên xuống |
| `mt_prop_bars` | so sánh số liệu | `title` (viết tay), `bars:[{label,value 0–100,unit,color,at}]` trên giấy kẻ ô |
| `mt_label_tape` | chốt tên / CTA trên ngực | `text` in từng ký tự (`cps`=14), `tape` (màu băng); dải ngực, ẩn phụ đề |

### POV hành trình
| type | dùng khi | tham số chính |
|---|---|---|
| `mt_pov_hud` | cả video | `place`, `clock` "13:24" (+`tick`), `tc_start` (giây timecode), `res`, `battery`, `fisheye`, `chip_bottom`=150 |
| `mt_pov_kinetic` | hook mở đầu / thẻ kết (cover) | `lines:[text\|{text,at,size}]` (`*từ*` = màu chanh), `kicker`, `pip` (cửa sổ tròn `src`='aroll', `pip_r`, `pip_y`) |
| `mt_pov_rewind` | "15 phút trước" (cover) | `kicker`, `time`, `place`, `src` (nền làm mờ) |
| `mt_pov_freeze` | khoảnh khắc đáng nhớ | `freeze_t` (tuyệt đối, mặc định `t0`), `zoom`=1.3, `focus:{x,y}` %, `emoji` + `ex,ey` (che mặt người lạ / phản ứng), `label`. Nên đi kèm `fx` punch |
| `mt_pov_stats` | thời gian, quãng đường, số lần… | `items:[{icon clock\|pin\|bolt\|flag\|route\|cam\|heart\|emoji, text, at}]`, x 40, y 200 |
| `mt_pov_clips` | đoạn tua nhanh (cover) | `images[]` (hoặc 'aroll'), `every`=1, rung tay `shake`, vệt whip vào mỗi cảnh, `speed` ("x2"), `label` |

### Hoạt hình giải thích
| type | dùng khi | tham số chính |
|---|---|---|
| `mt_vec_world` | nền cả video (cover) | `seed` (dáng cây), `grow_t`→`grow_end_t`, `leaves_t`, `sun_t`, `burst_t`, `fruit_t`, `warm_t`, `seasons_t`→`seasons_end_t` (đông→xuân→hạ→thu), `cam:[{t,x,y,s}]` (tâm điểm thế giới; chân trời y 1280; lặn ≈ y 1640 s 1.3; vươn ≈ y 960 s 1.15; toàn cảnh ≈ y 1180 s .92), `leaf`, `root`, `trunk` |
| `mt_vec_headline` | câu then chốt (5–7 câu/phút) | `text` (`*từ*` = nghiêng màu), `dark` (tấm tối trên nền đất), `size`=50, `w`=620; y 250. Ẩn phụ đề |
| `mt_vec_label` | nhãn chỉ vào hình | `text`, `x,y` (điểm, toạ độ màn hình), `dx,dy` (vị trí nhãn, tự kẹp trong khung), `dark` |
| `mt_vec_heavy` | khoảnh khắc nặng | `words[]` (Montserrat 900) đập vào từng chữ (`stagger`=.5), có rung + vết nứt, nền tối mềm (`panel:false` để tắt). Nên thêm `fx` shake |
| `mt_vec_arrows` | hai chiều ngược nhau | `up:{text,sub}`, `down:{text,sub}`, `y` (chân trời), `len`, `up_x`, `down_x` |

## Recipe (bản đầu tự động)
`ctx.opts = { variant, images?[], title?, music?, word? (seoul), cta?, cta_kicker?, place?, clock?, rewind?, moment? (pov), seed?, heavy?[] (vector) }`.
"Nhịp" = các đoạn phụ đề cách nhau ≥ 3,2–4,5 s. Mỗi nhịp có một **từ khoá**: từ dài nhất không nằm trong danh sách từ đệm (được, những, chúng, rằng…). Đoạn không có từ khoá thì bỏ qua.
- **seoul**: collage `shrink` 0–2,6 s (dòng = câu đầu, chữ lớn = tiêu đề), `mt_seoul_shots` nối liền tới 2,6 s cuối (ảnh `opts.images`, không có thì dùng cảnh quay), `mt_seoul_word` trên từ khoá mỗi nhịp (từ có số → chữ đậm, 1/3 số nhịp dùng chữ đậm), ≤ 2 `mt_seoul_flash` trên từ nối (*thậm chí, và rồi, nhưng, sau đó, thế là…*), outro `mt_seoul_imessage` 2,6 s cuối. Phụ đề `mt_seoul`, nhạc `lofi`.
- **result**: `mt_film` (vệt cháy ở 1/3 và 2/3), thẻ navy mở đầu, rồi luân phiên polaroid (dải trên) / thẻ navy-kraft chữ tay / xấp ảnh (khi có ảnh, không có thì giấy nhớ). Thẻ navy câu hỏi kết. Phụ đề `mt_result`, nhạc `lofi_2`.
- **face** (mặc định): `mt_film` không vignette, mỗi nhịp một đạo cụ ở dải trên theo vòng ghi chú → trích dẫn → biểu đồ (khi có số) / vé → polaroid → giấy nhớ → vé, cuối là `mt_label_tape` CTA. Phụ đề `mt_result`, nhạc `lofi`.
- **pov**: HUD cả video, kinetic hook từ các câu nói trong 2,4 s đầu, tua lại, `mt_pov_stats` ở con số đầu tiên, `mt_pov_clips` (khi có ảnh), `mt_pov_freeze` + punch ở *bất ngờ / đột nhiên / thế là / suýt / nhưng* (nếu không có thì ở 60 %), thẻ kết "Bạn sẽ làm gì nếu là mình?". Phụ đề `mt_pov`, nhạc `happy`.
- **vector**: `mt_vec_world` cả video (mọc 6–42 %, lặn 30 %, vươn + mặt trời + ấm 50 %, quả 72 %, bốn mùa trước kết), tiêu đề mở đầu, nhãn / chữ nặng theo từ khoá, tiêu đề kết. Phụ đề `mt_vec`, nhạc `inspire`.

Recipe chỉ tạo bản đầu. Từ khoá máy chọn thường cần **sửa lại trong Studio**: tiếng Việt là từ ghép, nên recipe có thể chỉ bắt được một nửa từ (ví dụ "thời" thay vì "thời gian").

## Bố cục dọc 720×1280
Seoul: chữ lớn y 600 · collage: dòng trên thẻ ~ y 300, chữ lớn ~ y 850 · danh sách xanh y 576 · bong bóng chat y 794 · phụ đề 1030.
RESULT: nội dung thẻ y 563 · polaroid / đạo cụ ở dải trên (y 100 → `face.y − 250`) · phụ đề navy dưới cằm.
POV: HUD góc 30 px · chip địa điểm / giờ cách đáy 150 · huy hiệu y 200 · nhãn đóng băng y 210 · phụ đề 1000.
Hoạt hình: tiêu đề y 220–250 · chân trời y 640 khi `cam` = (360, 1280, 1) · mép dưới phụ đề y 1000.

## Lời nói → module
| Người nói đang… | Dùng |
|---|---|
| liệt kê một nơi / một điều quan sát | `mt_seoul_word` trên b-roll `mt_seoul_shots` |
| "thậm chí", "và rồi" | `mt_seoul_flash` |
| kể một kỷ niệm / một đồ vật | `mt_polaroid`, `mt_prop_note` (vé, hoá đơn), `mt_result_card` |
| trích lời ai đó | `mt_quote_card` |
| so sánh con số | `mt_prop_bars`, `mt_pov_stats` |
| "15 phút trước…" | `mt_pov_rewind` |
| khoảnh khắc bất ngờ | `mt_pov_freeze` (+ fx punch) |
| ẩn dụ, quá trình, trước / sau | `mt_vec_world` + `mt_vec_headline` / `mt_vec_label` / `mt_vec_arrows` |
| khó khăn, áp lực | `mt_vec_heavy` (+ fx shake) |
| kết video | `mt_seoul_imessage` / `mt_result_card` / `mt_label_tape` / `mt_pov_kinetic` |

## Nguồn
Port phong cách từ các recipe `seoul-list`, `result-podcast` (cả `example-face`), `pov-montage`, `explainer-vector` của **ghost-editor** (kurbaitaev, giấy phép MIT).
Mã viết lại cho engine HTML→MP4 này: không chép minh hoạ, ảnh, font, logo hay media demo của bản gốc. Hình vẽ cây là SVG thủ tục tự viết, ảnh mẫu lấy từ `examples/media/`.
