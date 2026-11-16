# Thư viện template (`templates/`)

Template = **một bản dựng mẫu có sẵn phong cách** (gói, bảng màu, kiểu phụ đề, nhạc, các graphic đã đặt sẵn) mà người dùng
chọn trong Studio rồi áp lên video của mình. Hiện có **88 template** (11 ngang 16:9, còn lại dọc 9:16; 26 mẫu chuyển thể từ ghost-editor — xem `references/pack-print.md`, `pack-broadcast.md`, `pack-explain.md`, `pack-montage.md`), mỗi cái có
video xem trước 6 s và ảnh bìa trong `templates/previews/`.

```
templates/
  <id>.json            # 1 template
  index.json           # danh sách rút gọn cho Studio (id, name, category, aspect, pack, desc, tags, needs, preview, thumb)
  previews/<id>.mp4    # xem trước 5–6 s, 360×640 hoặc 640×360, H.264 không tiếng, ≤ 400 KB
  previews/<id>.jpg    # ảnh bìa, ≤ 60 KB
```

## Định dạng `<id>.json`

| Trường | Bắt buộc | Ý nghĩa |
|---|---|---|
| `id` | ✔ | trùng tên file, chữ thường, gạch ngang (`bds-can-ho-sang-trong`) |
| `name` | ✔ | tên tiếng Việt hiện trong Studio, ≤ 28 ký tự |
| `category` | ✔ | `bds` · `khoahoc` · `review` · `chiase` · `tintuc` · `banhang` · `ai` · `khac` |
| `aspect` | ✔ | `9:16` hoặc `16:9` |
| `pack` | ✔ | gói chính (`TL.pack`), quyết định recipe và menu graphic |
| `desc` | ✔ | 1 câu mô tả |
| `tags` | | từ khoá tìm kiếm |
| `title` | ✔ | tiêu đề mặc định cho intro (recipe dùng `ctx.title`). Studio truyền tiêu đề người dùng nhập thay vào |
| `caption_style` | | kiểu phụ đề. Bỏ trống = theo recipe; `""` = kiểu mặc định của engine |
| `music`, `music_gain` | | mood nhạc trong `assets/music` (`corporate, epic, happy, hype, inspire, lofi, mellow, sad, suspense, tech` + `_2`), gain dB (mặc định −20) |
| `brand` | | bảng màu / thông tin mặc định (`primary, accent, dark, light, font, disp, name, phone, website, handle`, và khoá riêng gói như `paper`, `good`). **Brand kit của người dùng luôn thắng** |
| `theme` | | khoá top-level thêm vào timeline, ví dụ `{"podcast_theme":"cinematic"}`, `{"person":{…}}` cho Hype Cam |
| `recipe_opts` | | truyền vào `recipe(ctx).opts` của gói (ví dụ `screen`/`focus` cho `screencast`, `cams`/`cuts`/`episode` cho `multicam`, `images`/`bpm` cho `beatslide`) |
| `use_recipe` | | mặc định `true`. `false` = chỉ dùng `scenes` của template (bản dựng viết tay hoàn toàn) |
| `base_dur` | ✔ | độ dài (giây) mà các `scenes` được viết cho. Tất cả template hiện tại viết cho 20,2 s |
| `scenes` | | scene thêm (ngoài recipe), thời gian **tuyệt đối** theo `base_dur`. Mọi type phải có trong `MODULES` (có thể trộn module của gói khác) |
| `fx` | | hiệu ứng toàn khung `[{t, type, amp}]` (punch, shake, whip, flash, glitch, blur_in, zoom_in) |
| `needs` | | những gì người dùng phải tự đưa vào (ảnh, giá, SĐT…). Studio nên hiện danh sách này sau khi áp |
| `preview` | | `{from, to, still}`: đoạn render xem trước và thời điểm chụp ảnh bìa (mặc định 0 → 6 s, still 1,5 s) |

