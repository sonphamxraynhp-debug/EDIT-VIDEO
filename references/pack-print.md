# Gói `print` — Báo in & tư liệu (5 phong cách)

File: `engine/packs/print.js` · template: `cs-luoi-thuy-si`, `tt-ho-so-mat`, `cs-giay-thu-cong`, `cs-phim-tai-lieu`,
`dn-cau-chuyen-so-lieu` · phụ đề: `print_swiss`, `print_dossier`, `print_paper`, `print_kdoc` (mặc định của gói), `print_data`.

Năm "nhà in" quanh người nói. Mỗi phong cách có bảng màu, font, nhịp chuyển động và kiểu phụ đề riêng; video người nói
**giữ nguyên** (không grade, không vẽ lên mặt). Chọn phong cách bằng `recipe_opts.variant` = `swiss` | `dossier` | `paper` | `kdoc` | `data`.
Thiết kế cho 9:16 (720×1280); 16:9 dùng bố cục rút gọn. Mọi thời gian bên trong scene là **tương đối** (`*_at`, `stagger`) trừ
các mảng có khoá `t` (`chapters[].t`, `words[].t`) là thời gian tuyệt đối, được `applyTemplate` dời theo.

## 1. Lưới Thuỵ Sĩ (`print_swiss_*`, phụ đề `print_swiss`)
- **Look**: trang `#EAE9E5`, giấy trắng, mực `#111`, xám `#77766F`, **một** màu tín hiệu đỏ `#E30613` (`TL.brand.primary` / `color` ghi đè) cho đúng một "nhân vật chính". Chỉ font Inter. Lưới 6 cột lề trái 48 px, căn trái, chừa trống nhiều.
- **Chuyển động**: một đường cong "snap" `cubic-bezier(.7,0,.2,1)`, độ dài theo nốt nhạc ở 30 fps (móc kép = 4 khung, móc đơn = 8 khung). Chữ **trồi lên khỏi khung cắt** đúng lúc nói; thẻ vào bằng **wipe mép giấy** từ dưới lên, ra bằng cuộn lên header; xoá bằng **nhát dao** (gạch 3 px rồi xẹp về giữa). Không nảy, không mờ.
- **Phụ đề `print_swiss`**: căn trái trên phần giấy dưới cằm (y 968): vài từ đầu xám 500 (dẫn), phần còn lại đậm 700 (44–64 px tuỳ độ dài), mỗi từ trồi lên trong 4 khung, rời lên trên ở 8 khung cuối; từ `hl` màu đỏ. Khi không có `print_swiss_frame` thì tự vẽ khối giấy sau chữ.

| type | dùng khi | tham số chính |
|---|---|---|
| `print_swiss_frame` | khung nhà cho cả video: header giấy (tiêu đề trái, bộ đếm `01 / 03` phải, vạch đỏ quét ngang) + trang giấy dưới cằm có đường cột | `title`, `total`, `chapters:[{t,num}]` (t tuyệt đối), `num`, `header_h`=200, `page_top`=940, `signal:false` (bỏ vạch đỏ) |
| `print_swiss_numeral` | thẻ chương (≤ 2,5 s): câu trên cùng + số Inter 800 cao ~470 px leo lên 4 bậc | `num`, `text`, `note` (dòng chú thích có vạch), `size`=640, `text_size`=66, `red` (số màu đỏ) |
| `print_swiss_rows` | danh sách dòng kẻ, có thể cắt bỏ một dòng | `title`, `items[]`, `stagger`=.35, `at`=.35, `cut` (chỉ số dòng bị cắt), `cut_at`, `row_h`=108, `rows_y`=420, `note` |
| `print_swiss_slab` | "nhân vật chính" = khối đỏ 3 cột, câu nói in đè màu đen; ngoại lệ: khối trôi khỏi lưới | `text`, `slab_at`=.15, `off_at` (khối rời lưới, chữ "trên lưới" → "lệch lưới"), `note` |
| `print_swiss_cells` | lưới mang ý nghĩa (24 ô = 24 giờ…), ô tô đỏ dần | `text`, `cols`=6, `rows`=4, `fill`, `fill_at`=.8, `rate`=10 ô/s, `from_end`, `label` |

Thẻ (`numeral/rows/slab/cells`) là toàn khung và ẩn phụ đề; giữ mỗi thẻ ≤ 2,5 s, mặt người ≥ 65 % video. Kết phẳng, không CTA.

