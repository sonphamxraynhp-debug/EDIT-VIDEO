# Style Lab: clone style từ video · tạo style từ mô tả

Tạo **gói style mới** (module + kiểu phụ đề + recipe), **template**, **style spec** và một **skill Claude Code** riêng, bằng
Claude Code CLI (`claude -p`) chạy trên máy người dùng ngay lúc bấm. Không cần API key: dùng gói Claude của người dùng.

## 1. Clone từ video
Đưa vào video bất kỳ đã edit (TikTok / Reels / YouTube).
1. **Phân tích offline** `scripts/style_analyze.py <video> <thư mục>` (~10 s cho 40 s video):
   - điểm cắt cảnh (ffmpeg `select=gt(scene,0.30)`), số cắt/phút, độ dài cảnh, độ chuyển động;
   - khung hình tại mọi điểm cắt + mỗi ~1 s (`keyframes/`), **3–4 contact sheet** `sheet_N.jpg` (lưới khung có nhãn thời gian, ô đỏ CUT);
   - bảng màu (k-means numpy) + màu nhấn bão hoà, độ sáng/tương phản/bão hoà;
   - vùng chữ/phụ đề (hàng có mật độ cạnh sắc cao bất thường, ổn định theo thời gian) + ảnh cắt `text_zones.jpg`, màu chữ / màu hộp;
   - lời nói (`transcribe.py`, model large-v3-turbo, `--lang vi|auto`), tỉ lệ thời gian có lời;
   - âm thanh: có nhạc nền (mức nền trong khoảng lặng + độ đều của nhịp), BPM (`beats.py`), tiếng động mạnh (SFX) và những cái trùng điểm cắt.
   Kết quả: `analysis.json`.
2. **Claude**: `claude -p --allowedTools Read --output-format json` với cwd = thư mục phân tích, nên Claude tự mở các
   contact sheet. Prompt gồm hợp đồng gói (`packs.md`), nguyên văn `engine/packs/cinema.js` làm ví dụ, danh sách hàm có sẵn,
   font, mood nhạc, `analysis.json`. Claude trả 3 phần: `META` (tên, mô tả, `seen` = điều nó thấy trong ảnh, mô tả skill),
   `SPEC` (markdown: màu, font, phụ đề, graphic, chuyển cảnh, nhạc/SFX, nhịp, bảng module) và `PACK_JS` (`P = 'u_<slug>'`, IIFE, 3–8 module).
3. **Kiểm tra trong engine thật** (headless Chrome, footage `~/.ai-video-studio/footage/clip-mau`, khung 360×640):
   cú pháp; cấm `Date.now/Math.random/setTimeout/fetch…`; có IIFE; PACKS entry đúng id; type có tiền tố `u_<slug>_`; mỗi item
   `make(T)` render ở 3 thời điểm không lỗi, có `data-cid`, **không trống** (so pixel với khung không có cảnh); kiểu phụ đề có
   `#cap` + `data-cid` + chữ; `recipe` trên phụ đề thật ≥ 3 cảnh, type hợp lệ, t0 < t1, chạy được khi phụ đề rỗng, render 6 thời
   điểm; render thuần theo t (cùng t → cùng HTML); khổ còn lại (ngang/dọc) không lỗi. Lỗi → gửi lại Claude (`--resume`
   cùng phiên) để sửa, **tối đa 2 vòng**. Chỉ cài khi qua hết.
4. **Cài**: xem mục 4. Ảnh so sánh `compare.jpg` (hàng trên: khung video mẫu, hàng dưới: recipe của style mới trên clip-mau).

## 2. Từ mô tả
Như trên nhưng không có video: mô tả tiếng Việt + tuỳ chọn khổ (dọc/ngang), ngành, màu thương hiệu, font, tối đa 4 ảnh
tham khảo (được chép vào thư mục làm việc `ref_N.jpg` để Claude đọc bằng Read).

## 3. Dùng
**Studio**: rail trái → **Tạo style** (icon DNA): tab *Clone từ video* (kéo thả / chọn file hoặc dán đường dẫn → Phân tích →
xem contact sheet, bảng màu, nhịp cắt → *Tạo style bằng Claude*) và *Từ mô tả*. Trong lúc chạy hiện các bước, thời gian, nút
Dừng. Kết quả: video xem trước, điều Claude thấy, ảnh so sánh, spec, nút **Áp dụng cho dự án** (nạp gói vào preview + `applyTemplate`,
hoàn tác được), **Mở trong thư viện mẫu**, **Xoá style**. Danh sách *Style của tôi*.