**Ảnh mẫu.** Scene có thể trỏ tới `media/<file>` lấy từ `examples/media/` (living.jpg, bedroom.jpg, kitchen.jpg, facade.jpg,
raw.jpg, phone_a.png, phone_b.png, serum.png, tf_*.jpg, gs_*.jpg, top_*.jpg, sc_demo/…). Khi áp template mà dự án chưa có
file đó, Studio nên chép ảnh mẫu từ `examples/media/` vào `<dự án>/media/` (hoặc để module tự vẽ placeholder) và nhắc người
dùng thay bằng ảnh thật theo `needs`.

**Nội dung mẫu.** Chữ trong template là chữ mẫu, đánh dấu rõ: "Tên dự án (ví dụ)", "09xx xxx xxx", "giá (ví dụ)",
"Thương hiệu", "Báo mẫu"… Không dùng tên thương hiệu thật kèm số liệu bịa. Template trước/sau (nội thất, mỹ phẩm) giữ dòng
"Ảnh minh hoạ" / "Kết quả mỗi người khác nhau"; thẻ trả góp giữ `note` "chỉ để tham khảo".

## Studio áp template thế nào (`applyTemplate`)

Hàm `window.applyTemplate(tl, tpl, captions, title)` ở cuối `engine/packs/core.js` là **thuật toán duy nhất** (Studio và
`scripts/build_templates.mjs` cùng gọi nó trong trang engine):

1. `tl.pack = tpl.pack`; `caption_style` của template (nếu có); `brand` = `{...tpl.brand, ...tl.brand}` (người dùng thắng); `theme` gộp vào `tl`.
2. Giữ các scene người dùng tự thêm (không có `_recipe`/`_tpl`), bỏ scene recipe/template cũ → đổi template nhiều lần không bị chồng.
3. Nếu `use_recipe !== false`: chạy `pack.recipe({dur, captions, brand, vertical, title, opts: recipe_opts})` — đặt graphic theo từ khoá trong phụ đề của video thật. Scene recipe được gắn `_recipe`.
4. Scene của template được **đặt lại theo độ dài video**. Điểm **bắt đầu**: `t0 < 3 s` giữ nguyên (intro), `t0 > base_dur − 4 s` neo vào cuối (CTA/outro), còn lại nhân `dur / base_dur`. **Độ dài**: chỉ scene phủ cả video (khung, ticker, thanh tiến trình: dài ≥ 40 % `base_dur` — trừ khối `hf` — hoặc chạy từ đầu tới cuối, hoặc `keep`) mới giãn theo video; mọi scene khác **giữ độ dài của nó** (video ngắn hơn thì co theo tỉ lệ, dài hơn chỉ giãn tối đa 25 %), nên thẻ 4 s không bao giờ thành 30 s trên clip 2 phút. Mọi khoá thời gian bên trong scene (`t, t0, t1, out, strike_at, *_t`, kể cả `items[].t`) đi theo scene. Gắn `_tpl`.
5. `fx` của recipe + template (đặt lại như điểm bắt đầu ở trên); nhạc = `tpl.music` hoặc nhạc recipe, phủ cả video, gain `music_gain` (−20).

Lưu ý khi viết template: các khoá thời gian tuyệt đối có tên khác (`word_t`… đã theo `*_t`; còn `flash`, `kw_at` dạng mảng…) không được
dời theo scene; ưu tiên các trường tương đối (`*_at`, `stagger`) khi module hỗ trợ.

Kiểm tra mọi template sau khi sửa: `node scripts/fx_audit.mjs <dự án> [--durs 15,30,60,120] [--frames] [--only id]` — báo scene quá
dài / 0 giây / nằm ngoài video, và với `--frames` render khung nhỏ quanh mỗi điểm vào/ra cảnh để bắt chỗ **giật** (một khung đổi hẳn).

## Danh sách template

### Bất động sản (`bds`, 8)

