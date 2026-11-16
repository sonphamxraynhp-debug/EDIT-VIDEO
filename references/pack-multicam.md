# Gói `multicam` — Podcast / phỏng vấn 2 người, nhiều camera

File: `engine/packs/multicam.js` · ví dụ: `examples/timeline.multicam.json` (20 s) · phụ đề: `caption_style: "multicam"` · script: `scripts/multicam.py`.

## Look
- Video tự **cắt sang người đang nói**. Mỗi lần cắt có **punch-in nhanh** (phóng thêm 7% trong 0,32 s rồi trôi rất chậm). Các shot liên tiếp của cùng một camera xen kẽ khung vừa và khung chặt (`tight` = 1.16), nên hai lần cắt về một người không bao giờ trông giống hệt nhau.
- Khi hai người cùng nói (`cam:'both'`), khung chia **2-up**: dọc thì xếp trên/dưới, ngang thì trái/phải, ngăn bằng một vạch màu nhấn có quầng sáng.
- **Mỗi người một màu**: cam 1 vàng hổ phách `#FFB020` (hoặc `TL.brand.primary`), cam 2 xanh cyan `#3DD6FF` (hoặc `TL.brand.accent`), cam 3 tím `#B78CFF`. Màu được dùng cho lower-third, viền khi chia đôi, sóng âm, từ đang đọc trong phụ đề và nhãn tên người nói. `cam.color` ghi đè màu của từng camera.
- Nền tối `#0A0C11`, tấm nền `rgba(10,12,18,.84)`, font Be Vietnam Pro 700/800.
- **Phụ đề `multicam`**: chữ trắng 800 trên tấm tối bo góc. **Từ đang đọc mang màu của người đang nói**, có nhãn nhỏ tên người nói phía trên tấm. Tâm y = 905 (dọc) / 640 (ngang). Khi có `mc_split` dọc, phụ đề tự nằm ở khe giữa hai khung (y 632) và không hiện nhãn tên (khung đã có chữ "ĐANG NÓI").

## Dữ liệu camera (`cams`) và điểm cắt (`cuts`)
Đặt trên scene `mc_switch` hoặc `mc_split`. Các module `mc_names`, `mc_reaction`, `mc_wave` và kiểu phụ đề **tự đọc** từ scene đó, không cần lặp lại (có thể ghi đè bằng `cams`/`cuts` riêng, hoặc đặt chung ở `TL.multicam = {cams, cuts, levels}`).

```json
"cams": [
  { "media": "aroll", "name": "Minh Kiên", "title": "Host · AI Creator", "face": {"x": 52, "y": 38} },
  { "media": {"seq": "media/mc_cam2_frames/%05d.jpg", "fps": 30, "count": 452, "t0": 0},
    "name": "Thu Hà", "title": "Khách mời", "face": {"x": 50, "y": 45}, "zoom": 1.05 }
],
"cuts": [ {"t": 0, "cam": 0}, {"t": 4.1, "cam": 1}, {"t": 11.4, "cam": "both"}, {"t": 13.1, "cam": 1} ]
```
| trường cam | ý nghĩa |
|---|---|
| `media` | `'aroll'` = video chính (`TL.aroll`, theo cả `TL.clips` và màu grade), hoặc chuỗi frame `{seq,fps,count,t0}`, hoặc ảnh. `t0` = giây trên timeline mà frame 1 của chuỗi xuất hiện, dùng để khớp hình (âm `t0` nghĩa là bỏ bớt phần đầu) |
| `face` | tâm khung theo % khung nguồn (`x`,`y`). Zoom và punch-in lấy điểm này làm gốc |
| `zoom` | phóng gốc (1 = vừa khung). `flip` lật ngang. `filter` là chuỗi CSS filter riêng cho camera đó |
| `fit` | `'cover'` (mặc định), `'contain'`, `'blurfill'` (cả khung nguồn đặt trên nền là chính nó làm mờ, dùng khi camera quay dọc mà video dựng ngang). Có thể đặt `fit` trên scene để áp cho mọi camera |
| `name`, `title`, `color` | tên, chức danh, màu riêng |

