# AUDIO SPEC

## Style dọc "tutorial bubble" (decode-bubble.md §5)
- −14 LUFS, LRA ~3 LU; **1 bed nhạc suốt video**: `happy` (118 bpm, khớp nhịp mẫu) hoặc `corporate`, gain −12, ducking bật.
- SFX nhẹ, không boom: `auto_sfx.py` tự đặt whoosh_fast (chữ trượt), pop (chữ/sticker bật), whoosh_2 (hero lật), whoosh_deep (vào spotlight),
  whoosh (bubble_screen drop), typing_Ns + keyboard_enter (ô chat gõ/gửi), blip (AI trả lời), click (bàn tay bấm), notification + shimmer (Follow + từ khoá neon).

## (Style ngang AI Hype Cam bên dưới)

## Số đo video gốc
- Integrated **-14.4 LUFS**, LRA **3.2 LU** → giọng bị nén mạnh, đều như podcast.
- Gap giữa các từ ≤ 0.16 s → cắt lặng tuyệt đối, chỉ chừa 40–80 ms đệm mỗi đầu.
- Đỉnh cao tần (SFX) trùng chính xác khung hình đổi cảnh: 0.3, 1.4, 2.3, 9.0, 21.0, 22.0, 28.3, 35.5, 42.2, 49.5, 55.7, 56.9, 59.6, 67.4, 70.2 s.
- Đỉnh tần thấp (boom) tại 45.3 s (orbit) và 48.1 s; outro 71.5–72.5 s nhạc nổi lên khi hết giọng.

## Chuỗi xử lý giọng (`scripts/mix_audio.py` làm sẵn)
1. `highpass=f=80` → `afftdn=nf=-25` (khử ồn phòng nhẹ)
2. `acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=4`
3. `equalizer=f=3500:t=q:w=1:g=2.5` (độ rõ) + `equalizer=f=250:t=q:w=1:g=-2` (bớt ù)
4. `alimiter=limit=0.89`

## Nhạc nền — đổi theo nghĩa câu (mood map)
Thư viện có sẵn 20 track tự sinh (10 mood × 2) — danh sách + BPM: `references/sound-library.md`.
| Đoạn | Mood | Gain (`"mood"` trong audio.music) |
|---|---|---|
| Hook, before/after, giải pháp, recap, chốt | `hype` / `hype_2` | -9 dB (mixer duck thêm 6 dB khi có giọng) |
| Panel liệt kê, hậu trường, công cụ | `tech` / `tech_2` | -11 dB |
| Câu "buồn", quá khứ khó khăn | `sad` | -7 dB (nổi rõ để "nghe thấy" cảm xúc) |
| Câu "vui, sôi động" | `happy` | -7 dB |
| Câu "du dương", kể chuyện chậm | `mellow` / `lofi` | -7 dB |
| Tầm nhìn / tuyên bố lớn | `epic` | -9 dB |
| Vấn đề, rủi ro, bí mật | `suspense` | -9 dB |
| Doanh nghiệp, hướng dẫn | `corporate` | -10 dB |
| Câu chuyện vượt khó | `inspire` | -9 dB |
| End card (hết giọng) | `hype` `offset` 30+ | -4 dB rồi fade |

Nhạc cắt **cứng theo câu** khi đổi mood (đúng tinh thần "đổi nhạc" trong video), crossfade 0.12 s.
Muốn nhạc thật: đặt file vào timeline bằng `"file": "my_track.mp3"` thay cho `"mood"`.

## SFX
191 âm tự sinh trong `assets/sfx/` (11 nhóm). Không cần đặt tay: `$PY scripts/auto_sfx.py timeline.json` đặt theo module
(luật + bảng tên: `references/sound-library.md`). Thêm hit riêng với `"manual": true` rồi chạy lại với `--keep-manual`.
Quy tắc: tối đa **1 SFX nổi bật mỗi 0.5 s**; SFX đặt trước khung hình 1 frame (âm tới sớm cảm giác "chắc" hơn).

## Master
`loudnorm=I=-14:TP=-1.0:LRA=4` (2-pass), xuất AAC 192 kbps 48 kHz.
