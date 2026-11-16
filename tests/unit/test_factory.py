"""Sản xuất hàng loạt: sản phẩm, bộ kênh, nhập bảng tính, hàng đợi."""
import io
import subprocess
import zipfile

from fastapi.testclient import TestClient

from avf import config, factory, main, news

client = TestClient(main.app)
API = main.API


def _image(path):
    subprocess.run([config.FFMPEG, "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x240", "-frames:v", "1", str(path)], check=True)


def test_table_headers_accept_vietnamese_with_or_without_accents():
    rows = factory.parse_table("a.csv", "\ufeffTên;Mô tả;Giá;Thư mục hình;Số bản\nÁo thun;Vải mát;99k;/x;3\n;;;;\n".encode())
    assert rows == [{"name": "Áo thun", "description": "Vải mát", "points": "", "price": "99k", "offer": "", "link": "",
                     "folder": "/x", "kind": "", "variants": "3", "platform": ""}]
    assert factory.parse_table("mau.csv", ("\ufeff" + factory.TEMPLATE).encode())[0]["variants"] == "3"      # file mẫu tự đọc lại được
    assert client.post(f"{API}/factory/import", files={"file": ("a.csv", b"Mo ta\nabc\n")}).status_code == 422   # thiếu cột Tên


def test_xlsx_is_read_without_extra_library():
    sheet = ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
             '<row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
             '<row><c r="A2" t="inlineStr"><is><t>Bình giữ nhiệt</t></is></c><c r="B2"><v>3.0</v></c></row></sheetData></worksheet>')
    shared = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Tên</t></si><si><t>Số bản</t></si></sst>'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("xl/sharedStrings.xml", shared)
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    r = factory.parse_table("a.xlsx", buf.getvalue())[0]
    assert r["name"] == "Bình giữ nhiệt" and r["variants"] == "3"


def test_import_creates_product_and_sale_draft_and_reports_bad_rows(tmp_path, monkeypatch):
    monkeypatch.setattr(factory, "enqueue", lambda ids, variants=1: [])
    (tmp_path / "sp").mkdir()
    _image(tmp_path / "sp" / "a.png")
    (tmp_path / "sp" / "ghi-chu.txt").write_text("x")
    rows = [{"name": "Bình giữ nhiệt", "description": "Giữ nóng lâu", "points": "Nhẹ; Bền", "price": "199.000đ", "offer": "", "link": "https://x.vn/b",
             "folder": str(tmp_path / "sp"), "kind": "", "variants": "3", "platform": "Shopee Video"},
            {"name": "Thiếu hình", "description": "", "points": "", "price": "", "offer": "", "link": "", "folder": str(tmp_path / "khong-co"),
             "kind": "", "variants": "", "platform": ""}]
    r = factory.import_rows(rows)
    assert len(r["created"]) == 1 and r["created"][0]["variants"] == 3 and r["errors"][0]["row"] == 3
    it = news.load(r["created"][0]["nid"])
    assert it["kind"] == "sale" and it["platform"] == "shopee" and it["price"] == "199.000đ" and it["link"] == "https://x.vn/b"
    assert "Bình giữ nhiệt" in it["source_text"] and "Nhẹ" in it["source_text"] and len(it["media"]) == 1 and it["media"][0]["shared"]
    pid = it["product_id"]
    assert client.delete(f"{API}/factory/products/{pid}").status_code == 409             # đang có video dùng hình
    client.delete(f"{API}/news/{it['id']}/media/{it['media'][0]['id']}")                 # gỡ hình mượn khỏi tin...
    assert len(factory.product(pid)["media"]) == 1 and __import__("pathlib").Path(factory.product(pid)["media"][0]["path"]).is_file()   # ...file gốc còn nguyên
    two = client.post(f"{API}/factory/products/{pid}/videos", json={"count": 2, "enqueue": False}).json()["items"]
    assert len(two) == 2 and two[0]["angle"] != two[1]["angle"] and two[0]["angle"]      # mỗi video một góc nội dung
    for x in [it, *two]:
        client.delete(f"{API}/news/{x['id']}")
    assert client.delete(f"{API}/factory/products/{pid}").json()["ok"] is True


def test_profile_saves_channel_look_and_applies_to_item():
    it = client.post(f"{API}/news", json={}).json()
    p = client.post(f"{API}/factory/profiles", json={"name": "Kênh gia dụng", "channel": "Nhà Gọn", "theme": "orange", "style": "overlay",
                                                     "platform": "facebook", "music": "/etc/passwd", "voice": {"mode": "os"}}).json()
    assert p["theme"] == "orange" and p["music"] is None                                  # giá trị lạ bị loại như khi sửa tin
    r = client.post(f"{API}/news/{it['id']}/profile/{p['id']}").json()
    assert (r["channel"], r["theme"], r["style"], r["platform"], r["profile_id"]) == ("Nhà Gọn", "orange", "overlay", "facebook", p["id"])
    assert client.post(f"{API}/factory/profiles", json={"name": ""}).status_code == 422
    assert client.delete(f"{API}/factory/profiles/{p['id']}").json()["ok"] is True
    client.delete(f"{API}/news/{it['id']}")


def test_queue_orders_jobs_skips_duplicates_and_survives_restart(monkeypatch):
    client.post(f"{API}/factory/queue/pause")
    client.post(f"{API}/factory/queue/clear")
    a, b = (client.post(f"{API}/news", json={"headline": f"Tin {i}"}).json()["id"] for i in (1, 2))
    q = client.post(f"{API}/factory/queue", json={"ids": [a, b, a], "variants": 9}).json()["queue"]
    mine = [j for j in q["jobs"] if j["nid"] in (a, b)]
    assert [j["nid"] for j in mine] == [a, b] and mine[0]["variants"] == news.MAX_VARIANTS and q["paused"]
    factory._set_job(mine[0]["id"], status="running")
    factory.start()                                                                        # mở lại app: việc chạy dở quay về hàng chờ
    assert next(j for j in factory.queue()["jobs"] if j["id"] == mine[0]["id"])["status"] == "waiting"
    done = []
    monkeypatch.setattr(news, "write_script", lambda nid: done.append(("write", nid)) or {**news.load(nid), "body": "x"})
    monkeypatch.setattr(news, "render", lambda nid: done.append(("render", nid)))
    factory.run_job({**mine[0], "variants": 1})
    assert done == [("write", a), ("render", a)]                                           # chưa có lời thì tự viết rồi mới dựng
    for j in mine:
        client.delete(f"{API}/factory/queue/{j['id']}")
    client.post(f"{API}/factory/queue/resume")
    for x in (a, b):
        client.delete(f"{API}/news/{x}")
