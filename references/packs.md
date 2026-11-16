# Gói style (engine/packs/*.js)

Mỗi gói là **1 file JS** nạp sau `slate.js` và trước `engine.js` (xem `engine/index.html`). Gói gồm 3 phần:
- **module** dựng hình,
- **kiểu phụ đề** (tuỳ chọn),
- **metadata** để AI Video Studio hiện các graphic trong menu và tự dựng bản đầu.

## Hợp đồng module
```js
(() => {                       // LUÔN bọc IIFE: mọi file dùng chung global scope, khai báo trùng tên sẽ làm hỏng engine
  const P = 'course';          // tiền tố: mọi type của gói = `${P}_...`
  Object.assign(MODULES, {
    course_chapter(s, t, lt) { // s = scene JSON, t = giây tuyệt đối, lt = t - s.t0
      return { back: '…', front: '…', cover: false, person: false, hideCaptions: false };
    },
  });
  CAPTION_STYLES.course = (c, t) => `<div id="cap" data-cid="${c.cid}" …>…</div>`;
  PACKS.push({ id: P, name: 'Khoá học', icon: '🎓', desc: '…', caption: 'course',
    items: [{ type: 'course_chapter', label: 'Thẻ chương', make: T => ({ type: 'course_chapter', t0: T, t1: T + 2.5, num: 'BÀI 1', title: '…' }) }],
    recipe: ctx => ({ caption_style: 'course', music: 'corporate', scenes: [/* … */] }) });
})();
```
- Khung thiết kế **720×1280** khi dọc (`TL.width < TL.height`), **1280×720** khi ngang. Đọc kích thước bằng `const [W, H] = VERT() ? [720, 1280] : [1280, 720]` (hàm `VERT()` có trong `packs/core.js`).
- `back`: nằm dưới người (chèn sau video nền). `front`: nằm trên cùng. `cover:true`: không vẽ video nền (module tự vẽ toàn khung). `person:true`: vẽ người đã tách nền giữa back và front.
- **Phần tử chọn được trong Studio phải có `data-cid`**: thêm `${cidOf(s)}` vào div gốc. Phần tử con riêng (một dòng, một nút) thì dùng `cidOf(child)`. Các `lines[]` render bằng `lines(s, t)` đã tự có cid.
- Vị trí nên dùng `x`, `y` (tâm) và `size` để Studio kéo thả và đổi cỡ được. Studio mặc định hiểu `x/y/size` của scene. Khung dạng thẻ thì dùng `card:{x,y,w,h}`.
- Hoạt ảnh phải tính **chỉ từ `t`**, không dùng state hay `Date.now()`, vì frame nào cũng phải render được độc lập.
- Màu, font, logo, liên hệ lấy từ `BR()` (brand kit = `TL.brand`): `primary, accent, dark, light, muted, font, disp, logo, name, handle, phone, website`. Gói có thể có bảng màu mặc định riêng, nhưng nên cho `TL.brand` ghi đè.
- Icon/logo: `slIcon(icon, size, 'black'|'white')` nhận `si:<slug>` (Simple Icons v15), emoji hoặc đường dẫn ảnh. Emoji 3D dùng `emoji(ch, x, y, size)`. Ảnh hay chuỗi frame dùng `media(item, t)` (trả về URL), đường dẫn tương đối dùng `url(path)`.

## Hàm có sẵn (đừng khai báo lại)
- **engine.js**: `clamp, lerp, E.{linear,outCubic,inCubic,outExpo,inOutSine,outBack}, prog(t,t0,dur), anim, bob, url, media, emoji, arollImg(t, filter, style), personLayer, rnd, activeIn`, cùng biến `TL`.
- **vertical.js**: `textLine(L, t, out), lines(s, t), TEXT_STYLE, strokeShadow(w, color), stickerHTML, iconHTML, screenContent(screen, t, w, h, s), chatUI, gridBg, faceCircle`.
- **slate.js**: `keyAt(keys, t, field, dflt), slIcon, slateBg, SPARK`.
- **broll.js**: `esc` và module `broll`.
- **registry.js**: `BR(), cidOf, fadeIO(t, t0, t1, din, dout)`.

