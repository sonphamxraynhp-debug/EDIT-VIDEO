# SFX & MUSIC LIBRARY (tự sinh 100% — royalty-free, dùng thương mại thoải mái)

**309 SFX** ở `assets/sfx/<name>.flac` · **30 track nhạc** ở `assets/music/<mood>.mp3` (mọi track -16 LUFS, loop được).
Gọi trong timeline bằng tên: `{"t": 3.2, "name": "whoosh_4", "gain": -13}` · `{"t0": 0, "t1": 28, "mood": "hype", "gain": -9}`.
Sinh lại / đổi giọng: `$PY scripts/gen_sfx.py assets/sfx --ext flac [--skip-existing]` · `$PY scripts/gen_music.py assets/music [--only lofi_hiphop --variants 1]` (`--only` gộp vào catalog có sẵn).
Tự đặt SFX theo cảnh: `$PY scripts/auto_sfx.py timeline.json` (luật ở cuối file) · bản v4 giàu hơn: `--level nhe|vua|phongphu [--music auto]` — xem `references/autofill.md`.
Bảng dưới sinh từ `catalog.json` — sửa catalog/generator rồi sinh lại.
v4 thêm 118 SFX (riser nhiều độ dài, hit, UI, tiền, 12 nền loop ≤ 16 s, hoạt hình, swell, glitch, nhịp tim, vỗ tay tổng hợp…) và 10 nhạc mới; mỗi SFX v4 tự tái lập được riêng (RNG reverb gieo theo tên), đã lọc DC, beds crossfade đuôi→đầu nên loop không click.

## Nhạc nền theo mood

| file | BPM | dài | dùng khi |
|---|---|---|---|
| `hype` | 128 | 60s | năng lượng cao, EDM 128bpm — hook, tuyên bố, recap, chốt |
| `hype_2` | 124 | 62s | năng lượng cao, EDM 128bpm — hook, tuyên bố, recap, chốt |
| `tech` | 110 | 61s | arp điện tử 110bpm — hậu trường, công cụ, AI, dashboard |
| `tech_2` | 116 | 58s | arp điện tử 110bpm — hậu trường, công cụ, AI, dashboard |
| `sad` | 70 | 62s | piano buồn 70bpm — nỗi đau, quá khứ, thất bại |
| `sad_2` | 66 | 58s | piano buồn 70bpm — nỗi đau, quá khứ, thất bại |
| `happy` | 118 | 57s | ukulele + clap 118bpm — vui, kết quả tốt, đời thường |
| `happy_2` | 122 | 63s | ukulele + clap 118bpm — vui, kết quả tốt, đời thường |
| `mellow` | 80 | 60s | lofi electric piano 80bpm — du dương, thư giãn, kể chuyện |
| `mellow_2` | 76 | 63s | lofi electric piano 80bpm — du dương, thư giãn, kể chuyện |
| `lofi` | 84 | 57s | lofi biến thể — hoài niệm, chill |
| `lofi_2` | 72 | 53s | lofi biến thể — hoài niệm, chill |
| `epic` | 90 | 64s | dây + trống trận 90bpm — tầm nhìn, tuyên bố lớn |
| `epic_2` | 90 | 64s | dây + trống trận 90bpm — tầm nhìn, tuyên bố lớn |
| `suspense` | 100 | 58s | ostinato căng 100bpm — vấn đề, rủi ro, bí mật |
| `suspense_2` | 100 | 58s | ostinato căng 100bpm — vấn đề, rủi ro, bí mật |
| `corporate` | 112 | 60s | piano + guitar sáng 112bpm — doanh nghiệp, giới thiệu, hướng dẫn |
| `corporate_2` | 112 | 60s | piano + guitar sáng 112bpm — doanh nghiệp, giới thiệu, hướng dẫn |
| `inspire` | 96 | 60s | piano + strings 96bpm — truyền cảm hứng, câu chuyện vượt khó |
| `inspire_2` | 96 | 60s | piano + strings 96bpm — truyền cảm hứng, câu chuyện vượt khó |
| `lofi_hiphop` | 84 | 57s | lofi hip-hop 84bpm, trống boom-bap + vinyl — chill, học tập, vlog đời thường |
| `cinematic_epic` | 80 | 60s | dây + kèn + trống taiko 80bpm — tuyên bố lớn, hành trình, trailer |
| `corporate_upbeat` | 120 | 64s | pop doanh nghiệp tươi 120bpm — giới thiệu công ty, sản phẩm, khoá học |
| `real_estate_luxury` | 100 | 58s | deep house sang trọng 100bpm — bất động sản, nội thất, khách sạn |
| `tiktok_trap` | 140 | 62s | trap 140bpm, 808 + hi-hat roll — TikTok, hook nhanh, giới trẻ |
| `acoustic_warm` | 100 | 58s | guitar mộc ấm 100bpm — câu chuyện, gia đình, ẩm thực |
| `ambient_calm` | 60 | 64s | ambient pad + chuông 60bpm, không trống — thiền, sức khoẻ, spa |
| `news_bg` | 120 | 64s | nền bản tin 120bpm, nhịp xung + timpani — tin tức, cập nhật, phân tích |
| `kids_playful` | 126 | 61s | pizzicato + glockenspiel 126bpm — vui nhộn, trẻ em, mẹo hay |
| `piano_minimal` | 90 | 64s | piano tối giản 90bpm — tâm sự, cảm xúc, chiêm nghiệm |

