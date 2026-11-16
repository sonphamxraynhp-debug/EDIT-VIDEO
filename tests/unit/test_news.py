"""Chế độ Tin tức: chia thời lượng, vùng chữ, API soạn tin."""
from fastapi.testclient import TestClient

from avf import main, news

client = TestClient(main.app)
API = main.API
VIDEO = {"id": "v1", "type": "video", "has_audio": True, "duration_ms": 60000, "path": "/x/a.mp4"}
IMAGE = {"id": "i1", "type": "image", "has_audio": False, "duration_ms": 0, "path": "/x/b.jpg"}


def test_plan_opens_with_panel_then_raw_sound_then_body():
    p = news.plan({"media": [VIDEO, IMAGE], "raw_gap_s": 8}, hook_s=10.0, body_s=20.0)
    assert [s["layout"] for s in p["segs"]] == ["A", "B", "B"]
    assert p["gap"] == 8 and abs(p["total"] - (10.5 + 8 + 20.8)) < 0.01
    assert p["segs"][1]["start"] == p["t_a"]                       # thân bài nối tiếp đúng chỗ phần mở dừng
    assert abs(sum(s["dur"] for s in p["segs"]) - p["total"]) < 0.01


def test_plan_skips_raw_sound_for_images_and_short_clips():
    assert news.plan({"media": [IMAGE], "raw_gap_s": 8}, 6.0, 12.0)["gap"] == 0
    short = {**VIDEO, "duration_ms": 9000}
    assert news.plan({"media": [short], "raw_gap_s": 8}, 6.0, 12.0)["gap"] == 0


def test_plan_never_shows_a_shot_for_under_three_seconds():
    p = news.plan({"media": [VIDEO] + [dict(IMAGE, id=f"i{k}") for k in range(8)], "raw_gap_s": 0}, 5.0, 10.0)
    assert all(s["dur"] >= 3.4 for s in p["segs"][1:])


def test_headline_panel_fits_or_reports_overflow(tmp_path):
    item = {"theme": "red", "category": "Đời sống", "date_label": "11/11/2026", "credit": "Video: A",
            "headline": "Người mẹ ngồi khóc bên tấm ảnh cưới của con gái và con rể, ảnh còn chưa kịp treo lên"}
    info = news.overlay_a(item, tmp_path / "a.png")
    assert info["overflow"] is False and (tmp_path / "a.png").stat().st_size > 1000
    assert news.overlay_a({**item, "headline": "rất dài " * 200}, tmp_path / "b.png")["overflow"] is True


def test_news_api_create_edit_and_guards():
    it = client.post(f"{API}/news", json={"theme": "khong-co", "category": "Kinh doanh"}).json()
    assert it["theme"] == "green" and it["category"] == "Kinh doanh" and it["status"] == "draft"
    nid = it["id"]
    assert client.post(f"{API}/news/{nid}/render").status_code == 422           # chưa có hình
    assert client.post(f"{API}/news/{nid}/write").status_code == 422            # chưa có nội dung
    r = client.put(f"{API}/news/{nid}", json={"headline": "Tiêu đề thử", "status": "done", "music": "/etc/passwd"}).json()
    assert r["headline"] == "Tiêu đề thử" and r["status"] == "draft" and r["music"] is None
    assert client.get(f"{API}/news/zzzzzzzzzzzz").status_code == 404
    assert client.delete(f"{API}/news/{nid}").json()["ok"] is True


def test_news_write_without_llm_uses_source_sentences(monkeypatch):
    monkeypatch.setattr(news.ai, "llm_available", lambda: False)
    nid = client.post(f"{API}/news", json={"source_text": "Câu mở đầu thứ nhất. Câu mở đầu thứ hai. Diễn biến một. Diễn biến hai. Câu kết."}).json()["id"]
    r = client.post(f"{API}/news/{nid}/write").json()
    assert r["hook"] == "Câu mở đầu thứ nhất. Câu mở đầu thứ hai." and r["body"].split("\n") == ["Diễn biến một.", "Diễn biến hai.", "Câu kết."]
    client.delete(f"{API}/news/{nid}")


