"""Tự lấy ảnh đại diện Facebook của chủ kênh làm ảnh tham chiếu nhân vật cho Google Flow.

Dùng khi thư mục anh_tham_chieu/ còn trống: chủ kênh không phải tự chép ảnh. Ảnh chỉ lưu trên máy
(thư mục bị .gitignore), cắt bỏ phần chữ/logo của khung ảnh đại diện tròn để Flow không vẽ chữ vào video.
"""
from __future__ import annotations

import io
import logging
from pathlib import Path

log = logging.getLogger(__name__)

AVATAR_NAME = "0-anh-dai-dien-facebook.jpg"

# Ảnh đại diện lớn nhất, gần vuông, ở phần đầu trang hồ sơ (ảnh bìa thì rất ngang nên bị loại)
_AVATAR_JS = """() => {
  const out = [];
  const push = (src, el) => {
    if (!src || src.startsWith('data:')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 90 || r.top > 900) return;
    const ratio = r.width / Math.max(r.height, 1);
    if (ratio < 0.85 || ratio > 1.15) return;
    const label = (el.closest('a,[role=button],[aria-label]')?.getAttribute('aria-label') || '').toLowerCase();
    const bonus = /profile picture|ảnh đại diện|avatar/.test(label) ? 1e7 : 0;
    try { src = new URL(src, location.href).href; } catch (e) { return; }
    out.push({src, score: r.width * r.height + bonus});
  };
  document.querySelectorAll('svg image').forEach(e => push(e.getAttribute('xlink:href') || e.getAttribute('href'), e));
  document.querySelectorAll('img').forEach(e => push(e.currentSrc || e.src, e));
  out.sort((a, b) => b.score - a.score);
  return out.map(o => o.src);
}"""


def clean_avatar(data: bytes):  # noqa: ANN201
    """Ảnh đại diện vuông -> phủ phần ngoài vòng tròn (viền, nền trắng) bằng màu nền, cắt nửa trên ở giữa:
    giữ mặt + vai, bỏ dải chữ phía dưới và logo bên phải (kiểu ảnh đại diện có tên/khẩu hiệu)."""
    from PIL import Image, ImageDraw

    im = Image.open(io.BytesIO(data)).convert("RGB")
    side = min(im.size)
    im = im.crop(((im.width - side) // 2, (im.height - side) // 2, (im.width + side) // 2, (im.height + side) // 2))
    w = h = side
    bg = im.getpixel((int(w * 0.12), int(h * 0.40)))
    mask = Image.new("L", im.size, 255)
    ImageDraw.Draw(mask).ellipse((w * 0.03, h * 0.03, w * 0.97, h * 0.97), fill=0)
    im.paste(Image.new("RGB", im.size, bg), mask=mask)
    out = im.crop((int(w * 0.17), int(h * 0.03), int(w * 0.655), int(h * 0.62)))
    if out.width < 512:  # phóng to cho Flow nhận diện mặt tốt hơn
        k = 512 / out.width
        out = out.resize((512, round(out.height * k)), Image.LANCZOS)
    return out


def fetch_own_avatar(cfg, dest_dir: Path) -> Path | None:  # noqa: ANN001
    """Mở trang cá nhân (đã đăng nhập) -> tải ảnh đại diện -> làm sạch -> lưu vào dest_dir. Lỗi thì trả None."""
    from ..browser import persistent_context
    from ..context import BROWSER_LOCK

    url = cfg.get("own_channel")
    if not url:
        return None
    headless = bool(cfg.get_path("facebook.headless", False))
    try:
        with BROWSER_LOCK, persistent_context(cfg.path("facebook.browser_profile_dir"), headless,
                                              cfg.get_path("facebook.locale", "vi-VN")) as bctx:
            page = bctx.new_page()
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
            for src in page.evaluate(_AVATAR_JS)[:5]:
                try:
                    resp = bctx.request.get(src, timeout=60000)
                    if not resp.ok or len(resp.body()) < 3000:
                        continue
                    img = clean_avatar(resp.body())
                except Exception as exc:  # noqa: BLE001 — thử ảnh kế tiếp
                    log.debug("Bỏ qua ảnh %s: %s", src[:80], exc)
                    continue
                dest_dir.mkdir(parents=True, exist_ok=True)
                path = dest_dir / AVATAR_NAME
                img.save(path, quality=92)
                log.info("Đã lấy ảnh đại diện Facebook làm ảnh tham chiếu: %s", path)
                return path
    except Exception as exc:  # noqa: BLE001
        log.warning("Không tự lấy được ảnh đại diện Facebook: %s", exc)
    return None