Gain gợi ý (track -16 LUFS, giọng sau xử lý ≈ -18 LUFS): nền dưới giọng **-9 … -11 dB** (đã có duck 6 dB); khoảnh khắc mood (buồn/vui/du dương) **-7 dB**; outro không giọng **-4 dB**. Nhạc tự động (`--music auto`) dùng -18 dB + tự hạ khi nói (duck object).
Đổi mood = cắt cứng đúng đầu câu, crossfade 0.12 s (mặc định của mixer); nhạc tự động dùng `xfade` 0.8 s. Dùng `offset` để nhảy vào đoạn sôi động (giây 30+ của track là phần 'lift').

## SFX theo nhóm

### Chuyển cảnh (32)

| tên | dài | dùng khi |
|---|---|---|
| `whoosh` | 0.55s | chữ hero/mega vào, đổi cảnh, card trượt |
| `whoosh_2` | 0.35s | chữ hero/mega vào, đổi cảnh, card trượt |
| `whoosh_3` | 0.8s | chữ hero/mega vào, đổi cảnh, card trượt |
| `whoosh_4` | 0.45s | chữ hero/mega vào, đổi cảnh, card trượt |
| `whoosh_5` | 1.1s | chữ hero/mega vào, đổi cảnh, card trượt |
| `whoosh_6` | 0.6s | chữ hero/mega vào, đổi cảnh, card trượt |
| `whoosh_7` | 0.25s | chữ hero/mega vào, đổi cảnh, card trượt |
| `whoosh_8` | 0.7s | chữ hero/mega vào, đổi cảnh, card trượt |
| `whoosh_fast` | 0.18s | jump cut nhanh, pill bật |
| `whoosh_slow` | 1.6s | light leak, chuyển mood chậm |
| `whoosh_deep` | 0.9s | iris tối mở ra, vào panel |
| `whoosh_reverse` | 0.7s | trước khi chữ lớn đập vào (đặt kết thúc đúng frame) |
| `swoosh_up` | 0.3s | chữ/thẻ bay lên, số tăng |
| `swoosh_down` | 0.3s | chữ rơi xuống, rời cảnh |
| `swoosh_up_2` | 0.5s | chữ/thẻ bay lên, số tăng |
| `swoosh_down_2` | 0.5s | chữ rơi xuống, rời cảnh |
| `transition_hit` | 1.1s | đổi cảnh lớn có đập |
| `transition_hit_2` | 2.05s | đổi cảnh lớn có boom |
| `transition_hit_3` | 1.6s | build up ngắn rồi đập |
| `transition_hit_4` | 0.38s | chuyển nhẹ vui |
| `whoosh_soft` | 0.5s | chuyển nhẹ dưới giọng nói |
| `whoosh_soft_2` | 0.4s | chữ trượt nhẹ |
| `whoosh_air` | 0.8s | thoáng, chuyển sáng |
| `whoosh_heavy` | 1.1s | khối lớn bay vào, b-roll full |
| `swoosh_out` | 0.45s | b-roll/thẻ rời khỏi khung |
| `swoosh_out_2` | 0.6s | rời cảnh chậm hơn |
| `whip` | 0.2s | whip pan, chuyển cực nhanh |
| `whip_2` | 0.15s | whip pan ngắn |
| `transition_soft` | 0.8s | chuyển clip nhẹ nhàng |
| `transition_glitch` | 0.4s | chuyển clip kiểu glitch |
| `transition_whip_hit` | 0.58s | whip pan đập mạnh |
| `transition_riser_hit` | 1.2s | dồn ngắn rồi đập (đập ở 0.6s) |

