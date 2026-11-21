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