def test_new_item_is_ai_voice_only_by_default():
    it = client.post(f"{API}/news", json={}).json()
    assert it["raw_gap_s"] == 0                                   # tin tức: mặc định 100% giọng AI, không phát tiếng gốc
    assert news.plan({"media": [VIDEO], "raw_gap_s": it["raw_gap_s"]}, 8.0, 15.0)["gap"] == 0
    client.delete(f"{API}/news/{it['id']}")


def _lib(*moods):
    return [{"path": f"/m/{m}{i}.mp3", "name": f"{m}{i}", "file": f"{m}__{i}.mp3", "mood": m} for m in moods for i in range(3)]


def test_auto_music_follows_mood_and_differs_per_variant(monkeypatch):
    monkeypatch.setattr(news.scale, "music_library", lambda: _lib("news", "dramatic", "emotional"))
    it = {"id": "abc123abc123", "music": "auto", "headline": "Cháy lớn tại kho hàng", "hook": "", "body": "", "source_text": ""}
    assert news.mood_of(it) == "dramatic"                                     # không có AI: đoán theo từ khoá
    assert news.mood_of({**it, "mood_ai": "emotional"}) == "emotional"        # AI đoán lúc viết lời thắng từ khoá
    assert news.mood_of({**it, "mood_ai": "emotional", "music_mood": "news"}) == "news"   # người dùng chọn thắng tất cả
    picks = [news.pick_music({**it, "variant_k": k})["path"] for k in range(3)]
    assert len(set(picks)) == 3 and all("/dramatic" in p for p in picks)      # mỗi biến thể một bài, đúng tâm trạng
    assert news.pick_music(it) == news.pick_music(dict(it))                   # dựng lại cùng tin thì vẫn bài đó
    assert news.pick_music({**it, "music_mood": "funny"})["mood"] == "news"   # nhóm trống thì lùi về nhạc tin tức
    assert news.pick_music({**it, "music": None}) is None
    monkeypatch.setattr(news.scale, "music_library", lambda: [])
    assert news.pick_music(it) is None                                        # chưa tải nhạc: không có nhạc, không lỗi


def test_variant_specs_keep_first_and_rotate_the_rest():
    it = {"headline": "Tiêu đề gốc", "hook": "Mở đầu gốc.", "body": "Thân bài gốc.", "theme": "red", "style": "panel", "media": [VIDEO, IMAGE],
          "voice": {"mode": "preset", "name": "Mai Anh"}}
    alts = [{"headline": "Tiêu đề hai", "hook": "Mở hai.", "body": "Thân bài viết lại."}]
    v = news.variant_specs(it, 4, alts, ["Mai Anh", "Hải Đăng"])
    assert len(v) == 4
    assert (v[0]["headline"], v[0]["theme"], v[0]["style"], v[0]["media"][0]["id"]) == ("Tiêu đề gốc", "red", "panel", "v1")
    assert v[1]["headline"] == "Tiêu đề hai" and v[1]["style"] == "overlay" and v[1]["media"][0]["id"] == "i1"
    assert v[1]["body"] == "Thân bài viết lại." and v[2]["body"] == "Thân bài gốc."        # thân bài cũng được viết lại
    assert v[0]["rate"] == 1.0 and not v[0].get("seed") and v[1]["rate"] != 1.0 and v[1]["seed"] == 1   # bản 1 giữ nguyên nhịp và thứ tự hình
    assert news.variant_specs(it, 3, [], [], order={"theme": ["black"], "style": []})[1]["theme"] == "black"   # công thức thắng lên trước
    assert v[2]["headline"] == "Tiêu đề gốc"                                  # hết tiêu đề AI viết thì dùng lại tiêu đề gốc
    assert len({(x["theme"], x["style"], x["media"][0]["id"]) for x in v}) == 4
    assert all(x["voice"]["name"] == "Mai Anh" for x in v)                    # giọng giữ nguyên nếu người dùng không bật đổi giọng
    assert [x["voice"]["name"] for x in news.variant_specs(it, 2, [], ["Mai Anh", "Hải Đăng"], vary_voice=True)] == ["Mai Anh", "Hải Đăng"]
    assert len(news.variant_specs(it, 99, [], [])) == news.MAX_VARIANTS