| id | Tên | Gói | Khung | Recipe | Cần chuẩn bị |
|---|---|---|---|---|---|
| `bds-ban-tin-bds` | Bản tin BĐS | `news` | 9:16 | không | tên kênh, tiêu đề tin, khu vực, các dòng tin ticker |
| `bds-biet-thu-toi-gian` | Biệt thự tối giản | `luxury` | 9:16 | có | video/ảnh biệt thự, điểm nổi bật, giá, handle |
| `bds-can-ho-ngang` | Căn hộ YouTube ngang | `realestate` | 16:9 | không | video ngang, ảnh căn hộ, giá, SĐT |
| `bds-can-ho-sang-trong` | Căn hộ sang trọng | `realestate` | 9:16 | có | ảnh căn hộ (4 phòng), giá bán, diện tích, số phòng, tên + SĐT môi giới |
| `bds-du-an-greenscreen` | Review dự án qua web | `greenscreen` | 9:16 | không | ảnh phối cảnh dự án, ảnh chụp trang web/bài viết, tiêu đề, nguồn |
| `bds-nha-pho-xanh` | Nhà phố xanh – vay vốn | `realestate` | 9:16 | không | ảnh nhà, giá + % vay, các tiện ích quanh nhà, SĐT |
| `bds-noi-that-truoc-sau` | Nội thất trước – sau | `transform` | 9:16 | không | ảnh trước (thô), ảnh sau (hoàn thiện), 2–4 ảnh giữa quá trình |
| `bds-photo-tour-nhip` | Tour ảnh theo nhịp nhạc | `beatslide` | 9:16 | không | 6–10 ảnh căn nhà, tên dự án, SĐT / website |

### Khoá học (`khoahoc`, 8)

| id | Tên | Gói | Khung | Recipe | Cần chuẩn bị |
|---|---|---|---|---|---|
| `kh-bai-giang-xanh` | Bài giảng xanh dương | `course` | 9:16 | có | số bài + tên bài, tên giảng viên, câu hỏi trắc nghiệm, giá khoá học |
| `kh-bang-trang-code` | Bảng trắng + code | `course` | 9:16 | không | dàn ý bài, đoạn code / công thức |
| `kh-chia-man-hinh` | Dạy kèm màn hình | `split` | 9:16 | không | video quay màn hình, tên các bước |
| `kh-hoi-dap-hoc-vien` | Hỏi đáp học viên | `qa` | 9:16 | không | 2–3 câu hỏi, ý trả lời |
| `kh-keynote-thuyet-trinh` | Keynote thuyết trình | `keynote` | 9:16 | không | ý chính, hiểu lầm cần gạch bỏ, các bước |
| `kh-screencast-ngang` | Hướng dẫn phần mềm ngang | `screencast` | 16:9 | có | video quay màn hình (ngang), các bước + phím tắt |
| `kh-top-5-meo-hoc` | Top 5 mẹo học nhanh | `topn` | 9:16 | không | 5 mẹo + lý do ngắn |
| `kh-tutorial-phat-sang` | Tutorial phát sáng | `glow` | 9:16 | không | tên công cụ, các bước, ảnh/clip màn hình |

### Review sản phẩm (`review`, 6)

| id | Tên | Gói | Khung | Recipe | Cần chuẩn bị |
|---|---|---|---|---|---|
| `rv-danh-gia-chi-tiet` | Đánh giá chi tiết | `review` | 9:16 | không | ảnh sản phẩm (PNG nền trong), giá, ưu / nhược, điểm |
| `rv-dap-hop` | Đập hộp trải nghiệm | `review` | 9:16 | không | ảnh sản phẩm, danh sách phụ kiện, giá tham khảo |
| `rv-my-pham-truoc-sau` | Mỹ phẩm trước – sau | `transform` | 9:16 | không | ảnh trước / sau thật (cùng ánh sáng), ảnh sản phẩm, số liệu đo thật |
| `rv-review-nhanh-kinetic` | Review nhanh 30 giây | `kinetic` | 9:16 | không | tên sản phẩm, 1 con số ấn tượng, kết luận |
| `rv-so-sanh-a-b` | So sánh A vs B | `split` | 9:16 | không | ảnh 2 sản phẩm, bảng thông số, kết quả test |
| `rv-top-5-san-pham` | Top 5 đáng mua | `topn` | 9:16 | không | ảnh 5 sản phẩm, tên + lý do, giá / điểm |

