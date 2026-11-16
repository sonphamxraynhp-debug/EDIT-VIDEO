# Gói `broadcast` — Truyền hình (4 kiểu)

File: `engine/packs/broadcast.js` · template: `tt-phu-de-ban-tin`, `tt-phong-su-truyen-hinh`, `rv-ve-phan-tich`, `ai-quet-hologram` ·
chọn kiểu bằng `recipe_opts.variant` = `capnews` | `package` | `tele` | `holo`.

Bốn "ngôn ngữ truyền hình" cho video người nói, khác hẳn gói `news` (ident đỏ/navy, ticker, TIN NÓNG):

| variant | gọi là | ý tưởng | phụ đề |
|---|---|---|---|
| `capnews` | Phụ đề bản tin | xem không cần tiếng: phụ đề **là** hình chính, chữ khổng lồ trên khối mực, 1 từ khoá/câu trên khối vàng mật; cắt sang tờ sổ kẻ dòng khi nhắc tài liệu / danh sách | `bc_capnews` |
| `package` | Phóng sự truyền hình | người nói là người dẫn một bản tin một chủ đề: plate → logo góc, băng tên lật chữ, rundown mở và đóng (✓), mỗi ý một thẻ toàn khung, nối bằng vạch quét vàng chanh | không (`none`): băng tên mang tiêu đề |
| `tele` | Vẽ phân tích | kiểu bình luận chiến thuật: **dừng hình thật** rồi vẽ vòng, mũi tên, vùng đỏ, nhãn quanh mặt (không lên mặt); bảng chiến thuật tối; khung chương trình mọi khung hình | `bc_tele` |
| `holo` | Quét hologram | vật thể được nhắc tới hiện thành wireframe phát sáng trên bệ chiếu, khoá mục tiêu, giá trị cuộn ký tự rồi chuyển hổ phách, chip xếp vào thanh | `bc_holo` |

Quy tắc chung: không chỉnh màu / lọc mặt người nói; không vẽ gì lên mặt; không bịa số (chữ mẫu đều ghi "(ví dụ)", "Nguồn mẫu");
không logo / tên kênh thật. Không nhạc nền (bản gốc chỉ dùng giọng + SFX) — tự thêm `music` nếu muốn.
Thẻ toàn khung tự vẽ hiệu ứng vào/ra đặc trưng (trượt sổ, vạch quét, vạch xiên vàng, khe bật nguồn) nên đặt **`cut: true`**
để engine không chồng thêm fade/zoom. Thời gian trong `items[]`: `t` tuyệt đối (được applyTemplate dời theo) hoặc `at` = giây sau `t0`.
Khung dọc 720×1280; vùng an toàn y 84–1133.

## 1. Phụ đề bản tin (`capnews`)
Màu: mực `#0E0E0C`, ngà `#F7F5EF`, vàng mật `#FFC21A` (= `TL.brand.primary`), đỏ `#FF4A3D` (điều xấu / chấm thông báo), sổ `#151512`.
Font Inter Tight 900.

| type | dùng khi | tham số |
|---|---|---|
| `bc_capnews_hook` | 1–2 s đầu | `lines[]` hoặc `text` ('a / b / \|c\|'); bỏ trống = lấy chính phụ đề dưới cảnh (từ khoá tự chọn); `\|từ\|` = khối vàng to (`kw_scale` 1.45); `stagger` .13; ẩn phụ đề. Đáy y 1120 |
| `bc_capnews_sting` | giới thiệu tiêu đề | trang vàng kẻ dòng + lề đỏ kép phủ dải dưới (từ dưới cằm `TL.face.y+250`, 760–900), `title` (`\|từ\|` = khối mực), `chip`; trượt ra trái 0.3 s trước `t1` |
| `bc_capnews_badge` | logo góc tới hết video | `a` (khối vàng), `b` (khối mực), `x` 43, `y` 84, `size` 28 |
| `bc_capnews_source` | thẻ nguồn dưới logo | `label`, `kicker`='NGUỒN', y 140 |
| `bc_capnews_doc` | người nói nhắc tài liệu / bài báo | `src` (ảnh chụp thật) hoặc trang vẽ `kicker,title,lines[]`; `hl:[{line:'title'\|i, t\|at, dur}]` bút dạ quét; `block`, `block_t\|block_at` khối vàng nghiêng; `source`; `w,h,x,y,tilt` |
| `bc_capnews_grid` | liệt kê "thứ" | `items:[{icon,label,badge,t\|at}]` 2–4 ô sáng (viền vàng + chấm đỏ khi gọi tên), `title`, `kicker`, `top`, `ph` |
| `bc_capnews_list` | liệt kê hành động | `items:[{text,t\|at}]` 2–4: số nảy + thanh vàng chạy, thanh trước chuyển ngà; `title` |

