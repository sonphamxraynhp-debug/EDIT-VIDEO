"""Kiểm tra bộ thu thập link + bấm nút trên trang HTML giả lập (không truy cập Facebook/Flow thật)."""
import os
import shutil

import pytest

pw = pytest.importorskip("playwright.sync_api")

from flow_agent.browser import click_any, persistent_context  # noqa: E402
from flow_agent.facebook.parse import canonical_video_url, extract_stats, parse_count  # noqa: E402
from flow_agent.facebook.scraper import _COLLECT_JS  # noqa: E402

CHROME = os.environ.get("FLOWAGENT_BROWSER_PATH") or ("/opt/pw-browsers/chromium" if os.path.exists("/opt/pw-browsers/chromium") else None)

PAGE = """<html><body>
<div><div><div><a href="https://www.facebook.com/reel/111111111111?s=x" aria-label="Reel"><span>1,2K</span></a></div></div></div>
<div><div><div><a href="https://www.facebook.com/reel/222222222222/"><span></span></a><span>3,4 N lượt xem</span></div></div></div>
<a href="https://www.facebook.com/somepage/videos/333333333333/">Video dài</a>
<a href="https://www.facebook.com/somepage/photos/1">Ảnh</a>
<button aria-label="Chỉ mình tôi" onclick="document.body.dataset.privacy='only_me'">🔒</button>
</body></html>"""


@pytest.fixture
def page(tmp_path):
    if CHROME:
        os.environ.setdefault("FLOWAGENT_BROWSER_PATH", CHROME)
    try:
        with persistent_context(tmp_path / "profile", headless=True) as ctx:
            yield ctx.new_page()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Không mở được trình duyệt: {exc}")


def test_collect_and_click(page):
    page.set_content(PAGE)
    items = page.evaluate(_COLLECT_JS)
    urls = {canonical_video_url(i["href"]): i for i in items}
    assert set(urls) == {"https://www.facebook.com/reel/111111111111", "https://www.facebook.com/reel/222222222222",
                         "https://www.facebook.com/watch/?v=333333333333"}
    assert parse_count(urls["https://www.facebook.com/reel/111111111111"]["text"]) == 1200
    assert extract_stats(urls["https://www.facebook.com/reel/222222222222"]["tile"])["views"] == 3400
    assert click_any(page, ["Only me", "Chỉ mình tôi"], timeout_ms=3000)
    assert page.evaluate("document.body.dataset.privacy") == "only_me"
    assert not click_any(page, ["Nút không tồn tại"], timeout_ms=800)


def test_only_me_check_requires_only_me_and_no_public_button(page):
    from flow_agent.facebook.uploader import _only_me_shown

    page.set_content('<button aria-label="Đối tượng">🔒 Chỉ mình tôi</button><span>Đăng</span>')
    assert _only_me_shown(page)
    page.set_content('<button>🌐 Công khai</button><div>Chỉ mình tôi</div>')  # hộp thoại còn mở, vẫn đang Công khai
    assert not _only_me_shown(page)
    page.set_content('<button>👥 Bạn bè</button>')
    assert not _only_me_shown(page)


