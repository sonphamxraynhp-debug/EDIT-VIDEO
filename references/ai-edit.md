# AI dựng giúp · Cắt lỗi nói · Sửa video bằng chữ

Ba công cụ trong Studio (rail **AI** và **Lời thoại**, nút **AI dựng giúp** trên thanh trên). Code: `studio/features/20_ai.js` (giao diện + cắt ripple), `studio/routes/20_ai.mjs` (API), `scripts/ai_edit.mjs`, `scripts/fillers.py`.

## 1. AI dựng giúp
Claude (lệnh `claude -p`, model `sonnet`, không cần API key) đọc lời thoại rồi:
- chọn gói style và kiểu phụ đề (hoặc giữ gói đang dùng, hoặc theo gói người dùng chọn);
- sửa phụ đề để hiển thị: lỗi nhận dạng, tên riêng, nhấn từ khoá (`hl`), xuống dòng (`br`). **Không đổi thời gian**: số từ mỗi dòng phải giữ nguyên, từ bị bỏ thì để `""` (bị xoá khi áp dụng);
- viết hook, đặt 6–15 graphic. Mỗi cảnh bắt đầu tại thời điểm bắt đầu của một từ (`c` = chỉ số dòng phụ đề, `w` = chỉ số từ);
- chọn nhạc nền (mood) và 3–8 SFX đặt tại từ.

Tuỳ chọn trong hộp thoại: mục tiêu (khoá học / BĐS / review / chia sẻ / bán hàng / khác), giọng điệu, gói (giữ / AI chọn / gói khác), mật độ graphic (thưa 5–7, vừa 8–11, dày 12–15), yêu cầu thêm. Chạy dạng job (`/api/job`), mất khoảng 20–90 giây.

**Dữ liệu gửi cho Claude**: lời thoại có chỉ số từ, thời lượng, khổ hình, brand kit, danh sách gói kèm loại graphic và ví dụ params (lấy thật từ engine: `make(0)` của từng item, qua headless Chrome), kiểu phụ đề, danh sách mẫu, chủ đề và template b-roll, mood nhạc, tên SFX. Các gói cần cảnh quay đặc biệt (hypecam, beatslide, multicam, screencast, greenscreen, transform) chỉ dùng khi người dùng chọn đích danh. Item cần ảnh hoặc video của người dùng bị loại.

**Kiểm tra kết quả** (`validate`): type không có trong gói thì bỏ. Thời gian lấy từ `words[w].s`, giới hạn trong video, dài 0,8–8 giây, không cho chồng nhau. Params trộn lên ví dụ của item, nên trường nào thiếu vẫn có giá trị mặc định. Thời gian lồng bên trong params được tính tương đối so với đầu cảnh. Chữ không dài quá khoảng 1,8 lần chữ ví dụ. Id b-roll sai thì chuyển về id gần nhất trong catalog. Mood và SFX lạ thì bỏ. JSON hỏng thì hỏi lại 1 lần. Những gì bị bỏ được ghi trong `dropped`.

**Plan** (`.studio/ai_plan.json`):
```json
{ "pack": "share", "caption_style": "share", "hook": "AI có thể đáng sợ hơn I, Robot?",
  "captions": [{"i": 9, "t0": 7.06, "n": 4, "words": [{"w": "tin"}, {"w": "gây", "hl": true}, {"w": "sốc", "hl": true}, {"w": "trên"}]}],
  "scenes": [{"type": "sh_grade", "t0": 0, "t1": 22.6, "_ai": true, "_base": true}, {"type": "sh_stat", "t0": 2.85, "t1": 4.35, "value": "Vài năm", "_ai": true}],
  "music": {"t0": 0, "t1": 22.6, "mood": "suspense", "gain": -20, "_ai": true},
  "sfx": [{"t": 1.91, "name": "whoosh", "gain": -12, "_ai": true}], "summary": "…", "dropped": [] }
```
`_base` là các cảnh nền dài lấy từ recipe của gói (khung, màu phim, thanh tiến độ…).

**Áp dụng** (phía client, hoàn tác bằng ⌘Z):
- xoá các cảnh `_ai` / `_recipe` **chưa bị người dùng chỉnh** (chưa có `_orig`), rồi thêm cảnh mới;
- thay nhạc phủ cả video và các SFX `_ai`;
- sửa phụ đề theo `t0` + số từ.

