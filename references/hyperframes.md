# Khối HyperFrames (engine/hf)

Khoảng 200 hiệu ứng lấy từ [HyperFrames](https://github.com/heygen-com/hyperframes) của HeyGen (giấy phép Apache-2.0, xem `engine/hf/LICENSE-HyperFrames.txt`), chia 8 nhóm trong thư viện **Hiệu ứng**:

| Nhóm | Gồm |
|---|---|
| Sản phẩm & demo app | khung thiết bị, giao diện, con trỏ |
| Số liệu & biểu đồ | biểu đồ, bản đồ, đếm số |
| Niềm tin & chốt đơn | đánh giá, thông báo, CTA |
| Logo & tiêu đề động | |
| Tên & chức danh | lower third |
| Chú thích & con trỏ | |
| Chuyển cảnh phủ | |
| Nền & lớp phủ | |

## Scene
```json
{ "type": "hf", "block": "count-up", "t0": 3, "t1": 6,
  "x": 360, "y": 1010, "size": 100, "fit": "contain",
  "speed": 1, "offset": 0, "loop": false, "fade": 0.2,
  "vars": { "end": 245, "suffix": "%" }, "texts": { "0": "Nguyễn Minh Anh" },
  "hideCaptions": true }
```
- `block`: tên khối trong `engine/hf/catalog.js` (`HF_CATALOG`).
- Mỗi khối có:
  - `w`, `h`, `dur`;
  - `layer`: `full` (phủ kín khung) hoặc `over` (nền trong suốt);
  - `box`: vùng có nội dung;
  - `vars`: biến khai báo trong khối;
  - `texts`: chữ tĩnh, đánh số `data-hft`.
- Vị trí mặc định do engine tự tính:
  - Khối `full` vừa khung theo kiểu `contain`; đặt `fit: "cover"` để lấp đầy.
  - Khối `over` được thu phóng theo `box`. Khối ngang đặt trong video dọc được phóng tối đa 2,2 lần.
  - `x`, `y`, `size` ghi đè vị trí mặc định.
- `vars`: giá trị cho biến của khối (chữ, màu, số). Ảnh dùng đường dẫn trong dự án.
- `texts`: thay chữ tĩnh theo số thứ tự.
- Mặc định tiếng Việt viết tay trong `engine/hf/vi.js` (`vi` cho biến, `vit` cho chữ tĩnh). Giá trị của scene vẫn được ưu tiên.
- Thời gian trong khối = `(t − t0) × speed + offset`. Khi hết `dur`, khối giữ khung cuối, hoặc lặp lại nếu đặt `loop`.

## Cách chạy
- Module `hf` (`engine/hf.js`) chỉ vẽ một `.hfslot` rỗng. Slot này dùng để chọn và kéo trong Studio.
- Sau mỗi frame, `hfMount()` đặt một iframe thật lên trên slot. Iframe nằm trong lớp `#hfl` cạnh `#stage`, nên không bị `innerHTML` xoá, và trạng thái GSAP/WebGL được giữ.
- `hfSeek()` (`engine/hf_seek.js`) tua mọi timeline GSAP trong `window.__timelines`, cộng thêm `data-start` của các khối con, rồi tua animation CSS/WAAPI. Lệnh tua có bật event để các khối 3D (three.js) vẽ trong `onUpdate`.
- Phụ đề (`#cap`, `#sub2`) được nhấc sang lớp `#hfcap` phía trên khối.
- Iframe được dùng lại khi biến và chữ không đổi; đổi nội dung thì tạo iframe mới. Tối đa 14 iframe, thừa thì bỏ cái ít dùng nhất.

## Nhập lại / thêm khối
```bash
git clone --depth 1 https://github.com/heygen-com/hyperframes /tmp/hf
node scripts/hf_import.mjs /tmp/hf                                        # đọc scripts/hf_curate.json
node scripts/thumbs.mjs <dự án>/timeline.json --only hf_sp,hf_so,hf_tin,hf_logo,hf_lt,hf_note,hf_ct,hf_nen
node scripts/hf_templates.mjs && node scripts/build_templates.mjs <dự án> <id mẫu…>
```
`hf_import.mjs` làm lần lượt các bước:
1. Chép khối.
2. Gắn khối con (`data-composition-src`) thẳng vào trang, đồng thời làm trong suốt và ẩn phần khung demo quanh nó.
3. Ảnh mẫu lưu trên CDN của HeyGen được thay bằng ảnh trong `examples/media`, để không mang theo ảnh người hay thương hiệu khác.
4. Đánh số chữ tĩnh và chèn shim `__hyperframes.getVariables()`.
5. Mở khối trong Chrome headless, tua tới 15/50/85% thời lượng, rồi đo:
   - khối trống hoặc chỉ một màu thì bị bỏ;
   - phân loại `full` / `over`;
   - lấy vùng nội dung.

Không nhập khối nhái giao diện thương hiệu khác (ChatGPT, Claude, Spotify, Slack, X, Reddit, YouTube, TikTok, Instagram, Figma…).

Thư viện các khối cần (GSAP, d3, three.js bản thường, bản đồ, font) nằm sẵn trong `engine/hf/_lib/`. `scripts/hf_localize.mjs` (được `hf_import.mjs` tự gọi) đổi link CDN sang bản này, nên khối tải ngay và chạy được khi mất mạng. 6 khối 3D dùng module three.js (import map) vẫn tải từ CDN.

Các khối shader WebGPU (`data-no-timeline`) không tua được nên cũng không nhập.
