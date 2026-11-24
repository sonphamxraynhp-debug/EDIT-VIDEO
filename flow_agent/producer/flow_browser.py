"""Tạo clip trên Google Flow (flow.google.com, trước là labs.google/fx/tools/flow) bằng trình duyệt đã đăng nhập tài khoản Google.

Google Flow không có API công khai nên agent điều khiển giao diện web. Giao diện có thể thay đổi:
mọi nhãn nút đều chỉnh được trong config (video.flow.selectors). Ở chế độ có giao diện (mặc định), bước nào
agent không tự làm được thì nó DỪNG CHỜ bạn thao tác tay trong cửa sổ trình duyệt rồi tự làm tiếp — không bỏ cuộc.
"""
from __future__ import annotations

import base64
import logging
import re
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from ..browser import click_any, debug_shot, persistent_context, wait_for_user

log = logging.getLogger(__name__)

_VIDEO_SRCS_JS = "() => Array.from(document.querySelectorAll('video')).map(v => v.currentSrc || v.src).filter(Boolean)"
_BLOB_JS = """async (src) => {
  const buf = await (await fetch(src)).arrayBuffer();
  let s = ''; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}"""
PROMPT_BOX_DEFAULT = ["textarea", "[contenteditable='true']", "[role='textbox']", "input[type='text']"]
SETTINGS_DEFAULT = ["Settings", "Cài đặt", "Tùy chọn", "Options", "tune"]
PORTRAIT_DEFAULT = ["9:16", "Portrait", "Dọc", "Khung dọc"]
# Từ 2026 Flow ưu tiên tạo ẢNH; phải chuyển sang chế độ tạo video từ chữ trước khi gõ prompt
VIDEO_MODE_DEFAULT = ["Text to Video", "Văn bản thành video", "Văn bản sang video"]
MODE_MENU_DEFAULT = ["Text to Image", "Create Image", "Văn bản thành hình ảnh", "Frames to Video", "Ingredients to Video"]
OUTPUTS_DEFAULT = ["Outputs per prompt", "Số kết quả", "Số đầu ra"]
# Flow có thêm trang "New tool" (tạo công cụ) cũng có ô nhập — không được gõ prompt video vào đó
_TOOL_BUILDER_URL = re.compile(r"/create-tools?(?:/|$)", re.IGNORECASE)
_TOOL_BUILDER_HINT = re.compile(r"\b(app|tool|công cụ|ứng dụng)\b", re.IGNORECASE)


class FlowError(RuntimeError):
    pass


def _as_list(v, default: list[str]) -> list[str]:  # noqa: ANN001
    if not v:
        return default
    return [v] if isinstance(v, str) else list(v)


