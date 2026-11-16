# Gói `explain` — Giải thích trực quan (5 kiểu)

File: `engine/packs/explain.js` · template: `ai-clean-os`, `rv-trang-san-pham`, `kh-man-hinh-sau-lung`, `kh-bo-the-buoc`, `kh-bang-ve-tay`
· recipe: `recipe_opts.variant` = `os` | `product` | `stan` | `deck` | `board` (mặc định `os`).

Nguồn: port (viết lại mã riêng, không chép code/font/media/demo) từ 5 recipe **clean-os, product-page, stan-style, step-deck,
whiteboard** của repo **ghost-editor** của kurbaitaev (giấy phép MIT). Giao diện điện thoại / phần mềm là giao diện chung tự dựng,
không logo, không giả lập app thật.

## Quy tắc chung
- Khung 720×1280. Điểm mặt lấy từ `TL.face` (mặc định 360, 525). **Vùng ngực** = `face.y + 340` (kẹp 800–1080): phụ đề và thẻ chữ của
  OS / Màn hình / Trang SP nằm ở đây để không đè miệng.
- Module "đặt người vào khung" (`ex_os_phone`, `ex_pp_hook`, `ex_pp_split`, `ex_board_split`) tự vẽ A-roll (cover) và **co ra từ khung
  toàn màn hình**: khung đầu giống hệt video gốc nên vào/ra không giật. Cảnh chạy tới hết video thì không co về.
- Chữ "sau đầu" (`ex_deck_behind`, `ex_stan_screen`) chỉ thật sự nằm sau đầu khi dự án có cutout (`aroll.cutouts`); không có cutout thì
  tự đặt phía trên đỉnh đầu / dải màn hình kết thúc trên đầu.
- Thời gian: khoá tuyệt đối có tên `t`, `t0`, `t1`, `*_t` (đi theo khi đổi thời lượng); khoá tương đối `*_at`, `*_dur`, `stagger`.
- Màu nhấn: `color` của scene › `TL.brand.primary` › mặc định của kiểu.
- Chữ viết tay trên bảng dùng **Nunito 800 có rung nét**, vì Caveat không có dấu thanh tiếng Việt. Chữ ký bút dùng **Pacifico**.

## 1. Clean OS (`variant: 'os'`, phụ đề `ex_os`)
Ý tưởng = một thay đổi trạng thái trên điện thoại. Inter chữ thường, tracking chặt, nghiêng là cách nhấn duy nhất; nhấn 1 màu
(xanh `#0A84FF` / cam `#FF9F0A` / lục `#30D158`, đặt `accent: 'blue'|'orange'|'green'`).

| type | dùng khi | tham số chính |
|---|---|---|
| `ex_os_phone` | mở đầu / đặt người "trong điện thoại" | `w`=400, `x`,`y`, `time`='9:41', `shrink_at`, `notif:{app,icon,title,text,t}` (thông báo rơi xuống), `fpy` |
| `ex_os_notifs` | áp lực: tin nhắn, email, việc dồn | `items:[{app,icon,title,text,time}]`, `stagger`=.35, `at`, `badge`(false = ẩn), `y`=150 (trên đầu), `w`=600 |
| `ex_os_toggle` | lựa chọn, bật/tắt | `title`='cài đặt', `rows:[{label,icon,on,t}]` (công tắc lật đúng `t`), `y`=140 |
| `ex_os_ring` | số liệu: năng lượng, thời gian, pin | `from`,`to`, `count_at`, `count_dur`, `mode:'ring'|'battery'`, `label`, `x`,`y` (cạnh đầu) — màu tự đổi lục→cam→đỏ |
| `ex_os_select` | nhấn / gạch bỏ một cụm từ | `text`, `mode:'focus'|'reject'`, `sel_at`, `reject_at`, `label`='Chữ', `color` — khung chọn đỏ có tay nắm + con trỏ; ẩn phụ đề |
| `ex_os_pen` | chữ ký cảm xúc cuối video | `text`, `write_at`, `write_dur`, `rot` — thanh công cụ bút trồi lên, ngòi bút viết chữ Pacifico; ẩn phụ đề |