**Phụ đề `bc_capnews`**: một câu một lúc ở dải dưới (trái x 43, đáy y 1120, rộng 634), chia 1–3 cụm, mỗi cụm một khối mực
rgba(14,14,12,.84) **đập vào** (1.3→1, .13 s) đúng lúc từ đầu cụm được nói; **một** từ khoá (từ `hl`, nếu không thì từ có số / từ dài
không phải hư từ) trên khối vàng quét trái→phải .12 s, chữ chuyển mực. Cỡ 54 (co tới 36), câu cuối (kết luận) ×1.2.

## 2. Phóng sự truyền hình (`package`)
Màu: mực `#121417/#1B1E23/#22262C`, vàng chanh `#F2CF1D` (= brand.primary), vàng kim `#D4B064`, giấy `#F4F1E8`, ô liu `#6E5A1E`.
Font Inter Tight 800 (tiêu đề), Oswald (số, tab, plate), JetBrains Mono (eyebrow, nguồn, timecode). Nền studio: vầng sáng vàng góc
phải trên, lưới chấm, dải sáng chéo trôi.

| type | dùng khi | tham số |
|---|---|---|
| `bc_pkg_sting` | mở đầu ~1.9 s | plate vàng chanh (vạch mực + vạch kim) đập vào, chữ `word`='LÊN SÓNG' rơi từng chữ, `title` mở từ giữa + `dateline` mono, tia lóe; ở `fly_at` (1.25 s) plate bay lên góc phải thành logo, vạch quét lau nền lộ mặt |
| `bc_pkg_badge` | logo góc tới hết | `word`, `x,y` (548,118), `scale` .42, lóe sáng mỗi `glint_every` 7 s. Bắt đầu ≈ `fly_at`+0.35 của sting |
| `bc_pkg_strap` | băng tên trên ngực suốt bài | `items:[{t\|at, tab, head, sub, source}]` lật chữ .32 s (tab nháy trắng khi đổi mục); `word`; tab y 878, thân 924–1036; `head` ≤ 26 ký tự, không xuống dòng; `source` hiện hộp mono "NGUỒN: …" bên dưới. Ẩn phụ đề |
| `bc_pkg_rundown` | sau mở đầu: liệt kê ý | `title`, `mono`, `tab`, `unit`='Ý CHÍNH', `items:[{text,tc}]` ≤ 4 hàng lật vào; **`recap:true`** = tab TÓM TẮT, mỗi hàng được ✓ tại `t\|at` |
| `bc_pkg_flap` | đổi trạng thái | bảng chữ lật `from`→`to` (≤ 8 ký tự) tại `flip_t\|flip_at`, `eyebrow`, `title`, `label`; dấu `stamp`, `stamp_sub`, `stamp_t\|stamp_at` |
| `bc_pkg_cards` | 3 thứ ngang hàng | `items:[{icon,text,t\|at}]` 2–3 thẻ viền vàng trồi lên, ngoặc kim nối xuống `summary` (`\|từ\|` = nền vàng) ở `summary_t\|summary_at`; `stamp` |

Thẻ toàn khung vào/ra bằng **vạch quét** (vàng chanh 56 + mực 3 + kim 9 px) 0.3 s; `schematic: true` thêm nhãn góc "SƠ ĐỒ"
(biểu đồ không có số liệu thật).

## 3. Vẽ phân tích (`tele`)
Màu theo vai: vàng `#FFD400` = người nói / điều quan trọng, xanh lơ `#3FD8FF` = thứ cản trở (thông báo…), đỏ `#FF3B30` = khoảng
trống / vùng, phấn `#F4F1E8` = nét trung tính. Font Inter Tight 900, Oswald (nghiêng cho số), JetBrains Mono (đồng hồ).