### Đập / boom (33)

| tên | dài | dùng khi |
|---|---|---|
| `impact` | 0.7s | stamp, chữ mega đập, 100%, kết luận |
| `impact_2` | 0.9s | stamp, chữ mega đập, 100%, kết luận |
| `impact_3` | 0.5s | stamp, chữ mega đập, 100%, kết luận |
| `impact_4` | 1.2s | stamp, chữ mega đập, 100%, kết luận |
| `impact_5` | 0.4s | stamp, chữ mega đập, 100%, kết luận |
| `impact_6` | 0.8s | stamp, chữ mega đập, 100%, kết luận |
| `boom` | 1.6s | slam_bg hook, mở màn, con số lớn |
| `boom_2` | 2.2s | slam_bg hook, mở màn, con số lớn |
| `boom_3` | 1.2s | slam_bg hook, mở màn, con số lớn |
| `boom_4` | 3.0s | slam_bg hook, mở màn, con số lớn |
| `sub_drop` | 1.5s | ngay sau riser, cảnh chuyển lớn |
| `sub_drop_2` | 2.5s | ngay sau riser, cảnh chuyển lớn |
| `sub_drop_3` | 1.0s | ngay sau riser, cảnh chuyển lớn |
| `cinematic_hit` | 2.5s | câu chốt, tiết lộ, title lớn |
| `cinematic_hit_2` | 2.5s | câu chốt, tiết lộ, title lớn |
| `cinematic_hit_3` | 2.5s | câu chốt, tiết lộ, title lớn |
| `braam` | 2.8s | tuyên bố lớn kiểu trailer |
| `braam_2` | 3.5s | tuyên bố lớn kiểu trailer |
| `hit_punch` | 0.45s | nhấn chữ/b-roll vào mạnh, gọn |
| `hit_punch_2` | 0.38s | nhấn chữ/b-roll vào mạnh, gọn |
| `hit_punch_3` | 0.55s | nhấn chữ/b-roll vào mạnh, gọn |
| `hit_metal` | 1.4s | đập kim loại, con số lớn |
| `hit_metal_2` | 1.4s | đập kim loại, con số lớn |
| `hit_deep` | 1.2s | cú đập trầm, tiết lộ |
| `hit_deep_2` | 1.8s | cú đập trầm, tiết lộ |
| `hit_snap` | 0.08s | cắt gọn, chữ bật |
| `hit_glass` | 1.2s | chữ sáng, đẹp, cao cấp |
| `hit_cinematic_short` | 1.4s | title lớn, không quá dài |
| `hit_trailer` | 1.8s | tuyên bố, chương mới |
| `intro_hit` | 2.4s | đầu video: hút ngược rồi đập (đập ở 0.8s) |
| `outro_hit` | 2.0s | thẻ kết, câu chốt cuối |
| `sub_drop_short` | 0.6s | rơi bass ngắn sau hook |
| `sub_boom_soft` | 1.0s | nhấn trầm nhẹ dưới giọng |

### Dồn / riser (24)

