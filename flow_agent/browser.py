"""Tiện ích Playwright dùng chung: hồ sơ trình duyệt bền (đăng nhập 1 lần), bấm nút theo nhiều nhãn, chụp lỗi."""
from __future__ import annotations

import logging
import re
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Sequence

log = logging.getLogger(__name__)


# Có thể đặt qua biến môi trường: FLOWAGENT_BROWSER_CHANNEL=chrome (dùng Google Chrome thật — khuyên dùng,
# vì Google hay chặn đăng nhập trên Chromium tự động) hoặc FLOWAGENT_BROWSER_PATH=/đường/dẫn/chrome
@contextmanager
def persistent_context(profile_dir: Path, headless: bool = False, locale: str = "vi-VN",
                       downloads_dir: Path | None = None) -> Iterator["object"]:
    import os

    from playwright.sync_api import sync_playwright

    profile_dir.mkdir(parents=True, exist_ok=True)
    extra: dict = {}
    if os.environ.get("FLOWAGENT_BROWSER_PATH"):
        extra["executable_path"] = os.environ["FLOWAGENT_BROWSER_PATH"]
    elif os.environ.get("FLOWAGENT_BROWSER_CHANNEL"):
        extra["channel"] = os.environ["FLOWAGENT_BROWSER_CHANNEL"]
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(profile_dir),
            headless=headless,
            locale=locale,
            viewport={"width": 1280, "height": 900},
            accept_downloads=True,
            downloads_path=str(downloads_dir) if downloads_dir else None,
            args=["--disable-blink-features=AutomationControlled"],
            **extra,
        )
        try:
            yield ctx
        finally:
            ctx.close()


def _label_regex(labels: Sequence[str]) -> re.Pattern:
    return re.compile("|".join(re.escape(x) for x in labels), re.IGNORECASE)


def click_any(page, labels: Sequence[str], timeout_ms: int = 8000, roles: Sequence[str] = ("button", "menuitem", "radio", "option", "link")) -> bool:
    """Bấm phần tử đầu tiên khớp một trong các nhãn (theo role/aria-label/text). Trả về True nếu bấm được."""
    rx = _label_regex(labels)
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        candidates = [page.get_by_role(r, name=rx) for r in roles]
        candidates += [page.locator(f'[aria-label*="{lbl}" i]') for lbl in labels]
        candidates += [page.get_by_text(rx)]
        for loc in candidates:
            try:
                n = loc.count()
                for i in range(n):
                    el = loc.nth(i)
                    if el.is_visible() and el.is_enabled():
                        el.click()
                        return True
            except Exception:  # noqa: BLE001 — giao diện thay đổi liên tục, thử ứng viên tiếp theo
                continue
        page.wait_for_timeout(400)
    return False


def debug_shot(page, out_dir: Path, name: str) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{time.strftime('%Y%m%d-%H%M%S')}-{name}.png"
    try:
        page.screenshot(path=str(path), full_page=False)
    except Exception:  # noqa: BLE001
        pass
    return path


def export_netscape_cookies(context, path: Path, domain_filter: str = "facebook.com") -> Path:
    """Xuất cookie của hồ sơ trình duyệt sang định dạng Netscape cho yt-dlp."""
    lines = ["# Netscape HTTP Cookie File"]
    for c in context.cookies():
        if domain_filter not in c.get("domain", ""):
            continue
        domain = c["domain"]
        include_sub = "TRUE" if domain.startswith(".") else "FALSE"
        expires = int(c.get("expires", 0) or 0)
        if expires < 0:
            expires = 0
        lines.append("\t".join([domain, include_sub, c.get("path", "/"), "TRUE" if c.get("secure") else "FALSE",
                                str(expires), c["name"], c["value"]]))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    path.chmod(0o600)
    return path


def wait_for_user(page, message: str, timeout_s: int = 600, done_check=None) -> bool:
    """Ở chế độ có giao diện: chờ người dùng thao tác tay (đăng nhập/xác minh) rồi tiếp tục."""
    log.warning(message)
    print(f"\n>>> {message}\n>>> Agent sẽ tự tiếp tục khi xong (tối đa {timeout_s // 60} phút).")
    end = time.time() + timeout_s
    while time.time() < end:
        if done_check and done_check():
            return True
        page.wait_for_timeout(2000)
    return False