FAKE_FLOW = """<html><body>
<nav style="height:400px"><a href="create-tool/" onclick="document.body.dataset.wrong='tool'">Create tool</a>
  <button aria-label="Settings" onclick="document.body.dataset.wrong='gear'">⚙</button></nav>
<button id="np" onclick="document.getElementById('ed').style.display='block';this.remove()">New project</button>
<div id="ed" style="display:none">
  <div class="bar">
    <div id="box" contenteditable="true" role="textbox" style="width:400px;height:60px;border:1px solid"></div>
    <button onclick="document.getElementById('modes').style.display='block'">Create Image</button>
    <button onclick="document.getElementById('opt').style.display='block'"><i>tune</i></button>
    <button onclick="document.getElementById('f').click()"><i>add_photo_alternate</i></button>
    <input id="f" type="file" accept="image/*" style="display:none" onchange="addRef(this)">
    <span id="thumbs"></span>
    <button aria-label="Close">x</button><button onclick="gen()"><i>arrow_forward</i></button>
  </div>
  <div id="modes" style="display:none" role="menu">
    <div role="menuitem" onclick="document.body.dataset.mode='image'">Create Image</div>
    <div role="menuitem" onclick="document.body.dataset.mode='video'">Text to Video</div>
    <div role="menuitem" onclick="document.body.dataset.mode='ingredients'">Ingredients to Video</div></div>
  <div id="opt" style="display:none">
    <button role="combobox" onclick="document.getElementById('ar').style.display='block'">Aspect Ratio Landscape (16:9)</button>
    <div id="ar" style="display:none" role="listbox"><div role="option" onclick="document.body.dataset.aspect='16:9'">Landscape (16:9)</div>
      <div role="option" onclick="document.body.dataset.aspect='9:16'">Portrait (9:16)</div></div>
    <button role="combobox" onclick="document.getElementById('outs').style.display='block'">Outputs per prompt 2</button>
    <div id="outs" style="display:none" role="listbox"><div role="option" onclick="document.body.dataset.outputs='1'">1</div>
      <div role="option" onclick="document.body.dataset.outputs='2'">2</div></div></div>
  <div id="out"></div>
</div>
<script>
let n = 0;
function addRef(inp) {
  document.body.dataset.uploads = String(Number(document.body.dataset.uploads || 0) + 1);
  const im = document.createElement('img');
  im.src = '/clip.png'; im.width = 40; im.height = 40;
  document.getElementById('thumbs').appendChild(im);
}
async function gen() {
  document.body.dataset.prompt = document.getElementById('box').innerText;
  n += 1;
  await new Promise(r => setTimeout(r, 1200));
  const v = document.createElement('video');
  if (n === 1) { v.src = '/clip.mp4'; }
  else { const b = await (await fetch('/clip.mp4')).blob(); v.src = URL.createObjectURL(b); }
  document.getElementById('out').appendChild(v);
}
</script></body></html>"""


def test_flow_browser_end_to_end_on_fake_flow(tmp_path):
    import functools
    import http.server
    import subprocess
    import threading

    if not shutil.which("ffmpeg"):
        pytest.skip("cần ffmpeg")
    if CHROME:
        os.environ.setdefault("FLOWAGENT_BROWSER_PATH", CHROME)
    site = tmp_path / "site"
    site.mkdir()
    (site / "flow.html").write_text(FAKE_FLOW, encoding="utf-8")
    # Flow thật (flow.google.com) có trang "New tool" cũng có ô nhập: agent phải rời trang đó, không gõ vào
    (site / "project" / "p1" / "create-tool").mkdir(parents=True)
    (site / "project" / "p1" / "index.html").write_text(FAKE_FLOW, encoding="utf-8")
    (site / "project" / "p1" / "create-tool" / "index.html").write_text(
        '<textarea placeholder="Build a retro pixel effect app with a large upload drop zone"></textarea>', encoding="utf-8")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=24:duration=1",
                    "-pix_fmt", "yuv420p", str(site / "clip.mp4")], check=True)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    from flow_agent.config import load_config
    from flow_agent.producer.flow_browser import FlowBrowser

    cfg = load_config(tmp_path / "missing.yaml")
    cfg["data_dir"] = str(tmp_path / "data")
    cfg["video"]["flow"]["reference_dir"] = str(tmp_path / "khong-co-anh")   # không có ảnh/avatar -> Text to Video
    cfg["video"]["flow"]["reference_assets"] = []
    cfg["video"]["flow"].update({"url": f"http://127.0.0.1:{srv.server_port}/project/p1/create-tool/", "headless": True,
                                 "generation_timeout_sec": 20, "browser_profile_dir": str(tmp_path / "prof")})
    try:
        with FlowBrowser(cfg, tmp_path / "debug") as fb:
            assert fb.page.url.rstrip("/").endswith("/project/p1")  # đã rời trang "New tool"
            assert fb.page.evaluate("document.body.dataset.aspect") == "9:16"
            assert fb.page.evaluate("document.body.dataset.mode") == "video"     # đã chuyển từ tạo ảnh sang video
            assert fb.page.evaluate("document.body.dataset.outputs") == "1"      # 1 clip mỗi prompt
            a = fb.generate_clip("Doctor says hello", tmp_path / "a.mp4")      # src http
            b = fb.generate_clip("Doctor waves goodbye", tmp_path / "b.mp4")   # src blob:
            sent = fb.page.evaluate("document.body.dataset.prompt")
            assert sent.endswith("Doctor waves goodbye") and "rimless" in sent   # mô tả đúng ngoại hình bác sĩ
            assert not fb.page.evaluate("document.body.dataset.wrong")  # không bấm nhầm 'Create tool' hay bánh răng tài khoản
        assert (tmp_path / "debug" / "flow-ready-buttons.txt").exists()   # có file chẩn đoán giao diện
    finally:
        srv.shutdown()
    clip = (site / "clip.mp4").read_bytes()
    assert a.read_bytes() == clip and b.read_bytes() == clip