| tên | dài | dùng khi |
|---|---|---|
| `riser` | 0.5s | dồn trước khoảnh khắc lớn 0.5s (kết thúc đúng frame đập) |
| `riser_1s` | 1.0s | dồn trước khoảnh khắc lớn 1s (kết thúc đúng frame đập) |
| `riser_2s` | 2.0s | dồn trước khoảnh khắc lớn 2s (kết thúc đúng frame đập) |
| `riser_3s` | 3.0s | dồn trước khoảnh khắc lớn 3s (kết thúc đúng frame đập) |
| `riser_4s` | 4.0s | dồn trước khoảnh khắc lớn 4s (kết thúc đúng frame đập) |
| `downlifter` | 1.0s | sau cú đập, rời cảnh căng |
| `downlifter_2` | 1.6s | sau cú đập, rời cảnh căng |
| `downlifter_3` | 2.5s | sau cú đập, rời cảnh căng |
| `reverse_cymbal` | 0.8s | đặt sao cho kết thúc đúng lúc chữ xuất hiện |
| `reverse_cymbal_2` | 1.5s | đặt sao cho kết thúc đúng lúc chữ xuất hiện |
| `reverse_cymbal_3` | 2.5s | đặt sao cho kết thúc đúng lúc chữ xuất hiện |
| `riser_0_6s` | 0.6s | dồn trước khoảnh khắc lớn 0.6s |
| `riser_1_5s` | 1.5s | dồn trước khoảnh khắc lớn 1.5s |
| `riser_noise_0_6s` | 0.6s | riser nhiễu trắng 0.6s trước cú đập |
| `riser_noise_1s` | 1.0s | riser nhiễu trắng 1s trước cú đập |
| `riser_noise_2s` | 2.0s | riser nhiễu trắng 2s trước cú đập |
| `riser_tension_1s` | 1.0s | dồn căng kiểu trailer 1s |
| `riser_tension_2s` | 2.0s | dồn căng kiểu trailer 2s |
| `riser_tension_3s` | 3.0s | dồn căng kiểu trailer 3s |
| `riser_pitch_1s` | 1.0s | tông lên + rung nhanh dần 1s |
| `riser_pitch_2s` | 2.0s | tông lên + rung nhanh dần 2s |
| `reverse_cymbal_0_6s` | 0.6s | kết thúc đúng frame chữ lớn (0.6s) |
| `reverse_swell_1s` | 1.0s | hút vào mềm trước tiêu đề (1s) |
| `reverse_swell_2s` | 2.0s | hút vào dài trước tiêu đề (2s) |

### UI / bấm / đếm (58)

| tên | dài | dùng khi |
|---|---|---|
| `swipe` | 0.22s | vuốt màn hình điện thoại, lật thẻ |
| `swipe_2` | 0.16s | vuốt màn hình điện thoại, lật thẻ |
| `swipe_3` | 0.3s | vuốt màn hình điện thoại, lật thẻ |
| `swipe_4` | 0.2s | vuốt màn hình điện thoại, lật thẻ |
| `slide` | 0.35s | panel/thẻ trượt vào |
| `slide_2` | 0.55s | panel/thẻ trượt vào |
| `pop` | 0.12s | emoji/pill/tag/chip bật ra |
| `pop_2` | 0.12s | emoji/pill/tag/chip bật ra |
| `pop_3` | 0.12s | emoji/pill/tag/chip bật ra |
| `pop_4` | 0.12s | emoji/pill/tag/chip bật ra |
| `pop_5` | 0.12s | emoji/pill/tag/chip bật ra |
| `pop_6` | 0.12s | emoji/pill/tag/chip bật ra |
| `bubble` | 0.18s | sticker vui, chat bubble |
| `bubble_2` | 0.18s | sticker vui, chat bubble |
| `bubble_3` | 0.18s | sticker vui, chat bubble |
| `blip` | 0.07s | HUD/số nhảy/icon nhỏ |
| `blip_2` | 0.07s | HUD/số nhảy/icon nhỏ |
| `blip_3` | 0.07s | HUD/số nhảy/icon nhỏ |
| `blip_4` | 0.07s | HUD/số nhảy/icon nhỏ |
| `blip_5` | 0.07s | HUD/số nhảy/icon nhỏ |
| `tick` | 0.05s | counter mỗi bước, kim đồng hồ |
| `tick_2` | 0.05s | counter mỗi bước, kim đồng hồ |
| `tick_3` | 0.05s | counter mỗi bước, kim đồng hồ |
| `clock_ticking` | 4.0s | nói về thời gian, deadline (4s loop) |
| `clock_ticking_fast` | 3.0s | áp lực thời gian |
| `countdown_321` | 3.4s | đếm ngược 3-2-1 (beep cuối ở 3.0s) |
| `click` | 0.03s | bấm nút, chọn mục |
| `click_2` | 0.03s | bấm nút, chọn mục |
| `click_3` | 0.03s | bấm nút, chọn mục |
| `click_4` | 0.03s | bấm nút, chọn mục |
| `click_5` | 0.03s | bấm nút, chọn mục |
| `mouse_click` | 0.11s | bấm chuột trên UI showcase |
| `typing_1s` | 1.0s | prompt_box gõ chữ, search bar |
| `typing_2s` | 2.0s | prompt_box gõ chữ, search bar |
| `typing_4s` | 4.0s | prompt_box gõ chữ, search bar |
| `keyboard_enter` | 0.06s | gõ xong bấm Enter |
| `ui_click_soft` | 0.03s | bấm UI nhẹ nhàng, không gắt |
| `ui_click_soft_2` | 0.03s | bấm UI nhẹ nhàng, không gắt |
| `ui_tap` | 0.06s | chạm màn hình, chọn thẻ |
| `ui_tap_2` | 0.06s | chạm màn hình, chọn thẻ |
| `ui_toggle_on` | 0.4s | bật công tắc, chọn |
| `ui_toggle_off` | 0.4s | tắt công tắc, bỏ chọn |
| `ui_hover` | 0.07s | rê qua mục, highlight rất nhẹ |
| `ui_select` | 0.38s | chọn mục trong danh sách |
| `ui_confirm` | 0.64s | xác nhận, lưu xong |
| `ui_back` | 0.12s | quay lại, đóng |
| `ui_swipe_soft` | 0.25s | vuốt thẻ nhẹ |
| `ui_type_key` | 0.04s | một phím gõ |
| `pop_soft` | 0.12s | emoji/chữ nhỏ dưới giọng nói |
| `pop_soft_2` | 0.12s | chữ nhỏ bật nhẹ |
| `pop_bright` | 0.1s | tag/sticker bật rõ |
| `pop_bubble` | 0.13s | bong bóng chat, sticker |
| `pop_cork` | 0.15s | khui, ăn mừng |
| `typing_3s` | 3.0s | gõ prompt/tìm kiếm 3s |
| `typing_soft_2s` | 2.0s | gõ chữ dưới giọng nói |
| `keyboard_enter_2` | 0.07s | bấm Enter gửi |
| `typewriter_ding` | 0.95s | hết dòng máy đánh chữ |
| `typewriter_keys_2s` | 2.19s | chữ hiện từng ký tự kiểu máy chữ |

