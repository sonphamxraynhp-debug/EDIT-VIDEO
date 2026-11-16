"""Smoke test toàn bộ tính năng qua API thật với video thật trên máy.
Dùng: .venv/bin/python -I scripts/smoke_real.py <video1> [video2 ...] [--folder <thư mục>]
Cần API + worker đang chạy. In PASS/FAIL từng bước, tiếp tục khi lỗi."""
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = "http://127.0.0.1:8765/api/v1"
RESULTS: list[tuple[str, bool, str]] = []


def call(method, path, body=None, params="", raw=None, ctype="application/json", timeout=600):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path + params, method=method, data=data, headers={"Content-Type": ctype})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            txt = r.read()
            return r.status, (json.loads(txt) if txt and r.headers.get_content_type() == "application/json" else txt)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except ValueError:
            return e.code, None


def step(name, fn):
    t = time.time()
    try:
        info = fn()
        RESULTS.append((name, True, str(info or "")[:160]))
        print(f"PASS {name} ({time.time() - t:.1f}s) {str(info or '')[:160]}", flush=True)
        return info
    except Exception as e:  # noqa: BLE001
        RESULTS.append((name, False, f"{type(e).__name__}: {e}"[:300]))
        print(f"FAIL {name} ({time.time() - t:.1f}s) {type(e).__name__}: {str(e)[:300]}", flush=True)
        return None


def ok(res, *codes):
    st, b = res
    if st not in (codes or (200,)):
        raise AssertionError(f"HTTP {st}: {json.dumps(b, ensure_ascii=False)[:300] if b else b}")
    return b


def wait_jobs(timeout=1800, quiet=False):
    t = time.time()
    while time.time() - t < timeout:
        st = ok(call("GET", "/render/jobs", params="?size=1"))["stats"]["by_status"]
        if not sum(st.get(k, 0) for k in ("PENDING", "PREPARING", "RENDERING", "VERIFYING", "RETRY_WAIT")):
            return st
        if not quiet:
            print("   …queue", st, flush=True)
        time.sleep(4)
    raise TimeoutError("queue không xong")


def multipart(fields: dict, file_field: str, path: Path, filename: str | None = None):
    b = uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{file_field}"; filename="{filename or path.name}"\r\n'
                 f"Content-Type: application/octet-stream\r\n\r\n".encode() + path.read_bytes() + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={b}"