class FlowBrowser:
    def __init__(self, cfg, debug_dir: Path):  # noqa: ANN001
        self.cfg = cfg
        self.sel = cfg.get_path("video.flow.selectors", {}) or {}
        self.url = cfg.get_path("video.flow.url")
        self.headless = bool(cfg.get_path("video.flow.headless", False))
        self.timeout = int(cfg.get_path("video.flow.generation_timeout_sec", 900))
        self.manual_wait = int(cfg.get_path("video.flow.manual_wait_sec", 900))
        self.aspect = cfg.get_path("video.aspect_ratio", "9:16")
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

    # ------------------------------------------------------------------ ô nhập prompt
    def _find_prompt_box(self, timeout_ms: int = 0):  # noqa: ANN202
        deadline = time.time() + timeout_ms / 1000
        while True:
            for css in _as_list(self.sel.get("prompt_box"), []) + PROMPT_BOX_DEFAULT:
                loc = self.page.locator(css)
                try:
                    for i in range(loc.count()):
                        el = loc.nth(i)
                        if el.is_visible() and el.is_editable() and not self._is_tool_box(el):
                            return el
                except Exception:  # noqa: BLE001
                    continue
            if time.time() >= deadline:
                return None
            self.page.wait_for_timeout(500)

    def _on_tool_builder(self) -> bool:
        path = urlparse(self.page.url).path
        return bool(_TOOL_BUILDER_URL.search(path))

    def _is_tool_box(self, el) -> bool:  # noqa: ANN001
        if self._on_tool_builder():
            return True
        try:
            hint = " ".join(filter(None, [el.get_attribute("placeholder"), el.get_attribute("aria-label")]))
        except Exception:  # noqa: BLE001
            return False
        return bool(_TOOL_BUILDER_HINT.search(hint))

    def _leave_tool_builder(self) -> None:
        """Lỡ vào trang 'New tool' (…/create-tool) thì quay về trang dự án/trang chủ Flow."""
        page = self.page
        if not self._on_tool_builder():
            return
        u = urlparse(page.url)
        target = urlunparse(u._replace(path=_TOOL_BUILDER_URL.split(u.path)[0], query="", fragment=""))
        log.info("Flow: đang ở trang tạo công cụ, chuyển về %s", target)
        page.goto(target or self.url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        if self._on_tool_builder():
            page.goto(self.url, wait_until="domcontentloaded")
            page.wait_for_timeout(3000)

    def _fill_prompt(self, box, prompt: str) -> None:  # noqa: ANN001
        tag = (box.evaluate("e => e.tagName") or "").lower()
        if tag in ("textarea", "input"):
            box.fill(prompt)
        else:  # ô soạn thảo contenteditable
            box.click()
            self.page.keyboard.press("Control+A")
            self.page.keyboard.press("Delete")
            self.page.keyboard.insert_text(prompt)

    def _open(self) -> None:
        page = self.page
        page.goto(self.url, wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        if "accounts.google.com" in page.url:
            if self.headless:
                raise FlowError("Chưa đăng nhập Google. Chạy `python -m flow_agent login flow` trước.")
            wait_for_user(page, "Hãy đăng nhập tài khoản Google (có gói dùng Flow) trong cửa sổ trình duyệt.",
                          timeout_s=self.manual_wait, done_check=lambda: "accounts.google.com" not in page.url)
        self._leave_tool_builder()
        if not self._find_prompt_box():
            click_any(page, _as_list(self.sel.get("new_project"), ["New project", "Dự án mới"]), timeout_ms=10000)
        if not self._find_prompt_box(30000):
            shot = debug_shot(page, self.debug_dir, "flow-open")
            if self.headless or not wait_for_user(
                    page, "Agent chưa thấy ô nhập prompt làm video. Hãy tự mở một dự án mới trên Flow (bấm 'New project' "
                          "hoặc dấu +), vào phần tạo VIDEO (không phải 'New tool') — agent sẽ tự làm tiếp.",
                    timeout_s=self.manual_wait, done_check=lambda: self._find_prompt_box() is not None):
                raise FlowError(f"Không thấy ô nhập prompt trên Flow (ảnh lỗi: {shot})")
        self._try_video_mode()
        self._try_portrait()
        self._try_single_output()

    def _try_video_mode(self) -> None:
        """Chọn chế độ 'Text to Video'. Không thấy thì làm tiếp — _wait_new_video chỉ nhận <video>, không nhận ảnh."""
        page = self.page
        video = _as_list(self.sel.get("video_mode"), VIDEO_MODE_DEFAULT)
        ok = click_any(page, video, timeout_ms=1500)
        if not ok and click_any(page, _as_list(self.sel.get("mode_menu"), MODE_MENU_DEFAULT), timeout_ms=2000):
            page.wait_for_timeout(600)
            ok = click_any(page, video, timeout_ms=3000)
            if not ok:
                page.keyboard.press("Escape")
        log.info("Flow: %s chế độ Text to Video", "đã chọn" if ok else "không thấy nút chọn")

    def _try_single_output(self) -> None:
        """Mỗi prompt chỉ tạo 1 clip (Flow mặc định có thể tạo 2–4 clip, tốn credit gấp nhiều lần)."""
        page = self.page
        if not click_any(page, _as_list(self.sel.get("outputs_per_prompt"), OUTPUTS_DEFAULT), timeout_ms=1500):
            if not click_any(page, _as_list(self.sel.get("settings"), SETTINGS_DEFAULT), timeout_ms=2000):
                return
            page.wait_for_timeout(600)
            click_any(page, _as_list(self.sel.get("outputs_per_prompt"), OUTPUTS_DEFAULT), timeout_ms=2000)
        page.wait_for_timeout(500)
        ok = False
        for role in ("option", "menuitemradio", "menuitem", "radio", "button"):
            loc = page.get_by_role(role, name="1", exact=True)
            try:
                if loc.count() and loc.first.is_visible():
                    loc.first.click()
                    ok = True
                    break
            except Exception:  # noqa: BLE001
                continue
        page.keyboard.press("Escape")
        log.info("Flow: %s 1 kết quả mỗi prompt", "đã đặt" if ok else "không đặt được")

    def _try_portrait(self) -> None:
        """Cố chọn khung dọc 9:16 (nếu Flow có). Không được thì vẫn làm tiếp — bước ghép sẽ lót nền mờ."""
        if self.aspect != "9:16":
            return
        page = self.page
        portrait = _as_list(self.sel.get("aspect_portrait"), PORTRAIT_DEFAULT)
        ok = click_any(page, portrait, timeout_ms=1500)
        if not ok and click_any(page, _as_list(self.sel.get("settings"), SETTINGS_DEFAULT), timeout_ms=3000):
            page.wait_for_timeout(800)
            ok = click_any(page, portrait, timeout_ms=3000)
            page.keyboard.press("Escape")
        log.info("Flow: %s khung dọc 9:16", "đã chọn" if ok else "không tìm thấy tuỳ chọn")

    # ------------------------------------------------------------------ tạo 1 clip
    def _new_srcs(self, before: set[str]) -> list[str]:
        return [s for s in self.page.evaluate(_VIDEO_SRCS_JS) if s not in before]

    def generate_clip(self, prompt: str, out_path: Path) -> Path:
        page = self.page
        before = set(page.evaluate(_VIDEO_SRCS_JS))
        box = self._find_prompt_box(15000)
        if box is None:
            raise FlowError(f"Mất ô nhập prompt (ảnh lỗi: {debug_shot(page, self.debug_dir, 'flow-prompt')})")
        self._fill_prompt(box, prompt)
        page.wait_for_timeout(500)
        if not click_any(page, _as_list(self.sel.get("generate"), ["Create", "Generate", "Tạo"]), timeout_ms=6000):
            box.press("Enter")

        new_src = self._wait_new_video(before, self.timeout)
        if not new_src:
            shot = debug_shot(page, self.debug_dir, "flow-timeout")
            if self.headless:
                raise FlowError(f"Quá thời gian chờ Flow tạo clip (ảnh lỗi: {shot})")
            print(f"\n>>> PROMPT cảnh này (dán vào Flow nếu cần):\n{prompt}\n")
            if wait_for_user(page, "Flow chưa trả clip. Hãy tự bấm tạo video với prompt ở trên trong cửa sổ Flow — "
                                   "khi clip hiện ra agent sẽ tự tải về.", timeout_s=self.manual_wait,
                             done_check=lambda: bool(self._new_srcs(before))):
                new_src = self._new_srcs(before)[0]
            else:
                raise FlowError(f"Quá thời gian chờ Flow tạo clip (ảnh lỗi: {shot})")

        page.wait_for_timeout(3000)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        return self._save(new_src, out_path)

    def _wait_new_video(self, before: set[str], timeout_s: int) -> str | None:
        page = self.page
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            page.wait_for_timeout(5000)
            srcs = self._new_srcs(before)
            if srcs:
                return srcs[0]
            if page.get_by_text("policy", exact=False).count() and page.get_by_text("violat", exact=False).count():
                raise FlowError("Flow từ chối prompt vì chính sách nội dung.")
        return None

    def _save(self, src: str, out_path: Path) -> Path:
        try:
            if src.startswith("http"):
                resp = self.context.request.get(src, timeout=180000)
                if resp.ok and len(resp.body()) > 1000:
                    out_path.write_bytes(resp.body())
                    return out_path
            elif src.startswith("blob:"):
                out_path.write_bytes(base64.b64decode(self.page.evaluate(_BLOB_JS, src)))
                return out_path
        except Exception as exc:  # noqa: BLE001
            log.warning("Tải clip trực tiếp lỗi (%s) — thử nút Tải xuống", exc)
        return self._download_via_ui(src, out_path)

    def _download_via_ui(self, src: str, out_path: Path) -> Path:
        page = self.page
        video = page.locator(f'video[src="{src}"]').first
        try:
            video.hover()
        except Exception:  # noqa: BLE001
            pass
        with page.expect_download(timeout=180000) as dl:
            if not click_any(page, _as_list(self.sel.get("download"), ["Download", "Tải xuống"]), timeout_ms=10000):
                raise FlowError("Không thấy nút tải xuống clip trên Flow")
            page.wait_for_timeout(800)
            click_any(page, _as_list(self.sel.get("download_quality"), ["Original size", "720p"]), timeout_ms=5000)
        dl.value.save_as(str(out_path))
        return out_path
