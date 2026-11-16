"""Bốn chế độ thêm: review người thật, cắt video dài, kể chuyện bằng ảnh, trích dẫn."""
import pytest
from fastapi.testclient import TestClient

from avf import main, modes, news
from avf.errors import AppError

client = TestClient(main.app)
API = main.API


def seg(a, b, text):
    return {"start_ms": int(a * 1000), "end_ms": int(b * 1000), "text": text}


def test_silence_is_cut_and_subtitles_follow_the_new_timeline():
    segs = [seg(1.0, 3.0, "Xin chào các bạn"), seg(3.2, 5.0, "hôm nay mình chia sẻ"), seg(9.0, 11.0, "một kinh nghiệm bán hàng")]
    r = modes.keep_ranges(segs, 0, 12)
    assert len(r) == 2 and r[0][0] == pytest.approx(0.88) and r[0][1] == pytest.approx(5.12)       # ngừng 0,2 giây thì giữ liền, 4 giây thì cắt
    assert modes.keep_ranges(segs, 0, 12, cut=False) == [(0, 12)]
    assert modes.remap(9.0, r) == pytest.approx(5.12 - 0.88 + 0.12)                                   # câu thứ ba dời lên ngay sau câu thứ hai
    chunks = modes.sub_chunks(segs, r)
    assert [c["text"] for c in chunks][:2] == ["Xin chào các bạn", "hôm nay mình chia sẻ"]
    assert all(c["t1"] > c["t0"] and len(c["text"]) <= 22 for c in chunks)
    assert chunks[-1]["t1"] <= sum(b - a for a, b in r) + 0.01 and all(x["t0"] >= y["t0"] for x, y in zip(chunks[1:], chunks))


def test_word_fixes_apply_to_misheard_names():
    it = {"sub_fixes": "Hoá => Hoà\nmáy game=>máy ghi âm\ndòng sai định dạng"}
    out = modes.fixed([seg(0, 2, "Thầy hoá dùng Máy Game AI")], it)
    assert out[0]["text"] == "Thầy Hoà dùng máy ghi âm AI"
    assert modes.fixed([seg(0, 1, "abc")], {"sub_fixes": ""})[0]["text"] == "abc"


def test_long_video_is_split_at_sentence_ends_and_ranked(monkeypatch):
    segs, t = [], 0.0
    for i in range(60):                                   # 60 câu, mỗi câu 5 giây, 6 chữ
        segs.append(seg(t, t + 5, f"Đây là câu số {i} trong bài." if i % 4 else f"Bạn có biết điều số {i} không?"))
        t += 5
    cands = modes.candidates(segs, 45)
    assert cands and all(27 <= c["t1"] - c["t0"] <= 65 for c in cands)
    assert all(a["t1"] <= b["t0"] for a, b in zip(cands, cands[1:]))                                  # các đoạn không chồng nhau
    monkeypatch.setattr(modes.ai, "llm_available", lambda: False)
    picks = modes.pick_clips(cands, 3)
    assert len(picks) == 3 and picks == sorted(picks, key=lambda c: c["t0"]) and all(p["title"] for p in picks)
    monkeypatch.setattr(modes.ai, "llm_available", lambda: True)
    monkeypatch.setattr(modes.ai, "generate_json", lambda s, p, validate, **kw: validate(
        {"clips": [{"id": cands[0]["id"], "title": "Bài học đáng nhớ trong 99 ngày"}, {"id": cands[1]["id"], "title": "Một điều đáng biết"}]}))
    # tiêu đề có con số không nằm trong đoạn thì bị loại; AI chọn không đủ thì lùi về cách chọn theo điểm
    assert all("99" not in p["title"] for p in modes.pick_clips(cands, 2))


def test_each_mode_asks_for_its_own_ingredients():
    talk = {"type": "video", "has_audio": True}
    base = {"media": [], "body": "", "hook": "", "headline": ""}
    for kind in ("review", "clips"):
        with pytest.raises(AppError):
            modes.ready({**base, "kind": kind, "media": [{"type": "image"}]})          # chỉ có ảnh thì chưa đủ
        modes.ready({**base, "kind": kind, "media": [talk]})
    with pytest.raises(AppError):
        modes.ready({**base, "kind": "quote"})
    modes.ready({**base, "kind": "quote", "body": "Một câu trích dẫn"})                 # trích dẫn không cần hình
    with pytest.raises(AppError):
        modes.ready({**base, "kind": "story", "body": "Câu một."})                      # kể chuyện cần hình
    modes.ready({**base, "kind": "story", "body": "Câu một.", "media": [{"type": "image"}]})
    assert modes.needs_script({**base, "kind": "clips"}) is False and modes.needs_script({**base, "kind": "review"}) is True
    assert modes.needs_script({**base, "kind": "review", "headline": "Có rồi"}) is False


def test_review_inserts_product_shots_between_speech():
    plan = modes.insert_plan([{"path": "/a.jpg"}, {"path": "/b.jpg"}], 30)
    assert [p["t0"] for p in plan] == [4.0, 11.0, 18.0, 25.0] and [p["path"][-5] for p in plan] == ["a", "b", "a", "b"]
    assert modes.insert_plan([], 30) == [] and modes.insert_plan([{"path": "/a.jpg"}], 6) == []


def test_mode_items_are_created_cleaned_and_rendered_text_fits(tmp_path):
    it = client.post(f"{API}/news", json={"kind": "quote", "clip_count": 99, "clip_len": 50, "speak": "có", "subs": False,
                                          "body": "Dòng một\nDòng hai\n\nDòng ba"}).json()
    assert it["kind"] == "quote" and it["clip_count"] == 10 and it["clip_len"] == 45 and it["speak"] is False and it["subs"] is False
    assert client.post(f"{API}/news", json={"kind": "khong-co"}).json()["kind"] == "news"
    assert modes.quote_lines(it) == ["Dòng một", "Dòng hai", "Dòng ba"]
    assert client.post(f"{API}/news/{it['id']}/render").status_code == 200              # trích dẫn dựng được dù không có hình
    clip = client.post(f"{API}/news", json={"kind": "clips"}).json()
    assert client.post(f"{API}/news/{clip['id']}/variants").status_code == 422          # chưa có video để cắt
    assert client.post(f"{API}/news/{clip['id']}/write").status_code == 422             # chế độ này không cần viết lời
    look = {"theme": "navy", "channel": "Kênh thử", "headline": "Bài học"}
    modes.quote_png(look, ["Một câu trích dẫn khá dài để thử việc tự xuống dòng trong vùng chữ ở giữa màn hình"], 0, tmp_path / "q.png")
    modes.scene_png(look, "Một câu kể chuyện", tmp_path / "s.png")
    modes.sub_png("một cụm phụ đề rất dài để thử thu nhỏ chữ", tmp_path / "sub.png")
    modes.title_png(look, "Tiêu đề clip", tmp_path / "t.png")
    assert all((tmp_path / n).stat().st_size > 1000 for n in ("q.png", "s.png", "sub.png", "t.png"))