Phụ đề `ex_os`: 1–3 từ chữ thường ở vùng ngực, hiện từ mờ → nét; từ `hl` in nghiêng.

## 2. Trang sản phẩm (`variant: 'product'`, phụ đề `ex_pp`)
"Cho thấy chứ không kể": trang trắng `#FDFDFD`, hình vẽ nét mảnh xám + **một phần đen chuyển động**, máy quay ảo đẩy vào, tiêu đề
2 tầng (Inter Tight 800 + Playfair Display nghiêng). Trên trang, phụ đề thay bằng **viên xám chỉ chứa từ đang nói**.

| type | dùng khi | tham số chính |
|---|---|---|
| `ex_pp_hook` | khung 0: tên thứ được nói + câu mở | `name`, `sub`, `icon` / `badge_img`, `lines[]` (`*…*` = tầng serif), `card_y`=660, `y` — người trong thẻ bo góc dưới; ẩn phụ đề |
| `ex_pp_page` | câu nói "cái gì / như thế nào" | `art: phone|book|cup|stairs|box|bulb`, `title`, `title_b`, `title_t` (thu nhỏ trang + tiêu đề lên), `size`=440, `rate` — tự hoà tan về mặt người 0,7 s cuối |
| `ex_pp_split` | việc người xem cần làm (giao diện) | `ui:{kind:'alert', title, text, buttons[], press, press_t}` hoặc `ui:{kind:'list', title, rows:[{label,icon,t}]}` (công tắc tắt đúng từ), `card_y`=800, `fpy` |
| `ex_pp_gallery` | liệt kê / kết | `items:[{art,label,t}]` (≤6), `stagger`, `hl`, `hl_t` (ô sáng viền màu nhấn, ô khác mờ), `title`, `title_b`, `title_t` |

Phụ đề `ex_pp`: 2 tầng ở ngực trên nền tối dần — chữ đậm Inter Tight + từ chốt (từ `hl`, hoặc từ cuối khi câu ≥ 3 từ) Playfair nghiêng
to; mỗi từ mờ → nét đúng lúc nói. Tiêu đề tự co cỡ theo độ dài.

## 3. Màn hình sau lưng (`variant: 'stan'`, phụ đề `ex_stan`)
Hướng dẫn công cụ xem không tiếng vẫn hiểu: màn hình phần mềm chiếm dải trên, người ở dưới; nhãn kiểu sách hướng dẫn «[Bước n]».

| type | dùng khi | tham số chính |
|---|---|---|
| `ex_stan_hook` | 1–3 s đầu | `icons[]` (mail, chat, video, doc, spark, music, folder… hoặc emoji), `lines[]` (dải chữ đen trên nền trắng), `y`=150 |
| `ex_stan_screen` | mỗi câu nhắc tới thứ trên màn hình | `screen:{kind:'app', app, heading, prompt, button, cards[], click_t, scroll}` · `{kind:'chat', prompt, lines[]}` · `{media, fit, pos}` (ảnh/chuỗi frame quay màn hình thật); `band_h` (mặc định kết thúc trên đầu, có cutout thì xuống tới mắt) |
| `ex_stan_step` | đếm bước | `num`, `label` (mặc định "Bước n"), `text` (mệnh lệnh ngắn), `icons[]` — dưới cằm; ẩn phụ đề |
| `ex_stan_diagram` | "cách nó hoạt động" (1 lần, sớm) | `sources:[{icon,label}]` (dưới), `tool:{icon,label}` (giữa), `output` (1 chữ đậm trên), `title`, `stagger` — vào bằng zoom-blur, nét vẽ dần |
| `ex_stan_cta` | kết | `keyword` (gõ dần trong ô bình luận), `label`, `gift` — ẩn phụ đề |

Phụ đề `ex_stan`: cụm chữ thường trắng nhỏ (32 px) ở ~68 % chiều cao / vùng ngực, cả cụm hiện cùng lúc ở từ đầu.

