# Lịch đăng + tự tải lên YouTube

Code: `scripts/publish.mjs` (CLI + thư viện), `studio/routes/18_schedule.mjs` (API + hẹn giờ dự phòng), `studio/features/18_schedule.js` (mục **Lịch đăng** ở thanh trái), nút **Lên lịch…** trong hộp thoại **Đăng** (`52_publish.js`).

## Làm được gì
| Nền tảng | Đến giờ đăng |
|---|---|
| **YouTube** (đã Kết nối YouTube) | Tự tải lên trước giờ đăng (mặc định 120 phút), đặt `status.publishAt` = giờ đăng → YouTube tự công khai đúng giờ. Tiêu đề/mô tả/tag/danh mục/quyền riêng tư, `madeForKids=false` mặc định, ảnh bìa (`thumbnails.set`), tự thêm `#Shorts` cho video dọc ≤ 3 phút. |
| YouTube chưa kết nối, TikTok, Facebook, Instagram, Zalo | 10 phút trước: thông báo macOS. Đúng giờ: thông báo + mở trang đăng trong trình duyệt mặc định + hiện file trong Finder + **chép sẵn caption + hashtag** (`pbcopy`) → trạng thái `reminded`. Mỗi lượt chạy chỉ nhắc 1 mục để clipboard không bị đè. |

Vì sao không tự đăng TikTok/Facebook/Instagram: các API đăng bài (TikTok Content Posting API, Meta Graph API cho Reels/Instagram) đòi app được nền tảng **duyệt** (app review, Business/Creator account, trang web chính sách…). Muốn thêm: tạo app trên developer portal của nền tảng, xin quyền (`video.publish` của TikTok; `instagram_content_publish`, `pages_manage_posts`/`publish_video` của Meta), rồi viết một hàm `uploadTiktok/uploadMeta` giống `youtubeUpload` và gọi trong `runDue` bước 2 — store, khoá, trạng thái giữ nguyên.

## Lịch (`~/.ai-video-studio/schedule.json`, quyền 600)
`{ settings: {slots:["11:30","19:30"], remindMin:10, ytLeadMin:120, privacy:"public", madeForKids:false, categoryId:"22"}, items: [...] }`
Mục: `{id, project, file, platform, when (ISO UTC; hiển thị giờ Việt Nam), title, caption, hashtags[], privacy, thumb?, state: planned|uploading|done|reminded|error, url, error, preReminded, attempts, retryAfter, videoId, publishAt, warnings}`.
Caption mặc định lấy từ `<dự án>/publish/publish.json` (do hộp thoại **Đăng** viết bằng AI) theo nền tảng.
**Xếp lịch tự động**: mỗi video vào khung giờ trống kế tiếp (cách hiện tại ≥ 10 phút, 1 video/nền tảng/khung), các nền tảng của cùng video chung một khung.

## Dòng lệnh
```bash
node scripts/publish.mjs schedule-list [--json] [--all]
node scripts/publish.mjs schedule-add --file out/a.mp4 --platform youtube,tiktok --when "2026-11-05 19:30" [--title …] [--caption …] [--hashtags "#a #b"] [--privacy public]
node scripts/publish.mjs schedule-update <id> --when "2026-11-06 11:30"      # --state planned = thử lại
node scripts/publish.mjs schedule-remove <id>
node scripts/publish.mjs schedule-settings --slots 11:30,19:30 [--remind 10] [--lead 120]
node scripts/publish.mjs schedule-auto --files a.mp4,b.mp4 --platforms youtube,tiktok [--from ISO]
node scripts/publish.mjs run-due [--json]                                   # chạy mỗi phút
node scripts/publish.mjs youtube-client client_secret.json | youtube-auth | youtube-status | youtube-disconnect [--forget-client]
node scripts/publish.mjs youtube-upload out/a.mp4 --meta '{"title":"…","caption":"…","hashtags":["#a"],"privacy":"public"}' [--schedule "2026-11-05 19:30"] [--thumb cover.jpg] [--out result.json]
```
Tiến trình: dòng `@@ <0..1> <bước>`; lỗi: mã thoát ≠ 0 + câu tiếng Việt trên stderr. `run-due` ghi `publish_last_run.json`.

**Ai gọi `run-due`**: hàng đợi Tự lái (A1) mỗi phút; nếu không có, route Studio tự chạy mỗi 60 s (chỉ khi có mục `planned/uploading`; tắt bằng `AVS_NO_SCHEDULE_TIMER=1`). Chống chạy trùng bằng `~/.ai-video-studio/publish.lock` do chính `run-due` giữ (`{pid, started}`; khoá của pid đã chết hoặc > 6 giờ bị coi là cũ). Tiến trình cha giữ sẵn khoá rồi spawn `run-due` làm con trực tiếp cũng được (khoá có `pid === ppid` được chấp nhận).

