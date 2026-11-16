# Âm thanh+ — làm sạch giọng, tự hạ nhạc, nhiều track âm thanh

Code: `scripts/voice_clean.py`, `scripts/mix_audio.py`, `studio/routes/30_audio.mjs`, `studio/features/30_audio.js`.
Tất cả chạy offline bằng ffmpeg + numpy, không tải model, không cần tài khoản. Bản xuất luôn được chuẩn hoá về **−14 LUFS / −1 dBTP** (`loudnorm` cuối chuỗi của `mix_audio.py`).

## 1. Làm sạch giọng — `TL.audio.clean`
```json
"clean": {"preset": "vua"}            // "nhe" | "vua" | "manh" (nhận cả "nhẹ/vừa/mạnh"); bỏ trường hoặc "off" = tắt
"clean": {"preset": "manh", "denoise": 30, "gate": 0.6, "deess": 0.5, "comp": 3, "presence": 2, "hp": 90}   // ghi đè từng thông số
```
Chuỗi xử lý (`voice_clean.py`):
1. `highpass` (70–100 Hz) bỏ tiếng ù.
2. **Lọc ồn `afftdn` có mẫu ồn**: tìm 0,6 s yên nhất (vẫn có tiếng phòng, bỏ qua im lặng số) trong *toàn bộ* file, ghép đoạn đó lên đầu, cho `afftdn` học mẫu (`sn start/stop`), rồi cắt bỏ — thời lượng và khớp hình giữ nguyên.
3. **Giảm vang (gần đúng)**: expander `agate` kéo đuôi vang giữa các từ xuống + cắt nhẹ 300 Hz. Không phải de-reverb thật; phòng vang nặng vẫn còn vang.
4. `deesser` (giảm xì “s”), `acompressor`, EQ presence 3,2 kHz.
5. `loudnorm` −16 LUFS (giọng) + `alimiter`.

| Preset | Lọc ồn | Giảm vang | De-ess | Nén | Presence |
|---|---|---|---|---|---|
| nhe | 10 dB | tắt | 0,3 | 2:1 | +1,5 dB |
| vua | 18 dB | 0,4 | 0,5 | 3:1 | +2,5 dB |
| manh | 28 dB | 0,8 | 0,7 | 4:1 | +3,5 dB |

Khi trộn, giọng đã làm sạch **thay** chuỗi giọng cũ (highpass/afftdn/nén cố định) và được cache ở `<dự án>/.studio/voice_clean_<hash>.wav` (hash = thông số + nội dung giọng; đổi clip/preset là tự làm lại, cache cũ bị xoá). ~1 s cho 45 s giọng.

Dòng lệnh: `python scripts/voice_clean.py in.mp4 out.wav --preset vua [--ss 10 --t 5] [--json '{"denoise":24}']`.

Đo thử (giọng TTS + ồn hồng + vang, 14 s): khoảng cách giọng − nền 29 dB → nhe 32 / vua 42 / manh 47 dB.

**RNNoise (`arnndn`)**: ffmpeg có filter này nhưng cần file model `.rnnn` tải riêng; không đóng gói vì không xác minh được giấy phép của bộ model phổ biến → dùng `afftdn`.

## 2. Tự hạ nhạc khi nói — `TL.audio.duck`
```json
"duck": {"on": true, "amount_db": -10, "attack": 60, "release": 400, "hold": 250}
```
- **Kiểu mới (object)**: dò giọng (VAD theo năng lượng, khung 10 ms, ngưỡng = nền + 40 % khoảng nền→giọng), giữ 250 ms để không “bơm” giữa các từ, bắt đầu hạ sớm `attack` ms (look-ahead), về lại trong `release` ms. Nhạc bị nhân với đường bao này (`amultiply`) → hạ **đúng** `amount_db` khi có giọng. Áp cho mọi `audio.music` + các track có `"duck": true`.
- **Kiểu cũ**: `duck` vắng mặt hoặc `true` → `sidechaincompress` cố định như trước (dự án cũ **không đổi tiếng**: 23/23 timeline mẫu cho ra file WAV giống hệt từng byte). `false` hoặc `{"on": false}` = tắt.
- Studio: dự án cũ hiện “kiểu cũ”; kéo một thanh trong panel là chuyển sang kiểu mới.