### Chuông / thông báo / tiền (38)

| tên | dài | dùng khi |
|---|---|---|
| `ding` | 1.2s | kết luận, đáp án, check ✅ |
| `ding_2` | 1.2s | kết luận, đáp án, check ✅ |
| `ding_3` | 1.2s | kết luận, đáp án, check ✅ |
| `ding_4` | 1.2s | kết luận, đáp án, check ✅ |
| `success` | 1.72s | hoàn tất, kết quả tốt |
| `success_2` | 1.5s | đạt mục tiêu |
| `success_3` | 1.2s | check mục cuối checklist |
| `level_up` | 0.79s | nâng cấp, mở khoá |
| `notification` | 0.92s | thông báo đẩy, tin nhắn mới, đơn hàng |
| `notification_2` | 1.03s | thông báo đẩy, tin nhắn mới, đơn hàng |
| `notification_3` | 0.92s | thông báo đẩy, tin nhắn mới, đơn hàng |
| `notification_4` | 0.92s | thông báo đẩy, tin nhắn mới, đơn hàng |
| `notification_5` | 0.92s | thông báo đẩy, tin nhắn mới, đơn hàng |
| `message_sent` | 0.18s | gửi tin nhắn, gửi prompt |
| `error` | 0.45s | sai lầm, ❌, cách cũ |
| `error_2` | 0.58s | sai lầm nhẹ |
| `wrong_buzzer` | 0.8s | câu trả lời sai kiểu gameshow |
| `correct` | 1.17s | đáp án đúng |
| `coin` | 0.44s | tiền, doanh thu, giá |
| `coin_2` | 0.6s | tiền rơi, nhận thưởng |
| `cash_register` | 1.4s | chốt đơn, doanh thu tăng |
| `money_count` | 1.14s | tiền, lương, thu nhập |
| `alarm` | 1.2s | cảnh báo, deadline |
| `phone_vibrate` | 1.3s | điện thoại rung, có cuộc gọi |
| `phone_ring` | 1.3s | cuộc gọi |
| `coin_drop` | 1.0s | đồng xu rơi nảy, tiết kiệm |
| `coin_multi` | 1.0s | nhận nhiều tiền, thưởng |
| `coins_pour` | 1.6s | tiền về ào ào (1.6s) |
| `cash_ching` | 1.2s | ra tiền, chốt đơn (ngắn) |
| `cash_ching_2` | 1.2s | giá, khuyến mãi |
| `money_bag` | 0.64s | đặt túi tiền, thu nhập lớn |
| `price_tag` | 0.54s | hiện giá tiền, con số |
| `purchase_success` | 1.36s | chốt đơn thành công |
| `notif_soft` | 0.5s | thông báo dưới giọng nói |
| `notif_pop` | 0.63s | thông báo bật lên trên điện thoại |
| `message_in` | 0.15s | tin nhắn mới trong chat |
| `message_in_2` | 0.56s | tin nhắn mới (biến thể) |
| `like_pop` | 0.53s | tim/like bật lên |

