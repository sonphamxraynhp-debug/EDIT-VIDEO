"""Phân tích chuỗi số liệu Facebook (tiếng Việt & tiếng Anh) và nhận diện link video."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

_SUFFIX = {
    "k": 1_000, "n": 1_000, "nghìn": 1_000, "ngàn": 1_000,
    "m": 1_000_000, "tr": 1_000_000, "triệu": 1_000_000,
    "b": 1_000_000_000, "tỷ": 1_000_000_000, "t": 1_000_000_000,
}

_COUNT_RE = re.compile(r"(\d+(?:[.,\s]\d+)*)\s*(triệu|nghìn|ngàn|tỷ|tr|k|n|m|b|t)?\b", re.IGNORECASE)


def parse_count(text: str | None) -> int | None:
    """'1,2K' -> 1200; '3,4 Tr' -> 3400000; '1.234' -> 1234; '12 N lượt xem' -> 12000; '1.2M views' -> 1200000."""
    if not text:
        return None
    m = _COUNT_RE.search(text.strip())
    if not m:
        return None
    num, suffix = m.group(1).replace(" ", ""), (m.group(2) or "").lower()
    if suffix:
        num = num.replace(",", ".")
        if num.count(".") > 1:  # "1.234.5K" — hiếm, bỏ dấu ngăn nghìn
            head, _, tail = num.rpartition(".")
            num = head.replace(".", "") + "." + tail
        try:
            return int(round(float(num) * _SUFFIX[suffix]))
        except (ValueError, KeyError):
            return None
    digits = re.sub(r"[.,]", "", num)
    return int(digits) if digits.isdigit() else None


_VIEW_RE = re.compile(
    r"(\d+(?:[.,]\d+)*\s*(?:triệu|nghìn|ngàn|tr|k|n|m|b)?)\s*(?:lượt xem|lượt phát|views?|plays?)", re.IGNORECASE
)
_REACT_RE = re.compile(r"(?:Tất cả cảm xúc|All reactions)\s*:?\s*(\d+(?:[.,]\d+)*\s*(?:tr|k|n|m)?)", re.IGNORECASE)
_COMMENT_RE = re.compile(r"(\d+(?:[.,]\d+)*\s*(?:tr|k|n|m)?)\s*(?:bình luận|comments?)", re.IGNORECASE)
_SHARE_RE = re.compile(r"(\d+(?:[.,]\d+)*\s*(?:tr|k|n|m)?)\s*(?:lượt chia sẻ|chia sẻ|shares?)", re.IGNORECASE)


def extract_stats(text: str) -> dict[str, int | None]:
    def first(rx: re.Pattern) -> int | None:
        m = rx.search(text or "")
        return parse_count(m.group(1)) if m else None

    return {"views": first(_VIEW_RE), "reactions": first(_REACT_RE),
            "comments": first(_COMMENT_RE), "shares": first(_SHARE_RE)}


def video_id_from_url(url: str) -> str | None:
    u = urlparse(url)
    q = parse_qs(u.query)
    if "v" in q:
        return q["v"][0]
    m = re.search(r"/(?:reel|videos|watch/live|share/r|share/v)/(?:[^/]+/)?(\d{6,})", u.path)
    return m.group(1) if m else None


def canonical_video_url(url: str) -> str | None:
    vid = video_id_from_url(url)
    if not vid:
        return None
    if "/reel/" in url:
        return f"https://www.facebook.com/reel/{vid}"
    return f"https://www.facebook.com/watch/?v={vid}"


def channel_tab_urls(channel_url: str) -> list[str]:
    """Các tab chứa video của trang cá nhân/fanpage."""
    u = urlparse(channel_url)
    if u.path.rstrip("/") == "/profile.php":
        pid = parse_qs(u.query).get("id", [""])[0]
        base = f"https://www.facebook.com/profile.php?id={pid}"
        return [f"{base}&sk=reels_tab", f"{base}&sk=videos"]
    base = f"https://www.facebook.com{u.path.rstrip('/')}"
    return [f"{base}/reels/", f"{base}/videos/"]