## 4. Bộ thẻ bước (`variant: 'deck'`, phụ đề `ex_deck`)
Mẹo theo bước như một bộ thẻ: cứ 1–2 s đổi "thế giới" giữa mặt người và thẻ phẳng toàn màn hình. Bảng màu navy `#0B1829`,
trắng `#F1F1F1`, xanh điện `#2534E9`, kem; chữ Inter Tight 600, giọng serif Playfair nghiêng.
Cú pháp chữ trong `text`: `*…*` = serif nghiêng, `[từ]` = hộp xanh mọc từ giữa dưới từ, `!từ` = chớp hiện.

| type | dùng khi | tham số chính |
|---|---|---|
| `ex_deck_numeral` | mở mỗi bước | `num`, `look` (mặc định xoay navy → trắng → xanh theo `num`), `text`, `label`, `words_at`, `stagger`, `size`=70, `num_size`=660 — số nghiêng khổng lồ thu 1.48 → 1 từ mờ, ánh sáng tắt dần |
| `ex_deck_card` | câu hỏi / bước ngoặt (navy) hoặc câu khẳng định (trắng) | `look: navy|white|cream`, `text` hoặc `words:[{w,t}]`, `stagger`=.22, `words_at`, `sub`, `sub_t` — cụm chữ mọc tại chỗ |
| `ex_deck_behind` | từ đầu tiên (khung 0) / từ chốt | `text`, `gradient` (từ chuyển màu duy nhất của video), `serif`, `size`, `y` — ẩn phụ đề |
| `ex_deck_counter` | con số | `from`,`to`, `count_at`, `count_dur` (mỗi khung 1 giá trị), `prefix`, `suffix`, `lines[]` (`*…*` serif), `look` |
| `ex_deck_title` | lời hứa của video (1 lần) | `small` (chữ hoa serif hiện từng từ), `big` (chữ hoa lớn, tách kênh RGB), `big_t`, `sub` |

Phụ đề `ex_deck`: cụm chữ mọc từng từ ở **trên đỉnh đầu** (từ chưa nói vẫn giữ chỗ), từ `hl` serif nghiêng, từ đầu mờ + nhích lên.

## 5. Bảng vẽ tay (`variant: 'board'`, phụ đề `ex_board`)
Ý tưởng được vẽ ngay lúc nói: bảng trắng nửa trên, người nửa dưới, bút dạ hiện rõ đi theo từng nét, lau bảng giữa các trang.
Màu bút: `ink #1E1F24`, `blue #1F5FD1`, `red #D7342B`, `green #128A4F`, `orange #E0A100`.

| type | dùng khi | tham số chính |
|---|---|---|
| `ex_board_split` | nền cho cả video | `drop_at`, `ratio`=.5 (tỉ lệ bảng), `zoom` — bảng rơi xuống, mặt trượt vào nửa dưới |
| `ex_board_draw` | một ý = một trang | `shape` (bulb, clock, arrow, check, cross, stick, house, target, mountain, chart, key, heart, phone, rocket, video, chain, bubble, team), `label`, `label_t`, `label_color`, `draw_at`, `draw_dur`, `size`, `x`,`y`, `seed`, `words:[{text,t,x,y,color,size}]`, `erase` (mặc định lau bảng 0,55 s cuối) |
| `ex_board_list` | các bước / tổng kết | `title`, `items:[{text,t}]`, `stagger`, `gap`, `erase` — viết từng dòng + vẽ dấu tích |
| `ex_board_hook` | khung đầu, trước khi bảng rơi | `text` (`*…*` = gạch vàng), `y`, `size` |

Không có `ex_board_split` thì trang tự vẽ một tấm bảng trắng ở nửa trên. Phụ đề `ex_board`: viên trắng nằm trên **đường nối** bảng/người
(không có bảng: ở 75 % chiều cao), từ đang nói được quét vàng `#FFE14D`.

