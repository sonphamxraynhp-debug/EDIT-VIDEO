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

_VIDEO_SRCS_JS = ("() => Array.from(document.querySelectorAll('video, video source'))"
                  ".map(v => v.currentSrc || v.src).filter(Boolean)")
_BUTTONS_JS = """() => Array.from(document.querySelectorAll('button,[role=button],[role=combobox],[role=tab],a'))
  .filter(e => e.offsetParent !== null)
  .map(e => (e.getAttribute('aria-label') || e.innerText || e.title || '').replace(/\\s+/g, ' ').trim())
  .filter(Boolean)"""
_BLOB_JS = """async (src) => {
  const buf = await (await fetch(src)).arrayBuffer();
  let s = ''; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}"""
PROMPT_BOX_DEFAULT = ["textarea", "[contenteditable='true']", "[role='textbox']", "input[type='text']"]
SETTINGS_DEFAULT = ["tune", "Settings", "Cài đặt", "Tùy chọn", "Options"]
ASPECT_MENU_DEFAULT = ["Aspect Ratio", "Aspect ratio", "Tỉ lệ khung hình", "Tỷ lệ khung hình", "Landscape", "16:9"]
PORTRAIT_DEFAULT = ["9:16", "Portrait", "Dọc", "Khung dọc"]
# Từ 2026 Flow ưu tiên tạo ẢNH; phải chuyển sang chế độ tạo video từ chữ trước khi gõ prompt
VIDEO_MODE_DEFAULT = ["Text to Video", "Văn bản thành video", "Văn bản sang video"]
MODE_MENU_DEFAULT = ["Text to Image", "Create Image", "Văn bản thành hình ảnh", "Frames to Video", "Ingredients to Video"]
GENERATE_DEFAULT = ["arrow_forward", "arrow_upward", "send", "Generate", "Create", "Submit", "Tạo", "Gửi"]
_NOT_GENERATE = re.compile(r"tool|công cụ|collection|bộ sưu tập|character|nhân vật|scene|library|thư viện|image|hình ảnh|close|đóng", re.IGNORECASE)
OUTPUTS_DEFAULT = ["Outputs per prompt", "Số kết quả", "Số đầu ra"]
# Flow có thêm trang "New tool" (tạo công cụ) cũng có ô nhập — không được gõ prompt video vào đó
_TOOL_BUILDER_URL = re.compile(r"/create-tools?(?:/|$)", re.IGNORECASE)
_TOOL_BUILDER_HINT = re.compile(r"\b(app|tool|công cụ|ứng dụng)\b", re.IGNORECASE)


def _near(a: dict, b: dict | None, margin: float = 220) -> bool:
    """Nút b có nằm trong dải dọc quanh ô prompt a không (thanh prompt của Flow cao vài trăm px)."""
    if not b:
        return False
    cy = b["y"] + b["height"] / 2
    return a["y"] - margin <= cy <= a["y"] + a["height"] + margin


_IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}
INGREDIENTS_MODE_DEFAULT = ["Ingredients to Video", "Thành phần thành video", "Nguyên liệu thành video"]
ADD_REF_DEFAULT = ["add_photo_alternate", "Add image", "Add ingredient", "Upload", "Thêm ảnh", "Tải ảnh lên", "add"]
REF_CONFIRM_DEFAULT = ["Crop and save", "Save", "Done", "Cắt và lưu", "Lưu", "Xong"]
REF_PROMPT_PREFIX = ("The doctor in this video is the real person shown in the reference image(s): keep his face, "
                     "hairstyle and build exactly the same in every shot. ")
_IMG_BOXES_JS = """() => Array.from(document.querySelectorAll('img')).filter(i => i.offsetParent !== null)
  .map(i => i.getBoundingClientRect()).filter(r => r.width > 8 && r.width < 260)
  .map(r => ({x: r.x, y: r.y, width: r.width, height: r.height}))"""


def reference_images(cfg) -> list[Path]:  # noqa: ANN001
    """Ảnh tham chiếu nhân vật: video.flow.reference_images trong config, hoặc mọi ảnh trong thư mục anh_tham_chieu/."""
    from ..config import ROOT

    listed = cfg.get_path("video.flow.reference_images", None)
    if listed:
        paths = [Path(p) if Path(p).is_absolute() else ROOT / p for p in ([listed] if isinstance(listed, str) else listed)]
    else:
        folder = Path(cfg.get_path("video.flow.reference_dir", "anh_tham_chieu"))
        folder = folder if folder.is_absolute() else ROOT / folder
        paths = sorted(folder.glob("*")) if folder.is_dir() else []
    return [p for p in paths if p.is_file() and p.suffix.lower() in _IMG_EXT][:3]


class FlowError(RuntimeError):
    pass


