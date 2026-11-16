"""Tạo dự án mẫu qua API thật (cần API + worker đang chạy): python scripts/seed_demo.py
Dữ liệu sản phẩm là dữ liệu MẪU để thử quy trình, không phải claim thương mại thật."""
import json
import sys
import time
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8765/api/v1"
FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "sample_9x16.mp4"


def call(method, path, body=None, params=""):
    req = urllib.request.Request(BASE + path + params, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read() or "null")


def wait_jobs(timeout=600):
    t = time.time()
    while time.time() - t < timeout:
        st = call("GET", "/render/jobs")["stats"]["by_status"]
        busy = sum(st.get(k, 0) for k in ("PENDING", "PREPARING", "RENDERING", "VERIFYING", "RETRY_WAIT"))
        print("  queue:", st, flush=True)
        if not busy:
            return
        time.sleep(3)


def main(n_variants=6):
    p = call("POST", "/projects", {"name": "Campaign A – Serum", "description": "Chiến dịch video cho Serum Mẫu A (dữ liệu mẫu)",
                                   "product_name": "Serum Mẫu A", "target_count": n_variants})
    pid = p["id"]
    res = call("POST", "/assets/import-path", {"project_id": pid, "path": str(FIXTURE)})
    aid = res["imported"][0]["id"]
    call("POST", "/analysis/jobs", {"asset_id": aid, "asr": False})
    wait_jobs()
    for s in call("GET", "/scenes", params=f"?asset_id={aid}"):
        call("PATCH", f"/scenes/{s['id']}", {"tags_json": sorted(set(s["tags_json"] + ["demonstration", "hand", "face", "packshot"])),
                                            "review": "approved"})
    prod = call("GET", "/products", params=f"?project_id={pid}")[0]
    call("PUT", f"/products/{prod['id']}", {"sku": "SRM-A-30", "attributes_json": {
        "category": "Chăm sóc da", "short_description": "Tinh chất dưỡng da dùng trong quy trình hằng ngày",
        "usp": "Thiết kế đầu nhỏ giọt, dễ kiểm soát lượng dùng", "price": "299.000đ / 30ml",
        "features": "Chai thuỷ tinh, đầu nhỏ giọt, dung tích 30 ml", "usage": "Lấy 2 đến 3 giọt, thoa đều lên da sạch",
        "limitations": "Không tạo tuyên bố điều trị hoặc hiệu quả phi thực tế", "audience": "Người quan tâm quy trình chăm sóc da",
        "allowed_cta": "Tìm hiểu thêm · Xem thông tin sản phẩm", "evidence_note": "Hồ sơ sản phẩm và tài liệu đã duyệt",
        "blocked_phrases": ["thần kỳ", "trắng bật tông", "trị dứt điểm"]}})
    ev1 = call("POST", f"/products/{prod['id']}/evidence", {"title": "Hồ sơ sản phẩm Mẫu A", "kind": "PDF", "source_uri": "Nội bộ", "excerpt": "Thông số chai 30ml, đầu nhỏ giọt"})
    ev2 = call("POST", f"/products/{prod['id']}/evidence", {"title": "Hướng dẫn sử dụng sản phẩm", "kind": "DOCX", "source_uri": "Nhà cung cấp"})
    for text, ev in [("Thiết kế đầu nhỏ giọt giúp kiểm soát lượng dùng", ev1), ("Chai thuỷ tinh dung tích 30 ml", ev1),
                     ("Dùng 2 đến 3 giọt mỗi lần trên da sạch", ev2), ("Kết cấu dễ thoa đều lên da", ev2)]:
        call("POST", f"/products/{prod['id']}/claims", {"text": text, "status": "approved", "evidence_id": ev["id"]})
    call("POST", f"/products/{prod['id']}/claims", {"text": "Giúp da căng bóng sau 7 ngày", "status": "needs_review", "risk_level": "high"})
    call("POST", f"/products/{prod['id']}/claims", {"text": "Trị dứt điểm mụn", "status": "prohibited", "risk_level": "high"})
    for q, a in [("Dùng serum vào lúc nào?", "Sau bước làm sạch, trước kem dưỡng."), ("Mỗi lần dùng bao nhiêu?", "Khoảng 2 đến 3 giọt.")]:
        call("POST", f"/products/{prod['id']}/faqs", {"q": q, "a": a})
    camp = call("GET", "/campaigns", params=f"?project_id={pid}")[0]
    call("PUT", f"/campaigns/{camp['id']}", {"brief_json": {**camp["brief_json"], "product_id": prod["id"],
        "creative_angles": ["how_to", "faq", "demo", "checklist", "tips", "mistakes"], "audiences": ["new_buyers", "busy_professionals", "ingredient_focused"],
        "durations_sec": [15, 30], "formats": ["full", "packshot_text"]}})
    print(call("POST", f"/campaigns/{camp['id']}/variants/generate"))
    vs = call("GET", f"/campaigns/{camp['id']}/variants")["items"]
    for i, v in enumerate(vs):
        call("POST", f"/variants/{v['id']}/script", params=f"?use_llm={'true' if i < 2 else 'false'}")
    for v in vs[: max(1, len(vs) - 1)]:
        try:
            call("POST", f"/variants/{v['id']}/script/approve")
            call("POST", f"/variants/{v['id']}/storyboard")
            call("POST", f"/variants/{v['id']}/preview")
        except urllib.error.HTTPError as e:
            print("  skip", v["code"], e.read()[:200])
    wait_jobs()
    for v in vs[:2]:
        try:
            call("POST", f"/variants/{v['id']}/approval", {"decision": "waive", "reason": "Demo: đã xem preview"})
        except urllib.error.HTTPError as e:
            print("  approval skip", v["code"], e.read()[:200])
    call("POST", "/render/batches", {"campaign_id": camp["id"], "idempotency_key": f"seed-{pid}"})
    wait_jobs()
    print("Xong. Project:", pid)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 6)