## Recipe (bản đầu tự động)
`ctx.opts = { variant, music?, title?, … }`; các mốc tìm theo từ khoá trong phụ đề (khớp có dấu, rồi không dấu), các cảnh cách nhau ≥ 1–1,5 s:
- **os**: `ex_os_phone` 0–2,8 s (thông báo = tiêu đề) → `ex_os_notifs` ở *thông báo / tin nhắn / email / trước kia / mất* → `ex_os_ring` ở
  *thời gian / phút / giờ / tiếng* → `ex_os_toggle` ở *chọn / bật / tắt / cài đặt* → `ex_os_select` ở *chỉ cần / quan trọng* → `ex_os_pen`
  2,6 s cuối với 2 từ cuối (bỏ *nhé, nha, ạ, rồi…*; ghi đè bằng `opts.sign`).
- **product**: `ex_pp_hook` 0–3 s (`opts.name`, `opts.lines`) → `ex_pp_page` ở *công cụ / sản phẩm / là gì* → `ex_pp_split` (alert) ở
  *chỉ cần / kéo / bấm / chọn* → `ex_pp_gallery` 3,8 s cuối.
- **stan**: `ex_stan_hook` → `ex_stan_diagram` ở *cách / quy trình / hoạt động / tự động* → tới 3 `ex_stan_screen` ở *công cụ / màn hình /
  kéo thả / video / hiệu ứng* (xen app/chat) → `ex_stan_step` ở *đầu tiên / sau đó / cuối cùng* → `ex_stan_cta` (`opts.keyword`).
- **deck**: `ex_deck_behind` 2 từ đầu → `ex_deck_card` navy ở câu hỏi → `ex_deck_numeral` ở *đầu tiên / thứ hai / sau đó / cuối cùng* →
  `ex_deck_counter` ở câu có số → từ chốt chuyển màu 2,6 s cuối (`opts.payoff`).
- **board**: `ex_board_split` từ 0,6 s tới hết; trang mới mỗi `opts.page_len`=4 s, hình chọn theo từ khoá (*thời gian→đồng hồ, ý tưởng→bóng
  đèn, video→máy quay, tăng/kết quả→biểu đồ, mục tiêu→bia, khó→núi, nhanh/tự động→tên lửa, công cụ/app→điện thoại…*; không trùng
  trang liền trước), nhãn = cụm từ khớp; trang cuối là `ex_board_list` từ các câu cuối.
Chữ tự lấy từ phụ đề là bản nháp: nên sửa thành ý ngắn trong Studio. Nhạc: os/deck `lofi`, product `tech`, stan `lofi_2`, board `mellow`.

## Lời nói → module
| Người nói đang… | Dùng |
|---|---|
| than bận, việc dồn | `ex_os_notifs` |
| nói về thời gian / năng lượng / phần trăm | `ex_os_ring`, `ex_deck_counter` |
| chọn / bỏ một việc | `ex_os_toggle`, `ex_os_select mode:'reject'`, `ex_pp_split ui.kind:'list'` |
| gọi tên sản phẩm / thứ cụ thể | `ex_pp_hook`, `ex_pp_page` |
| thao tác trên phần mềm | `ex_stan_screen` + `ex_stan_step` |
| giải thích quy trình | `ex_stan_diagram`, `ex_board_draw` |
| đếm mẹo / bước | `ex_deck_numeral`, `ex_board_list` |
| câu hỏi tu từ | `ex_deck_card look:'navy'`, `ex_deck_behind` |
| chốt cảm xúc | `ex_os_pen`, `ex_deck_behind gradient:true` |

## Giới hạn
- Không có cutout thì không có hiệu ứng "chữ/màn hình sau đầu" thật — module tự né đầu bằng vị trí.
- Bố cục tính theo `TL.face`; clip có mặt quá thấp/cao nên đặt `face` đúng (hoặc chỉnh `y`, `fpy`, `card_y`, `band_h`).
- Giao diện app/điện thoại là bản dựng chung; dùng `screen.media` để đặt bản quay màn hình thật.
