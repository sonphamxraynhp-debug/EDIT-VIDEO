# Làm hàng loạt · Brand kit nhiều thương hiệu · Gói đăng mạng xã hội

Ba tính năng cho người làm nhiều video giống nhau (BĐS, bán hàng, khoá học…). Không cần thư viện mới: XLSX đọc bằng `zlib` có sẵn của Node.

| Phần | Giao diện | Server | Script |
|---|---|---|---|
| Làm hàng loạt | rail **Hàng loạt** (`studio/features/50_batch.js`) | `studio/routes/50_batch.mjs` | `scripts/batch.mjs` |
| Brand kit | rail **Thương hiệu** + nút đổi nhanh trên thanh trên (`51_brands.js`) | `51_brands.mjs` | — |
| Đăng mạng xã hội | nút **Đăng** trên thanh trên + nút trong hộp "Xuất xong" (`52_publish.js`) | `52_publish.mjs` | — |

---

## 1. Làm hàng loạt

Một **nguồn** × một **bảng tính** → mỗi dòng một thư mục dự án (mở lại sửa được trong Studio) + một MP4. Chạy lần lượt từng dòng
(một tác vụ nền, như Xuất), có tiến độ từng dòng, **Dừng** được, **Chạy tiếp** bỏ qua dòng đã xong.

**Nguồn**
- *Template* (`templates/*.json`, `templates/user/*.json`) hoặc *Mẫu hàng loạt* (`examples/batch/*.template.json`). Áp bằng đúng
  `window.applyTemplate` của engine (chạy trong Chrome headless), nên co giãn thời gian giống hệt Studio.
- *Dự án đang mở*: nhân bản dự án (symlink `work/`, file gốc; `media/` gồm link tới media cũ + ảnh của dòng), thay chữ/ảnh/thương hiệu.
  Giữ nguyên giọng và video; nhạc trộn ra `out/mix.wav` của bản sao (không đụng dự án gốc).

**Ghép cột** (`mapping`: khoá → tên cột)
| Khoá | Ý nghĩa |
|---|---|
| `p:<tên>` | chỗ trống `{{tên}}` ở **bất kỳ chuỗi nào** trong template/timeline (cả giữa câu: `"Giá {{gia}} tỷ"`). Cột trùng tên tự ghép. Cũng dùng được `{{brand.phone}}`, `{{brand.outro}}`… |
| `t:<chữ mẫu>` | thay **nguyên chuỗi** chữ mẫu có trong template (vd `"3,2"` → cột `gia`). Thay mọi chỗ có đúng chuỗi đó |
| `m:media/<file>` | ảnh/video mẫu → đường dẫn/URL trong ô. File được chép vào `media/` của dự án dòng đó. Cột `anh_1…anh_n` tự ghép theo thứ tự |
| `f:title` | tiêu đề (intro, `TL.title`, tên thư mục) |
| `f:file_name` | tên thư mục/file xuất (mặc định = tiêu đề) |
| `f:script` | lời đọc → giọng AI tiếng Việt macOS `say -v Linh` (WAV 48 kHz) + phụ đề chia theo độ dài chữ |
| `f:video` | video người nói → nhận giọng (whisper) → cắt lặng → khung hình → phụ đề, như "Video mới" (~1–2 phút/dòng) |
| `f:images` | danh sách ảnh `a.jpg | b.jpg` → lấp các ô ảnh mẫu theo thứ tự và làm nền |
| `f:dur` | độ dài (giây) khi không có video/lời đọc; với giọng AI = max(lời đọc + 2,4 s, giá trị này) |
| `f:brand.name/phone/website/handle/outro` | ghi đè thông tin thương hiệu theo dòng |

Đường dẫn trong ô: tuyệt đối, `~/…`, tương đối với thư mục bảng tính → thư mục dự án → `examples/batch/` → `examples/`, hoặc
`http(s)://` (tự tải). Không tìm thấy → dòng đó báo lỗi, các dòng khác vẫn chạy.

**Giọng / nền** (`voice`): `auto` (có `video` → video người nói; có `script` → giọng AI + ảnh; không có → ảnh + nhạc của mẫu),
`tts`, `none`, `beat` (ảnh theo nhịp nhạc bằng `scripts/beat_project.py` — dùng ảnh + tiêu đề + liên hệ, bỏ qua scene của template).
Ảnh làm nền là `TL.clips` (ảnh tĩnh, zoom nhẹ, chuyển cảnh); giọng AI gắn vào clip nên `mix_audio.py` trộn đúng.

**Thương hiệu**: chọn một brand kit → `TL.brand` (logo chép vào `media/brand_<id>.*`), cột `brand.*` của dòng thắng. Chữ liên hệ mẫu
của recipe (`09xx xxx xxx`, `Tên môi giới`, `…vidu.vn`) được thay bằng giá trị thương hiệu.