def _as_list(v, default: list[str]) -> list[str]:  # noqa: ANN001
    """Nhãn trong config được thử TRƯỚC, sau đó vẫn thử nhãn mặc định (config cũ không làm mất nhãn mới)."""
    own = [] if not v else ([v] if isinstance(v, str) else list(v))
    return list(dict.fromkeys(own + list(default)))


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
        self.refs = reference_images(cfg)
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

    def _click_generate(self, box) -> bool:  # noqa: ANN001
        """Bấm nút gửi NẰM TRONG thanh prompt (mũi tên/Create) — không bấm nhầm 'Create tool', 'Library +'."""
        name = self._bar_click(box, _as_list(self.sel.get("generate"), GENERATE_DEFAULT), exclude=_NOT_GENERATE)
        if name:
            log.info("Flow: đã bấm nút tạo '%s'", name[:40])
        return bool(name)

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
        box = self._find_prompt_box(5000)
        if box is not None:
            self._try_video_mode(box, ingredients=bool(self.refs))
            self._try_bar_settings(box)
        self._dump_ui("flow-ready")

    # ------------------------------------------------------------------ thanh prompt (chế độ, khung hình, số kết quả)
    def _bar_click(self, box, labels: list[str], exclude: re.Pattern | None = _NOT_GENERATE) -> str | None:  # noqa: ANN001
        """Bấm nút khớp nhãn NẰM TRONG khung ô prompt (đi ngược lên tối đa 6 tầng). Trả về tên nút đã bấm."""
        rx = re.compile("|".join(re.escape(x) for x in labels), re.IGNORECASE)
        try:
            bb = box.bounding_box()
        except Exception:  # noqa: BLE001
            bb = None
        container = box
        for _ in range(6):
            container = container.locator("xpath=..")
            buttons = container.locator("button, [role='button'], [role='combobox']")
            try:
                n = buttons.count()
            except Exception:  # noqa: BLE001
                return None
            for i in reversed(range(n)):
                b = buttons.nth(i)
                try:
                    if not (b.is_visible() and b.is_enabled()):
                        continue
                    if bb and not _near(bb, b.bounding_box()):
                        continue  # nút ở xa ô prompt (thanh bên, bánh răng tài khoản…) — bỏ qua
                    name = " ".join(filter(None, [b.get_attribute("aria-label"), b.inner_text(), b.get_attribute("title")]))
                    if rx.search(name) and not (exclude and exclude.search(name)):
                        b.click()
                        return name.strip()
                except Exception:  # noqa: BLE001
                    continue
        return None

    def _pick_option(self, labels: list[str], exact: str | None = None) -> bool:
        """Chọn 1 mục trong menu/danh sách vừa mở (menu thường nằm ngoài khung prompt)."""
        page = self.page
        if exact is not None:
            for role in ("option", "menuitemradio", "menuitem", "radio", "button"):
                loc = page.get_by_role(role, name=exact, exact=True)
                try:
                    if loc.count() and loc.first.is_visible():
                        loc.first.click()
                        return True
                except Exception:  # noqa: BLE001
                    continue
            return False
        return click_any(page, labels, timeout_ms=2500, roles=("option", "menuitemradio", "menuitem", "radio", "button"))

    def _try_video_mode(self, box, ingredients: bool = False) -> None:  # noqa: ANN001
        """Flow 2026 ưu tiên tạo ẢNH: mở nút chế độ trong thanh prompt rồi chọn 'Text to Video'
        (hoặc 'Ingredients to Video' khi có ảnh tham chiếu nhân vật)."""
        page = self.page
        video = (_as_list(self.sel.get("ingredients_mode"), INGREDIENTS_MODE_DEFAULT) if ingredients
                 else _as_list(self.sel.get("video_mode"), VIDEO_MODE_DEFAULT))
        ok = False
        opened = self._bar_click(box, _as_list(self.sel.get("mode_menu"), MODE_MENU_DEFAULT) + video, exclude=None)
        if opened:
            page.wait_for_timeout(700)
            ok = self._pick_option(video)
            if not ok:
                page.keyboard.press("Escape")
        log.info("Flow: %s chế độ %s (nút chế độ: %s)", "đã chọn" if ok else "không chọn được",
                 "Ingredients to Video" if ingredients else "Text to Video", opened)

    def _try_bar_settings(self, box) -> None:  # noqa: ANN001
        """Mở cài đặt CỦA THANH PROMPT (biểu tượng 'tune') — không phải bánh răng tài khoản — chọn 9:16 và 1 kết quả."""
        page = self.page
        portrait = _as_list(self.sel.get("aspect_portrait"), PORTRAIT_DEFAULT)
        ok_aspect = self.aspect != "9:16"
        if not ok_aspect and self._bar_click(box, portrait, exclude=None):
            ok_aspect = True
        opened = self._bar_click(box, _as_list(self.sel.get("settings"), SETTINGS_DEFAULT), exclude=None)
        if opened:
            page.wait_for_timeout(700)
            if not ok_aspect:
                ok_aspect = self._pick_option(portrait)
                if not ok_aspect and click_any(page, _as_list(self.sel.get("aspect_menu"), ASPECT_MENU_DEFAULT), timeout_ms=2000):
                    page.wait_for_timeout(600)
                    ok_aspect = self._pick_option(portrait)
            ok_out = False
            if click_any(page, _as_list(self.sel.get("outputs_per_prompt"), OUTPUTS_DEFAULT), timeout_ms=2000):
                page.wait_for_timeout(600)
                ok_out = self._pick_option([], exact="1")
            page.keyboard.press("Escape")
            log.info("Flow: khung dọc 9:16 %s; 1 kết quả mỗi prompt %s", "✓" if ok_aspect else "✗", "✓" if ok_out else "✗")
        else:
            log.info("Flow: không thấy nút cài đặt trong thanh prompt; khung dọc 9:16 %s", "✓" if ok_aspect else "✗")

    # ------------------------------------------------------------------ ảnh tham chiếu nhân vật
    def _refs_attached(self, box) -> int:  # noqa: ANN001
        """Đếm ảnh nhỏ (thumbnail) đang gắn trong thanh prompt."""
        try:
            bb = box.bounding_box()
            boxes = self.page.evaluate(_IMG_BOXES_JS)
        except Exception:  # noqa: BLE001
            return 0
        return sum(1 for b in boxes if bb and _near(bb, b))

    def _ensure_refs(self, box) -> None:  # noqa: ANN001
        if self._refs_attached(box):
            return
        page = self.page
        files = [str(p) for p in self.refs]
        ok = False
        inputs = page.locator("input[type='file']")
        try:
            if inputs.count():
                inp = inputs.first
                inp.set_input_files(files if inp.get_attribute("multiple") is not None else files[:1])
                ok = True
        except Exception as exc:  # noqa: BLE001
            log.warning("Gắn ảnh tham chiếu qua ô chọn file lỗi: %s", exc)
        if not ok:
            try:
                with page.expect_file_chooser(timeout=6000) as fc:
                    if not self._bar_click(box, _as_list(self.sel.get("add_reference"), ADD_REF_DEFAULT), exclude=None):
                        raise FlowError("không thấy nút thêm ảnh")
                chooser = fc.value
                chooser.set_files(files if chooser.is_multiple() else files[:1])
                ok = True
            except Exception as exc:  # noqa: BLE001
                log.warning("Không tự gắn được ảnh tham chiếu: %s", exc)
        if ok:
            page.wait_for_timeout(2500)
            click_any(page, _as_list(self.sel.get("reference_confirm"), REF_CONFIRM_DEFAULT), timeout_ms=3000)
            page.wait_for_timeout(1500)
        n = self._refs_attached(box)
        log.info("Flow: ảnh tham chiếu trong thanh prompt: %d", n)
        if not n and not ok and not self.headless:
            wait_for_user(page, "Agent chưa gắn được ảnh tham chiếu. Hãy bấm nút thêm ảnh (+) trong thanh prompt của Flow và "
                                f"chọn ảnh trong thư mục {self.refs[0].parent} — agent sẽ tự làm tiếp.",
                          timeout_s=self.manual_wait, done_check=lambda: self._refs_attached(box) > 0)

    def _dump_ui(self, name: str) -> None:
        """Lưu ảnh chụp + danh sách nút đang hiện để chẩn đoán khi Flow đổi giao diện (data/debug)."""
        try:
            names = self.page.evaluate(_BUTTONS_JS)
            self.debug_dir.mkdir(parents=True, exist_ok=True)
            (self.debug_dir / f"{name}-buttons.txt").write_text(f"URL: {self.page.url}\n" + "\n".join(names), encoding="utf-8")
            debug_shot(self.page, self.debug_dir, name)
        except Exception as exc:  # noqa: BLE001
            log.debug("Không lưu được ảnh chẩn đoán: %s", exc)

    # ------------------------------------------------------------------ tạo 1 clip
    def _new_srcs(self, before: set[str]) -> list[str]:
        return [s for s in self.page.evaluate(_VIDEO_SRCS_JS) if s not in before]

    def generate_clip(self, prompt: str, out_path: Path) -> Path:
        page = self.page
        before = set(page.evaluate(_VIDEO_SRCS_JS))
        box = self._find_prompt_box(15000)
        if box is None:
            raise FlowError(f"Mất ô nhập prompt (ảnh lỗi: {debug_shot(page, self.debug_dir, 'flow-prompt')})")
        if self.refs:
            self._ensure_refs(box)
            prompt = REF_PROMPT_PREFIX + prompt
        self._fill_prompt(box, prompt)
        page.wait_for_timeout(500)
        if not self._click_generate(box):
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