### Công nghệ / glitch / HUD (33)

| tên | dài | dùng khi |
|---|---|---|
| `glitch` | 0.3s | glitch cut, chữ RGB split, AI |
| `glitch_2` | 0.5s | glitch cut, chữ RGB split, AI |
| `glitch_3` | 0.2s | glitch cut, chữ RGB split, AI |
| `glitch_4` | 0.8s | glitch cut, chữ RGB split, AI |
| `glitch_5` | 0.4s | glitch cut, chữ RGB split, AI |
| `glitch_6` | 1.2s | glitch cut, chữ RGB split, AI |
| `static` | 1.0s | TV nhiễu, mất tín hiệu |
| `static_burst` | 0.15s | cắt glitch |
| `data_burst` | 0.9s | dashboard, số liệu chạy, AI xử lý |
| `data_burst_2` | 1.28s | dashboard, số liệu chạy, AI xử lý |
| `data_burst_3` | 1.88s | dashboard, số liệu chạy, AI xử lý |
| `scan` | 1.2s | HUD quét mặt, AI phân tích |
| `scan_2` | 0.6s | quét ngắn |
| `hud_lock` | 0.57s | HUD khoá mặt xong |
| `hud_lock_2` | 0.3s | khoá mục tiêu |
| `ui_open` | 0.2s | mở/đóng cửa sổ, panel |
| `ui_close` | 0.2s | mở/đóng cửa sổ, panel |
| `beep_computer` | 0.54s | AI/robot trả lời |
| `beep_computer_2` | 0.62s | AI/robot trả lời |
| `beep_computer_3` | 0.7s | AI/robot trả lời |
| `beep_computer_4` | 0.78s | AI/robot trả lời |
| `power_up` | 1.0s | bật lên, kích hoạt AI |
| `power_down` | 1.0s | tắt, thất bại, hết pin |
| `laser` | 0.25s | tia sáng, chữ bắn ra |
| `teleport` | 0.8s | đối tượng xuất hiện thần kỳ |
| `hologram` | 1.5s | UI nổi, hologram |
| `drone_tech` | 3.0s | nền căng dưới cảnh tech (3s) |
| `glitch_digital` | 0.35s | glitch ngắn số hoá |
| `glitch_digital_2` | 0.6s | glitch dài hơn |
| `glitch_short` | 0.12s | nháy glitch 1 frame |
| `glitch_stutter` | 0.49s | chữ/hình giật lặp |
| `glitch_bitcrush` | 0.5s | lỗi số, AI hỏng |
| `glitch_tape` | 0.5s | tua nhầm, khựng lại |

### Lấp lánh / phép màu (15)

| tên | dài | dùng khi |
|---|---|---|
| `sparkle` | 1.0s | ✨ xuất hiện, highlight, đẹp |
| `sparkle_2` | 1.3s | ✨ xuất hiện, highlight, đẹp |
| `sparkle_3` | 1.6s | ✨ xuất hiện, highlight, đẹp |
| `sparkle_4` | 1.9s | ✨ xuất hiện, highlight, đẹp |
| `shimmer` | 1.6s | light leak, mood happy, end card |
| `shimmer_2` | 1.6s | light leak, mood happy, end card |
| `shimmer_3` | 1.6s | light leak, mood happy, end card |
| `magic` | 1.5s | biến hoá, trước→sau, AI làm phép |
| `magic_2` | 1.5s | biến hoá, trước→sau, AI làm phép |
| `magic_3` | 1.5s | biến hoá, trước→sau, AI làm phép |
| `fairy_dust` | 2.0s | mood mellow, chuyển nhẹ |
| `sparkle_soft` | 0.8s | emoji/sticker xuất hiện dưới giọng |
| `twinkle` | 0.54s | đẹp, mới, sạch |
| `chime_soft` | 1.2s | ý hay, mẹo |
| `magic_rise` | 1.3s | biến hoá, trước → sau |

### Foley (đời thực) (22)