def main(videos: list[Path], folder: Path | None):
    S: dict = {}
    proj = step("Tạo dự án", lambda: ok(call("POST", "/projects", {"name": f"Test thực tế {time.strftime('%H:%M')}",
                                                                    "product_name": "Sản phẩm test", "target_count": 6})))
    pid = proj["id"]
    S["assets"] = []
    for v in videos:
        def imp(v=v):
            raw, ct = multipart({"project_id": pid, "rights": "own_footage"}, "file", v)
            a = ok(call("POST", "/assets/import", raw=raw, ctype=ct))
            m = a["meta_json"]
            S["assets"].append(a)
            return f"{v.name}: {m.get('video_codec')} {m.get('width')}x{m.get('height')} {m.get('fps')}fps " \
                   f"{m.get('duration_ms')}ms aspect={m.get('aspect')} rot={m.get('rotation')} thumb={bool(m.get('thumbnail'))}"
        step(f"Nhập {v.name}", imp)
    def expect_error(status, raw_ct):
        st, b = call("POST", "/assets/import", raw=raw_ct[0], ctype=raw_ct[1])
        if st != status:
            raise AssertionError(f"HTTP {st}: {b}")
        return b["error"]["code"]
    if videos:
        step("Chặn nhập trùng (SHA-256)", lambda: expect_error(409, multipart({"project_id": pid}, "file", videos[0], "copy.mov")))
    bad = Path("/tmp") / f"avf_bad_{uuid.uuid4().hex[:6]}.mp4"
    bad.write_bytes(b"\x00" * 2048)
    step("Báo lỗi file hỏng", lambda: expect_error(400, multipart({"project_id": pid}, "file", bad)))
    bad.unlink(missing_ok=True)
    if folder:
        step("Nhập từ thư mục (không copy)", lambda: (lambda r: f"{len(r['imported'])} file, {len(r['errors'])} lỗi")(
            ok(call("POST", "/assets/import-path", {"project_id": pid, "path": str(folder), "copy_files": False}))))
    step("Proxy + waveform", lambda: wait_jobs())
    assets = ok(call("GET", "/assets", params=f"?project_id={pid}"))
    step("Proxy tồn tại cho mọi video", lambda: (lambda miss: f"{len(assets)} asset" if not miss else
                                                 (_ for _ in ()).throw(AssertionError(f"thiếu proxy: {miss}")))(
        [a["file_name"] for a in assets if a["media_type"] == "video" and not (a["meta_json"] or {}).get("proxy")]))
    for a in S["assets"]:
        step(f"Gửi phân tích {a['file_name']}", lambda a=a: ok(call("POST", "/analysis/jobs", {"asset_id": a["id"]}))["id"])
    step("Phân tích xong", lambda: wait_jobs())
    for a in S["assets"]:
        def chk(a=a):
            d = ok(call("GET", f"/assets/{a['id']}"))
            an = d["meta_json"].get("analysis", {})
            if not d["scenes"]:
                raise AssertionError("0 cảnh")
            q = [s["quality_json"].get("score") for s in d["scenes"]]
            return f"{len(d['scenes'])} cảnh, chất lượng {q}, audio={an.get('audio')}, asr={an.get('asr')}, " \
                   f"ocr={[s['ocr_text'][:20] for s in d['scenes'] if s['ocr_text']][:3]}"
        step(f"Kết quả phân tích {a['file_name']}", chk)
    scenes = ok(call("GET", "/scenes", params=f"?project_id={pid}"))
    if scenes:
        s0 = scenes[0]
        mid = (s0["start_ms"] + s0["end_ms"]) // 2
        sp = step("Tách cảnh", lambda: ok(call("POST", f"/scenes/{s0['id']}/split", params=f"?at_ms={mid}")))
        if sp:
            step("Gộp cảnh", lambda: ok(call("POST", "/scenes/merge", [sp[0]["id"], sp[1]["id"]]))["end_ms"])
    scenes = ok(call("GET", "/scenes", params=f"?project_id={pid}"))
    tagsets = [["packshot", "close_up", "face"], ["demonstration", "hand", "presenter"], ["face", "presenter"],
               ["cta", "packshot", "face"]]
    step("Gắn nhãn + duyệt cảnh", lambda: [ok(call("PATCH", f"/scenes/{s['id']}", {
        "tags_json": sorted(set(s["tags_json"]) | set(tagsets[i % 4])), "review": "approved"})) for i, s in enumerate(scenes)]
         and f"{len(scenes)} cảnh")

    prod = ok(call("GET", "/products", params=f"?project_id={pid}"))[0]
    step("Cập nhật Product Brain", lambda: ok(call("PUT", f"/products/{prod['id']}", {"sku": "TEST-01", "attributes_json": {
        "category": "Đào tạo AI", "short_description": "Khoá học ứng dụng AI cho doanh nghiệp",
        "usp": "Học qua dự án thực tế", "usage": "Học trực tuyến theo lộ trình 8 tuần",
        "allowed_cta": "Đăng ký tư vấn", "blocked_phrases": ["cam kết thu nhập"]}}))["product"]["version"])
    ev = step("Thêm bằng chứng", lambda: ok(call("POST", f"/products/{prod['id']}/evidence", {"title": "Đề cương khoá học v2"})))
    step("Từ chối claim approved thiếu bằng chứng (422)", lambda: ok(call("POST", f"/products/{prod['id']}/claims",
                                                                          {"text": "x", "status": "approved"}), 422)["error"]["code"])
    for t in ["Khoá học gồm 8 tuần học trực tuyến", "Học viên thực hành trên dự án thực tế",
              "Có buổi hỏi đáp trực tiếp mỗi tuần"]:
        step(f"Claim: {t[:30]}", lambda t=t: ok(call("POST", f"/products/{prod['id']}/claims",
                                                     {"text": t, "status": "approved", "evidence_id": ev["id"]}))["id"][:8])
    step("Claim bị cấm", lambda: ok(call("POST", f"/products/{prod['id']}/claims",
                                         {"text": "Cam kết thu nhập 100 triệu sau khoá học", "status": "prohibited"}))["id"][:8])
    faq = step("Thêm FAQ", lambda: ok(call("POST", f"/products/{prod['id']}/faqs", {"q": "Học bao lâu?", "a": "8 tuần."})))
    if faq:
        step("Sửa FAQ", lambda: ok(call("PUT", f"/faqs/{faq['id']}", {"a": "Khoảng 8 tuần."}))["a"])
    step("Audit Product Brain", lambda: ok(call("GET", f"/products/{prod['id']}"))["audit"])

    camp = ok(call("GET", "/campaigns", params=f"?project_id={pid}"))[0]
    cid = camp["id"]
    step("Lưu chiến lược", lambda: ok(call("PUT", f"/campaigns/{cid}", {"target_count": 6, "brief_json": {
        **camp["brief_json"], "product_id": prod["id"], "creative_angles": ["how_to", "faq", "qa", "tips", "mistakes", "checklist"],
        "audiences": ["new_buyers", "busy_professionals"], "durations_sec": [15, 30], "formats": ["full"], "aspect": "9:16"}}))
         ["scene_count"])
    step("Lập ma trận", lambda: ok(call("POST", f"/campaigns/{cid}/variants/generate")))
    vs = ok(call("GET", f"/campaigns/{cid}/variants"))["items"]
    step("Xuất CSV ma trận", lambda: len(ok(call("GET", f"/campaigns/{cid}/variants.csv")).splitlines()))
    step("Sinh kịch bản hàng loạt (LLM)", lambda: ok(call("POST", f"/campaigns/{cid}/scripts/generate", {"use_llm": True})))
    step("Kịch bản xong", lambda: wait_jobs())
    vs = ok(call("GET", f"/campaigns/{cid}/variants"))["items"]
    for v in vs:
        step(f"Kịch bản {v['code']}", lambda v=v: f"{v['script']['engine']} flags={v['script']['flags']} "
                                                f"~{v['script']['est_seconds']}s hook={v['script']['hook']}" if v["script"]
             else (_ for _ in ()).throw(AssertionError("không có kịch bản")))
    if vs:
        v0 = vs[0]
        full = ok(call("GET", f"/variants/{v0['id']}"))["script_full"]
        beats = full["beats_json"]["beats"]
        bad_beats = beats + [{"type": "body", "text": "Cam kết thu nhập 100 triệu", "claim_ids": []}]
        step("Claim gate chặn câu cấm khi sửa tay", lambda: ok(call("PUT", f"/variants/{v0['id']}/script",
                                                                    {"beats": bad_beats}))["status"] == "blocked" or
             (_ for _ in ()).throw(AssertionError("không bị chặn")))
        step("Duyệt kịch bản bị chặn (409)", lambda: ok(call("POST", f"/variants/{v0['id']}/script/approve"), 409)["error"]["code"])
        step("Sửa lại kịch bản hợp lệ", lambda: ok(call("PUT", f"/variants/{v0['id']}/script", {"beats": beats}))["version"])
        step("Lịch sử phiên bản", lambda: len(ok(call("GET", f"/variants/{v0['id']}/scripts"))))
        if len(vs) > 1:
            step("So sánh 2 biến thể", lambda: {k: v for k, v in ok(call("GET", "/variants/compare",
                                                                        params=f"?a={vs[0]['id']}&b={vs[1]['id']}")).items()
                                                if k not in ("a", "b")})
    approved = []
    for v in vs:
        r = call("POST", f"/variants/{v['id']}/script/approve")
        if r[0] == 200:
            approved.append(v)
        else:
            print(f"   (không duyệt được {v['code']}: {r[1]['error']['code']} {r[1]['error']['message'][:80]})")
    step("Duyệt kịch bản", lambda: f"{len(approved)}/{len(vs)}")
    for v in approved:
        step(f"Storyboard {v['code']}", lambda v=v: (lambda sb: f"{len(sb['timeline_json']['tracks']['video'])} clip, "
                                                    f"gaps={[g['code'] for g in sb['timeline_json']['gaps']]}")(
            ok(call("POST", f"/variants/{v['id']}/storyboard"))))
    if approved:
        va = approved[0]
        tl = ok(call("GET", f"/variants/{va['id']}"))["storyboard"]["timeline_json"]
        tl["tracks"]["video"][0]["motion"] = "pan_left"
        tl["tracks"]["titles"].append({"start_ms": 0, "end_ms": 1500, "text": "Tiêu đề test", "style": "hook"})
        step("Lưu timeline chỉnh tay", lambda: ok(call("PUT", f"/variants/{va['id']}/timeline", tl))["version"])
        step("Từ chối timeline sai schema", lambda: ok(call("PUT", f"/variants/{va['id']}/timeline", {"x": 1}), 400)["error"]["code"])
        step("Nghe thử giọng", lambda: (lambda r: f"{r['duration_ms']}ms, {len(r['words'])} từ, '{r['normalized'][:50]}'")(
            ok(call("POST", "/voice/preview", {"text": "Giá 299.000đ cho 30ml, giảm 10%.", "settings": {"rate": 1.1}}))))
    for v in approved:
        call("POST", f"/variants/{v['id']}/voice")
    step("Tạo giọng đọc", lambda: wait_jobs())
    for v in approved:
        call("POST", f"/variants/{v['id']}/preview")
    step("Render preview", lambda: wait_jobs())
    jobs = ok(call("GET", "/render/jobs", params=f"?campaign_id={cid}&size=100"))["items"]
    failed = [j for j in jobs if j["status"] == "FAILED"]
    step("Không job nào lỗi", lambda: f"{len(jobs)} job" if not failed else
         (_ for _ in ()).throw(AssertionError([(j["kind"], j["code"], j["error_code"], j["error_message"]) for j in failed])))
    qc_ok = []
    for v in approved:
        def qc(v=v):
            d = ok(call("GET", f"/variants/{v['id']}"))
            q = d["qc_full"]
            if not q:
                raise AssertionError(f"chưa có QC, status={d['status']}")
            c = q["checks_json"]
            if q["severity"] != "critical":
                qc_ok.append(v)
            return f"{d['status']} sev={q['severity']} " + ", ".join(f"{k}={c[k].get('status')}" for k in c if isinstance(c[k], dict)
                                                                    and "status" in c[k])
        step(f"QC {v['code']}", qc)
    if qc_ok:
        step("Duyệt QC (accept)", lambda: ok(call("POST", f"/variants/{qc_ok[0]['id']}/approval", {"decision": "accept"}))["status"])
    if len(approved) > 1:
        step("Gửi chỉnh sửa (revise)", lambda: ok(call("POST", f"/variants/{approved[-1]['id']}/approval",
                                                       {"decision": "revise", "reason": "test"}))["status"])
    if len(qc_ok) > 1:
        step("Duyệt hàng loạt", lambda: ok(call("POST", "/variants/bulk-approval", {"variant_ids": [v["id"] for v in qc_ok[1:]],
                                                                                    "decision": "waive", "reason": "smoke"})))
    key = uuid.uuid4().hex
    b = step("Tạo batch render final", lambda: ok(call("POST", "/render/batches", {"campaign_id": cid, "idempotency_key": key})))
    step("Batch idempotent", lambda: ok(call("POST", "/render/batches", {"campaign_id": cid, "idempotency_key": key}))["idempotent"])
    if b and b["queued"]:
        time.sleep(3)
        j = next((x for x in ok(call("GET", "/render/jobs", params=f"?kind=final&campaign_id={cid}"))["items"]
                  if x["status"] in ("PENDING", "PREPARING", "RENDERING")), None)
        if j:
            step("Tạm dừng job", lambda: ok(call("POST", f"/render/jobs/{j['id']}/actions", {"action": "pause"}))["status"])
            time.sleep(2)
            step("Tiếp tục job", lambda: ok(call("POST", f"/render/jobs/{j['id']}/actions", {"action": "resume"}))["status"])
    step("Render final xong", lambda: wait_jobs())
    lib = [r for r in ok(call("GET", "/library", params=f"?project_id={pid}"))]
    step("Thư viện có video final", lambda: [(r["code"], r["exists"], r["manifest_json"].get("encoder"),
                                              r["manifest_json"].get("resolution")) for r in lib] or
         (_ for _ in ()).throw(AssertionError("thư viện trống")))
    if lib:
        step("Xuất gói", lambda: ok(call("POST", "/exports", {"variant_ids": [r["variant_id"] for r in lib]})))
        csv = "code,platform,date,views,watch_time,hold_3s,completion,ctr,conversions,post_url\n" + "\n".join(
            f"{r['code']},tiktok,2026-11-0{i + 1},{1000 * (i + 1)},{12 + i},0.4,0.2,0.03,{i},https://example.com/{i}"
            for i, r in enumerate(lib))
        p = Path("/tmp") / f"avf_metrics_{uuid.uuid4().hex[:6]}.csv"
        p.write_text(csv)
        raw, ct = multipart({"campaign_id": cid}, "file", p)
        step("Nhập CSV hiệu suất", lambda: ok(call("POST", "/metrics/import", raw=raw, ctype=ct)))
        p.unlink(missing_ok=True)
        step("Phân tích hiệu suất", lambda: (lambda t: t if t["published"] == len(lib) else
                                             (_ for _ in ()).throw(AssertionError(t)))(
            ok(call("GET", "/analytics", params=f"?campaign_id={cid}"))["totals"]))
    step("Template: tạo + sửa", lambda: (lambda t: ok(call("PUT", f"/templates/{t['id']}", {"name": "Test v2", "category": "Custom"}))
                                         ["version"])(ok(call("POST", "/templates", {"name": "Test", "template_json": {}}))))
    step("Brand kit: lưu", lambda: len(ok(call("PUT", "/brands", {"name": "Brand test", "primary": "#FF5CA8", "caption": {}}))["kits"]))
    step("Đổi Product Brain sau khoá → rà soát (TC-020)", lambda: (lambda d: f"v{d['product']['version']}")(
        ok(call("PUT", f"/products/{prod['id']}", {"attributes_json": {"usp": "Đổi USP"}}))))
    step("Phần cứng", lambda: ok(call("GET", "/system/hardware"))["static"]["hw_encoders"])
    step("Mô hình", lambda: [(m["kind"], m["installed"]) for m in ok(call("GET", "/models"))["models"]])
    step("Test model", lambda: ok(call("POST", "/models/test"), 200)["results"])
    step("Benchmark", lambda: (ok(call("POST", "/system/benchmark")), time.sleep(1))[0])
    step("Sao lưu CSDL", lambda: ok(call("POST", "/system/backup"))["backup"][-30:])
    step("Dung lượng", lambda: ok(call("GET", "/system/storage")))
    step("Log", lambda: len(ok(call("GET", "/system/logs", params="?name=worker"))["lines"]))
    print("\n==== TỔNG KẾT ====")
    for n, passed, info in RESULTS:
        if not passed:
            print("FAIL", n, "→", info)
    print(f"{sum(1 for r in RESULTS if r[1])}/{len(RESULTS)} PASS · project {pid}")


if __name__ == "__main__":
    args = sys.argv[1:]
    folder = None
    if "--folder" in args:
        i = args.index("--folder")
        folder = Path(args[i + 1])
        args = args[:i] + args[i + 2:]
    main([Path(a) for a in args], folder)