## Kiểu phụ đề
`CAPTION_STYLES[name](c, t)`. `c = {t0, t1, words:[{w,s,e,hl?,br?}], x?, y?, size?, font?, color?, weight?, cid}` và phải trả về `<div id="cap" …>`. Tôn trọng `c.x/y/size/font/color/weight` nếu có (người dùng chỉnh trong Studio), và từ có `hl` thì làm nổi bật.

## Recipe (bản đầu tự động)
`recipe(ctx)` với `ctx = { dur, captions, brand, vertical }`. Trả về `{ scenes, caption_style, music }`. Studio gọi hàm này khi tạo dự án từ "Video mới" có chọn gói này. Recipe nên có:
- intro (0–2,5 s),
- khung nền cho toàn bài,
- 2–4 graphic đặt theo từ khoá tìm được trong `captions`,
- outro / CTA.

## Danh sách gói
| id | nguồn | dùng cho |
|---|---|---|
| `core` | style có sẵn: slate grid, bubble, Hype Cam | metadata + menu cho module cũ |
| `course` | mới | khoá học, bài giảng, tutorial |
| `realestate` | mới | bất động sản, giới thiệu dự án/căn hộ |
| `review` | mới | review sản phẩm, so sánh, unbox |
| `share` | mới | chia sẻ kinh nghiệm, kể chuyện, quan điểm |
| `luxury` | port từ skill video-edit-minimal-luxury | thương hiệu cao cấp, tối giản |
| `neon` | port từ video-ai-caption-neon | phụ đề neon AI |
| `keynote` | port từ video-edit-ai-keynote | thuyết trình kiểu keynote |
| `glow` | port từ video-tutorial-glow | tutorial phát sáng |
| `podcast` | port từ video-edit-ai-podcast | podcast, phỏng vấn |
| `kinetic` | port từ video-edit-kinetic-broll + taki-video-edit-reference-shortform | chữ động, b-roll dồn dập |
| `split` | mới v3 | chia đôi màn hình: người nói + màn hình/b-roll, so sánh |
| `transform` | mới v3 | biến đổi trước/sau (makeover, nội thất, làm đẹp) |
| `greenscreen` | mới v3 | tách người ghép lên ảnh/bài báo/website (news reaction) |
| `news` | mới v3 | bản tin: lower-third, ticker, breaking banner |
| `multicam` | mới v3 | podcast 2 người, tự chuyển camera theo người nói |
| `qa` | mới v3 | hỏi đáp / phỏng vấn đường phố |
| `topn` | mới v3 | Top N / đếm ngược |
| `cinema` | mới v3 | điện ảnh kể chuyện (letterbox, màu phim, typewriter) |
| `beatslide` | mới v3 | ảnh → video theo nhịp nhạc |
| `screencast` | mới v3 | quay màn hình hướng dẫn: zoom theo vùng thao tác, vòng click, phím tắt |
| `print` | chuyển thể ghost-editor (MIT) | in ấn: lưới Thuỵ Sĩ, hồ sơ halftone, giấy thủ công, phim tài liệu đen trắng, biểu đồ bút chì — `references/pack-print.md` |
| `broadcast` | chuyển thể ghost-editor (MIT) | truyền hình: phụ đề bản tin khối vàng, phóng sự, vẽ phân tích (telestrator), HUD hologram — `references/pack-broadcast.md` |
| `explain` | chuyển thể ghost-editor (MIT) | giải thích: Clean OS (người trong điện thoại), trang sản phẩm, màn hình sau lưng, bộ thẻ số, bảng vẽ tay — `references/pack-explain.md` |
| `montage` | chuyển thể ghost-editor (MIT) | danh sách Seoul, podcast RESULT / quanh mặt, POV montage, hoạt hình vector — `references/pack-montage.md` |
