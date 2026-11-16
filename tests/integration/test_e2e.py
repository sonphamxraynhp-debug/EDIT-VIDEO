"""Vertical slice: import → phân tích → Product Brain → ma trận → kịch bản → storyboard → giọng → preview → QC
→ duyệt → render final → manifest. Chạy thật bằng ffmpeg + TTS local (LLM tắt để test deterministic)."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from conftest import FIXTURE
from avf import db, worker
from avf.main import app

c = TestClient(app)


def drain(max_loops=50):
    """Chạy hết hàng đợi đồng bộ trong test."""
    for _ in range(max_loops):
        job = worker.claim("test-worker", list(worker.CLASS_OF))
        if not job:
            return
        worker.execute(job, "test-worker")


def ok(r):
    assert r.status_code < 400, r.text
    return r.json()


def test_full_vertical_slice():
    p = ok(c.post("/api/v1/projects", json={"name": "Campaign Test", "product_name": "Serum Mẫu A", "target_count": 2}))
    pid = p["id"]
    with open(FIXTURE, "rb") as f:
        a = ok(c.post("/api/v1/assets/import", data={"project_id": pid}, files={"file": ("demo.mp4", f, "video/mp4")}))
    assert a["meta_json"]["aspect"] == "9:16" and a["meta_json"]["fps"] == 30          # TC-001
    with open(FIXTURE, "rb") as f:                                                     # M01-05 trùng sha256
        r = c.post("/api/v1/assets/import", data={"project_id": pid}, files={"file": ("demo2.mp4", f, "video/mp4")})
    assert r.status_code == 409 and r.json()["error"]["code"] == "ASSET_DUPLICATE"
    bad = c.post("/api/v1/assets/import", data={"project_id": pid}, files={"file": ("x.mp4", b"not a video", "video/mp4")})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "ASSET_CORRUPT"   # TC-003

    ok(c.post("/api/v1/analysis/jobs", json={"asset_id": a["id"], "asr": False}))
    drain()
    scenes = ok(c.get("/api/v1/scenes", params={"asset_id": a["id"]}))
    assert len(scenes) >= 3
    for s in scenes:   # người dùng xác nhận nhãn
        ok(c.patch(f"/api/v1/scenes/{s['id']}", json={"tags_json": ["demonstration", "hand", "packshot", "face", "close_up"],
                                                       "review": "approved"}))

    prod = ok(c.get("/api/v1/products", params={"project_id": pid}))[0]
    ok(c.put(f"/api/v1/products/{prod['id']}", json={"attributes_json": {
        "category": "Chăm sóc da", "usp": "Đầu nhỏ giọt dễ kiểm soát", "usage": "Thoa 2 đến 3 giọt lên da sạch",
        "allowed_cta": "Tìm hiểu thêm", "blocked_phrases": ["thần kỳ"]}}))
    ev = ok(c.post(f"/api/v1/products/{prod['id']}/evidence", json={"title": "Hồ sơ sản phẩm"}))
    r = c.post(f"/api/v1/products/{prod['id']}/claims", json={"text": "Không có bằng chứng", "status": "approved"})
    assert r.status_code == 422                                                         # KPI-05
    ok(c.post(f"/api/v1/products/{prod['id']}/claims", json={"text": "Thiết kế đầu nhỏ giọt giúp kiểm soát lượng dùng",
                                                              "status": "approved", "evidence_id": ev["id"]}))

    camp = ok(c.get("/api/v1/campaigns", params={"project_id": pid}))[0]
    ok(c.put(f"/api/v1/campaigns/{camp['id']}", json={"brief_json": {**camp["brief_json"], "creative_angles": ["how_to", "faq"],
                                                                      "audiences": ["new_buyers", "busy_professionals"],
                                                                      "durations_sec": [15]}}))
    plan = ok(c.post(f"/api/v1/campaigns/{camp['id']}/variants/generate"))
    assert plan["created"] == 2
    vs = ok(c.get(f"/api/v1/campaigns/{camp['id']}/variants"))["items"]

    for v in vs:
        s = ok(c.post(f"/api/v1/variants/{v['id']}/script", params={"use_llm": False}))
        assert s["beats_json"]["beats"][0]["type"] == "hook"
        ok(c.post(f"/api/v1/variants/{v['id']}/script/approve"))
        sb = ok(c.post(f"/api/v1/variants/{v['id']}/storyboard"))
        assert sb["timeline_json"]["tracks"]["video"]
        ok(c.post(f"/api/v1/variants/{v['id']}/preview"))
    drain()
    v0 = ok(c.get(f"/api/v1/variants/{vs[0]['id']}"))
    assert v0["status"] == "QC_PENDING", v0["jobs"]
    assert v0["qc_full"]["checks_json"]["technical"]["audio"]["has_audio"]

    # chỉ reviewer mới duyệt (state machine) → owner local duyệt được
    r = ok(c.post(f"/api/v1/variants/{vs[0]['id']}/approval", json={"decision": "waive", "reason": "Test duyệt"}))
    assert r["status"] == "APPROVED"
    b = ok(c.post("/api/v1/render/batches", json={"campaign_id": camp["id"], "idempotency_key": "k1"}))
    assert b["queued"] == 1
    again = ok(c.post("/api/v1/render/batches", json={"campaign_id": camp["id"], "idempotency_key": "k1"}))
    assert again.get("idempotent")
    drain()
    lib = ok(c.get("/api/v1/library"))
    assert len(lib) == 1
    out = Path(lib[0]["output_uri"])
    assert out.exists() and not list(out.parent.glob("*.part.mp4"))
    assert out.with_suffix(".srt").read_text(encoding="utf-8").startswith("1\n")
    exp = ok(c.post("/api/v1/exports", json={}))
    m = json.loads((Path(exp["folder"]) / "manifest.json").read_text(encoding="utf-8"))
    assert len(m) == 1 and m[0]["code"] == vs[0]["code"]                              # TC-019


def test_crash_recovery_marks_stale_jobs():  # TC-011
    j = db.insert("render_jobs", {"kind": "proxy", "profile_json": {"asset_id": "x"}, "status": "RENDERING",
                                  "heartbeat_at": "2000-01-01T00:00:00+00:00", "created_at": db.now(), "updated_at": db.now()})
    assert worker.recover_stale() >= 1
    assert db.q1("SELECT status FROM render_jobs WHERE id=?", (j["id"],))["status"] == "RETRY_WAIT"


def test_compare_route_not_shadowed():
    r = c.get("/api/v1/variants/compare", params={"a": "x", "b": "y"})
    assert r.json()["error"]["message"] == "Không tìm thấy biến thể"   # đi vào compare, không phải get_variant("compare")


def test_metrics_import_scoped_by_campaign():
    """Mã biến thể chỉ duy nhất trong chiến dịch: không gắn số liệu nhầm chiến dịch."""
    ids = []
    for name in ("Metric A", "Metric B"):
        p = ok(c.post("/api/v1/projects", json={"name": name}))
        camp = ok(c.get("/api/v1/campaigns", params={"project_id": p["id"]}))[0]
        v = db.insert("variants", {"campaign_id": camp["id"], "code": "V-9001", "concept_json": {"angle": "faq"},
                                   "created_at": db.now(), "updated_at": db.now()})
        ids.append((camp["id"], v["id"]))
    csv_ = b"code,platform,date,views\nV-9001,tiktok,2026-11-01,500\n"
    r = ok(c.post("/api/v1/metrics/import", files={"file": ("m.csv", csv_, "text/csv")}))
    assert r["imported"] == 0 and r["ambiguous_codes"] == ["V-9001"]
    r = ok(c.post("/api/v1/metrics/import", data={"campaign_id": ids[1][0]}, files={"file": ("m.csv", csv_, "text/csv")}))
    assert r["imported"] == 1
    assert db.q1("SELECT variant_id FROM metrics WHERE views=500")["variant_id"] == ids[1][1]


def test_reanalysis_keeps_reviewed_scenes():
    p = ok(c.post("/api/v1/projects", json={"name": "Reanalyze", "product_name": "SP", "target_count": 1}))
    with open(FIXTURE, "rb") as f:
        a = ok(c.post("/api/v1/assets/import", data={"project_id": p["id"]}, files={"file": ("r.mp4", f, "video/mp4")}))
    ok(c.post("/api/v1/analysis/jobs", json={"asset_id": a["id"], "asr": False, "ocr": False}))
    drain()
    s0 = ok(c.get("/api/v1/scenes", params={"asset_id": a["id"]}))[0]
    ok(c.patch(f"/api/v1/scenes/{s0['id']}", json={"tags_json": ["hand"], "review": "approved"}))
    ok(c.post("/api/v1/analysis/jobs", json={"asset_id": a["id"], "asr": False, "ocr": False}))
    drain()
    again = {s["id"]: s for s in ok(c.get("/api/v1/scenes", params={"asset_id": a["id"]}))}
    assert s0["id"] in again                                    # giữ id → storyboard không gãy tham chiếu
    assert again[s0["id"]]["review"] == "approved" and again[s0["id"]]["tags_json"] == ["hand"]


def _project_with_source(name: str, n_assets: int = 1):
    """Dự án + sản phẩm có claim + chiến dịch; mỗi asset là bản fixture khác nhau (đổi độ dài để khác sha)."""
    import subprocess
    p = ok(c.post("/api/v1/projects", json={"name": name, "product_name": "Serum Thử", "target_count": 4}))
    for i in range(n_assets):
        f = Path(__import__("tempfile").mkdtemp()) / f"src{i}.mp4"
        if i == 0:
            f = FIXTURE
        else:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(FIXTURE), "-t", f"{3 + i * 0.5:.1f}", "-c", "copy", str(f)], check=True)
        with open(f, "rb") as fh:
            a = ok(c.post("/api/v1/assets/import", data={"project_id": p["id"]}, files={"file": (f.name, fh, "video/mp4")}))
        ok(c.post("/api/v1/analysis/jobs", json={"asset_id": a["id"], "asr": False, "ocr": False}))
    drain()
    prod = ok(c.get("/api/v1/products", params={"project_id": p["id"]}))[0]
    ok(c.put(f"/api/v1/products/{prod['id']}", json={"attributes_json": {"category": "Chăm sóc da", "usp": "Đầu nhỏ giọt",
                                                                          "usage": "Thoa 2 giọt", "allowed_cta": "Tìm hiểu thêm"}}))
    ev = ok(c.post(f"/api/v1/products/{prod['id']}/evidence", json={"title": "Hồ sơ"}))
    ok(c.post(f"/api/v1/products/{prod['id']}/claims", json={"text": "Thiết kế đầu nhỏ giọt giúp kiểm soát lượng dùng",
                                                              "status": "approved", "evidence_id": ev["id"]}))
    camp = ok(c.get("/api/v1/campaigns", params={"project_id": p["id"]}))[0]
    for a in ok(c.get("/api/v1/assets", params={"project_id": p["id"]})):
        for s in ok(c.get("/api/v1/scenes", params={"asset_id": a["id"]})):
            ok(c.patch(f"/api/v1/scenes/{s['id']}", json={"tags_json": ["demonstration", "hand", "packshot", "face"], "review": "approved"}))
    return p, prod, camp


def test_source_gate_blocks_big_target_with_one_video():
    _, _, camp = _project_with_source("Gate")
    r = c.post(f"/api/v1/campaigns/{camp['id']}/variants/generate", json={"target": 50})
    assert r.status_code == 422 and r.json()["error"]["code"] == "NEED_MORE_SOURCE"
    plan = ok(c.get(f"/api/v1/campaigns/{camp['id']}/plan", params={"target": 50}))
    assert plan["requirement"] == {"assets": 3, "scenes": 12} and any(w["code"] == "NEED_MORE_SOURCE" for w in plan["warnings"])
    assert plan["eta"]["total_hours"] > 0 and plan["hooks"]["need"] == 10


def test_hooks_policy_and_originality_gate():
    _, _, camp = _project_with_source("Hooks")
    cid = camp["id"]
    ok(c.put(f"/api/v1/campaigns/{cid}", json={"brief_json": {**camp["brief_json"], "creative_angles": ["faq", "checklist"],
                                                                "audiences": ["new_buyers"], "durations_sec": [15], "formats": ["full"],
                                                                "platforms": ["meta", "tiktok"]}}))
    h = ok(c.post(f"/api/v1/campaigns/{cid}/hooks/generate", json={"n": 6, "use_llm": False}))
    assert h["created"] >= 4 and h["source"] == "template"
    # hook thêm tay vi phạm chính sách → từ chối; hook trùng → từ chối
    r = c.post(f"/api/v1/campaigns/{cid}/hooks", json={"text": "Bạn đang béo và muốn thay đổi đúng không"})
    assert r.status_code == 422 and "chính sách" in r.json()["error"]["details"]
    r = c.post(f"/api/v1/campaigns/{cid}/hooks", json={"text": h["hooks"][0]["text"] + " nhé"})
    assert r.status_code == 422
    ok(c.post(f"/api/v1/campaigns/{cid}/variants/generate", json={"target": 2}))
    vs = ok(c.get(f"/api/v1/campaigns/{cid}/variants"))["items"]
    assert len(vs) == 2 and vs[0]["concept_json"]["voice"]["rate"] != vs[1]["concept_json"]["voice"]["rate"]
    hooks_used = set()
    for v in vs:
        s = ok(c.post(f"/api/v1/variants/{v['id']}/script", params={"use_llm": False}))
        hooks_used.add(s["beats_json"]["beats"][0]["text"])
    lib = {x["text"] for x in ok(c.get(f"/api/v1/campaigns/{cid}/hooks"))["items"]}
    assert hooks_used <= lib and len(hooks_used) == 2                      # hook lấy từ thư viện, không trùng nhau
    # cổng chính sách trong kịch bản sửa tay
    v0 = vs[0]
    s = ok(c.get(f"/api/v1/variants/{v0['id']}/scripts"))[0]
    bad = [dict(b, text="Da bạn xấu vì chưa dùng serum này, cam kết hết mụn") if i == 1 else b for i, b in enumerate(s["beats_json"]["beats"])]
    s2 = ok(c.put(f"/api/v1/variants/{v0['id']}/script", json={"beats": bad}))
    assert s2["status"] == "blocked" and any(f["code"].startswith("POLICY-") and f["severity"] == "critical" for f in s2["beats_json"]["flags"])
    r = c.post(f"/api/v1/variants/{v0['id']}/script/approve")
    assert r.status_code == 409
    # hai bản gần như giống nhau → điểm nguyên bản thấp → QC fail → không duyệt được, không vào lô final
    ok(c.put(f"/api/v1/variants/{v0['id']}/script", json={"beats": s["beats_json"]["beats"]}))
    v1 = vs[1]
    ok(c.put(f"/api/v1/variants/{v1['id']}/script", json={"beats": s["beats_json"]["beats"]}))   # copy nguyên kịch bản
    db.conn().execute("UPDATE variants SET concept_json=? WHERE id=?", (json.dumps(v0["concept_json"]), v1["id"]))
    for v in vs:
        ok(c.post(f"/api/v1/variants/{v['id']}/script/approve"))
        ok(c.post(f"/api/v1/variants/{v['id']}/storyboard"))
        ok(c.post(f"/api/v1/variants/{v['id']}/preview"))
    drain()
    q1 = ok(c.get(f"/api/v1/variants/{v1['id']}"))
    assert q1["qc_full"]["checks_json"]["originality"]["status"] == "fail"
    assert q1["qc_full"]["checks_json"]["policy"]["status"] == "pass"
    r = c.post(f"/api/v1/variants/{v1['id']}/approval", json={"decision": "waive", "reason": "thử"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "BLOCK-04"


def test_ads_export_batch_actions_and_next_batch():
    _, _, camp = _project_with_source("Ads")
    cid = camp["id"]
    ok(c.put(f"/api/v1/campaigns/{cid}", json={"brief_json": {**camp["brief_json"], "creative_angles": ["faq", "checklist", "tips"],
                                                                "audiences": ["new_buyers", "loyal"], "durations_sec": [15],
                                                                "formats": ["full", "packshot_text"], "landing_url": "https://shop.vn/serum",
                                                                "platforms": ["tiktok"]}}))
    ok(c.post(f"/api/v1/campaigns/{cid}/hooks/generate", json={"n": 8, "use_llm": False}))
    ok(c.post(f"/api/v1/campaigns/{cid}/variants/generate", json={"target": 2}))
    vs = ok(c.get(f"/api/v1/campaigns/{cid}/variants"))["items"]
    for v in vs:
        ok(c.post(f"/api/v1/variants/{v['id']}/script", params={"use_llm": False}))
        ok(c.post(f"/api/v1/variants/{v['id']}/script/approve"))
        ok(c.post(f"/api/v1/variants/{v['id']}/storyboard"))
        ok(c.post(f"/api/v1/variants/{v['id']}/preview"))
    drain()
    for v in vs:
        ok(c.post(f"/api/v1/variants/{v['id']}/approval", json={"decision": "waive", "reason": "test"}))
    b = ok(c.post("/api/v1/render/batches", json={"campaign_id": cid, "idempotency_key": "ads-1"}))
    assert b["queued"] == 2 and b["blocked_originality"] == []
    bid = b["batch"]["id"]
    assert ok(c.post(f"/api/v1/render/batches/{bid}/actions", json={"action": "pause"}))["changed"] == 2
    assert ok(c.get("/api/v1/render/batches", params={"campaign_id": cid}))[0]["jobs"] == {"PAUSED": 2}
    assert ok(c.post(f"/api/v1/render/batches/{bid}/actions", json={"action": "resume"}))["changed"] == 2
    drain()
    lib = [r for r in ok(c.get("/api/v1/library")) if r["campaign_id"] == cid]
    assert len(lib) == 2
    exp = ok(c.post("/api/v1/exports", json={"variant_ids": [r["variant_id"] for r in lib], "preset": "tiktok_ads"}))
    folder = Path(exp["folder"])
    rows = list(__import__("csv").DictReader(open(folder / "ads_mapping.csv", encoding="utf-8-sig")))
    assert len(rows) == 2 and all(r["landing_url"].startswith("https://shop.vn/serum?utm_source=") for r in rows)
    assert all((folder / r["file"]).exists() and r["ad_name"].startswith("ads_V-000") for r in rows)
    assert (folder / "README.txt").exists()
    # số liệu → yếu tố thắng → lô kế tiếp (lô 2, mã tiếp nối, trọng số)
    for i, v in enumerate(vs):
        for _ in range(2):
            ok(c.post("/api/v1/metrics", json={"variant_id": v["id"], "platform": "tiktok", "views": 1000, "ctr": 0.02 + 0.03 * i}))
    learn = ok(c.get(f"/api/v1/campaigns/{cid}/learnings", params={"kpi": "ctr"}))
    assert learn["variants_with_data"] == 2 and learn["dimensions"]["angle"]
    nb = ok(c.post(f"/api/v1/campaigns/{cid}/variants/next-batch", json={"target": 2, "kpi": "ctr", "use_llm": False}))
    assert nb["created"] == 2 and nb["batch_no"] == 2
    allv = ok(c.get(f"/api/v1/campaigns/{cid}/variants", params={"size": 100}))["items"]
    assert len(allv) == 4 and {v["batch_no"] for v in allv} == {1, 2} and allv[-1]["code"] == "V-0004"


def test_onboarding_checklist_tracks_real_progress():
    r = ok(c.get("/api/v1/onboarding"))
    assert r["done"] == 0 and r["next"]["key"] == "project"
    p = ok(c.post("/api/v1/projects", json={"name": "Onboard", "product_name": "SP", "target_count": 1}))
    r = ok(c.get("/api/v1/onboarding", params={"project_id": p["id"]}))
    assert r["steps"][0]["done"] and r["next"]["key"] == "import" and r["total"] == 11
    with open(FIXTURE, "rb") as f:
        ok(c.post("/api/v1/assets/import", data={"project_id": p["id"]}, files={"file": ("o.mp4", f, "video/mp4")}))
    r = ok(c.get("/api/v1/onboarding", params={"project_id": p["id"]}))
    assert r["done"] == 2 and r["next"]["key"] == "analyze" and r["next"]["path"] == "/media/analyze"
    assert ok(c.get("/api/v1/settings"))["tutorial"]["done"] is False
