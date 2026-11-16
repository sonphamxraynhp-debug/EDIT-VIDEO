# MODULE API — `timeline.json`

Mọi thời gian là **giây tuyệt đối** trên timeline đã cắt. Scene sống trong `[t0, t1)`; thứ tự trong mảng = thứ tự lớp (sau đè trước).
Media (`image`, `tiles`, `cards`, `columns[]`): `"broll/a.jpg"` hoặc `{ "seq": "broll/gym/%05d.jpg", "fps": 30, "count": 90, "t0": 53.9 }` cho b-roll động (tách frame bằng `ffmpeg -i clip.mp4 -vf fps=30,scale=-2:720 broll/gym/%05d.jpg`).

## Khung timeline
```json
{ "width": 1280, "height": 720, "fps": 30, "duration": 71.4,
  "aroll": { "frames": "work/frames/%05d.jpg", "cutouts": "work/cutouts/%05d.png" },
  "person": { "x": 62, "y": 62, "rx": 26, "ry": 62 },
  "captions": "work/captions.json",
  "captionsHide": [{ "t0": 0, "t1": 5.5 }],
  "grade": [{ "t0": 19.6, "t1": 22.1, "mode": "bw" }],
  "zoom":  [{ "t0": 7.6, "t1": 10, "scale": 1.06 }, { "t0": 39, "t1": 43, "from": 1, "scale": 1.06, "ramp": true }],
  "fx": [{ "t": 8.9, "type": "punch" }],
  "scenes": [ … ], "audio": { "voice": "work/aroll.mp4", "music": [{ "t0": 0, "t1": 28, "mood": "hype", "gain": -9 }], "sfx": [] } }
```
`fx` (tuỳ chọn): `[{ "t": 8.9, "type": "punch" }]` — nhấn chuyển cảnh toàn khung, phụ đề không bị ảnh hưởng.
`type`: `punch` (giật zoom 0.25 s, cho mega/stamp) · `shake` (rung 0.35 s, cho boom/100%) · `whip` (lia ngang có blur, đổi cảnh A-roll↔panel) ·
`zoom_in` (đẩy chậm, `dur` 0.6–1.2, `amp` 0.08) · `blur_in` (vào cảnh mờ→nét) · `glitch` (RGB/sọc, cho AI/tech) · `flash` (chớp trắng). `amp`, `dur` ghi đè mặc định.
`emoji_dir` (tuỳ chọn): thư mục cache Fluent 3D để render không cần mạng.
`person` = elip mềm (%) dùng khi thiếu cutout. `grade.mode`: normal | bw | sad | mellow | blur | chuỗi CSS filter tuỳ ý.

**Vào/ra cảnh (mọi module):** engine tự bọc mỗi scene một lớp chuyển cảnh để không graphic nào bật/tắt trong 1 khung:
overlay hiện dần 0.2 s và mờ dần 0.26 s quanh `t1`; scene phủ toàn khung (`cover` hoặc tự ẩn phụ đề) hiện dần 0.32 s kèm zoom
1.04→1 + blur nhẹ. Khi một scene toàn khung được nối ngay bởi scene khác (t0 sau cách t1 < 0.1 s), nó **giữ nguyên và chạy tiếp
0.32 s dưới** scene mới đang hiện dần — hai phông/panel liền nhau hoà chéo, không lộ camera ở giữa. Khối `hf` (iframe) nhận
cùng độ mờ. Không áp ở đầu/cuối video, cho `broll`/`photo` (tự có fade), hoặc khi đặt `"cut": true` (muốn cắt cứng đúng nhịp);
scene `keep` chỉ có phần hiện vào. Chữ dùng `anim()` khi ra: 0.22 s mờ + thu nhỏ nhẹ.

## Bảng module