`cuts[].cam` nhận: chỉ số camera (`0`, `1`, `2`), `'both'` (2-up), hoặc `'wide'` (dùng `scene.wide = {media, face, zoom}`; nếu không có `wide` thì hiện 2-up). Nếu không có `cuts`, engine tự xen kẽ 2 camera mỗi 4 s. Nếu không có `cams`, engine dùng A-roll 2 lần (cam 2 là bản lật ngang, phóng 1.45), nên dự án nào cũng render được.

## Module (`x`,`y` là tâm, riêng `mc_names` thì `x` là mép trái; `size` là cỡ chữ gốc)

| type | dùng khi | tham số chính |
|---|---|---|
| `mc_switch` | nền cả bài: cắt theo người nói | `cams`, `cuts`, `punch`=.07, `punch_dur`=.32, `drift`=.012, `alt` (false = tắt xen khung chặt), `tight`=1.16, `layout_both:'stack'\|'side'`, `both_n`, `wide`, `flash` (chớp trắng 0,12 s khi cắt), `fit`, `levels`/`step` (từ script) |
| `mc_split` | luôn thấy cả hai người (tranh luận, phản ứng) | `layout:'auto'\|'stack'\|'side'`, `top`, `h`, `pad`, `gap`, `r`=22, `zoom`, `show_names`, `name_size`, `live_label`='ĐANG NÓI', `three` (3 khung). Người nói có viền màu + quầng sáng + nhãn "ĐANG NÓI", người kia tối đi (độ sáng .5, bão hoà .55, thu nhỏ .965), chuyển trong 0,3 s |
| `mc_names` | tên + chức danh khi camera xuất hiện lần đầu | `mode:'first'` (mặc định) \| `'every'` (mỗi shot, 1,8 s), `hold`=3, `delay`=.25, `cam_tag:false` (ẩn chip "CAM 1"); mặc định x 40, y 760 (dọc) / 60, 540 (ngang). Tự ẩn sớm nếu cắt sang camera khác |
| `mc_reaction` | PIP người đang nghe (góc phải trên) | `cam` (ép camera), `w`=196, `h`=260, `zoom`=1.05, `delay`=.45; ẩn khi đang 2-up. Mặc định tâm (600, 330) dọc, (1140, 110) ngang |
| `mc_topic` | thanh tập / chủ đề trên cùng | `episode`='TẬP 1', `chapters:[{t (giây tuyệt đối), title}]` hoặc `title`, `w`=640; tiêu đề trượt khi đổi chương, thanh tiến độ có vạch chương, đếm "1/2". y 150 (dọc) / 46 (ngang) |
| `mc_wave` | sóng âm 2 người nói (ai to hơn thì sáng màu) | `levels:[[…],[…]]` + `step`=.1 + `levels_t0`=0 (lấy từ `mc_switch` nếu bỏ trống); không có levels thì giả lập theo `cuts`. `bars`=26, `w`=330; y 248 (dọc) / 110 (ngang) |

**Bố cục dọc 720×1280** (vùng an toàn y 130–1000): thanh chủ đề 150 · sóng âm 248 (trái) · PIP 200–460 (phải) · lower-third 760 · phụ đề 905. `mc_split` dọc: khung trên y 190–590, khung dưới 674–1074, phụ đề ở khe 632.
**Ngang 1280×720**: `mc_split` hai khung 590×480 cạnh nhau từ y 96, phụ đề 640. Nguồn quay dọc mà dựng ngang thì nên dùng `fit:'blurfill'` trên `mc_switch`.

## Cách quay / thu cho multicam
1. **Mỗi người một micro** (lavalier hoặc micro cài áo/thu riêng). Đây là thứ quyết định cắt chuẩn hay không. Nếu chỉ có tiếng của camera, đặt mỗi camera gần người mình quay và để script tự chuẩn hoá mức tiếng.
2. **2 camera chính**, mỗi camera một người, góc chéo khoảng 30–45° (cam A quay người 1 hơi từ trái, cam B quay người 2 hơi từ phải, mắt nhìn chéo vào nhau). Nên có thêm cam 3 góc rộng thấy cả hai người (dùng cho `cam:'wide'`).
3. Quay cùng độ phân giải, cùng fps (30), cùng màu (white balance cố định). Để thừa đầu khung một chút cho punch-in, vì engine phóng thêm 7–16%.
4. **Vỗ tay một cái (clap) khi bắt đầu** để đồng bộ. Đo lệch giữa các file (ví dụ tiếng vỗ ở giây 2,30 trong file A và 2,72 trong file B) rồi dùng `--offsets 0,-0.42` cho script và `t0` của chuỗi frame cho từng camera.
5. Tách frame từng camera: `ffmpeg -ss <đầu> -t <dài> -i camB.mp4 -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30" -q:v 3 media/mc_cam2_frames/%05d.jpg` (dựng ngang thì dùng 1280:720).