## 2. Hồ sơ mật (`print_dossier_*`, phụ đề `print_dossier`)
- **Look**: giấy kem `#F4ECDD` có vân, viền tối, nếp gấp và hạt nhiễu đổi 2 khung/lần; **chấm halftone** (1–3 lớp, góc lưới khác nhau, mật độ radial/edge/linear, lớp sau nhân màu). Một mực đậm navy `#1D2340` cho viền + chữ; hồng `#FF5A87` là bóng lệch màu; vàng `#FFC628` là điểm nhấn; đỏ `#E8384F` chỉ cho con dấu. Tiêu đề Playfair Display 900 có bóng hồng lệch .055em; số khổng lồ Unbounded 900 tô chấm; nhãn JetBrains Mono 800.
- **Chuyển động**: mọi thứ vào có **vượt đà** (back.out 1.9); tiêu đề **bật từng ký tự** (rơi .45em + nén dãn); trang vào bằng **wipe chấm** (chấm lớn dần); đạo cụ vẽ "sôi" 10 fps; **con dấu** đập 2,6× → 1× trong 0,09 s + rung trang.
- **Phụ đề `print_dossier`**: viên thuốc navy bo 14 px, bóng hồng lệch 7/7, chữ kem Inter 800 36 px, từ `hl` vàng; bật vào (scale .6→1, xoay −2,4° → −0,6°) đầu mỗi câu. y 1060.

| type | dùng khi | tham số chính |
|---|---|---|
| `print_dossier_frame` | khung HUD cả video (trừ đoạn hook): chip số hồ sơ + chip chương góc trái, chấm REC + ngày góc phải | `case`='HỒ SƠ SỐ 001', `chapter`, `chapters:[{t,text}]`, `date`, `x`,`y` |
| `print_dossier_page` | trang tang vật toàn khung | `title`, `title_size`=92, `exhibit` (chip), `num` (số halftone), `num_at`, `icon` (emoji/ảnh, sôi), `icon_size`, `label` (ghi chú gõ máy, `label_at`, `cps`), `stamp` + `stamp_at` (dấu trên trang, có rung), `night:true` (trang tối), `dots:[{color,field,ang,step,max,op,blend,cx,cy,radius,reach}]` |
| `print_dossier_suspect` | "nghi phạm" (đồ vật/thói quen): thước chiều cao, đạo cụ trồi lên, chớp sáng, biển tên | `icon`='📱', `icon_size`, `name`='NGHI PHẠM', `case`, `title`, `flash_at`=.55 |
| `print_dossier_board` | bảng chứng cứ 2–4 thẻ ghim, dây đỏ nối dần | `title`, `items:[{text,icon}]`, `stagger`=.45, `at`=.4, `string_at` |
| `print_dossier_stamp` | con dấu phán quyết dưới mặt (không rung) | `text`, `at`=.12, `x`,`y`=955, `size`=60, `rot`=−8, `color` |

Dùng 2–3 con dấu mỗi 30 s, con cuối "ĐÃ ĐÓNG HỒ SƠ" (`keep:true`). Trang 1,5–4,8 s, mặt người ~40–55 %.

## 3. Giấy thủ công (`print_paper_*`, phụ đề `print_paper`)
- **Look**: nền vải nhung đỏ mận (`#522333`/`#60293C`/`#240F16`, phẳng `#6A2947`) có hạt; giấy báo xám và giấy thư `#DFCFB6` có vân + bóng đổ; tiêu đề Inter Tight 700; mũi tên cọ trắng; bút dạ đỏ thẫm `#990028`; nhãn hộp than `#363432`.
- **Chuyển động stop-motion**: mọi chuyển động thiết kế bước **12 fps** (lật chậm 8 fps); tờ giấy **mở từ góc** có vạt gấp, **lật đi như trang sách** sang mặt người, ảnh in **cuộn lên** từ mép; camera trên giấy luôn đẩy chậm.
- **Phụ đề `print_paper`**: 1–3 từ (≤ 17 ký tự) IN HOA trong viên thuốc đen 85 %, đổi cứng không hiệu ứng, không tô từ. y 935.

