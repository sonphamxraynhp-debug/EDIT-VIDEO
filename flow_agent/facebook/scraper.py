"""Quét video trên một trang Facebook (cá nhân hoặc fanpage) bằng trình duyệt đã đăng nhập."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from ..browser import wait_for_user
from .parse import canonical_video_url, channel_tab_urls, extract_stats, parse_count

log = logging.getLogger(__name__)

# JS: thu thập mọi link video + chữ hiển thị trong ô lưới (ô reels thường hiện số lượt phát)
_COLLECT_JS = r"""
() => {
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.href;
    if (!/\/reel\/\d|\/videos\/|watch\/?\?v=|\/watch\/\?v=/.test(h)) continue;
    let tile = a; for (let i = 0; i < 3 && tile.parentElement; i++) tile = tile.parentElement;
    out.push({href: h, text: (a.innerText || '') + ' | ' + (a.getAttribute('aria-label') || ''), tile: tile.innerText || ''});
  }
  return out;
}
"""


@dataclass
class VideoItem:
    url: str
    grid_views: int | None = None
    caption: str = ""
    stats: dict = field(default_factory=dict)


def is_logged_in(page) -> bool:
    try:
        return page.locator('[aria-label="Facebook"], [role="navigation"]').count() > 0 and \
            page.locator('input[name="email"]').count() == 0
    except Exception:  # noqa: BLE001
        return False


def ensure_login(page, headless: bool) -> None:
    page.goto("https://www.facebook.com/", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    if is_logged_in(page):
        return
    if headless:
        raise RuntimeError("Chưa đăng nhập Facebook. Chạy `flowagent login facebook` (có giao diện) trước.")
    ok = wait_for_user(page, "Hãy đăng nhập Facebook trong cửa sổ trình duyệt vừa mở.",
                       done_check=lambda: is_logged_in(page))
    if not ok:
        raise RuntimeError("Hết thời gian chờ đăng nhập Facebook.")


def collect_videos(page, channel_url: str, scroll_rounds: int = 40, max_items: int | None = None) -> list[VideoItem]:
    found: dict[str, VideoItem] = {}
    for tab in channel_tab_urls(channel_url):
        log.info("Quét tab %s", tab)
        page.goto(tab, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        stagnant = 0
        for _ in range(scroll_rounds):
            before = len(found)
            for item in page.evaluate(_COLLECT_JS):
                url = canonical_video_url(item["href"])
                if not url:
                    continue
                views = parse_count(item["text"]) if any(ch.isdigit() for ch in item["text"]) else None
                if views is None:
                    views = extract_stats(item["tile"]).get("views")
                cur = found.get(url)
                if cur is None:
                    found[url] = VideoItem(url=url, grid_views=views)
                elif views and not cur.grid_views:
                    cur.grid_views = views
            if max_items and len(found) >= max_items:
                break
            page.mouse.wheel(0, 2500)
            page.wait_for_timeout(1500)
            stagnant = stagnant + 1 if len(found) == before else 0
            if stagnant >= 4:
                break
    items = list(found.values())
    return items[:max_items] if max_items else items


def fetch_details(page, url: str) -> VideoItem:
    """Mở trang video, lấy caption + view/cảm xúc/bình luận/chia sẻ."""
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(3500)
    caption = ""
    for sel in ['meta[property="og:description"]', 'meta[name="description"]', 'meta[property="og:title"]']:
        try:
            v = page.locator(sel).first.get_attribute("content", timeout=1500)
            if v:
                caption = v
                break
        except Exception:  # noqa: BLE001
            continue
    try:
        body = page.inner_text("body", timeout=5000)
    except Exception:  # noqa: BLE001
        body = ""
    stats = extract_stats(body)
    return VideoItem(url=url, caption=caption, stats=stats, grid_views=stats.get("views"))