**Thư mục** (`<dự án>/batch/<tên>_<giờ>/`):
```
job.json            # nguồn, bảng tính, mapping, brand, voice, quality, dur, rows
status.json         # {name,total,started,updated,rows:[{i,state:pending|running|done|error|cancelled,step,progress,dir,out,error}]}
01_<tên>/           # dự án đầy đủ: timeline.json (TL._batch ghi nguồn + số dòng), media/, work/, out/01_<tên>.mp4
_preview/           # xem trước (ảnh tĩnh 540×960, không tiếng)
../_sheets/         # bảng tính đã tải lên
```

**Dòng lệnh**
```bash
node scripts/batch.mjs examples/batch/bds-can-ho.template.json examples/batch/bds-can-ho-vi-du.csv /tmp/bds --quality 720 --rows 1-2
node scripts/batch.mjs bds-can-ho-sang-trong bang.xlsx out_dir --map map.json --brand <brand-id> --voice tts
node scripts/batch.mjs <thư_mục_dự_án> bang.csv out_dir --map map.json        # nguồn = dự án
node scripts/batch.mjs --job out_dir/job.json                                   # chạy tiếp (bỏ dòng đã xong)
node scripts/batch.mjs --job job.json --preview 0 --t 3 --out still.jpg         # ảnh xem trước dòng 1
node scripts/batch.mjs --parse bang.xlsx · --targets <template|dự án>           # xem cột / ô ghép được
```
Không có `--map` thì tự ghép theo tên cột. Mã thoát 2 nếu có dòng lỗi. SIGTERM = dừng (dòng đang làm đánh dấu `cancelled`).

**API**: `GET /api/batch/sources`, `POST /api/batch/targets {source, columns}`, `POST /api/batch/sheet?name=` (body = file),
`GET /api/batch/example`, `POST /api/batch/preview {…job, row, t}`, `POST /api/batch/start {…job | resume:dir}`,
`GET /api/batch/status?dir=`, `GET /api/batch/list`. Dừng: `POST /api/job/cancel`.

**Ví dụ BĐS**: `examples/batch/bds-can-ho-vi-du.csv` (5 căn hộ, mọi tên/giá/SĐT đều ghi "(ví dụ)" hoặc `0900 000 00x`) +
`examples/batch/bds-can-ho.template.json` (gói `realestate`, 12 s, toàn bộ chữ là `{{cột}}`, 4 ảnh `anh_1…anh_4`, lời đọc cột `script`).
Nút **Dùng ví dụ BĐS** trong panel nạp cả hai.

**Giới hạn**
- XLSX: chỉ sheet đầu; ngày tháng ra số serial của Excel; công thức lấy giá trị đã lưu (file phải được Excel/Numbers lưu). `.xls` cũ không hỗ trợ — lưu lại thành .xlsx/.csv.
- Ghép `t:` thay theo **giá trị** (chữ "2" xuất hiện ở hai ô sẽ bị thay cả hai) — với template của bạn nên dùng `{{cột}}`.
- Khoá thời gian tuyệt đối không co giãn của template (xem templates.md) có thể lệch khi video rất khác `base_dur`.
- Phụ đề giọng AI chia theo độ dài chữ (không nhận giọng lại), đủ khớp cho câu ngắn.
- Xem trước không hỗ trợ dòng có video người nói (cần nhận giọng). Dự án nguồn: bỏ qua cột `script`/`video`.

---

## 2. Brand kit nhiều thương hiệu

Lưu ở `~/.ai-video-studio/brands.json` (đổi thư mục bằng biến `AVS_HOME`), logo ở `~/.ai-video-studio/brands/<id>/logo.<ext>`.
```json
{"version":1,"brands":[{"id":"song-xanh-a4fa","title":"BĐS Sông Xanh","name":"Sông Xanh Land","primary":"#0F6E5A","accent":"#F2C14E",
  "dark":"#0B1F1A","light":"#FFFFFF","font":"\"Lexend\", sans-serif","disp":"","logo":"logo.png","handle":"@songxanh","phone":"0900 000 111",
  "website":"songxanh.vn","pack":"realestate","outro":"Liên hệ để xem nhà!","created":"…","updated":"…"}]}
```
`title` = tên bộ nhận diện (chỉ để phân biệt), `name` = tên in trong video, `pack` = gói style mặc định, `outro` = câu kết (`{{brand.outro}}`).

- Panel **Thương hiệu**: tạo, sửa, nhân bản, xoá, tải logo, "Lưu từ dự án này".
- **Áp dụng cho dự án**: `TL.brand` = các trường của kit + `logo: media/brand_<id>.<ext>` (logo được chép vào dự án) + `kit: <id>`; giữ
  khoá riêng của gói (`paper`, `good`…). Hoàn tác được. Nếu kit có `pack` khác gói hiện tại thì hỏi đổi gói (scene cũ giữ nguyên, bấm
  "Dựng tự động theo gói" để dựng lại).
