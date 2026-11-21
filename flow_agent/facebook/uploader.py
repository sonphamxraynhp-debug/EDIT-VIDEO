"""Đăng video lên Facebook ở chế độ riêng tư.

- Trang cá nhân (profile): tự động hoá trình duyệt qua trình tạo Reels, chọn đối tượng "Chỉ mình tôi".
- Fanpage (page): Graph API với published=false (video chưa đăng, chỉ quản trị viên thấy).
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import requests

from ..browser import click_any, debug_shot, wait_for_user

log = logging.getLogger(__name__)

NEXT = ["Tiếp", "Next"]
PUBLISH = ["Đăng", "Chia sẻ", "Publish", "Share", "Post"]
AUDIENCE_OPEN = ["Công khai", "Bạn bè", "Chỉ mình tôi", "Public", "Friends", "Only me", "Đối tượng", "Audience",
                 "Quyền riêng tư", "Privacy"]
ONLY_ME = ["Chỉ mình tôi", "Only me"]
DONE = ["Xong", "Lưu", "Done", "Save"]


class UploadError(RuntimeError):
    pass


def upload_profile_reel(page, video_path: Path, caption: str, debug_dir: Path, headless: bool) -> str | None:
    """Đăng Reel lên trang cá nhân với quyền 'Chỉ mình tôi'. Trả về URL video nếu tìm được."""
    page.goto("https://www.facebook.com/reels/create/", wait_until="domcontentloaded")
    page.wait_for_timeout(4000)
    file_input = page.locator('input[type="file"]').first
    try:
        file_input.set_input_files(str(video_path), timeout=20000)
    except Exception as exc:  # noqa: BLE001
        debug_shot(page, debug_dir, "upload-file-input")
        raise UploadError(f"Không tìm thấy ô chọn file trên trang tạo Reels: {exc}") from exc

    page.wait_for_timeout(8000)  # chờ tải lên/xử lý
    for _ in range(2):
        click_any(page, NEXT, timeout_ms=60000)
        page.wait_for_timeout(2500)

    box = page.locator('[contenteditable="true"][role="textbox"], textarea').first
    try:
        box.click(timeout=10000)
        page.keyboard.insert_text(caption)
    except Exception:  # noqa: BLE001
        log.warning("Không điền được caption tự động")

    privacy_ok = False
    if click_any(page, AUDIENCE_OPEN, timeout_ms=8000):
        page.wait_for_timeout(1500)
        if click_any(page, ONLY_ME, timeout_ms=8000):
            page.wait_for_timeout(800)
            click_any(page, DONE, timeout_ms=4000)
            privacy_ok = True

    if not privacy_ok:
        shot = debug_shot(page, debug_dir, "upload-privacy")
        if headless:
            raise UploadError(f"Không đặt được quyền 'Chỉ mình tôi' — đã dừng, KHÔNG đăng. Ảnh lỗi: {shot}")
        if not wait_for_user(page, "Hãy tự chọn đối tượng 'Chỉ mình tôi' rồi bấm Đăng trong cửa sổ trình duyệt.",
                             timeout_s=600, done_check=lambda: "reels/create" not in page.url):
            raise UploadError("Người dùng không hoàn tất bước chọn quyền riêng tư.")
    else:
        if not click_any(page, PUBLISH, timeout_ms=15000):
            shot = debug_shot(page, debug_dir, "upload-publish")
            raise UploadError(f"Không bấm được nút Đăng. Ảnh lỗi: {shot}")

    page.wait_for_timeout(15000)
    return None  # URL sẽ được ghép ở bước tracker (video mới nhất trên tab Reels)


def upload_page_video(page_id: str, token: str, video_path: Path, caption: str, api_version: str = "v21.0") -> str:
    """Fanpage: tải video lên ở trạng thái chưa đăng (published=false)."""
    url = f"https://graph-video.facebook.com/{api_version}/{page_id}/videos"
    with open(video_path, "rb") as f:
        r = requests.post(
            url,
            data={"description": caption, "published": "false", "access_token": token},
            files={"source": (video_path.name, f, "video/mp4")},
            timeout=1800,
        )
    if r.status_code >= 400:
        raise UploadError(f"Graph API lỗi {r.status_code}: {r.text[:500]}")
    vid = r.json().get("id")
    return f"https://www.facebook.com/watch/?v={vid}"


def page_video_views(video_id: str, token: str, api_version: str = "v21.0") -> dict:
    """Fanpage: đọc chỉ số video qua Graph API (reels dùng blue_reels_play_count, video thường total_video_views)."""
    out: dict = {}
    for metric in ("blue_reels_play_count", "total_video_views"):
        r = requests.get(
            f"https://graph.facebook.com/{api_version}/{video_id}/video_insights",
            params={"metric": metric, "access_token": token}, timeout=60,
        )
        if r.ok:
            data = r.json().get("data") or []
            if data and data[0].get("values"):
                out["views"] = int(data[0]["values"][0].get("value") or 0)
                break
    r = requests.get(
        f"https://graph.facebook.com/{api_version}/{video_id}",
        params={"fields": "comments.summary(true).limit(0),reactions.summary(true).limit(0)", "access_token": token},
        timeout=60,
    )
    if r.ok:
        j = r.json()
        out["comments"] = (j.get("comments") or {}).get("summary", {}).get("total_count")
        out["reactions"] = (j.get("reactions") or {}).get("summary", {}).get("total_count")
    return out


def page_token(cfg) -> str:  # noqa: ANN001
    env = cfg.get_path("facebook.graph.access_token_env", "FB_PAGE_TOKEN")
    token = os.environ.get(env, "")
    if not token:
        raise UploadError(f"Thiếu biến môi trường {env} (token fanpage).")
    return token