## Script `scripts/multicam.py`
Đo độ to (RMS) mỗi 0,1 s của 2–3 file (mỗi file một micro hoặc một camera), chuẩn hoá theo mức nói của từng micro, làm mượt 0,3 s, rồi chọn người nói có **trễ (hysteresis)**:
- người mới phải to hơn người hiện tại ít nhất `--margin` dB (4) trong ít nhất `--hold` s (0,5),
- không có shot nào ngắn hơn `--min-shot` s (1,2),
- khi không ai nói (dưới `--gate`, mặc định −14 dB so với mức nói), giữ camera hiện tại,
- `--both`: hai người nói chồng nhau ≥ `--both-min` s (1,5) thì tạo cut `'both'`.
Điểm cắt được lùi về lúc người mới bắt đầu nói. Chỉ cần ffmpeg + Python 3, không cần numpy.

```bash
python3 scripts/multicam.py work/mic_host.wav work/mic_guest.wav -o work/multicam.json
python3 scripts/multicam.py camA.mp4 camB.mp4 camWide.mp4 --offsets 0,-0.42,0.1 --margin 5 --min-shot 1.5 --both -o work/multicam.json
python3 scripts/multicam.py a.wav b.wav --apply timeline.json   # ghi cuts + levels thẳng vào các scene mc_switch/mc_split/mc_wave
```
Kết quả: `{"step":0.1,"duration":20.2,"cams":2,"cuts":[{"t":0,"cam":0},{"t":4.1,"cam":1},…],"levels":[[0..1 mỗi 0,1 s],[…]],"stats":{…}}`. `stats.screen_time` = số giây lên hình của từng camera. Đưa `cuts`/`levels` vào `mc_switch` (hoặc vào `ctx.opts` của recipe). Chỉnh tay thêm: chèn `{"t": …, "cam": "both"}` hoặc `"wide"` vào chỗ hai người cười, tranh luận.

Đã thử: 2 track ghép từ giọng A-roll và một clip người thứ hai (lẫn tiếng 8% sang micro kia). Script cắt tại 4.1 / 7.6 / 9.1 / 10.3 / 13.1 / 17.1 s so với lịch nói thật 4 / 7.5 / 9 / 9.6 / 13 / 17 s. Riêng câu xen 0,6 s ở giây 9 vẫn được giữ đủ 1,2 s theo `--min-shot`.

## Recipe (bản đầu tự động)
`ctx.opts = { cams?, cuts?, levels?, step?, episode?, chapters?, music? }`. Recipe gồm: `mc_switch` cả bài (lấy `opts.cuts`; nếu không có thì xen kẽ khoảng 4 s tại điểm bắt đầu câu, cut thứ 4 là `both`), `mc_topic`, `mc_names` (lần đầu mỗi camera), `mc_reaction` từ giây 6 nếu video dài hơn 8 s, `mc_wave` nếu có `levels`. Phụ đề `multicam`, nhạc `corporate`.

## Lời nói → module
| Tình huống | Dùng |
|---|---|
| hỏi đáp nhanh, mỗi người nói 2–10 s | `mc_switch` (cuts từ script) |
| tranh luận, phản ứng liên tục | `mc_split` hoặc `cam:'both'` |
| giới thiệu khách mời | `mc_names` mode `first` |
| người nghe gật đầu, cười | `mc_reaction` |
| chuyển chủ đề | thêm chương vào `mc_topic.chapters` |
| clip audiogram / teaser | `mc_wave` + `mc_split` |