- Nút đổi nhanh trên thanh trên hiện kit đang dùng (`TL.brand.kit`).
- Làm hàng loạt dùng kit đã chọn cho mọi dòng.

API: `GET /api/brands`, `POST /api/brands/save {brand}`, `/delete {id}`, `/duplicate {id}`, `POST /api/brands/logo?id=&name=` (body = ảnh),
`GET /api/brands/logo/<id>`, `POST /api/brands/apply {id}` → `{brand, pack, title}`.

---

## 3. Gói đăng mạng xã hội (bản trung thực)

**Studio không tự đăng.** Đăng tự động cần ứng dụng OAuth của từng nền tảng được duyệt (TikTok Content Posting API, Meta Graph API cho
Facebook/Instagram, YouTube Data API, Zalo OA API) và token của chính người dùng — không thể làm offline/không tài khoản. Hộp **Đăng** làm phần còn lại:

1. Chọn video trong `out/`. **Viết nội dung bằng AI**: gọi `claude -p … --output-format json --model sonnet` (Claude Code CLI, không cần API key)
   với lời thoại có mốc thời gian, chữ trên màn hình, thương hiệu, ghi chú của bạn → mỗi nền tảng: `title`, `caption`, `hashtags`,
   `first_comment`, `thumb_time`, `thumb_text`. Không có CLI → báo lỗi tiếng Việt hướng dẫn cài.
2. Sửa trực tiếp, **Chép** từng phần / chép tất cả, **Lưu chỉnh sửa**. Lưu ở `<dự án>/publish/<nền tảng>.txt` + `publish/publish.json`.
3. **Kiểm tra** (ffprobe): khung 9:16, độ phân giải, độ dài, dung lượng, codec, có tiếng, fps — cảnh báo theo bảng dưới.
4. **Xuất ảnh bìa** ở giây chọn (mặc định giây AI gợi ý) → `publish/cover_<t>s.jpg` 1080×1920.
5. **Mở trang đăng** (trình duyệt mặc định) + **Hiện MP4 trong Finder** để kéo thả.

| Nền tảng | Trang mở | Độ dài khuyến nghị | Ghi chú |
|---|---|---|---|
| TikTok | tiktok.com/tiktokstudio/upload | ≤ 10 phút (web tới 60) | caption ≤ 4000 |
| YouTube Shorts | youtube.com/upload | ≤ 3 phút (lỗi nếu dài hơn) | tiêu đề ≤ 100, có #Shorts |
| Facebook Reels | facebook.com/reels/create | ≤ 90 s | dài hơn vẫn đăng được dạng video |
| Instagram Reels | instagram.com (nút Tạo) | ≤ 3 phút | caption ≤ 2200 |
| Zalo Video | oa.zalo.me | ≤ 10 phút | tài khoản cá nhân: đăng trong app Zalo |

Thông số là tham khảo (11/2026), nền tảng đổi thường xuyên — sửa ở `PLATFORMS` trong `studio/routes/52_publish.mjs`.

API: `GET /api/publish/platforms`, `/videos`, `/check?video=`, `/data`; `POST /api/publish/gen {video, platforms, notes}` (tác vụ nền),
`/save {platform, data}`, `/cover {t}`, `/open {platform}`.

### Muốn tự đăng thật về sau
- **YouTube** (dễ nhất): người dùng tạo *OAuth client* (Desktop app) trong Google Cloud Console của chính họ, bật YouTube Data API v3, lưu
  `client_secret.json` vào `~/.ai-video-studio/`. Thêm route đổi mã OAuth (redirect `http://127.0.0.1:<port>/oauth`) lấy refresh token, rồi
  `videos.insert` (resumable upload, `snippet.title/description/tags`, `status.privacyStatus`). Video chưa qua kiểm duyệt app sẽ bị khoá ở chế độ riêng tư
  cho tới khi Google duyệt (audit) dự án.
- **TikTok**: Content Posting API cần app TikTok for Developers được duyệt; app chưa duyệt chỉ đăng được ở chế độ riêng tư.
- **Facebook/Instagram**: Graph API với Page/tài khoản Instagram Business, quyền `pages_manage_posts`/`instagram_content_publish` qua App Review của Meta.
- **Zalo**: Zalo OA API (tài khoản OA, không áp dụng cho trang cá nhân).
Nơi gắn: một route mới `studio/routes/53_upload_<nền tảng>.mjs` đọc `publish/publish.json` + video đã chọn; token lưu trong `~/.ai-video-studio/` (không trong dự án).
