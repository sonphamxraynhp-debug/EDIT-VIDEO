"""Tạo clip trên Google Flow (labs.google/fx/tools/flow) bằng trình duyệt đã đăng nhập tài khoản Google.

Google Flow không có API công khai nên agent điều khiển giao diện web. Giao diện có thể thay đổi:
mọi nhãn nút đều chỉnh được trong config (video.flow.selectors). Khi một bước không tự làm được ở chế độ
có giao diện, agent dừng lại chờ bạn thao tác tay rồi tiếp tục.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path

from ..browser import click_any, debug_shot, persistent_context, wait_for_user

log = logging.getLogger(__name__)

_VIDEO_SRCS_JS = "() => Array.from(document.querySelectorAll('video')).map(v => v.currentSrc || v.src).filter(Boolean)"


class FlowError(RuntimeError):
    pass


class FlowBrowser:
    def __init__(self, cfg, debug_dir: Path):  # noqa: ANN001
        self.cfg = cfg
        self.sel = cfg.get_path("video.flow.selectors", {})
        self.url = cfg.get_path("video.flow.url")
        self.headless = bool(cfg.get_path("video.flow.headless", False))
        self.timeout = int(cfg.get_path("video.flow.generation_timeout_sec", 900))
        self.debug_dir = debug_dir
        self._cm = None
        self.page = None

    # ------------------------------------------------------------------ vòng đời
    def __enter__(self) -> "FlowBrowser":
        self._cm = persistent_context(self.cfg.path("video.flow.browser_profile_dir"), self.headless)
        bctx = self._cm.__enter__()
        self.context = bctx
        self.page = bctx.new_page()
        self._open()
        return self

    def __exit__(self, *exc) -> None:  # noqa: ANN002
        if self._cm:
            self._cm.__exit__(*exc)

    def _prompt_box(self):
        return self.page.locator(self.sel.get("prompt_box", "textarea")).first

    def _open(self) -> None:
        page = self.page
        page.goto(self.url, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        if "accounts.google.com" in page.url:
            if self.headless:
                raise FlowError("Chưa đăng nhập Google. Chạy `flowagent login flow` trước.")
            wait_for_user(page, "Hãy đăng nhập tài khoản Google (có gói dùng Flow) trong cửa sổ trình duyệt.",
                          done_check=lambda: "labs.google" in page.url)
        click_any(page, self.sel.get("new_project", ["New project"]), timeout_ms=10000)
        page.wait_for_timeout(4000)
        try:
            self._prompt_box().wait_for(timeout=30000)
        except Exception as exc:  # noqa: BLE001
            shot = debug_shot(page, self.debug_dir, "flow-open")
            raise FlowError(f"Không thấy ô nhập prompt trên Flow (ảnh lỗi: {shot})") from exc

    # ------------------------------------------------------------------ tạo 1 clip
    def generate_clip(self, prompt: str, out_path: Path) -> Path:
        page = self.page
        before = set(page.evaluate(_VIDEO_SRCS_JS))
        box = self._prompt_box()
        box.click()
        box.fill(prompt)
        page.wait_for_timeout(500)
        if not click_any(page, self.sel.get("generate", ["Create", "Generate"]), timeout_ms=6000):
            box.press("Enter")

        deadline = time.time() + self.timeout
        new_src = None
        while time.time() < deadline:
            page.wait_for_timeout(5000)
            srcs = [s for s in page.evaluate(_VIDEO_SRCS_JS) if s not in before]
            if srcs:
                new_src = srcs[0]
                break
            if page.get_by_text("policy", exact=False).count() and page.get_by_text("violat", exact=False).count():
                raise FlowError("Flow từ chối prompt vì chính sách nội dung.")
        if not new_src:
            shot = debug_shot(page, self.debug_dir, "flow-timeout")
            raise FlowError(f"Quá thời gian chờ Flow tạo clip (ảnh lỗi: {shot})")

        page.wait_for_timeout(3000)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        if new_src.startswith("http"):
            resp = self.context.request.get(new_src, timeout=180000)
            if resp.ok:
                out_path.write_bytes(resp.body())
                return out_path
        return self._download_via_ui(new_src, out_path)

    def _download_via_ui(self, src: str, out_path: Path) -> Path:
        page = self.page
        video = page.locator(f'video[src="{src}"]').first
        try:
            video.hover()
        except Exception:  # noqa: BLE001
            pass
        with page.expect_download(timeout=180000) as dl:
            if not click_any(page, self.sel.get("download", ["Download"]), timeout_ms=10000):
                raise FlowError("Không thấy nút tải xuống clip trên Flow")
            page.wait_for_timeout(800)
            click_any(page, self.sel.get("download_quality", ["Original size", "720p"]), timeout_ms=5000)
        dl.value.save_as(str(out_path))
        return out_path