| type | dùng khi | tham số |
|---|---|---|
| `bc_tele_chrome` | cả video (`keep`) | `show`='SOI KỸ', chế độ tự đổi theo cảnh: ● TRỰC TIẾP / PHÂN TÍCH (khi có freeze/board/rows) / XEM LẠI (rewind); đồng hồ ▶ / ❚❚ vàng (giờ khung bị dừng) / ◀◀ đếm lùi + số khung thật; thanh đối đầu `sides[2]`, `lead` (0\|1), lật một lần ở `flip_t` có chớp vàng |
| `bc_tele_freeze` | lời nói có ý chính | **dừng hình thật** (`arollImg(freeze_t)`, mặc định `t0`), chớp trắng nhẹ, spotlight `focus{x,y,rx,ry}`; `ring{x,y,r,color,t\|at}` (elip phối cảnh vẽ theo chiều kim đồng hồ + vòng đứt quay), `zone{x,y,w,h}` đỏ .36 viền đứt, `arrows[{pts,color,dashed,w,t\|at}]` nét bút (viền tối + lõi phát sáng + vệt trắng, đầu mũi tên bật cuối), `label{big,small,color,x,y,t\|at}` (tự né hộp mặt `TL.face` trừ khi `guard:false`); hết cảnh mờ về hình chạy |
| `bc_tele_board` | thứ đang nói tới (điện thoại, việc…) | bảng tối lưới 40 px, điện thoại vẽ tay, `items[{text,icon,t\|at}]` thông báo xanh lơ đổ xuống, dừng ở `freeze_t\|freeze_at` (❚❚), vòng xanh `ring:[chỉ số]`, gạch vàng `strike_t`, `label`; `title`, `eyebrow` |
| `bc_tele_rows` | bảng tóm tắt | `items[{text,icon,t\|at}]` 2–4: số nghiêng vàng, icon phấn, gạch chân bút vàng; `title`, `eyebrow`='TÓM LẠI' |
| `bc_tele_stamp` | câu chốt (1 lần/video) | `text`, `sub`, rơi 1.7→1 xoay −5°; mặc định nằm trên đầu (từ `TL.face`) |
| `bc_tele_rewind` | "quay lại lúc nãy" | tua ngược **hình thật** của người nói `span` giây (3), rung, vạch nhiễu, ◀◀ TUA LẠI |

Bảng (`board`, `rows`) vào/ra bằng **vạch xiên vàng** 0.36 s. **Phụ đề `bc_tele`**: một dòng trên thanh đen .64 viền trái vàng,
y 1028, chữ Inter Tight 600 34 px, co chứ không xuống dòng; từ `hl` vàng.

Bố cục dọc: đồng hồ trái trên (y 88), logo + chế độ phải trên, nhãn/vòng ở khoảng trống quanh mặt (trần trên đầu, tay, tường bên),
phụ đề 1028, thanh đối đầu 1076–1126.

## 4. Quét hologram (`holo`)
Một màu lạnh (hue 188, `s.hue` / `TL.brand.hue`) + một màu ấm hổ phách (hue 38) **chỉ** cho giá trị đúng / công tắc bật. Font Exo 2,
JetBrains Mono. Mọi chữ có tấm nền tối.

| type | dùng khi | tham số |
|---|---|---|
| `bc_holo_chrome` | cả video (`keep`) | góc ngoặc + thước chạy hai mép, `subject` 'CHỦ ĐỀ // QUÉT' trái trên, trạng thái phải trên (`status`, chỉ khi ở mặt người); trong cảnh HUD hiện **thanh chip** (≤ 4) gom từ `dock` của các cảnh `bc_holo_*` + `chips[{label,on,t}]` |
| `bc_holo_scan` | nhắc tới một vật | `model`: `phone` \| `laptop` \| `book` \| `cup` \| `monitor` (`video`/`tv`); mặt phẳng quét mọc từ dưới lên (`scan_dur` 1.2) khi vật xoay (`yaw`,`spin`,`pitch`,`scale`); `locks[{part,label,t\|at}]` (part theo model: screen/notif/camera/grid · screen/keyboard · cover/title/spine · rim/handle · screen/play/timeline/stand); `card{label,value,t\|at,progress}`; `title` cuộn chữ; `erase_t\|erase_at` xoá từ trên xuống; `dock{label,on,t}` |
| `bc_holo_list` | liệt kê 2–5 thứ | bàn xoay: `items[{icon,label,t\|at}]`, xoay nhanh mục tới trước, khoá + nhãn hổ phách, trạng thái `n/N`; mỗi mục thành chip bật (`dock_items:false` để tắt) |
| `bc_holo_target` | khoá vật trên hình thật (không phải mặt) | `x,y,w,h`, `label`, `value`, `lock_t\|lock_at` |
| `bc_holo_card` | giá trị chốt ở tầm mắt | `label`, `value`, `progress`, `card_t\|card_at`, `x,y,w` |

