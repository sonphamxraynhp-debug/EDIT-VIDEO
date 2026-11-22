# Flow Video Agent — làm video Google Flow, tự học theo view thật

Agent tự động hoá trọn vòng làm video ngắn cho kênh **Bác sĩ Phạm Sơn**:

```
 ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐   ┌────────────────┐
 │ 1. Quét kênh │──▶│ 2. Rút công   │──▶│ 3. Mỗi ngày 10   │──▶│ 4. Giám khảo   │
 │    mẫu (FB)  │   │ thức + SKILL  │   │    kịch bản mới  │   │ chấm /100      │
 └──────────────┘   └───────▲───────┘   └──────────────────┘   └───────┬────────┘
                            │                                   chỉ > 95 điểm,
                            │                                   lấy tối đa 3 bản
 ┌──────────────┐   ┌───────┴───────┐   ┌──────────────────┐   ┌───────▼────────┐
 │ 8. Tự học:   │◀──│ 7. Quét view  │◀──│ 6. Đăng "Chỉ mình│◀──│ 5. Tạo clip    │
 │ bài học,     │   │ mỗi 2 giờ     │   │ tôi" + phiếu     │   │ Google Flow +  │
 │ rubric, công │   │               │   │ duyệt bác sĩ     │   │ ghép + phụ đề  │
 │ thức, skill  │   └───────────────┘   └──────────────────┘   └────────────────┘
 └──────────────┘
```

| Yêu cầu | Agent làm thế nào | Mã nguồn |
|---|---|---|
| Quét toàn bộ video kênh mẫu | Trình duyệt đã đăng nhập cuộn tab Reels + Video, lấy view/cảm xúc/bình luận/chia sẻ, tải video (yt-dlp), bóc lời (faster-whisper), trích khung hình | `research.py`, `facebook/scraper.py`, `media.py` |
| Tìm công thức thành công | Claude phân tích từng video (khung hình + lời + số liệu so với trung vị), rồi so nhóm top 25% với nhóm dưới để ra **playbook** có dẫn chứng số | `research.py`, `models.py` |
| Xây skill làm video tương tự | Tự sinh `.claude/skills/cong-thuc-kenh-mau/SKILL.md` (công thức, hook, cấu trúc, character bible cho Flow, rubric, bài học) — tự cập nhật sau mỗi vòng học | `skillgen.py` |
| Mỗi ngày 10 kịch bản, chấm 100 điểm | 70% bám công thức (exploit) + 30% thử hướng mới (explore). Giám khảo là lời gọi Claude **riêng**, rubric 7 tiêu chí; kèm **cổng an toàn bằng code** (từ cấm, giới tính thai, báo giá, cảnh > 8s) | `planner.py`, `scoring.py` |
| Sửa bản chưa đạt, học từ giám khảo | Bản chưa đạt được sửa theo đúng lời trừ điểm (2 vòng), luôn giữ **phiên bản điểm cao nhất**; nếu chưa đủ 3 bản đạt, 3 bản gần đạt nhất được **đánh bóng** thêm 2 vòng. Lỗi bị trừ nhiều nhất được rút thành quy tắc viết cho ngày sau (tối đa 8 quy tắc) | `planner.py` |
| Chỉ > 95 điểm mới làm, lấy 3 bản hay nhất | Bản vượt 95 phải được **giám khảo thứ hai chấm độc lập xác nhận** (lấy điểm thấp hơn, tránh qua ngưỡng nhờ may mắn). Lọc điểm **> 95**, bỏ bản vi phạm an toàn, không trùng chủ đề, lấy tối đa 3. Không bản nào đạt → hôm đó không làm video | `scoring.select_top` |
| Làm video trên Google Flow | Điều khiển labs.google/fx/tools/flow: mỗi cảnh 1 prompt (có character bible để nhân vật đồng nhất), tải clip, ghép 9:16 1080×1920, chèn phụ đề tiếng Việt màu thương hiệu | `producer/flow_browser.py`, `producer/assembler.py` |
| Đăng chế độ "Chỉ mình tôi" | Trang cá nhân: trình tạo Reels, chọn đối tượng **Chỉ mình tôi** — nếu không chọn được quyền thì **dừng, không đăng**. Fanpage: Graph API `published=false` | `facebook/uploader.py`, `production.py` |
| Mỗi 2 giờ quét lại view | Snapshot view/cảm xúc/bình luận/chia sẻ mọi video trên kênh vào SQLite | `tracker.py` |
| Feedback loop tự học | Nội suy view ở mốc 6h/24h/48h, tương quan Spearman giữa điểm dự đoán và view thật (tổng & từng tiêu chí) → Claude rút bài học, loại bài học sai, chỉnh trọng số rubric (mục an toàn luôn cố định), cập nhật playbook và skill | `learner.py` |

