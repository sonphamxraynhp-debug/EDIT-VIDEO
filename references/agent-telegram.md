# Agent Telegram · vòng phản hồi · tự đề xuất

## Thành phần
| File | Vai trò |
|---|---|
| `scripts/telegram.mjs` | `TelegramBot`: long polling `getUpdates`, không cần URL công khai; ghép nối; xử lý video, lệnh, tin tự do; giao kết quả; bản tin sáng. CLI: `token`, `pair`, `run [--no-queue]`, `status` |
| `scripts/feedback.mjs` | Phản hồi (`feedback.jsonl`), `improve()`, đề xuất (`suggestions.json`), `actSuggestion()`. CLI: `add`, `list`, `improve`, `suggest`, `suggestions`, `act` |
| `scripts/profile.mjs` | `effectiveProfile()` áp `p.fb` (từ phản hồi) trước `p.learned` (từ chỉnh sửa tay) |
| `studio/routes/46_agent.mjs` | Chạy bot trong server Studio (`AVS_NO_TELEGRAM=1` để tắt). Các API `/api/agent/*` |
| `studio/features/46_agent.js` | Mục **Agent** gồm 3 tab: Telegram · Phản hồi · Cải tiến & đề xuất |

Các file dữ liệu (trong `~/.ai-video-studio/`):
- `telegram.json` (mode 600): `{token, on, allowed[], pair, profile, digest, autoImprove, offset, notified[], pending{}}`
- `feedback.jsonl`: mỗi dòng là `{id, t, video, project, profile, rating, tags[], comment, source, qc}`. Dòng `{id, patch}` dùng để gộp thẻ hoặc góp ý gửi sau.
- `suggestions.json`, `improve_log.json`

## Luồng Telegram
- **Chat chưa ghép nối:** chỉ nhận mã 6 số (hết hạn sau 15 phút), lấy từ Studio hoặc `telegram.mjs pair`.
- **Nhận video** (`video`, `video_note`, hoặc `document` kiểu video, tối đa 20 MB):
  1. Lưu vào `telegram/inbox/`.
  2. Thêm việc `autopilot` vào hàng đợi với `opts.telegram.chat` (cùng `opts.profile` nếu bot có chọn hồ sơ).
- **Giao kết quả** (5 giây quét một lần), cho việc có `opts.telegram.chat` vừa `done` hoặc `failed`:
  - Gửi `sendVideo` nếu file ≤ 49 MB, kèm điểm QC và caption TikTok.
  - Sau đó gửi bàn phím chấm điểm `r:<item>:<n>`.
  - Việc lỗi thì có nút chạy lại `q:<id>:retry`.
- **Sau khi chấm:**
  - Tin được sửa thành các nút thẻ `t:<fid>:<tag>` và nút `d:<fid>` (xong).
  - Tin văn bản gửi trong 15 phút sau được coi là góp ý cho phản hồi đó.
- **Tin tự do:** gọi `claude -p` để trả JSON `{reply, action}`. Action là một trong:
  - `topic`
  - `video_path` (chỉ nhận file video có thật)
  - `status`, `suggest`, `improve`, `profile`, `retry`
  - `none`

  Agent không bao giờ chạy lệnh shell.
- **Bản tin sáng:** đến giờ `digest`, bot gọi `refreshSuggestions()` rồi gửi tóm tắt 24 giờ và các đề xuất kèm nút `s:<id>:apply|dismiss`.

## Tự cải tiến
- `deriveFeedbackRules()` xét 8 phản hồi gần nhất của mỗi hồ sơ. Một thẻ được tính khi xuất hiện ≥ 2 lần và chiếm ≥ 25%:

  | Thẻ | Thay đổi |
  |---|---|
  | `nhac_to` / `nhac_nho` | `music_gain` −3 / +3 dB |
  | `fx_nhieu` / `che_mat` | b-roll và AI giảm 1 bậc |
  | `fx_it` | b-roll và AI tăng 1 bậc |
  | `am_thanh` | SFX giảm 1 bậc |
  | `phude` | kiểu phụ đề `hf_pill_karaoke` |
  | `hook`, `dai`, `che_mat`, các góp ý | ghi vào `fb.extra`, được nối vào `extra` mà AI dựng giúp đọc |

- Với Claude, `improve()` gửi các phản hồi, số lỗi QC và cấu hình hồ sơ, rồi nhận về `{summary, changes, suggestions}`:
  - Chỉ chấp nhận các trường và giá trị hợp lệ (`cleanPatch`). Changes chỉ được tự áp khi gọi `--apply`; nếu không thì chuyển thành đề xuất.
- Bot tự chạy `improve()` sau mỗi 3 phản hồi mới, trừ khi tắt `autoImprove`.

## Đề xuất
- **Theo luật:**
  - Có ≥ 2 video bị chấm ≤ 3★ → đề xuất tự cải tiến.
  - Có ≥ 3 video chưa chấm → nhắc chấm điểm.
  - 3 ngày tới chưa có lịch đăng → đề xuất lên lịch.
  - Có việc lỗi → đề xuất chạy lại.
  - Hồ sơ được chấm cao → gợi ý nhân bản.
- **Với Claude:** 4 ý tưởng video lấy từ lời thoại của 5 video gần nhất (action `topic`).
- Hàm `actSuggestion` xử lý các loại action: `profile` (patch đã kiểm tra), `topic`, `improve`, `retry_failed`, `schedule`.

## Kiểm thử
Có thể chạy bot với máy chủ Telegram giả bằng `AVS_TG_API=http://127.0.0.1:<port>` và `AVS_HOME=<thư mục tạm>`.
