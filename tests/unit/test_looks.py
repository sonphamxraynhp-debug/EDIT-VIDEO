"""Phong cách edit, kiểu phụ đề chạy chữ và thư viện font."""
import subprocess
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import ImageFont

from avf import config, looks, main, render

client = TestClient(main.app)
API = main.API


def test_every_bundled_font_exists_has_vietnamese_and_a_licence():
    for fid, f in looks.FONTS.items():
        p = looks.FONT_DIR / f["file"]
        assert p.is_file(), fid
        ft = looks.font(fid, 40)
        blank = bytes(ft.getmask("￿"))
        assert all(ft.getmask(c).size[0] and bytes(ft.getmask(c)) != blank for c in "ữờẩỡặƯỞđĐ"), fid
    assert len(list((looks.FONT_DIR / "licenses").glob("*-OFL.txt"))) >= 16
    a, b = looks.font("montserrat", 60), looks.font("montserrat_bold", 60)      # cùng file, khác độ đậm
    assert a.getlength("ĐẬM") > b.getlength("ĐẬM")


def test_every_style_points_to_real_parts():
    for e in looks.EDIT_STYLES.values():
        assert e["caption"] in looks.CAPTION_STYLES and e["font"] in looks.FONTS and e["grade"] in looks.GRADES
        assert all(c in looks.CUTS for c in e["cut"].split("+"))
    for c in looks.CAPTION_STYLES.values():
        assert c["font"] in looks.FONTS and c["mode"] in ("static", "karaoke", "box_word", "reveal")
    assert all(v in looks.CAPTION_STYLES for v in looks.LEGACY_CAPTION.values())


def test_choice_order_user_caption_and_font_win_over_style():
    r = looks.resolve({"edit": "cinema"})
    assert (r["caption"], r["font"], r["letterbox"]) == ("cinema", "playfair", True)
    r = looks.resolve({"edit": "cinema", "caption": "karaoke"})
    assert (r["caption"], r["font"]) == ("karaoke", "montserrat")        # đổi kiểu phụ đề thì font đi theo kiểu đó
    r = looks.resolve({"edit": "cinema", "caption": "karaoke", "font": "lobster"})
    assert r["font"] == "lobster"
    assert looks.resolve({"edit": "khong-co", "font": "khong-co"})["edit"] == "clean"


def test_words_are_chunked_and_karaoke_states_cover_the_time():
    ws = looks.word_times("Hôm nay mình chia sẻ, một món đồ rất đáng tiền", 1.0, 4.0)
    assert abs(ws[-1]["e"] - 4.0) < 1e-6 and ws[0]["s"] == 1.0
    chunks = looks.chunk_words(ws, 4)
    assert all(len(c) <= 4 for c in chunks) and [w["w"] for w in chunks[0]] == ["Hôm", "nay", "mình", "chia"]
    assert looks.chunk_words(looks.word_times("Một hai ba, bốn năm sáu bảy", 0, 2), 6)[0][-1]["w"] == "ba,"   # ngắt ở dấu phẩy
    assert sum(len(c) for c in chunks) == len(ws)
    st = looks.caption_states(chunks[0], looks.CAPTION_STYLES["karaoke"])
    assert st[0][3] == 1.12 and st[0][1] - st[0][0] < 0.1                 # khối mới nảy nhẹ
    assert [s[2] for s in st[1:]] == list(range(len(chunks[0])))          # mỗi từ một trạng thái, đúng thứ tự
    assert abs(st[-1][1] - chunks[0][-1]["e"]) < 1e-6
    assert looks.caption_states(chunks[0], looks.CAPTION_STYLES["classic"]) == [(chunks[0][0]["s"], chunks[0][-1]["e"], -1, 1.0, None)]
    assert all(s[4] == s[2] for s in looks.caption_states(chunks[0], looks.CAPTION_STYLES["typewriter"]))


def test_segment_filters_follow_the_style():
    hype = looks.resolve({"edit": "hype"})
    assert "fade=t=in" not in looks.segment_vf(hype, 0, 1080, 1920)        # cảnh đầu không loé
    assert "color=white" in looks.segment_vf(hype, 1, 1080, 1920) and "crop=1080:1920" in looks.segment_vf(hype, 1, 1080, 1920)
    cin = looks.resolve({"edit": "cinema"})
    assert "drawbox" in looks.segment_vf(cin, 0, 1080, 1920) and "drawbox" not in looks.segment_vf(cin, 0, 1080, 1920, frame_only=True)
    assert "scale=" not in looks.segment_vf(looks.resolve({"edit": "viral"}), 2, 1080, 1920, frame_only=True)


def test_caption_track_and_render_with_a_style(tmp_path):
    src = tmp_path / "src.mp4"
    subprocess.run([config.FFMPEG, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:d=3:r=30", str(src)], check=True)
    caps = [{"start_ms": 200, "end_ms": 2600, "text": "Thử phụ đề chạy theo từng từ"}]
    lst = looks.caption_track(caps, 540, 960, looks.resolve({"edit": "hype"}), {}, 0.7, tmp_path / "c", 3.0)
    body = lst.read_text("utf-8")
    assert body.count("duration") >= 6 and body.rstrip().endswith("cap_blank.png'")
    tl = {"canvas": {"width": 1080, "height": 1920}, "duration_ms": 3000, "layout": "full",
          "tracks": {"video": [{"asset_id": "a", "start_ms": 0, "end_ms": 1500, "src_in_ms": 0, "motion": "none"},
                               {"asset_id": "a", "start_ms": 1500, "end_ms": 3000, "src_in_ms": 1000, "motion": "none"}],
                     "captions": caps, "titles": []}}
    out = tmp_path / "out.mp4"
    r = render.render_timeline(tl, {"a": src}, out, tmp_path / "w", "preview", {"look": looks.resolve({"edit": "cinema"})})
    assert out.is_file() and r["duration_ms"] == 3000


def test_looks_api_saves_default_and_rejects_unknown():
    d = client.get(f"{API}/looks").json()
    assert set(d) >= {"edit_styles", "caption_styles", "fonts", "default"} and len(d["fonts"]) == len(looks.FONTS)
    old = d["saved"]
    assert client.put(f"{API}/looks/default", json={"edit": "khong-co"}).status_code == 422
    assert client.put(f"{API}/looks/default", json={"edit": "neon", "font": "baloo"}).json()["font"] == "baloo"
    assert client.get(f"{API}/looks").json()["default"]["edit"] == "neon"
    client.put(f"{API}/looks/default", json=old or {})
    assert client.get(f"{API}/looks/font/montserrat").status_code == 200 and client.get(f"{API}/looks/font/x").status_code == 404
    assert client.get(f"{API}/looks/preview", params={"edit": "luxury"}).headers["content-type"] == "image/jpeg"