**CLI** (Claude trong chat dùng được):
```bash
node scripts/style_lab.mjs clone ~/Downloads/video.mp4 [--name "Tên"] [--model sonnet|opus]
node scripts/style_lab.mjs describe "Video BĐS sang trọng đen–gold…" [--orient vertical|horizontal] [--industry "BĐS"] [--colors "#0B0B0B,#C9A44C"] [--font "Playfair Display"] [--images a.jpg,b.png]
node scripts/style_lab.mjs apply <id> <thư mục dự án> [--title "…"]   # áp template của style vào timeline.json (có backup .studio/history)
node scripts/style_lab.mjs list | sync | delete <id> | check            # check = thử gọi claude
node scripts/style_lab.mjs validate pack.js [--id u_x] [--work dir]      # chỉ kiểm tra một gói
```
Tuỳ chọn chung: `--work <dir>` (mặc định `~/.ai-video-studio/stylelab/<thời gian>_<loại>/`), `--footage <dự án>`,
`--no-install`, `--rounds 2`. Env: `AVS_SKILLS_DIR` (mặc định `~/.claude/skills`), `AVS_HOME` (`~/.ai-video-studio`), `CLAUDE_BIN`.
Tiến độ in dạng `@@ <0..1> <bước>`; kết quả ở `<work>/result.json`.

## 4. File được tạo (id = `u_<slug>`)
| File | Nội dung |
|---|---|
| `engine/packs/user/<id>.js` | gói (engine nạp mọi gói người dùng qua `engine/packs/user/_all.js`, tự sinh lại khi cài/xoá; luôn tồn tại) |
| `templates/user/<id>.json` | template (`pack = caption_style = id`, `use_recipe: true`, `base_dur 20.2`, `style_lab:{kind, src, seen, skill…}`) |
| `templates/previews/<id>.mp4/.jpg` | xem trước dựng bằng `build_templates.mjs <footage> <id>` (giờ đọc cả `templates/user/`, không ghi vào `index.json`) |
| `references/user/<id>.md` | style spec |
| `~/.ai-video-studio/packs/<id>.{js,json,md,mp4,jpg}` | bản lưu bền: `style_lab.mjs sync` khôi phục khi cài lại skill, đồng thời tạo lại skill `video-style-*` còn thiếu từ `templates/user/` + `references/user/` (`--no-skills` để bỏ qua; `install.sh` tự chạy) |
| `~/.claude/skills/video-style-<slug>/SKILL.md` | skill Claude Code: mô tả + cụm từ kích hoạt, cách dùng (`apply`, render), spec. Có dòng `avs-style-id` để Xoá biết đúng skill của mình |

API server (`studio/routes/70_stylelab.mjs`): `GET /api/stylelab/check|list|analysis?w=|result?w=|file?w=&f=`,
`POST /api/stylelab/upload?name=|analyze {path}|generate {w|desc…}|delete {id}`. Một tác vụ một lúc (job `stylelab`).

## 5. Giới hạn (nói thật)
- Claude tái tạo **phong cách** từ ~40–48 khung hình tĩnh + số liệu đo, không xem chuyển động thật: hiệu ứng động, kiểu chuyển
  cảnh, nhịp chữ là suy đoán. Nội dung đặc thù của video mẫu (quay màn hình, cảnh khác, b-roll thật) không có trong footage người
  nói nên chỉ được mô phỏng bằng graphic/fx.
- Số liệu phân tích là heuristic: vùng chữ có thể nhầm với giao diện/nội dung có nhiều chữ; "có nhạc" và SFX là ước lượng.
- Kiểm tra tự động bắt lỗi kỹ thuật (crash, trống, thiếu cid, không thuần t), không chấm thẩm mỹ: luôn xem video xem trước.
- Mỗi lần tạo mất 2–10 phút (đo thật: mô tả 7,6 phút, clone 9,9 phút với model mặc định; Sonnet nhanh hơn; giới hạn 20 phút) và tốn lượt dùng gói Claude của người dùng. Cần `claude` đã cài và đăng nhập (UI báo rõ nếu thiếu).
- Không sao chép logo, tên, handle, watermark của người làm video mẫu (prompt cấm; người dùng vẫn nên xem lại).
