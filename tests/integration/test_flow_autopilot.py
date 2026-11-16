"""Chế độ AI chạy trọn vòng không cần người bấm từng bước: thả video → máy tự tới bản xem thử →
một chạm chọn tất cả và xuất → tự đóng gói Meta/TikTok. LLM tắt để test ổn định."""
from pathlib import Path

from fastapi.testclient import TestClient

from conftest import FIXTURE
from avf import ai, worker
from avf.main import app

c = TestClient(app)
A = "/api/v1"


def drain(max_loops=80):
    for _ in range(max_loops):
        job = worker.claim("test-worker", list(worker.CLASS_OF))
        if not job:
            return
        worker.execute(job, "test-worker")


def ok(r):
    assert r.status_code < 400, r.text
    return r.json()


def run_until(pid, stages, loops=40):
    st = {}
    for _ in range(loops):
        st = ok(c.post(f"{A}/flow/{pid}/auto"))
        if st["stage"] in stages:
            return st
        drain()
    raise AssertionError(f"không tới {stages}, dừng ở {st}")


def test_ai_mode_end_to_end(monkeypatch):
    monkeypatch.setattr(ai, "llm_available", lambda: False)
    p = ok(c.post(f"{A}/projects", json={"name": "IMG_0001", "product_name": "IMG_0001", "target_count": 3, "mode": "ai"}))
    pid = p["id"]
    with open(FIXTURE, "rb") as f:
        ok(c.post(f"{A}/assets/import", data={"project_id": pid}, files={"file": ("IMG_0001.mp4", f, "video/mp4")}))

    st = run_until(pid, ("need_claims", "review"))
    flow = ok(c.get(f"{A}/flow/{pid}"))
    assert flow["project"]["product"]["name"] != "IMG_0001"          # tên file không được lên video
    if st["stage"] == "need_claims":                                  # clip mẫu không có lời: người thêm một câu rồi máy chạy tiếp
        prod = flow["product_id"]
        ev = ok(c.post(f"{A}/products/{prod}/evidence", json={"title": "Hồ sơ sản phẩm"}))
        ok(c.post(f"{A}/products/{prod}/claims", json={"text": "Thiết kế đầu nhỏ giọt giúp kiểm soát lượng dùng",
                                                       "status": "approved", "evidence_id": ev["id"]}))
        st = run_until(pid, ("review",))
    assert st["variants"].get("QC_PENDING", 0) >= 1 and not st["stuck"]

    r = ok(c.post(f"{A}/flow/{pid}/finish", json={}))                 # một chạm: chọn mọi bản đạt và xuất
    assert r["queued"] >= 1, r
    st = run_until(pid, ("done",))
    packs = st["packages"]["folders"]
    assert set(packs) == {"meta_ads", "tiktok_ads"}
    for folder in packs.values():
        assert list(Path(folder).glob("*.mp4")) and (Path(folder) / "ads_mapping.csv").exists()
    assert ok(c.post(f"{A}/flow/{pid}/auto"))["packages"]["at"] == st["packages"]["at"]     # không đóng gói lại mỗi lượt


def test_redo_keeps_exported_and_restarts_the_rest(monkeypatch):
    monkeypatch.setattr(ai, "llm_available", lambda: False)
    p = ok(c.post(f"{A}/projects", json={"name": "Thử làm lại", "product_name": "Thử làm lại", "target_count": 3, "mode": "ai"}))
    pid = p["id"]
    with open(FIXTURE, "rb") as f:
        ok(c.post(f"{A}/assets/import", data={"project_id": pid}, files={"file": ("lam-lai.mp4", f, "video/mp4")}))
    st = run_until(pid, ("need_claims", "review"))
    if st["stage"] == "need_claims":
        prod = ok(c.get(f"{A}/flow/{pid}"))["product_id"]
        ev = ok(c.post(f"{A}/products/{prod}/evidence", json={"title": "Hồ sơ"}))
        ok(c.post(f"{A}/products/{prod}/claims", json={"text": "Thiết kế đầu nhỏ giọt giúp kiểm soát lượng dùng",
                                                       "status": "approved", "evidence_id": ev["id"]}))
        run_until(pid, ("review",))
    r = ok(c.post(f"{A}/flow/{pid}/redo"))
    assert r["reanalyzing"] == 1 and r["removed_variants"] >= 1
    assert ok(c.get(f"{A}/flow/{pid}"))["approved_claims"] == 1       # câu người tự nhập được giữ
    st = run_until(pid, ("review",))
    assert st["variants"].get("QC_PENDING", 0) >= 1