Chạy lại chỉ thay phần do AI tạo. Sau khi áp dụng có thể bấm **Render thử 3 khung** để render ảnh thật (`/api/still`) tại 3 cảnh AI.

CLI: `node scripts/ai_edit.mjs <dự án> [--goal "Chia sẻ"] [--tone …] [--pack keep|auto|<id>] [--density thua|vua|day] [--extra "…"] [--out plan.json] [--apply]`. Prompt và câu trả lời thô được lưu ở `.studio/ai_prompt.txt` và `.studio/ai_raw.txt`.

## 2. Cắt lỗi nói (`scripts/fillers.py`)
`python fillers.py <words.json|captions.json> [out.json] [--pause 0.7] [--keep 0.25] [--gap 0.12] [--fillers "ờ,ừm,thì là"] [--claude]`
- **filler**: tiếng đệm (ờ, ơ, ừ, ừm, ờm, à…) sát một chỗ ngắt ≥ `--gap`; cụm đệm (thì là, kiểu như, nói chung là, đại loại là…) có chỗ ngắt ở cả hai đầu. Danh sách có thể thay bằng `--fillers`. "à" và "ừ" có thể là từ thật nên độ tin thấp (mặc định không được chọn sẵn).
- **repeat**: 1–4 từ nói lặp liền nhau, cắt lần nói đầu. Có danh sách từ láy hợp lệ (từ từ, dần dần…) để không bắt nhầm.
- **pause**: chỗ ngắt dài hơn `--pause`, rút còn `--keep` giây.
- **false_start** (`--claude`): Claude chỉ ra câu bắt đầu rồi bỏ dở hoặc nói vấp. Mặc định không được chọn sẵn, người dùng tự xem lại.

Kết quả: `{"words": n, "cuts": [{"a", "b", "kind", "text", "reason", "conf", "i0", "i1"}]}`. Thời gian theo đúng đầu vào: Studio gửi thời gian đầu ra hiện tại của phụ đề.

Lưu ý: whisper thường **tự bỏ** tiếng "ờ, à" khi nhận dạng, nên tiếng đệm chỉ bắt được khi whisper có ghi lại. Từ lặp, chỗ ngắt và câu nói hỏng (qua Claude) thì bắt được ổn định hơn.

## 3. Lời thoại: sửa video bằng chữ
Panel **Lời thoại** hiện toàn bộ lời nói dạng văn bản, kèm mốc giờ ở chỗ ngắt.
- Bấm một từ để tua tới đó.
- Kéo chuột hoặc Shift-bấm để chọn một đoạn, rồi bấm **Delete** (hoặc nút "Xoá đoạn") để cắt đoạn đó khỏi video.
- Từ đang phát được gạch chân. Từ đã bị dò là lỗi nói được gạch chân vàng.

Đoạn bị cắt gồm các từ đã chọn cộng chỗ ngắt phía sau, không lấn vào từ bên cạnh.

## Cắt ripple (dùng chung cho 2 và 3)
`Studio.ai.cutRanges([[a, b], …])`:
1. gộp các đoạn cách nhau < 0,1 s;
2. cắt từ cuối lên đầu: `splitClipAt(b)`, `splitClipAt(a)`, bỏ các clip nằm trong `[a, b]`;
3. `remapAll(fRemove(A, B), [A, B])` để dời phụ đề, từng từ, scenes, sfx, nhạc, fx; sau đó `fixDuration()`.

Đây là cùng bộ hàm mà xoá clip trong `studio/clips.js` dùng. Dự án chưa có `TL.clips` sẽ được `migrateClips()` tạo trước. Toàn bộ lần cắt là một bước hoàn tác. Âm thanh khi xuất được `mix_audio.py` dựng lại từ các clip, nên hình và tiếng luôn đi cùng nhau. Đã kiểm tra trên clip thật: tiếng sau cắt lệch 0 ms so với tính toán, khung hình khớp đúng frame nguồn.

## Giới hạn
- Cần Claude Code CLI (`claude`) cho AI dựng giúp và phần câu nói hỏng. Nếu không có, Studio báo lỗi tiếng Việt; phần dò tự động vẫn chạy.
- AI không tự tạo ảnh hoặc video: graphic cần media riêng bị loại, còn b-roll chỉ lấy từ thư viện b-roll động có sẵn.
- Không cắt được đoạn ngắn hơn 1 khung, cũng không cắt được toàn bộ video.
