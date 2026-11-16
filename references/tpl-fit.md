# Bám lời thoại — mẫu tự khớp với clip (`scripts/tpl_fit.mjs`)

Mẫu (`templates/*.json`) được dựng trên clip mẫu: chữ là chữ giữ chỗ ("Tên sản phẩm", "Ưu điểm thứ nhất", vars của khối
HyperFrames…), ảnh là ảnh mẫu trong `examples/media`, thời điểm là thời điểm của clip mẫu (giãn theo tỉ lệ). Ngay sau khi
**Dùng mẫu**, Studio chạy bước "Bám lời thoại" để mọi graphic khớp với lời nói thật của clip.

## Luồng
1. `library.js applyTemplate()` → `win.applyTemplate` (engine) → `Studio.fitTemplate(tpl)` (`studio/features/27_tplfit.js`).
   Mẫu có `"fit": false` thì bỏ qua bước này.
2. `POST /api/tplfit {claude=true, images=true, model}` → job `tplfit` (`studio/routes/27_tplfit.mjs`):
   - dự án chưa có phụ đề → tự tạo lời thoại (whisper small, cùng hàm `transcribe()` của `25_transcribe.mjs`);
   - snapshot vào `.studio/history/*_tplfit.json`, rồi `fitProject()` sửa `timeline.json` tại chỗ (+ `.bak`).
3. Studio `reload()`; một ⌘Z hoàn tác cả mẫu lẫn phần bám lời thoại. Tab **Dự án** có nút **Bám lời thoại** để chạy lại.
4. Tự lái (`autopilot.mjs`, bot Telegram, thư mục theo dõi): hồ sơ có `template` → áp mẫu rồi `fitProject()` luôn.

## `fitProject(dir, {claude, model, images, dry, say})`
Chỉ đụng cảnh của mẫu: `_tpl` / `_recipe`, chưa sửa tay (`_orig`), không phải b-roll tự động (`_auto`).
- **Thời điểm**: cảnh không phải khung nền (dài ≥ 40 % video) và không `keep:true` → bắt đầu ở từ Claude chọn (`c`,`w`), hoặc
  (không có Claude) đầu câu gần nhất trong ±3 s. Giữ thứ tự, không chồng nhau, thời gian bên trong cảnh (`t`, `*_t`) dời theo.
- **Chữ**: mọi trường chữ (khối `hf`: vars kiểu string + texts, kể cả giá trị mặc định tiếng Việt của `vi.js`; cảnh thường: mọi
  chuỗi có chữ cái ngoài các khoá kỹ thuật) + emoji ở `icon/emoji/e/burst`. Claude viết lại theo lời thoại, giữ độ dài/kiểu HOA/
  định dạng. Không có Claude: lấy lần lượt các cụm từ người nói nói từ đầu cảnh; số chỉ thay khi lời nói có số cùng loại (giá
  cần đơn vị tiền, % cần %). Chỗ không lấy được ghi vào `missing` để báo người dùng.
- **Ảnh**: trường ảnh (`image/media/bg/before/after/tiles/images/avatar/src`) đang trỏ ảnh mẫu `media/<file trong examples/media>`
  → tìm ảnh stock (Openverse/Commons, Pexels/Pixabay nếu có key) theo từ khoá tiếng Anh Claude đưa (thử lại 2 từ, 1 từ), tải vào
  `media/fit-*.jpg` + `media/credits.json`. Không có mạng → giữ ảnh mẫu, ghi `missing`.
- **Phụ đề**: Claude chọn 1–2 từ khoá mỗi dòng → `hl:true`.
- Cảnh đã xử lý có `_fit: true`. Kết quả: `{fit, texts, images, hl, claude, missing[]}`.

CLI: `node scripts/tpl_fit.mjs <dự án|timeline.json> [--claude] [--model sonnet] [--no-images] [--dry]`.
Prompt/đáp án Claude lưu ở `.studio/tplfit_prompt.txt`, `.studio/tplfit_raw.txt`.
