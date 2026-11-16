from avf import creative


def claims():
    return [
        {"id": "c1", "text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng", "status": "approved"},
        {"id": "c2", "text": "Chữa khỏi mụn trong 3 ngày", "status": "prohibited"},
    ]


def test_similarity_identical_and_different():
    assert creative.similarity("serum dưỡng ẩm cho da", "serum dưỡng ẩm cho da") == 1.0
    assert creative.similarity("serum dưỡng ẩm", "máy hút bụi cầm tay") < 0.2


def test_cluster_near_duplicates():  # TC-006
    g = creative.cluster([("a", "3 bước dùng serum đúng cách mỗi sáng"),
                          ("b", "3 bước dùng serum đúng cách mỗi sáng nhé"),
                          ("c", "so sánh hai loại máy hút bụi")], 0.6)
    assert g["a"] == g["b"] != g["c"]


def test_claim_check_blocks_unapproved_and_risky():  # TC-004
    beats = [{"text": "Serum này chữa khỏi mụn 100%", "claim_ids": []},
             {"text": "Đầu nhỏ giọt giúp kiểm soát lượng dùng", "claim_ids": ["c1"]},
             {"text": "Hiệu quả tuyệt vời", "claim_ids": ["c-unknown"]}]
    flags = creative.check_script_claims(beats, claims())
    crit = [f for f in flags if f["severity"] == "critical"]
    assert any(f["beat"] == 0 for f in crit)
    assert any(f["beat"] == 2 for f in crit)
    assert not any(f["beat"] == 1 for f in crit)


def test_plan_matrix_need_more_source_and_quota():  # TC-007, M04-09
    scenes = [{"tags_json": ["packshot", "close_up"]}, {"tags_json": ["face"]}]
    plan = creative.plan_matrix({"creative_angles": ["demo", "faq", "comparison"], "audiences": ["new_buyers"],
                                 "durations_sec": [15, 30]}, scenes, claims(), 4)
    assert plan["rejected_reasons"].get("NEED_MORE_SOURCE", 0) > 0     # demo thiếu cảnh demonstration
    assert all(p["angle"] != "demo" for p in plan["chosen"])
    assert len(plan["chosen"]) <= 4


def test_template_script_uses_only_approved_claims():
    prod = {"name": "Serum A", "attributes_json": {"usage": "Thoa 2-3 giọt", "allowed_cta": "Tìm hiểu thêm"}}
    s = creative.template_script(prod, claims(), {"angle": "how_to", "duration": 30}, [], 1)
    used = {c for b in s["beats"] for c in b["claim_ids"]}
    assert used <= {"c1"}
    assert s["beats"][0]["type"] == "hook" and s["beats"][-1]["type"] == "cta"


def test_validate_script_schema_error():  # TC-005
    import pytest
    with pytest.raises(ValueError):
        creative.validate_script({"title": "x"}, set())


def test_miscited_benefit_is_blocked():
    """LLM gắn ID claim hợp lệ cho một câu lợi ích bịa thêm → phải bị chặn."""
    cl = [{"id": "c1", "text": "Thiết kế đầu nhỏ giọt giúp kiểm soát lượng dùng", "status": "approved"}]
    flags = creative.check_script_claims([{"type": "hook", "text": "Serum Mẫu A giúp dưỡng da hiệu quả", "claim_ids": ["c1"]}], cl)
    assert any(f["severity"] == "critical" for f in flags)
    ok = creative.check_script_claims([{"type": "body", "text": "Đầu nhỏ giọt giúp bạn kiểm soát lượng dùng", "claim_ids": ["c1"]}], cl)
    assert not any(f["severity"] == "critical" for f in ok)
    warn = creative.check_script_claims([{"type": "body", "text": "Sản phẩm giúp da mịn hơn", "claim_ids": []}], cl)
    assert any(f["code"] == "WARN-CLAIM" for f in warn)


def test_relocate_paths_after_moving_data_dir():
    from avf import db
    db.migrate()
    a = db.insert("render_jobs", {"kind": "final", "output_uri": "/old/root/data/output/V-1.mp4",
                                  "profile_json": {"result": {"video": "/old/root/data/output/V-1.mp4"}},
                                  "created_at": db.now(), "updated_at": db.now()})
    assert db.relocate_paths("/old/root/data", "/new/place/data") >= 2
    r = db.q1("SELECT * FROM render_jobs WHERE id=?", (a["id"],))
    assert r["output_uri"] == "/new/place/data/output/V-1.mp4"
    assert r["profile_json"]["result"]["video"].startswith("/new/place/data")