| type | Dùng khi | Props chính |
|---|---|---|
| `hud` | 0–2.6 s hook | `face {x,y,w,h}`, `face_out` |
| `slam_bg` | tuyên bố mạnh: hook, con số "after", recap | `tiles[]`, `cx`, `cy` (tâm tia sáng = đầu) — tự bật person layer |
| `flash_ring` | mở hook, lúc counter chạm 100% | `cx`, `cy`, `flash` (0–1), `dur` |
| `counter` | số đếm lên | `from`, `to`, `t_a`, `t_b`, `format` pct\|clock, `x`, `y`, `size`, `style` glow\|white |
| `kinetic` | khối chữ trái mặc định cho mọi câu ý chính | `label`, `label_t`, `label_words[{w,t}]`, `hero` (`\n` xuống dòng), `hero_t`, `hero_size`, `sub`, `sub_t`, `sub2`, `sub2_t`, `emoji[]`, `emoji_t`, `x`, `y` |
| `mega` | 1 từ cảm xúc / con số cực lớn | `text` (HTML, `<em>` = cam), `align` center, `x`, `y`, `size`, `style`, `behind` (sau đầu, cần cutout), `dim_t`, `dim_to` |
| `question_marks` | câu nghi vấn | `items[{x,y,size,t}]` |
| `pill` | câu hỏi phụ / trích dẫn | `text`, `x`, `y` |
| `stickers` | emoji 3D trang trí | `items[{e,x,y,size,t}]` |
| `waveform_strip` | đáy khung hook | — |
| `ui_showcase` | chứng minh bằng ảnh chụp màn hình | `image`, `chip`, `label`, `hero`, `sub`, `pip` (bool), `*_t`, `tags[{text,t}]`, `card_x/y/w`, `rot` |
| `light_leak` | vào/ra cảnh grade đặc biệt | `side` left\|right |
| `ring` | % tiến độ nhỏ | `from`, `to`, `t_a`, `t_b`, `x`, `y` |
| `compare_bar` | trước/sau | `top`, `bottom`, `bottom_t`, `bottom_w`, `shrink_t`, `bottom_w2`, `bottom2` |
| `iris` | chuyển sang panel tối | `cx`, `cy`, `dur`, `color` |
| `checklist_panel` | liệt kê 3–6 mục | `label`, `hero`, `window_title`, `items[{text,t,win}]`; `win.type`: `waves {rows[]}` · `emoji {items[]}` · `trim {from,to}` · `strike {lines[],result}` · `sfx {items[]}`; PiP tròn `pip_x/y/d/fx/fy` |
| `prompt_box` | "chỉ cần ra lệnh" | `text`, `type_a`, `type_b`, `progress_a`, `progress_b`, `x`, `y`, `w` |
| `stamp` | đóng dấu kết luận | `text`, `x`, `y`, `rot`, `size` |
| `orbit` | khoe hiệu ứng / nhiều tài sản quanh người | `cards[]`, `outline`, `fill`, `fill_t`, `emoji[]`, `speed`, `cx`, `cy` |
| `mood` | đổi cảm xúc theo lời | `mode` sad\|happy\|mellow, `text`, `text_t`, `x`, `y`, `size`, `notes[[x,y]]` |
| `mosaic` | dồn b-roll nhanh | `columns[[…],[…],[…]]`, `step` |
| `mosaic_wall` | "rất nhiều", "sinh động" | `tiles[]`, `text`, `text_t`, `y`, `size` |
| `step_cards` | chuỗi nhân quả 2–4 bước | `cards[{title,images[]\|emoji,t}]`, `highlight_t`, `hero`, `pip_fx` |
| `end_card` | chốt | `label`, `text`, `fade_out` |
| `black` | fade đen | `fade_in` |
| `broll` | b-roll procedural (55 template) | `template`, `pal`, `text`, `sub`, `icon`, `num`, `unit`, `items`, `seed`, `layout` full\|card\|right\|left\|pip (+`x,y,w,h`,`rot`), `person` — xem `references/broll-library.md` |

Mặc định ẩn phụ đề trong: slam_bg, mega, orbit, mosaic, mosaic_wall, end_card, flash_ring, iris, black. Ghi đè bằng `"hideCaptions": false|true` trên từng scene.

## Mẹo bố trí
- Khi người ngồi **bên trái** khung: đặt `x` chữ ≈ 760 và `person.x` ≈ 35; `cx` của slam_bg/orbit theo đầu.
- `face` của HUD và `cx/cy` lấy bằng mắt từ 1 still (`render.mjs --still`), sai số 20 px không sao.
- Một khoảnh khắc tối đa **3 lớp chữ** (label + hero + 1 widget). Thêm nữa là rối.
