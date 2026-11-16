# Keyframe tự do · Mặt nạ & tách nền · B-roll AI

Code: engine `engine/engine.js` (`kfAt`, `sceneFx`, `maskCss`, `applyLineKf`, nhánh `bg` trong `clipLayer`) · Studio `studio/features/60_keyframes.js`, `61_mask.js`, `62_broll.js` · server `studio/routes/60_media.mjs` · CLI `scripts/ai_broll.mjs`.

## 1. Keyframe tự do — `kf`
Gắn vào **bất kỳ cảnh nào** (`scenes[i]`: photo, sticker, emoji_pop, broll, media_card, led_text…) hoặc **một dòng chữ** (`scenes[i].lines[j]`, cả cảnh `text`).
```json
{ "type": "emoji_pop", "t0": 0.5, "t1": 5.5, "src": "🚀", "x": 360, "y": 900, "anchor": [360, 900],
  "kf": [ {"t": 1, "x": -200, "y": 0,    "scale": 1,   "rot": 0,   "opacity": 1,  "ease": "bounce"},
          {"t": 3, "x": 180,  "y": -480, "scale": 1.6, "rot": 40,  "opacity": 1,  "ease": "inOut"},
          {"t": 5, "x": 0,    "y": -480, "scale": 0.6, "rot": -30, "opacity": 0.4} ] }
```
| Trường | Ý nghĩa |
|---|---|
| `t` | giây **tuyệt đối** trên timeline (dời cảnh trong Studio thì keyframe dời theo) |
| `x`, `y` | độ dời (px thiết kế, 720×1280 hoặc 1280×720) so với vị trí gốc |
| `scale`, `rot`, `opacity` | tỉ lệ (1 = gốc), xoay (độ), độ mờ 0–1 (nhân với độ mờ sẵn có) |
| `ease` | đường cong **từ key này tới key sau**: `linear`, `in`, `out`, `inOut`, `back` (nảy quá), `bounce`, `hold` (đứng yên rồi nhảy) |
| `anchor` (cảnh) | tâm xoay/phóng `[x, y]` px; mặc định `[s.x, s.y]` hoặc giữa khung. Studio tự đặt khi tạo key đầu tiên |

- Trước key đầu = giá trị key đầu; sau key cuối = giá trị key cuối. Thiếu trường = mặc định (0, 0, 1, 0, 1).
- Engine bọc `back`/`front` của cảnh trong một lớp transform → hoạt ảnh vào/ra sẵn có của module **vẫn chạy bên trong**; không có `kf` thì không đổi gì. Cảnh có `kf`/`mask` không còn được coi là "phủ kín" (`cover`) nên video chính vẫn vẽ bên dưới.
- Dòng chữ: engine gán `data-cid` rồi chèn transform ngay sau `translate(-50%,-50%)` → xoay/phóng quanh tâm chữ.

**Studio** — chọn thành phần → tab **Keyframe**: Thêm/cập nhật keyframe tại playhead (lấy giá trị đang hiển thị), ‹ › nhảy keyframe, xoá, thanh trượt Dời X/Y, Tỉ lệ, Xoay, Độ mờ (kéo là tự tạo key tại playhead), chọn kiểu chuyển động, danh sách key. Timeline vẽ **hình thoi** trên khối; bấm hình thoi để tua tới. Khi thành phần đã có keyframe, **kéo trên preview / ô X-Y-Cỡ / Alt+mũi tên sửa keyframe tại playhead** (tạo mới nếu chưa có) thay vì vị trí gốc (bọc `getPos`/`setPos` của studio.js). Track chính (clip) chưa hỗ trợ `kf`.

## 2. Mặt nạ — `mask`
Trên clip track chính (`clips[i].mask`) hoặc cảnh bất kỳ (`scenes[i].mask`).
```json
"mask": { "shape": "heart", "x": 50, "y": 42, "w": 80, "h": 45, "feather": 2, "invert": false, "bg": "#3b1f6e" }
```
| Trường | Ý nghĩa |
|---|---|
| `shape` | `circle`, `rounded` (+`r` bo góc 0–50), `rect`, `heart`, `star`, `diamond`, `blob` |
| `x`, `y`, `w`, `h` | tâm và cỡ, **% của lớp** (clip/cảnh = cả khung). Tròn đúng trong 9:16: `h = w × 720/1280` |
| `feather` | viền mềm (% , 0–20) |
| `invert` | khoét lỗ (giữ phần ngoài hình) |
| `bg` (chỉ clip) | màu dưới phần bị che (mặc định đen) |

Cài bằng CSS `mask-image` (SVG data-URI, có blur), render giống hệt khi xuất. Studio: tab **Mặt nạ** (lưới 8 hình + thanh trượt + đảo ngược + màu nền).

