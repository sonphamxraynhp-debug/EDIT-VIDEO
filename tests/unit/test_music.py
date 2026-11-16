"""Thư viện nhạc: danh mục, giấy phép, nhạc tự thêm, xoay nhạc theo tâm trạng."""
import io
import json
import subprocess

from fastapi.testclient import TestClient

from avf import config, main, music, scale

client = TestClient(main.app)
API = main.API


def _tone(path):
    subprocess.run([config.FFMPEG, "-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", str(path)], check=True)


def test_catalog_entries_are_complete_and_https():
    raw = json.loads(music.CATALOG_FILE.read_text("utf-8"))["tracks"]
    assert len(music.catalog()) == len(raw)                      # không bài nào bị loại vì thiếu trường
    ids = [t["id"] for t in raw]
    assert len(ids) == len(set(ids))
    for t in raw:
        assert t["url"].startswith("https://") and t["mood"] in music.MOODS and t["title"] and t["licence"] and t["source_page"]
        if "BY" in t["licence"].upper():
            assert t.get("attribution"), t["id"]                # giấy phép đòi ghi công thì phải có sẵn dòng ghi công


def test_upload_own_music_is_listed_with_licence_file(tmp_path):
    wav = tmp_path / "nhac cua toi.wav"
    _tone(wav)
    r = client.post(f"{API}/music/upload", files={"file": (wav.name, wav.read_bytes(), "audio/wav")})
    assert r.status_code == 200, r.text
    f = r.json()["file"]
    lib = {x["file"]: x for x in scale.music_library()}
    assert lib[f]["mood"] == "mine" and lib[f]["name"] == "nhac cua toi" and lib[f]["licensed"] is True
    assert (scale.MUSIC_DIR / "LICENSES.txt").is_file()
    assert client.post(f"{API}/music/upload", files={"file": ("x.txt", io.BytesIO(b"abc"), "text/plain")}).status_code == 422
    assert client.post(f"{API}/music/upload", files={"file": ("gia.mp3", io.BytesIO(b"khong phai nhac"), "audio/mpeg")}).status_code == 400
    assert client.delete(f"{API}/music/{f}").json()["ok"] is True
    assert f not in {x["file"] for x in scale.music_library()}
    assert client.delete(f"{API}/music/index.json").status_code == 404           # không xoá được file không phải nhạc


def test_auto_rotation_skips_sad_and_dramatic_music(monkeypatch):
    lib = [{"path": f"/m/{m}.mp3", "name": m, "mood": m} for m in ("emotional", "dramatic", "funny", "news", "upbeat", "calm")]
    monkeypatch.setattr(scale, "music_library", lambda: lib)
    picked = {scale.decorate_concept({}, i, {}).get("music") for i in range(12)}
    assert picked <= {None, "/m/upbeat.mp3", "/m/calm.mp3"} and "/m/upbeat.mp3" in picked
