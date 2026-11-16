# Track chính nhiều clip: `TL.clips`

Có `TL.clips` (mảng không rỗng) thì engine dựng video nền từ các clip **nối liền nhau** theo thứ tự trong mảng, giống track chính có nam châm. Không có thì engine dùng `TL.aroll` như cũ (một đoạn liền).

```json
"clips": [
  { "src": {"seq": "work/frames/%05d.jpg", "fps": 30, "count": 606}, "audio": "work/aroll.mp4", "in": 0, "out": 4 },
  { "src": {"seq": "work/frames/%05d.jpg", "fps": 30, "count": 606}, "audio": "work/aroll.mp4", "in": 8, "out": 12, "speed": 1.5,
    "transition": {"type": "zoom", "dur": 0.4} },
  { "src": "media/living.jpg", "in": 0, "out": 2, "fit": "blurfill", "transition": {"type": "slide_l", "dur": 0.4} },
  { "src": {"seq": "media/clip2_frames/%05d.jpg", "fps": 30, "count": 300}, "audio": "media/clip2.mp4", "in": 1, "out": 6,
    "filter": {"preset": "warm", "brightness": 1.05}, "flip": true, "volume": 0.8 }
]
```

| Trường | Ý nghĩa |
|---|---|
| `src` | chuỗi frame `{seq, fps, count}` (video đã tách khung) hoặc đường dẫn ảnh tĩnh |
| `audio` | file có tiếng của clip (mp4/wav), tính theo giây của nguồn. Bỏ trống thì clip im lặng |
| `in`, `out` | đoạn lấy từ nguồn, tính bằng giây nguồn. Ảnh tĩnh: `out - in` = thời lượng |
| `speed` | tốc độ (0.25–4). Thời lượng trên timeline = (out − in) / speed. Tiếng đổi theo bằng atempo |
| `volume`, `mute` | âm lượng (0–2), tắt tiếng |
| `filter` | `preset` (warm, cool, vivid, bw, film, fade, night, pop) + `brightness`, `contrast`, `saturate` (1 = giữ nguyên), `hue` (độ), `temp` (−1…1), `blur` (px) |
| `flip` | lật ngang |
| `fit` | `cover` (mặc định), `contain`, `blurfill` (vừa khung, nền là chính nó làm mờ, dùng cho clip ngang trong video dọc) |
| `zoom`, `ox`, `oy` | phóng to 1–3 quanh điểm ox/oy (%) |
| `cutouts` | chuỗi PNG người đã tách nền, cùng cách đánh số với `src.seq` |
| `transition` | chuyển cảnh **vào** clip này: `{type, dur}`. `type` ∈ fade, dissolve, slide_l, slide_r, slide_up, push, zoom, zoom_out, blur, whip, spin, wipe, circle, flash, glitch. Clip trước tiếp tục chạy bên dưới, nên tổng thời lượng không đổi |
| `hidden` | bỏ qua clip |

## Thời gian
- Clip `i` bắt đầu tại tổng thời lượng các clip đứng trước. `TL.duration` nên bằng tổng các clip, cộng thêm phần đuôi nếu có thẻ kết.
- **Mọi thứ khác** (scenes, phụ đề, sfx, nhạc) dùng thời gian **đầu ra**. Khi người dùng cắt hoặc xoá một đoạn trên track chính (ripple), Studio phải dời theo:
  - phụ đề và các từ (`words[].s/e`), bỏ những từ nằm trong đoạn bị xoá;
  - scenes, sfx, nhạc.

## Tương thích
- Khi có clip, engine đặt `TL.aroll.frames = '@clip'` (và `'@cut'` cho cutout). Mọi module cũ gọi `url(fmtSeq(TL.aroll.frames, frameAt(t)))` vẫn tự lấy đúng khung của clip đang chạy, gồm cả cắt, tốc độ và thứ tự.
- `arollFilter(t)` đã gồm màu của clip.
- `arollImg(t)` vẽ cả chuyển cảnh.
- Hàm cho gói: `clipAt(t)` → `{c, i, lt, src}`, `srcFrame(clip, srcT)`, `mainTrack(t)`.

## Âm thanh
`mix_audio.py` thấy có `clips` thì dựng giọng từ các clip: cắt in/out, `atempo` theo tốc độ, áp âm lượng hoặc tắt tiếng, chèn im lặng cho ảnh tĩnh, nối lại, lưu ra `.studio/voice_clips.wav`. Sau đó trộn nhạc và SFX như cũ.

## Chuyển dự án cũ sang clip
`{ src: {seq: TL.aroll.frames, fps: TL.fps, count: <số frame>}, audio: TL.audio.voice, in: 0, out: count / fps }`.