| type | dùng khi | tham số chính |
|---|---|---|
| `print_paper_sheet` | cảnh giấy toàn khung (hook / bookend) | `title` (`''` = không tiêu đề), `title_color`, `head`, `body[]`, `paper`='news'\|'letter', `paper_name`, `date`, `marks:[chỉ số dòng]` + `mark_at` (gạch đỏ), `unfurl`=.9, `arrow:false`, `arrow_at`, **`turn_out:true`** (cuối cảnh lật trang về mặt người), `slow` (lật 8 fps), `turn_dur` |
| `print_paper_turn` | lật trang riêng (nối sau một cảnh khác) | như `sheet` + `turn_at`=.3, `turn_dur`, `slow`, `sheet:false` |
| `print_paper_card` | ảnh in / thẻ cuộn lên dưới mặt | `src` (ảnh → đen trắng) hoặc `icon` hoặc `text`, `label` (hộp than, rung 8 fps), `label_at`, `ellipse` + `ellipse_at` (khoanh đỏ), `x`,`y`=1105,`w`=400,`h`=260, `rot` |
| `print_paper_marks` | nét tay dẫn mắt | `kind`='arrow'\|'underline'\|'ellipse', `x`,`y`,`x2`,`y2` (mũi tên), `w`,`h`, `black` (mũi tên đen), `at`, `draw`=.45 |
| `print_paper_rise` | một từ trồi từ sau mép giấy (2 khung/chữ), ẩn phụ đề | `text`, `size`=150, `sub` (dòng nghiêng trên giấy), `edge_y`=700, `color` |

Cảnh giấy ≤ 3,5 s; kết bằng tờ giấy thư lật chậm 8 fps về mặt người, không CTA.

## 4. Phim tài liệu chữ động (`print_kdoc_*`, phụ đề `print_kdoc`)
- **Look**: ảnh **đen trắng** như vật thể (ảnh in trên bản mờ của chính nó, cửa sổ trên nền đen), trang xám có vignette cho câu chuyển, giấy ấm cho trích dẫn; **một** màu đỏ ấm `#D63A2F`. Chữ Inter 500 + Oswald 700 IN HOA, Playfair nghiêng cho trích dẫn/số, JetBrains Mono cho máy chữ.
- **Chuyển động**: chữ hiện **trong 1 khung** đúng lúc nói, ở vị trí cuối cùng (không mờ, không trượt); cửa sổ ảnh **nhảy 3 cỡ** cách 4 khung; ảnh đẩy chậm ×1,06; nhãn đỏ wipe trái → phải .5 s; cắt cứng.
- **Phụ đề `print_kdoc`**: một dòng chữ nhỏ trắng có bóng mềm (từ chưa nói giữ chỗ, ẩn), dưới là **một từ lớn** Oswald IN HOA (từ `hl` — có hộp đỏ — hoặc từ cuối ≥ 4 chữ cái khi câu ≥ 3 từ). y 940.

| type | dùng khi | tham số chính |
|---|---|---|
| `print_kdoc_turn` | câu chuyển "Nhưng…", "Và rồi…" trên trang xám; khối đen đứng trước mỗi từ 3 khung | `words:[{text,t}]` (t tuyệt đối) hoặc `text` + `at`=.12 + `stagger`=.35, `red` (chỉ số từ đỏ), `size`=150 |
| `print_kdoc_print` | ảnh như bản in trên nền mờ của chính nó | `src`, `label`, `sub`, `label_at`=.45 |
| `print_kdoc_window` | ảnh trong khung trên nền đen, nhảy 3 cỡ | `src`, `steps`=[.46,.68,.9], `label`, `sub`, `label_at` |
| `print_kdoc_counter` | con số đỏ đếm lên (từng bậc) trên giấy ấm | `from`, `to`, `count`=1.2, `at`=.2, `prefix`, `suffix`, `decimals`, `label`, `sub`, `size` |
| `print_kdoc_type` | trích dẫn máy chữ ~1 ký tự/khung, con trỏ nhấp nháy | `text`, `cps`=30, `at`, `by` (nguồn, Playfair nghiêng đỏ), `size`=46 |

`turn/counter/type` ẩn phụ đề; `print/window` giữ phụ đề. Không ảnh → ô "ẢNH MINH HOẠ" sọc xám.

## 5. Câu chuyện số liệu (`print_data_*`, phụ đề `print_data`)
- **Look**: một tờ giấy kem `#F6F3EC` lưới chấm; biểu đồ tự vẽ dưới **bút chì đỏ-xanh** (nhấc, bay vòng cung, run khi vẽ, đổi đầu đỏ cho dấu đỏ); màu chỉ mã hoá **giá trị** (thang `#FDDBC7 → #B2182B`); ghi chú viết tay xanh (người) / đỏ (kỷ lục, cảnh báo). Tiêu đề Playfair, đơn vị/nguồn JetBrains Mono, ghi chú Pacifico.
- **Số liệu thật**: chỉ hiện con số khi scene có `source` (tên nguồn + năm); không có `source` thì trang ghi **"SƠ ĐỒ MINH HOẠ"** và ẩn số. Trục bắt đầu từ 0.
- **Phụ đề `print_data`** = chú thích hình: dải giấy dưới (y 990), kicker mono "HÌNH n" (hoặc `TL.data_kicker · HÌNH n`, `c.kicker`), vạch mảnh vẽ ra, chữ Playfair hiện theo từng từ (mờ + nâng 4 px trong 0,125 s), tối đa 2 dòng; từ `hl` đỏ.