def test_flow_browser_uses_reference_images(tmp_path):
    """Có ảnh tham chiếu -> chọn 'Ingredients to Video', gắn ảnh 1 lần vào thanh prompt, prompt nhắc giữ đúng mặt."""
    import functools
    import http.server
    import threading

    if CHROME:
        os.environ.setdefault("FLOWAGENT_BROWSER_PATH", CHROME)
    site = tmp_path / "site"
    site.mkdir()
    (site / "flow.html").write_text(FAKE_FLOW, encoding="utf-8")
    (site / "clip.mp4").write_bytes(b"0" * 5000)
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4"
           b"\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82")
    (site / "clip.png").write_bytes(png)
    ref = tmp_path / "bac-si.png"
    ref.write_bytes(png)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    from flow_agent.config import load_config
    from flow_agent.producer.flow_browser import FlowBrowser

    cfg = load_config(tmp_path / "missing.yaml")
    cfg["data_dir"] = str(tmp_path / "data")
    cfg["video"]["flow"].update({"url": f"http://127.0.0.1:{srv.server_port}/flow.html", "headless": True,
                                 "generation_timeout_sec": 20, "browser_profile_dir": str(tmp_path / "prof"),
                                 "reference_images": [str(ref)], "reference_assets": []})
    try:
        with FlowBrowser(cfg, tmp_path / "debug") as fb:
            assert fb.refs == [ref]
            assert fb.page.evaluate("document.body.dataset.mode") == "ingredients"
            fb.generate_clip("Doctor says hello", tmp_path / "a.mp4")
            fb.generate_clip("Doctor waves", tmp_path / "b.mp4")
            assert fb.page.evaluate("document.body.dataset.uploads") == "1"   # ảnh còn trong thanh -> không gắn lại
            assert fb.page.evaluate("document.body.dataset.prompt").startswith("The doctor in this video is the real person")
    finally:
        srv.shutdown()


def test_reference_images_from_folder(tmp_path, monkeypatch):
    from flow_agent.config import load_config
    from flow_agent.producer.flow_browser import reference_images

    cfg = load_config(tmp_path / "missing.yaml")
    folder = tmp_path / "anh"
    folder.mkdir()
    for name in ("b.jpg", "a.PNG", "DOC_TOI.txt", "c.webp", "d.jpeg"):
        (folder / name).write_bytes(b"x")
    cfg["video"]["flow"]["reference_dir"] = str(folder)
    cfg["video"]["flow"].pop("reference_images", None)
    assert [p.name for p in reference_images(cfg)] == ["a.PNG", "b.jpg", "c.webp"]   # tối đa 3 ảnh, bỏ file chữ
    cfg["video"]["flow"]["reference_dir"] = str(tmp_path / "khong-co")
    assert reference_images(cfg) == []


def _noise_png(path, w=400, h=400):
    import random

    from PIL import Image

    im = Image.new("RGB", (w, h))
    im.putdata([(random.randrange(256), random.randrange(256), random.randrange(256)) for _ in range(w * h)])
    im.save(path)
    return path


def test_clean_avatar_crops_face_area():
    import io

    from PIL import Image

    from flow_agent.facebook.avatar import clean_avatar

    buf = io.BytesIO()
    Image.new("RGB", (300, 300), (4, 45, 97)).save(buf, "PNG")
    out = clean_avatar(buf.getvalue())
    assert out.width == 512 and out.height > out.width   # nửa trên ở giữa, phóng to cho Flow