Đo thử: giọng có quãng nghỉ 1,2–1,5 s, `amount_db −12` → nhạc −12,0 dB khi nói, −1,0 dB lúc nghỉ (trung vị). Clip thật nói liền (cắt lặng sẵn) → 94 % thời gian là giọng, nhạc nằm −12 dB gần như suốt, chỉ hồi lên ở vài chỗ nghỉ.

## 3. Nhiều track âm thanh — `TL.audio.tracks`
```json
"tracks": [{"id": "t1", "name": "Môi trường", "gain": 0, "mute": false, "solo": false, "duck": true,
  "items": [{"file": "media/rain.mp3", "t0": 2, "in": 0, "out": 8, "src_dur": 20, "gain": -12,
             "fade_in": 0.5, "fade_out": 1, "eq": {"low": -3, "mid": 0, "high": 2}, "hidden": false}]}]
```
- `t0` = vị trí trên timeline; `in`/`out` = điểm vào/ra trong file (độ dài khối = out − in); `src_dur` = độ dài file (giới hạn khi kéo mép).
- EQ 3 dải: `bass` 120 Hz, `equalizer` 1 kHz (Q 1), `treble` 8 kHz, ±12 dB. Âm lượng = `item.gain + track.gain` (dB).
- `mute` bỏ track; có track `solo` thì chỉ các track solo được trộn (solo chỉ trong nhóm track phụ, giọng/nhạc/SFX vẫn giữ).
- File mono được nhân đôi ra stereo theo luật −3 dB của ffmpeg (như giọng clip).
- Nhạc nền `audio.music[]` có thêm `fade_in` / `fade_out` (giây; mặc định chuyển mượt 0,12 s như cũ).

## Studio
Thanh trái **Âm thanh+**: preset làm sạch + **A/B** (5 s quanh playhead: A gốc / B đã làm sạch, cả hai cùng −16 LUFS để so độ sạch chứ không so độ to; với dự án nhiều clip, lấy đúng file/điểm nguồn của clip tại playhead, bỏ qua tốc độ clip), bật/tắt + 3 thanh hạ nhạc, quản lý track (thêm, đổi tên, M/S, âm lượng, tự hạ, thêm file từ Media hoặc tải lên → đặt tại playhead), **Lưu & trộn** (chạy `mix_audio.py` như khi xuất, nghe `work/mix.wav` ngay trong panel).
Timeline: mỗi track là một hàng dưới “Âm thanh”; khối **kéo ngang để dời, kéo mép để cắt** (mép trái đổi cả `in`), Delete / ⌘D / Ẩn như các khối khác. Inspector khối: Cơ bản (bắt đầu, vào/ra, âm lượng, “Bắt đầu tại playhead”) · Fade & EQ · Track. Nhạc nền có thêm tab **Fade**.
Preview khi phát: track phụ phát theo âm lượng + mute/solo; **chưa** có fade/EQ/làm sạch/hạ nhạc — những thứ đó chỉ nghe được qua “Lưu & trộn” hoặc bản xuất.

## API
| Đường dẫn | Việc |
|---|---|
| `POST /api/audio/ab` | `{src, ss, dur?, clean}` → `{a, b}` (wav trong `.studio/ab/`) |
| `GET /api/audio/probe?file=` | `{dur}` |
| `POST /api/audio/mix` | job chạy `mix_audio.py` → `job.out = work/mix.wav` |

`mix_audio.py <timeline.json> --stems` ghi thêm `.studio/stem_voice.wav` + `.studio/stem_music.wav` (bus nhạc sau khi hạ) để kiểm tra.