| type | dùng khi | tham số chính |
|---|---|---|
| `print_data_bars` | biểu đồ cột tự vẽ | `title`, `unit`, `source`, `items:[{label,value}]`, `max`, `axis_at`=.3, `stagger`=.45, `note:{text,i,red,at}` |
| `print_data_cells` | ô vuông lấp đầy (n / 100) | `title`, `source`, `cols`=10, `rows`=10, `fill`, `fill_at`=.6, `rate`=40, `show_count`, `red:false` (ô xanh), `note` |
| `print_data_line` | đường xu hướng bút chì vẽ dần | `title`, `source`, `values[]`, `labels[]`, `min`, `max`, `draw_at`=.6, `draw`=1.4, `note:{text,red,at}` |
| `print_data_note` | mảnh giấy ghi chú trên đầu người nói | `text`, `red`, `x`,`y`=200, `size`=42, `write_at`=.25, `rot` |

Trang ≤ 3,4 s, mặt người ≥ 50 %, kết bằng một nét của biểu đồ (không CTA).

## Recipe (bản đầu tự động)
`ctx.opts = { variant, music?, case?, icon?, head?, note?, image?, by? }`; mặc định `kdoc`. Từ khoá tìm trong phụ đề (khớp có/không dấu):
- **swiss**: `print_swiss_frame` cả video; thẻ chương tại *thứ nhất / đầu tiên / trước kia*, *thứ hai / tiếp theo / bây giờ*, *cuối cùng / thứ ba / việc cần làm* (cách nhau > 3,5 s; thiếu thì 25 % và 60 %); con số đầu tiên → `print_swiss_cells`; *nhưng / tuy nhiên / và rồi* → `print_swiss_slab`. Không nhạc.
- **dossier**: trang hook 0–2,6 s (tiêu đề), khung HUD từ 2,6 s; *điện thoại / ứng dụng / công cụ / tool / ai* → nghi phạm; từ liệt kê (*thứ nhất, bước, cách…*) → trang tang vật có dấu "ĐÁNG NGỜ"; *sự thật / thực ra / đúng / chính là* → dấu "ĐÃ XÁC MINH" + punch; 2,2 s cuối dấu "ĐÃ ĐÓNG HỒ SƠ". Nhạc `suspense`.
- **paper**: tờ báo hook 0–3,2 s lật về mặt; *nhưng…* → chữ trồi; *thành phố / ảnh / video / clip / sản phẩm* → ảnh in cuộn lên + nhãn; 4 s cuối tờ giấy thư lật chậm. Nhạc `mellow`.
- **kdoc**: *video / clip / ảnh* → cửa sổ ảnh; *nhưng…* → trang xám 2 từ; con số đầu tiên → số đếm; 6 s cuối → trích dẫn máy chữ (câu phụ đề tại đó). Nhạc `mellow_2`.
- **data**: ghi chú tiêu đề 0,4–2,8 s; con số đầu tiên → biểu đồ cột (sơ đồ minh hoạ, không số); *bây giờ / nhanh / tăng / giảm / chỉ* → đường xu hướng. Không nhạc.
Các thẻ toàn khung không chồng nhau (cách ≥ 0,25 s). Nội dung tự động là chữ trong phụ đề — sửa lại trong Studio; số liệu biểu đồ do recipe đặt chỉ là sơ đồ.

## Lời nói → module
| Người nói đang… | swiss | dossier | paper | kdoc | data |
|---|---|---|---|---|---|
| mở đầu / tên chủ đề | frame (title) | page (hook) | sheet `turn_out` | window | note |
| sang ý / chương mới | numeral | frame `chapters` | card | print | bars |
| liệt kê | rows | board | marks | — | cells |
| "nhưng…" | slab | stamp | rise | turn | line |
| nói con số | cells | page `num` | card `label` | counter | bars / cells |
| trích dẫn / kết | (kết phẳng) | stamp `keep` | sheet `slow` | type | line `note` |

## Nguồn
Phong cách viết lại cho engine này từ các recipe của **ghost-editor** (kurbaitaev, MIT): `swiss-grid`, `halftone-dossier`,
`tactile-paper`, `kinetic-doc`, `data-story`; `swiss-grid`, `halftone-dossier` và `data-story` chuyển thể từ **lemo-opuscar** của
LemoLab (MIT). Không dùng font, ảnh, âm thanh hay mã nguồn của các dự án đó; font lấy từ Google Fonts trong `engine/index.html`.