---

## ⚠️ Đọc trước khi chạy

1. **Video "Chỉ mình tôi" không có view thật** (chỉ bạn xem được). Vì vậy vòng học chỉ dùng video bạn đã
   duyệt và chuyển **Công khai**: sau khi Bác sĩ Phạm Sơn duyệt theo `PHIEU_DUYET.md`, đổi quyền trên
   Facebook rồi chạy `python -m flow_agent approve <id>`. Đây cũng là bước bắt buộc theo DNA phòng khám
   (nội dung y khoa phải được bác sĩ duyệt trước khi công khai).
2. **Agent phải chạy trên máy của bạn** (hoặc VPS có giao diện/xvfb), không chạy trên cloud của Claude:
   cần trình duyệt đã đăng nhập Facebook và Google. Đăng nhập 1 lần, phiên được lưu trong `data/browser/`
   (thư mục này chứa phiên đăng nhập — không chia sẻ, đã có trong `.gitignore`).
3. **Google Flow không có API công khai** nên agent điều khiển giao diện web; Google đổi giao diện thì sửa nhãn
   nút trong `video.flow.selectors`. Phương án dự phòng ổn định hơn: `video.backend: veo_api` (cùng mô hình Veo,
   gọi qua Gemini API, tính phí theo giây video). Flow cần gói Google AI Pro/Ultra và tiêu credit mỗi lần tạo
   (3 video × 4–7 cảnh ≈ 12–21 clip/ngày) — kiểm tra hạn mức trước khi bật chạy tự động.
4. **Facebook không cho phép tự động hoá tràn lan**: agent cuộn và mở trang với nhịp chậm như người dùng, nhưng
   vẫn có rủi ro bị yêu cầu xác minh. Nếu gặp, agent dừng và chờ bạn xử lý trong cửa sổ trình duyệt.
5. Agent chỉ học **công thức** của kênh mẫu, không sao chép nội dung, câu chữ, nhân vật hay hình ảnh.
   Video AI đăng công khai cần bật nhãn **"Thông tin do AI tạo"** của Facebook; caption tự thêm dòng ghi chú AI.

---

## Cách nhanh nhất: 1 lệnh

Tải repo về máy (nút **Code → Download ZIP** trên GitHub, giải nén), rồi:

- **Windows:** bấm đúp `BAT_DAU.bat`
- **macOS / Linux:** mở Terminal trong thư mục và chạy `./bat_dau.sh`

Trình cài đặt tự cài thư viện, cấu hình và **Claude Code**, rồi chỉ dừng lại ở 3 việc bắt buộc chính chủ làm:
đăng nhập Claude Code bằng tài khoản Claude (gói Pro/Max), đăng nhập Facebook, đăng nhập Google Flow.

> 💡 **Không tốn tiền API:** agent gọi Claude qua Claude Code (`claude -p`) nên dùng hạn mức của gói Claude
> Pro/Max bạn đang trả. Muốn dùng Claude API trả phí thay thế: đặt `llm.backend: api` và điền `ANTHROPIC_API_KEY`.
> Gói Max có giới hạn sử dụng theo chu kỳ; lần quét kênh mẫu đầu tiên (nhiều video) tốn hạn mức nhất —
> nếu chạm giới hạn, agent báo lỗi rõ ràng và lần chạy sau sẽ làm tiếp phần còn lại. Sau đó nó tự quét kênh mẫu, rút công thức, chạy
quy trình hôm nay (10 kịch bản → chấm → ≤3 video → đăng Chỉ mình tôi) và hỏi bạn có bật chế độ tự chạy không.
Kiểm tra máy bất cứ lúc nào: `python -m flow_agent doctor`.