def test_fetch_own_avatar_from_profile_page(tmp_path):
    import functools
    import http.server
    import threading

    from flow_agent.config import load_config
    from flow_agent.facebook.avatar import AVATAR_NAME, fetch_own_avatar

    if CHROME:
        os.environ.setdefault("FLOWAGENT_BROWSER_PATH", CHROME)
    site = tmp_path / "site"
    site.mkdir()
    _noise_png(site / "avatar.png")
    _noise_png(site / "cover.png", 900, 300)
    (site / "profile.html").write_text(
        '<img src="/cover.png" width="900" height="300">'
        '<a aria-label="Ảnh đại diện của Bác sĩ"><svg width="170" height="170"><image href="/avatar.png" '
        'width="170" height="170"/></svg></a>', encoding="utf-8")
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    cfg = load_config(tmp_path / "missing.yaml")
    cfg["own_channel"] = f"http://127.0.0.1:{srv.server_port}/profile.html"
    cfg["facebook"].update({"headless": True, "browser_profile_dir": str(tmp_path / "fb")})
    try:
        path = fetch_own_avatar(cfg, tmp_path / "anh")
    finally:
        srv.shutdown()
    assert path == tmp_path / "anh" / AVATAR_NAME and path.stat().st_size > 3000


def test_reference_image_drop_fallback_and_no_repeat_wait(tmp_path):
    """Không có ô chọn file/nút thêm ảnh: agent kéo-thả ảnh vào ô prompt. Thất bại hẳn thì không chờ lại ở cảnh sau."""
    from playwright.sync_api import sync_playwright

    from flow_agent.config import load_config
    from flow_agent.producer.flow_browser import DOCTOR_FALLBACK, FlowBrowser

    ref = _noise_png(tmp_path / "bs.png", 60, 60)
    cfg = load_config(tmp_path / "missing.yaml")
    cfg["video"]["flow"].update({"reference_images": [str(ref)], "headless": True, "reference_assets": []})
    fb = FlowBrowser(cfg, tmp_path / "debug")
    page_html = """<div style="height:300px"></div><div id="bar">
      <textarea id="box"></textarea><span id="th"></span><button>arrow_forward</button></div>
      <script>document.getElementById('bar').addEventListener('drop', e => { e.preventDefault();
        for (const f of e.dataTransfer.files) { const im = document.createElement('img');
          im.width = 40; im.height = 40; im.src = URL.createObjectURL(f); document.getElementById('th').appendChild(im); }
        document.body.dataset.dropped = e.dataTransfer.files[0].name; });</script>"""
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        fb.page = browser.new_page()
        fb.page.set_content(page_html)
        box = fb._find_prompt_box(2000)
        assert fb._ensure_refs(box) is True
        assert fb.page.evaluate("document.body.dataset.dropped") == "bs.png"
        fb.page.set_content("<textarea></textarea><button>arrow_forward</button>")   # Flow không nhận ảnh
        box = fb._find_prompt_box(2000)
        assert fb._ensure_refs(box) is False and fb._refs_failed
        assert fb._ensure_refs(box) is False   # lần sau trả về ngay, không thử/chờ lại
        browser.close()
    assert "glasses" in DOCTOR_FALLBACK


def test_picks_existing_flow_avatar_me(tmp_path):
    """Flow 2026: nút + trong thanh prompt mở thư viện tài sản; agent chọn avatar 'Me' có sẵn của bác sĩ."""
    from playwright.sync_api import sync_playwright

    from flow_agent.config import load_config
    from flow_agent.producer.flow_browser import FlowBrowser

    cfg = load_config(tmp_path / "missing.yaml")
    cfg["video"]["flow"].update({"reference_dir": str(tmp_path / "trong"), "headless": True})
    fb = FlowBrowser(cfg, tmp_path / "debug")
    assert fb.refs == [] and fb.ref_assets == ["Me"] and fb.use_refs
    html = """<div style="height:300px"><div id="panel" style="display:none">
        <div>Uploads</div><div>Avatars</div>
        <div onclick="const im=document.createElement('img');im.width=36;im.height=36;
          document.getElementById('th').appendChild(im);document.getElementById('panel').style.display='none'">
          <span>Me</span><span>Avatar</span></div></div></div>
      <div id="bar"><textarea></textarea><span id="th"></span>
        <button onclick="document.getElementById('panel').style.display='block'"><i>add</i></button>
        <button>arrow_forward</button></div>"""
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        fb.page = browser.new_page()
        fb.page.set_content(html)
        box = fb._find_prompt_box(2000)
        assert fb._ensure_refs(box) is True and fb._refs_attached(box) == 1
        browser.close()