Khoá mục tiêu: khung bắt đầu 1.9× xoay 45°, chốt vào trong .22 s, trắng 3 khung, thẻ tên. Giá trị cuộn phải→trái từ ký tự rác
(có chữ Việt) rồi chuyển hổ phách + chớp 1 khung. Cảnh HUD vào/ra bằng **khe bật nguồn** (vạch sáng mở ra toàn khung) 0.3 s.
**Phụ đề `bc_holo`**: tấm HUD tối, góc ngoặc chéo, 5 vạch sóng âm chuyển động khi đang nói, Exo 2 500 44 px, tối đa 2 dòng,
đáy y 1107; không cuộn ký tự lời nói.

## Recipe (`ctx.opts`)
- `variant` = `capnews` (mặc định) \| `package` \| `tele` \| `holo`.
- **capnews**: hook từ phụ đề 0–~2 s → sting (`sting`, `chip`) → badge từ tiêu đề tới hết; `doc` nếu nghe *theo / nguồn / nghiên cứu /
  báo cáo / khảo sát / số liệu* (`source`); `list` từ *thứ nhất / đầu tiên / bước / mẹo / lý do / cách* (hoặc ~40 %) với 3 câu kế
  tiếp (`list_title`); video ≥ 18 s thêm `grid` ở ~68 % (`grid_title`).
- **package**: sting (`dateline`) + badge; 3 ý = câu ở 35/55/72 % → rundown (≥ 12 s) và tab "01 · từ khoá" của băng tên (`sub`);
  thẻ `cards` ở ý 2 (≥ 16 s); 3,2 s cuối rundown `recap` ✓. Phụ đề `none`.
- **tele**: chrome (`show`, `sides`, lật ở câu cuối); freeze ở *quan trọng / vấn đề / bí quyết / thời gian / công cụ / chỉ cần / đây*
  (hoặc 25 %); board ở ~48 % (≥ 14 s) với 4 câu kế tiếp; rows 6 s cuối (≥ 20 s); stamp ở câu cuối (`stamp`, `stamp_sub`).
  Vị trí vòng / nhãn mặc định suy từ `TL.face` — nên chỉnh tay cho đúng tay / khoảng trống.
- **holo**: chrome (`subject`); scan khi nghe *điện thoại / máy tính / laptop / sách / cà phê / cốc / video / clip / màn hình*
  (hoặc 20 %; `model` ép mẫu), khoá 2 bộ phận, thẻ ĐỐI TƯỢNG; list ở ~55 % (≥ 14 s) với 3 câu kế tiếp + 1 `glitch` fx.
Chữ tự động lấy từ lời nói — **sửa lại thành ý ngắn** trong Studio.

## Lời nói → module
| Người nói… | capnews | package | tele | holo |
|---|---|---|---|---|
| mở đầu | `hook` | `sting` | `chrome` (+ freeze sớm) | `chrome` |
| nêu chủ đề | `sting` → `badge` | `strap` tab HÔM NAY | `stamp` (cuối) | `scan` title |
| nhắc tài liệu / nguồn | `doc` + `source` | `strap.source` | `board` | `scan model:'book'` |
| liệt kê | `list` / `grid` | `rundown`, `cards` | `rows` | `list` |
| đổi trạng thái (bật/tắt, trước/sau) | `list` | `flap` | `freeze` + `zone` | `card` / `dock on:false` |
| nhìn lại | — | `rundown recap` | `rewind` | `scan erase_at` |

## Nguồn
Phỏng theo các recipe `caption-news`, `news-package`, `telestrator`, `hologram-hud` của **ghost-editor** (kurbaitaev, MIT),
vốn chuyển thể từ các style cùng tên của **lemo-opuscar** (LemoLab, MIT, © 2026 LemoLab — commit f171360). Viết lại hoàn toàn
cho engine này (HTML theo khung, không dùng mã HyperFrames/Python, font, phim mẫu, tên kênh hay âm thanh của bản gốc).