### Chia sẻ / kể chuyện (`chiase`, 7)

| id | Tên | Gói | Khung | Recipe | Cần chuẩn bị |
|---|---|---|---|---|---|
| `cs-dien-anh` | Điện ảnh kể chuyện | `cinema` | 9:16 | không | tiêu đề chương, địa danh + thời gian, câu trích dẫn |
| `cs-goc-nhin-slate` | Góc nhìn trên lưới | `slate` | 9:16 | không | ý chính, 2–3 khái niệm để nối sơ đồ |
| `cs-hanh-trinh-ngang` | Hành trình YouTube ngang | `share` | 16:9 | không | các mốc thời gian, 1 con số, câu hỏi bình chọn |
| `cs-hoi-dap-doi-song` | Hỏi nhanh đáp gọn | `qa` | 9:16 | không | câu hỏi, tên người trả lời, kết quả bình chọn |
| `cs-ke-chuyen-am-ap` | Kể chuyện ấm áp | `share` | 9:16 | có | tiêu đề câu chuyện, câu trích dẫn, 3 bài học |
| `cs-neon-dem-khuya` | Neon đêm khuya | `neon` | 9:16 | không | từ khoá hook, 1 con số |
| `cs-toi-gian-sang-trong` | Tối giản sang trọng | `luxury` | 9:16 | có | 2 từ khoá chính, tên + 1 dòng giới thiệu |

### Tin tức (`tintuc`, 4)

| id | Tên | Gói | Khung | Recipe | Cần chuẩn bị |
|---|---|---|---|---|---|
| `tt-ban-tin-truyen-hinh` | Bản tin truyền hình | `news` | 9:16 | có | tên kênh, tên + chức danh người dẫn, tiêu đề tin, nguồn |
| `tt-phan-ung-bai-bao` | Phản ứng bài báo | `greenscreen` | 9:16 | không | ảnh chụp bài báo (ghi nguồn), ảnh bài đăng, ảnh nền |
| `tt-tin-nhanh-slate` | Điểm tin trên lưới | `slate` | 9:16 | có | 3 tin chính, hình minh hoạ |
| `tt-tin-nong-kinetic` | Tin nóng dồn dập | `kinetic` | 9:16 | không | tiêu đề tin, nhân vật / tổ chức (ghi nguồn), từ khoá |

### Bán hàng (`banhang`, 5)

| id | Tên | Gói | Khung | Recipe | Cần chuẩn bị |
|---|---|---|---|---|---|
| `bh-bubble-chot-don` | Bubble chốt đơn | `bubble` | 9:16 | không | ảnh sản phẩm, từ khoá chốt (vd: MUA) |
| `bh-flash-sale-coupon` | Flash sale mã giảm giá | `review` | 9:16 | không | ảnh sản phẩm, giá gốc / giá sale, mã giảm giá + hạn dùng |
| `bh-kinetic-cta` | Chốt đơn chữ động | `kinetic` | 9:16 | không | nỗi đau khách hàng, con số / lợi ích, lời kêu gọi |
| `bh-livestream-ngang` | Giới thiệu SP ngang | `review` | 16:9 | không | ảnh sản phẩm, điểm mạnh, giá + mã giảm giá |
| `bh-san-pham-theo-nhip` | Sản phẩm theo nhịp | `beatslide` | 9:16 | không | 5–10 ảnh sản phẩm, tên shop, SĐT / link |

### AI / công nghệ (`ai`, 4)