## 3. Tách nền clip (thay phông) — `cutouts` + `bg`
```json
{ "src": {"seq": "work/frames/%05d.jpg", "fps": 30, "count": 683}, "in": 8, "out": 16,
  "cutouts": "work/cutouts_frames/%05d.png", "bg": {"type": "color", "color": "#1e6fd9"} }
```
`bg.type`: `blur` (+`blur` px, `dim`), `color` (+`color`), `image` (+`src`: ảnh/chuỗi khung trong media), `none` (trong suốt — thấy màu nền khung). Khung chưa có cutout → hiện khung gốc. Clip ảnh tĩnh: `cutout_img` = `cutouts` = `<ảnh>_cut.png`.
Studio: tab **Mặt nạ** → **Tách nền clip này** → job `POST /api/segment` chạy `scripts/segment.py` (rembg `u2net_human_seg`, offline) **đúng đoạn nguồn in–out** của clip, có thanh tiến độ (đếm PNG); cutout lưu `work/cutouts_<thư mục khung>/` và dùng chung cho mọi clip cùng nguồn (khung đã có thì bỏ qua). Đo thực tế: 241 khung 720×1280 ≈ 60 s trên Mac. Sau đó chọn nền: Tắt / Làm mờ / Màu / Ảnh / Trong suốt.
**Tạo sticker người**: lấy khung tại playhead của clip → `scripts/make_sticker.py` (cắt người, viền trắng, đĩa vàng) → `media/sticker_<time>.png` → cảnh `sticker` (`outline: 0`) tại playhead 2,5 s.

## 4. B-roll AI (panel trái "B-roll AI")
- **Kho ảnh/video**: tìm (tiếng Việt tự dịch bằng `assets/broll/keywords_vi_en.tsv`) trên **Wikimedia Commons** + **Openverse** (không cần key, giấy phép CC — phải ghi nguồn) và **Pexels/Pixabay** (cần key miễn phí). Lưới kết quả, rê chuột video để xem trước, bấm = tải về `media/` (ảnh ≤1920 px; video cắt 2–4 s, 30 fps + chuỗi khung `media/<tên>_frames/`) và chèn cảnh `photo` toàn màn tại playhead (ảnh 2,5 s, video ≤ 3 s) kèm `credit`. Tác giả + license ghi vào `media/credits.json`.
- **AI gợi ý**: `claude -p --model sonnet` đọc phụ đề (gộp thành câu 2–6 s) và chọn tối đa 8 câu; mỗi câu là **preset b-roll động** (chỉ được chọn id trong danh sách ứng viên lấy từ `assets/broll/catalog.json`; server kiểm lại id tồn tại) kèm chữ ngắn, hoặc **từ khoá ảnh stock** tiếng Anh. Tick rồi **Chèn**: preset → dọc: `media_card` toàn màn (hoặc dạng thẻ) với `screen.broll.id`; ngang: `broll` `layout: full`. Stock → tìm + tải ảnh đầu tiên → `photo`. Không có Claude CLI → báo lỗi rõ.
- **Tạo ảnh AI**: chỉ chạy khi có key **OpenAI** (`gpt-image-1`) hoặc **Google Gemini** (`imagen-4.0-generate-001`); không có key thì panel giải thích cần gì, **không giả lập**. Ảnh → `media/ai_<time>.png` → `photo` 3 s. Tính phí theo tài khoản người dùng. (Chưa thử với key thật trong lúc phát triển.)
- **Key** (nút ⚙): lưu ở `~/.ai-video-studio/config.json`, quyền 600, ngoài dự án; API chỉ trả 4 ký tự cuối. Biến môi trường `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` cũng được.

## API / CLI
| Đường dẫn | Việc |
|---|---|
| `POST /api/segment` `{src, in, out, fps}` | job tách nền → `out: {cutouts, n}` |
| `POST /api/sticker` `{frame}` | job sticker → `out: {path}` |
| `GET/POST /api/aikeys` | đọc (đã che) / lưu key |
| `GET /api/stock?q=&kind=photo\|video&en=&n=` | tìm, không tải |
| `POST /api/stock/fetch` `{url, kind, name, dur, meta}` | tải + chuẩn hoá vào media/ → media item |
| `POST /api/broll/suggest` | job Claude → `out: [{i,t0,t1,text,kind,id,label,preset}|{…,kind:'stock',query}]` |
| `POST /api/genimage` `{prompt, provider?}` | job tạo ảnh → `out: {path, provider}` |

```bash
node scripts/ai_broll.mjs search "văn phòng" --kind photo --n 12
node scripts/ai_broll.mjs fetch <url> <dự án> --kind video --name robot --dur 3
node scripts/ai_broll.mjs suggest <dự án>/work/captions.json --n 6
node scripts/ai_broll.mjs genimage "mô tả" out.png --provider openai
node scripts/ai_broll.mjs keys
```

## Giới hạn
- Cảnh có `kf` di chuyển ra khỏi chỗ cũ có thể để lộ phần bên dưới; cảnh `cover` (photo/broll toàn màn) có `kf`/`mask` thì video chính vẫn vẽ dưới.
- Tách nền chỉ nhận chuỗi khung `%05d.jpg` (hoặc ảnh tĩnh); chất lượng tóc/viền theo rembg, chậm ~0,25 s/khung.
- Openverse đôi khi chậm/timeout (20 s) → chỉ thấy kết quả Commons. Pexels/Pixabay/AI ảnh cần key của người dùng.
