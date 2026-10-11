# Ads AI v1.1

Skill viết prompt video quảng cáo AI nhiều phân cảnh cho Flow/Veo.

Điểm nâng cấp chính:
- Continuity giữa các scene.
- Không thừa ~1 giây đầu/cuối.
- Không reset về pose ảnh tham chiếu.
- Edit/sound/text nằm trong video đầu ra.
- Tự co giãn theo số phân cảnh người dùng yêu cầu.
- Prompt từng scene độc lập, copy-paste trực tiếp.

File chính: `SKILL.md`


## v1.1 — Zero-Wait Speech Continuity
- Voice bắt đầu trong ~0.05–0.20s đầu scene.
- Opening transition và thoại chạy song song.
- Ending transition bắt đầu trong khi câu cuối vẫn đang nói.
- Âm tiết cuối bám sát cut/handoff.
- Không còn 0.5–1.5s hình/nhạc chờ trước hoặc sau thoại.
- Thêm Speech Occupancy Lock và QC checks cho voice start/end.