| id | Tên | Gói | Khung | Recipe | Cần chuẩn bị |
|---|---|---|---|---|---|
| `ai-bubble-prompt` | 3 câu lệnh AI | `bubble` | 9:16 | không | câu lệnh (prompt) mẫu, kết quả AI trả lời, từ khoá CTA |
| `ai-hype-cam-ngang` | AI Hype Cam ngang | `hypecam` | 16:9 | không | video ngang (nên có cutout người), câu hook, ảnh minh hoạ |
| `ai-neon-cong-cu` | Công cụ AI neon | `neon` | 9:16 | có | logo / tên công cụ, 1 con số |
| `ai-tin-ai-slate` | Tin AI kiểu Claude edit | `slate` | 9:16 | có | logo các công cụ nhắc tới, ý chính |

### Khác (podcast…) (`khac`, 3)

| id | Tên | Gói | Khung | Recipe | Cần chuẩn bị |
|---|---|---|---|---|---|
| `khac-podcast-2-nguoi-doc` | Podcast 2 người dọc | `multicam` | 9:16 | có | video cam 1 + cam 2, tên 2 người, tiêu đề trích đoạn |
| `khac-podcast-2-nguoi-ngang` | Podcast 2 người ngang | `multicam` | 16:9 | có | video cam 1 + cam 2 (multicam.py), tên host / khách, số tập + chủ đề |
| `khac-podcast-studio-vang` | Podcast studio vàng | `podcast` | 9:16 | không | chủ đề tập, ý chính, lời kêu gọi |

## Thêm một template

1. Chọn gói và đọc `references/pack-<gói>.md` + ví dụ `examples/timeline.<gói>.json` (đều viết cho 20,2 s, chép scene từ đây là nhanh nhất).
2. Tạo `templates/<id>.json` theo bảng trên, `base_dur: 20.2`. Muốn khác template cùng gói thì đổi `brand` (bảng màu), `caption_style`, `music`, thêm scene khác, hoặc `recipe_opts`.
3. Nếu dùng recipe: đừng thêm lại scene recipe đã có (ví dụ `realestate` đã có `re_title` đầu và `re_agent` cuối) và tránh trùng giờ với chúng.
4. Đặt `preview` vào đoạn nhiều graphic nhất, `still` vào khoảnh khắc thể hiện rõ chất template.
5. Build xem trước rồi xem ảnh bìa: `node scripts/build_templates.mjs <thư_mục_dự_án_footage> <id>`.
6. Chạy `node scripts/selftest.mjs engine/index.html <dự_án>/timeline.base.json` (phải `bad: []`, `errs: []`).

## Build lại video xem trước

```bash
cd <skill>
node scripts/build_templates.mjs <footage_project_dir>            # tất cả template
node scripts/build_templates.mjs <footage_project_dir> <id> [<id>…] # một vài template
#   --fps 24   khung hình/giây của preview   --keep  giữ dự án tạm + timeline đã áp (applied.<id>.json) để soi lỗi
```

`<footage_project_dir>` là một dự án talking-head bất kỳ do pipeline tạo: có `timeline.base.json` (hoặc `timeline.json`),
file phụ đề mà nó trỏ tới và frame A-roll (`work/frames/%05d.jpg`). Script:
- dựng một dự án tạm (symlink tới footage; `media/` = ảnh mẫu `examples/media/` + `media/` của footage),
- với mỗi template: đặt kích thước 360×640 (dọc) hoặc 640×360 (ngang). Template ngang trên footage dọc thì A-roll đi qua `TL.clips` với `fit:'blurfill'`,
- mở `engine/index.html`, `init` → `window.applyTemplate(TL, tpl, TL.captions, tpl.title)` → `init` lại → render đoạn `preview` ra `previews/<id>.mp4` (x264 crf 30, tự tăng crf nếu > 400 KB) và ảnh bìa `previews/<id>.jpg` (tự giảm chất lượng JPEG tới ≤ 60 KB),
- kiểm tra template thiếu trường, module không tồn tại, kiểu phụ đề sai, lỗi trang, rồi ghi lại `templates/index.json`. Thoát mã 2 nếu có lỗi.