## Cài đặt thủ công

Cần Python ≥ 3.10, ffmpeg, Google Chrome.

```bash
git clone https://github.com/sonphamxraynhp-debug/EDIT-VIDEO.git
```

```bash
cd EDIT-VIDEO && python -m venv .venv && source .venv/bin/activate
```

```bash
pip install -r requirements.txt faster-whisper
```

```bash
python -m playwright install chromium
```

```bash
cp config/config.example.yaml config/config.yaml && cp .env.example .env
```

Cài Claude Code rồi gõ `claude` một lần để đăng nhập tài khoản Claude (gói Pro/Max) — agent dùng nó, không cần khoá API.
Giữ `FLOWAGENT_BROWSER_CHANNEL=chrome` trong `.env`.
Mở `config/config.yaml` kiểm tra 2 link kênh, giờ chạy, ngưỡng điểm.

### Đăng nhập (1 lần)

```bash
python -m flow_agent login facebook
```

```bash
python -m flow_agent login flow
```

## Chạy từng bước (nên làm lần đầu để kiểm tra)

```bash
python -m flow_agent research
```
Quét + tải + phân tích kênh mẫu, ra playbook v1 và skill `.claude/skills/cong-thuc-kenh-mau/SKILL.md`.

```bash
python -m flow_agent propose
```
10 kịch bản, bảng điểm, danh sách được chọn. Xem chi tiết: `python -m flow_agent show <id>`.

```bash
python -m flow_agent produce <script_id>
```
Tạo clip trên Flow → `data/productions/<id>/final.mp4` + `PHIEU_DUYET.md`.

```bash
python -m flow_agent upload <production_id>
```
Đăng lên kênh ở chế độ **Chỉ mình tôi**.

```bash
python -m flow_agent approve <production_id>
```
Sau khi bác sĩ duyệt và bạn đã chuyển video sang Công khai.

## Chạy tự động

```bash
python -m flow_agent run
```

Lịch mặc định (giờ Việt Nam, sửa trong `schedule`):

| Job | Khi nào | Việc |
|---|---|---|
| `track` | khi khởi động + mỗi 2 giờ | quét view toàn bộ video kênh mình |
| `daily` | 05:30 | 10 kịch bản → chấm → ≤3 bản > 95 → làm video → đăng Chỉ mình tôi → báo cáo |
| `learn` | 22:30 | vòng tự học từ số liệu thật → cập nhật bài học/rubric/playbook/skill |
| `reference` | Chủ nhật 02:17 | quét lại kênh mẫu, phân tích video mới, cập nhật công thức |

Báo cáo hằng ngày: `data/reports/YYYY-MM-DD.md`.

## Rubric chấm điểm mặc định (thang 100)

| Tiêu chí | Điểm | Ghi chú |
|---|---|---|
| Hook 0–3 giây | 20 | |
| Khớp công thức thắng (playbook) | 20 | |
| Mật độ thông tin | 15 | |
| Giọng điệu & thương hiệu | 15 | |
| CTA kết thúc | 10 | |
| Khả thi trên Google Flow | 10 | cảnh ≤ 8s, nhân vật đồng nhất, không bắt AI vẽ chữ |
| An toàn nội dung | 10 | **cố định**; vi phạm → 0 điểm và bị loại |

Vòng học có thể chuyển điểm giữa 6 mục đầu (mỗi mục 5–30) khi số liệu cho thấy giám khảo chấm lệch so với view thật.
Mục an toàn và ngưỡng > 95 không bao giờ bị agent tự nới.

## Kiểm thử

```bash
pip install pytest && python -m pytest -q
```

Test chạy offline với LLM giả: phân tích số liệu FB tiếng Việt, cổng an toàn, chọn top 3, vòng sửa, vòng tự học,
ghép video ffmpeg thật, bộ thu thập link trên trang HTML giả lập.
