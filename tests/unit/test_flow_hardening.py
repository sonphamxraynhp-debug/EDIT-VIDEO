"""Các chốt chặn thêm ở đợt rà soát: tên tự đặt, phụ đề dài, đường dẫn file, nguồn gọi API."""
import io
from pathlib import Path

from fastapi.testclient import TestClient

from avf import config, db, main, pipeline, render

client = TestClient(main.app)
API = main.API


def test_file_like_names_are_auto():
    pid = db.insert("projects", {"org_id": "org-default", "name": "x", "status": "active", "settings_json": {},
                                 "created_at": db.now(), "updated_at": db.now()})["id"]
    for name in ("CE0AB84B-73EB-4198-BCFE-0045725E3FC5", "IMG_7019", "VID_20261109_083000", "video (1)", "", pipeline.NAME_FALLBACK):
        assert pipeline.name_is_auto(name, pid), name
    for name in ("Khoá học AI cho chủ doanh nghiệp", "AI Solo Business", "Serum C20"):
        assert not pipeline.name_is_auto(name, pid), name


def test_long_caption_shrinks_instead_of_truncating(tmp_path):
    text = "Kinh doanh một người không có nghĩa là làm việc một mình mà là biết xây dựng hệ thống để mình làm được nhiều việc hơn"
    info = render.draw_text_png(tmp_path / "c.png", 540, 960, text, {"max_lines": 2}, "caption")
    assert info["overflow"] is False and info["lines"] <= 3


def test_spa_route_cannot_escape_dist():
    r = client.get("/..%2f..%2f..%2f..%2f..%2f..%2fetc%2fpasswd")
    assert "root:" not in r.text


def test_files_endpoint_rejects_outside_data_dir():
    assert client.get(f"{API}/files", params={"path": "/etc/passwd"}).status_code == 403
    sibling = str(config.DATA_DIR) + "-old/secret.txt"          # tiền tố giống thư mục dữ liệu nhưng nằm ngoài
    assert client.get(f"{API}/files", params={"path": sibling}).status_code == 403


def test_origin_and_host_must_be_local():
    assert client.get(f"{API}/projects", headers={"Origin": "http://localhost.evil.com"}).status_code == 403
    assert client.get(f"{API}/projects", headers={"Host": "evil.com"}).status_code == 403
    assert client.get(f"{API}/projects", headers={"Origin": "http://127.0.0.1:5173"}).status_code == 200


def test_evidence_upload_keeps_only_file_name():
    p = client.post(f"{API}/projects", json={"name": "Thử tải tài liệu", "product_name": "Thử tải tài liệu"}).json()
    prod = client.get(f"{API}/projects/{p['id']}").json()["product"]
    r = client.post(f"{API}/products/{prod['id']}/evidence/upload",
                    files={"file": ("../../../../evil.txt", io.BytesIO(b"x"), "text/plain")})
    assert r.status_code == 200
    dest = Path(r.json()["source_uri"]).resolve()
    assert dest.name == "evil.txt" and dest.is_relative_to(config.MEDIA_DIR)


def test_product_patch_does_not_drop_ai_fields():
    p = client.post(f"{API}/projects", json={"name": "Thử lưu hồ sơ", "product_name": "Thử lưu hồ sơ"}).json()
    prod = client.get(f"{API}/projects/{p['id']}").json()["product"]
    db.update("products", prod["id"], {"attributes_json": {"clip_read": True, "clip_claim_ids": ["a"], "usp": "cũ"}})
    client.put(f"{API}/products/{prod['id']}", json={"attributes_patch": {"price": "2.990.000đ"}})
    attrs = db.q1("SELECT attributes_json FROM products WHERE id=?", (prod["id"],))["attributes_json"]
    assert attrs["clip_read"] is True and attrs["clip_claim_ids"] == ["a"] and attrs["usp"] == "cũ" and attrs["price"] == "2.990.000đ"


def test_preset_voice_needs_no_consent_but_must_exist(monkeypatch):
    presets = [{"name": "Hải Đăng", "gender": "male", "region": "Bắc", "style": "Phong cách tự nhiên"}]
    monkeypatch.setattr(pipeline.tts, "voice_server", lambda: {"ready": True, "clone": True, "presets": presets})
    pid = db.insert("projects", {"org_id": "org-default", "name": "giong", "status": "active", "settings_json": {},
                                 "created_at": db.now(), "updated_at": db.now()})["id"]
    cid = db.insert("campaigns", {"project_id": pid, "name": "giong", "brief_json": {}, "created_at": db.now()})["id"]
    r = client.post(f"{API}/campaigns/{cid}/voice", json={"mode": "preset", "name": "Hải Đăng"})
    assert r.status_code == 200, r.text
    assert pipeline.campaign_voice(cid) == {"provider": "vieneu_preset", "voice": "Hải Đăng"}
    assert client.post(f"{API}/campaigns/{cid}/voice", json={"mode": "preset", "name": "Không Có"}).status_code == 422
    assert client.post(f"{API}/voice/sample", json={"name": "Không Có"}).status_code == 422
    assert client.post(f"{API}/campaigns/{cid}/voice", json={"mode": "clone"}).status_code == 422      # giọng nhái vẫn đòi xác nhận


def test_variants_never_rotate_into_preset_voices(monkeypatch):
    from avf import scale
    monkeypatch.setattr(scale_tts := pipeline.tts, "voice_server",
                        lambda: {"ready": True, "clone": True, "presets": [{"name": "Hải Đăng"}, {"name": "Mai Anh"}]})
    assert scale_tts.providers()[0]["id"].startswith("vieneu")
    assert all(not v["provider"].startswith("vieneu") for v in scale.voice_options())