| tên | dài | dùng khi |
|---|---|---|
| `camera_shutter` | 0.35s | ảnh chụp màn hình xuất hiện, flash |
| `camera_shutter_2` | 0.84s | nhiều ảnh xuất hiện |
| `flash_pop` | 0.6s | flash trắng |
| `paper` | 0.4s | lật trang, tài liệu |
| `paper_2` | 0.7s | bỏ đi, gạch bỏ |
| `stamp` | 0.35s | stamp ĐÃ DUYỆT/100% |
| `stamp_2` | 0.35s | stamp ĐÃ DUYỆT/100% |
| `pen_scribble` | 0.6s | gạch bỏ chữ, viết tay |
| `zipper` | 0.5s | mở ra, tiết lộ |
| `heartbeat` | 1.05s | hồi hộp, căng thẳng (2 nhịp) |
| `heartbeat_loop` | 4.26s | nền hồi hộp 4s |
| `door_knock` | 0.78s | có người đến, cơ hội |
| `footsteps` | 2.7s | bước tiếp, hành trình |
| `water_drop` | 0.12s | nhẹ nhàng, tinh tế |
| `rubber_band` | 0.6s | hài hước, bật lại |
| `cartoon_slip` | 0.4s | fail hài hước |
| `balloon_pop` | 0.12s | phá vỡ niềm tin sai |
| `crowd_cheer` | 2.5s | thành tựu, ăn mừng (tổng hợp) |
| `applause` | 2.6s | kết thúc, chúc mừng |
| `heartbeat_single` | 0.74s | khựng lại một nhịp |
| `heartbeat_slow` | 2.46s | chờ đợi, căng thẳng (chậm) |
| `heartbeat_fast` | 2.3s | lo sợ, gấp gáp |

### Trống / stinger nhịp (11)

| tên | dài | dùng khi |
|---|---|---|
| `kick` | 0.5s | nhấn nhịp từ khoá |
| `kick_2` | 0.7s | nhấn nhịp |
| `snare` | 0.3s | nhấn chữ |
| `clap` | 0.3s | pop hero vui |
| `clap_2` | 0.3s | pop hero vui |
| `drum_roll` | 3.2s | chuẩn bị công bố (2s) |
| `tom_hits` | 0.84s | epic, tuyên bố |
| `cymbal_crash` | 2.0s | mở đầu đoạn mới |
| `tape_stop` | 0.8s | khựng lại, 'nhưng mà…' |
| `record_scratch` | 0.5s | phủ định bất ngờ, 'khoan đã' |
| `vinyl_rewind` | 1.2s | quay về quá khứ, 'trước đây' |

### Stinger nhạc ngắn (6)

| tên | dài | dùng khi |
|---|---|---|
| `stinger_happy` | 1.6s | kết câu vui |
| `stinger_sad` | 1.6s | câu buồn, thất bại |
| `stinger_epic` | 1.6s | tuyên bố lớn |
| `stinger_mystery` | 1.6s | bí mật, hé lộ |
| `stinger_win` | 1.6s | chiến thắng |
| `stinger_tension` | 1.6s | căng thẳng, rủi ro |

### Nền / không khí (7)

| tên | dài | dùng khi |
|---|---|---|
| `tension_drone` | 4.0s | nền căng dưới con số đau (4s) |
| `tension_drone_2` | 6.0s | nền căng (6s) |
| `wind` | 4.0s | cô đơn, trống rỗng (4s) |
| `vinyl_crackle` | 5.0s | mood mellow/hoài niệm (5s loop) |
| `rain` | 5.0s | mood sad (5s) |
| `office_room` | 5.0s | cảnh làm việc (5s) |
| `crowd_murmur` | 4.0s | sự kiện, đông người (4s) |

### Nền loop dài (v4) (12)

| tên | dài | dùng khi |
|---|---|---|
| `bed_rain_light` | 12.0s | mưa nhẹ: buồn, hoài niệm, thư giãn (12s, loop liền) |
| `bed_rain_heavy` | 12.0s | mưa to: kịch tính, khó khăn (12s, loop liền) |
| `bed_room_tone` | 10.0s | room tone: lấp khoảng lặng giữa các câu (10s, loop liền) |
| `bed_city` | 14.0s | thành phố, giao thông: đô thị, BĐS (14s, loop liền) |
| `bed_cafe` | 14.0s | quán cà phê: trò chuyện, chia sẻ, review đồ uống (14s, loop liền) |
| `bed_office` | 12.0s | văn phòng: làm việc, công sở (12s, loop liền) |
| `bed_night` | 14.0s | đêm, dế kêu: yên tĩnh, kể chuyện (14s, loop liền) |
| `bed_ocean` | 16.0s | sóng biển: du lịch, thư giãn, nghỉ dưỡng (16s, loop liền) |
| `bed_wind_soft` | 12.0s | gió nhẹ: trống trải, suy tư (12s, loop liền) |
| `bed_fire` | 12.0s | lửa bập bùng: ấm cúng, kể chuyện (12s, loop liền) |
| `bed_forest` | 14.0s | rừng, chim hót: thiên nhiên, sức khoẻ (14s, loop liền) |
| `bed_tech_hum` | 10.0s | máy chủ rì rì + bíp: công nghệ, AI (10s, loop liền) |