## Kết nối YouTube (OAuth client của chính người dùng — repo không chứa bí mật nào)
1. Google Cloud Console → tạo dự án → bật **YouTube Data API v3**.
2. Google Auth Platform (OAuth consent screen): External, thêm Gmail của kênh vào **Test users**. Bấm **Publish app** (In production) để refresh token không hết hạn sau 7 ngày (app chưa xác minh vẫn dùng được cho chính mình, qua màn cảnh báo).
3. Clients → **Desktop app** → Download JSON → dán/chọn trong Studio (**Lịch đăng → Kết nối YouTube**) hoặc `youtube-client <file>` → lưu `youtube_client.json` (600).
4. **Kết nối**: luồng installed-app, **PKCE S256** + `state`, redirect loopback `http://127.0.0.1:<cổng ngẫu nhiên>`, mở trang đồng ý trong trình duyệt mặc định, chờ ≤ 5 phút; scope `youtube.upload` + `youtube.readonly` (đọc tên kênh). Refresh token → `youtube_token.json` (600). Không bao giờ in token.
5. **Ngắt**: thu hồi token (`oauth2.googleapis.com/revoke`) + xoá file; "Xoá client + token" xoá cả client.
Token hết hạn/bị thu hồi (`invalid_grant`) → lỗi "Kết nối YouTube đã hết hạn… Kết nối lại", mục chuyển `error` (bấm **Thử lại** sau khi kết nối lại).

### Tải lên (resumable)
`POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` → `Location` (lưu `uploads/<hash>.json` để **tải tiếp khi bị ngắt / máy tắt**, hạn 6 ngày) → `PUT` từng khúc 8 MB (bội số 256 KB, `Content-Range`), 308 + `Range` = đã nhận tới đâu. Lỗi 5xx/429/mất mạng → chờ lùi dần (1, 2, 4… ≤ 64 s, tối đa 10 lần) rồi hỏi trạng thái `Content-Range: bytes */N` và tải tiếp từ byte server đã nhận; 401 → làm mới token 1 lần; 404/410 (phiên hết hạn) → tạo phiên mới. Lỗi có thể thử lại → mục quay về `planned` kèm lỗi, tự thử lại sau 5 phút (hết quota: 60 phút), tối đa 5 lần.
**Quota**: mặc định 10 000 đơn vị/ngày; mỗi video ~1 600, ảnh bìa 50 → ~6 video/ngày; đặt lại 0h giờ Thái Bình Dương. Studio đếm ước tính trong `youtube_quota.json` và hiện ở thẻ YouTube.

### Giới hạn thật cần biết
- **Video tải qua API từ dự án Google Cloud chưa được kiểm duyệt (tạo sau 28/07/2020) bị YouTube khoá ở chế độ Riêng tư**, kể cả khi hẹn `publishAt`. Muốn tự công khai: gửi đơn *YouTube API Services – Audit and Quota Extension Form*. Wizard trong Studio nói rõ điều này.
- Ảnh bìa tuỳ chỉnh cần kênh đã xác minh số điện thoại (lỗi 403 chỉ thành cảnh báo, video vẫn đăng).
- Luồng đồng ý thật cần tài khoản Google của người dùng: phần này **chưa chạy thật** khi phát triển; đã kiểm thử offline bằng máy chủ giả (bên dưới) và xác nhận Google nhận đúng URL đồng ý (client giả → `invalid_client`, không phải `invalid_request`).

## Kiểm thử offline
Biến môi trường: `AVS_HOME`, `AVS_NOW` (giờ giả), `AVS_DRY_OPEN=1` (ghi `publish_open.log` thay vì mở trình duyệt/thông báo), `AVS_YT_API`, `AVS_YT_TOKEN_URI`, `AVS_YT_AUTH_URI`, `AVS_YT_REVOKE_URI` (máy chủ giả), `AVS_YT_CHUNK`, `AVS_YT_BACKOFF_MS`.
Đã kiểm: PKCE theo vector RFC 7636, URL đồng ý, đổi mã qua loopback (sai `state` bị từ chối), tải lên sạch (byte trùng SHA-256), 503 + nhận nửa khúc + đứt kết nối + 401 giữa chừng, phiên hết hạn, **giết tiến trình giữa chừng rồi chạy lại → tải tiếp cùng phiên**, hết quota, token bị thu hồi, ảnh bìa 403, CRUD lịch, xếp lịch tự động, nhắc trước 10 phút / nhắc đúng giờ (nội dung clipboard), khoá chạy trùng.