def test_overlay_style_and_new_item_defaults(tmp_path):
    it = client.post(f"{API}/news", json={"style": "la"}).json()
    assert it["music"] == "auto" and it["style"] == "panel" and it["variants"] == []      # tin mới: nhạc tự động
    r = client.put(f"{API}/news/{it['id']}", json={"style": "overlay", "music_mood": "khong-co", "music": "auto"}).json()
    assert r["style"] == "overlay" and r["music_mood"] is None and r["music"] == "auto"
    assert client.post(f"{API}/news/{it['id']}/variants", json={"count": 3}).status_code == 422   # chưa có hình
    assert client.get(f"{API}/news/{it['id']}").json()["auto_mood"] == "news"
    client.delete(f"{API}/news/{it['id']}")
    base = {"theme": "navy", "style": "overlay", "category": "Tin", "date_label": "01/01/2026", "credit": "", "headline": "Tiêu đề thử kiểu chữ trên hình"}
    info = news.overlay_a(base, tmp_path / "o.png")
    from PIL import Image
    im = Image.open(tmp_path / "o.png")
    assert not info["overflow"] and im.getpixel((540, 600))[3] == 0 and im.getpixel((540, 1900))[3] > 200   # trên trong suốt, dưới tối


def test_sale_video_ends_with_closing_card_and_seeded_variants_differ(tmp_path):
    ms = [VIDEO, IMAGE, {**VIDEO, "id": "v2"}, {**IMAGE, "id": "i2"}]
    base = {"media": ms, "raw_gap_s": 0}
    p = news.plan(base, 6.0, 20.0, cta_s=3.0)
    assert p["segs"][-1]["layout"] == "C" and p["t_c"] == 4.0 and abs(p["total"] - sum(s["dur"] for s in p["segs"])) < 0.01
    assert news.plan(base, 6.0, 20.0)["t_c"] == 0 and news.plan(base, 6.0, 20.0)["segs"][-1]["layout"] == "B"
    a, b = news.plan({**base, "seed": 1}, 6.0, 20.0), news.plan({**base, "seed": 2}, 6.0, 20.0)
    shape = lambda p: [(s["media"]["id"], round(s["dur"], 2)) for s in p["segs"]]
    assert shape(a) != shape(b) and shape(a) == shape(news.plan({**base, "seed": 1}, 6.0, 20.0))     # khác nhau giữa các bản, ổn định trong một bản
    assert all(s["dur"] >= 2.8 for s in a["segs"]) and abs(a["total"] - b["total"]) < 0.01
    it = {"theme": "orange", "channel": "Kênh thử", "platform": "shopee", "cta_text": "", "price": "199.000đ", "offer": "Miễn phí vận chuyển"}
    assert "bên dưới video" in news.cta_line(it) and news.cta_line({**it, "cta_text": "Xem ngay"}) == "Xem ngay"
    news.overlay_c(it, tmp_path / "c.png")
    assert (tmp_path / "c.png").stat().st_size > 5000
    assert news._hashtags("#bình giữ nhiệt #inox 304 #Bình Giữ Nhiệt") == "#binhgiunhiet #inox304"     # thẻ nhiều từ được viết liền, bỏ trùng
    cap = news.caption_text({"caption": "Mô tả", "hashtags": "meovat, giadung, meovat", "link": "https://x.vn/a"})
    assert cap == "Mô tả\n\n#meovat #giadung\n\nhttps://x.vn/a"