### Hoạt hình (v4) (9)

| tên | dài | dùng khi |
|---|---|---|
| `boing` | 0.7s | hài hước, nảy lên, bất ngờ vui |
| `boing_2` | 0.55s | hài hước, nảy lên, bất ngờ vui |
| `boing_3` | 0.9s | hài hước, nảy lên, bất ngờ vui |
| `cartoon_pop` | 0.16s | emoji/sticker bật vui nhộn |
| `slide_whistle_up` | 0.6s | tăng vọt vui nhộn |
| `slide_whistle_down` | 0.6s | tụt dốc, thất bại hài |
| `cartoon_spring` | 0.6s | bật lò xo, nhảy ra |
| `cartoon_bonk` | 0.18s | gõ đầu, nhận ra sai |
| `cartoon_zip` | 0.2s | biến mất nhanh, chạy đi |

### Swell / pad (v4) (5)

| tên | dài | dùng khi |
|---|---|---|
| `swell_soft` | 2.0s | dâng nhẹ cảm xúc, chuyển đoạn êm |
| `swell_bright` | 2.0s | giải pháp, kết quả tốt |
| `swell_dark` | 2.2s | vấn đề, rủi ro |
| `swell_pad_2s` | 2.0s | nền chuyển đoạn 2s |
| `swell_pad_3s` | 3.0s | nền chuyển đoạn 3s |

### Đám đông tổng hợp (v4) (4)

| tên | dài | dùng khi |
|---|---|---|
| `applause_small` | 2.0s | vài người vỗ tay, cảm ơn |
| `applause_big` | 3.0s | thành tựu lớn, kết thúc ấn tượng |
| `cheer_short` | 1.6s | ăn mừng ngắn |
| `crowd_ooh` | 1.4s | khán giả 'ồ' ngạc nhiên |

## Luật tự đặt SFX (`auto_sfx.py`)

| Module / sự kiện | SFX | gain |
|---|---|---|
| hero (kinetic.hero_t) | whoosh (xoay vòng 5 biến thể) | -13 |
| label_words từng từ | whoosh_fast | -24 |
| sub / emoji / pill / tag / sticker | pop (xoay vòng) | -16…-20 |
| mega | impact (+ whoosh_reverse nếu `behind`) | -10 |
| counter | tick mỗi 0.12 s → ding (pct) / impact (clock) | -24 / -14 |
| stamp | stamp | -9 |
| slam_bg / flash_ring | boom / flash_pop | -11 / -12 |
| light_leak / iris | whoosh_slow + shimmer / whoosh_deep | -16 / -14 |
| ui_showcase | camera_shutter | -16 |
| checklist_panel | ui_open, click mỗi mục, success_3 cuối | -14…-18 |
| prompt_box | typing_Ns + keyboard_enter + success | -18 / -14 |
| orbit | whoosh_3 + sparkle | -14 / -16 |
| mood sad / happy / mellow | downlifter / stinger_happy / fairy_dust | -14 |
| mosaic / mosaic_wall | whoosh + swipe / whoosh_2 + impact | -13…-22 |
| step_cards | swoosh_up mỗi thẻ + ding | -16 / -14 |
| end_card | cinematic_hit + shimmer | -10 |
| broll (theo template) | chart→data_burst+ding · notifications→notification · chat→message_sent/pop · money_rain→cash_register · countdown→countdown_321 · clock→clock_ticking · typewriter/search→typing · glitch/matrix/code→glitch · rocket→riser_2s · versus→transition_hit · emoji_burst→impact_5+sparkle | -14…-20 |
| fx shake / punch / whip / glitch / flash / blur_in / zoom_in | impact_3 / kick / whoosh_fast / glitch / flash_pop / whoosh_2 / whoosh_reverse | -14 |

Mọi hit đặt sớm 1 frame; cùng họ âm cách nhau < 0.12 s bị gộp. `--density 0.6` bớt pop/tick cho video nhẹ nhàng.