def test_results_group_by_formula_and_feed_next_batch(monkeypatch):
    def vid(theme, views, orders):
        return {"formula": {"theme": theme, "style": "panel"}, "stats": {"views": views, "orders": orders}}
    monkeypatch.setattr(news, "videos", lambda: [vid("red", 1000, 5)] * 3 + [vid("navy", 1000, 1)] * 3 + [vid("black", 100, 9)]
                        + [{"formula": {"theme": "green"}, "stats": {}}])
    r = news.results()
    assert r["with_stats"] == 7 and [g["value"] for g in r["dims"]["theme"]][:2] == ["black", "red"]
    assert r["dims"]["theme"][1]["orders_per_1000"] == 5.0 and r["dims"]["theme"][1]["avg_views"] == 1000
    assert news.winner_order()["theme"] == ["red", "navy"]           # "black" mới có 1 video nên chưa đủ dữ liệu để ưu tiên


def test_numbers_not_in_source_are_flagged():
    src = "Bình inox dung tích 500 ml, giá 199.000đ, có ba màu."
    assert news.new_numbers("Bình 500ml giá 199.000 đồng với 3 màu", src) == []
    assert news.new_numbers("Giữ nhiệt suốt 12 giờ, bảo hành 24 tháng", src) == ["12", "24"]       # AI tự thêm số liệu


def test_variants_follow_the_edited_script_not_the_raw_source(monkeypatch):
    """Người dùng sửa tay lời (tên riêng, từ sai do bóc băng) thì tiêu đề các biến thể phải sinh từ lời đã sửa."""
    it = {"id": "abc123abc123", "kind": "news", "headline": "Thầy Hoà mang gì khi đi dạy", "hook": "Thầy Hoà kể về máy ghi âm AI.",
          "body": "Máy ghi âm AI ghi lại cả buổi dạy.", "source_text": "Thầy Hoá ơi... máy game AI", "price": "", "offer": ""}
    seen = {}
    monkeypatch.setattr(news.ai, "llm_available", lambda: True)

    def fake(system, prompt, validate, **kw):
        seen["prompt"] = prompt
        return validate({"variants": [{"headline": "Máy ghi âm AI theo Thầy Hoà lên lớp", "hook": "Thầy Hoà luôn mang máy ghi âm AI."}]})
    monkeypatch.setattr(news.ai, "generate_json", fake)
    alts = news.alt_headlines(it, 1)
    assert alts[0]["headline"].startswith("Máy ghi âm AI")
    assert "Thầy Hoá" not in seen["prompt"] and "máy game" not in seen["prompt"]        # lời bóc băng chưa sửa không được đưa cho AI
    assert "Thầy Hoà kể về máy ghi âm AI." in seen["prompt"] and "Máy ghi âm AI ghi lại cả buổi dạy." in seen["prompt"]


def test_editing_the_script_marks_old_videos_as_stale():
    it = client.post(f"{API}/news", json={"headline": "Tiêu đề một", "body": "Câu thân bài."}).json()
    nid = it["id"]
    h = news.script_hash(news.load(nid))
    news._patch(nid, output={"path": "/x.mp4", "script_hash": h}, variants=[{"k": 0, "base_hash": h}])
    r = client.get(f"{API}/news/{nid}").json()
    assert r["output_stale"] is False and r["variants_stale"] is False
    client.put(f"{API}/news/{nid}", json={"theme": "red"})                                 # đổi màu không làm lời cũ đi
    assert client.get(f"{API}/news/{nid}").json()["output_stale"] is False
    client.put(f"{API}/news/{nid}", json={"body": "Câu thân bài đã sửa tay."})
    r = client.get(f"{API}/news/{nid}").json()
    assert r["output_stale"] is True and r["variants_stale"] is True                      # sửa lời: video và biến thể cũ bị đánh dấu
    client.delete(f"{API}/news/{nid}")


def test_rewrite_that_translates_terms_is_rejected():
    src = "Máy ghi âm AI giúp ghi chú buổi dạy. Học viên nhận file slide, word và checklist từ máy game AI."
    assert news.foreign_words("AI recorder ghi lại buổi giảng, AI game machine gửi slide", src) == ["recorder", "machine"]
    assert news.foreign_words("Thiết bị ghi âm AI giúp tổng hợp trong khi thầy giảng cho học viên, theo checklist", src) == []
