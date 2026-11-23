"""Từ kịch bản đã chọn -> tạo clip trên Google Flow -> ghép video -> đăng 'Chỉ mình tôi' -> phiếu duyệt."""
from __future__ import annotations

import contextlib
import json
import logging
import re
from pathlib import Path

from .browser import persistent_context
from .context import BROWSER_LOCK, Ctx
from .db import now_iso
from .models import Scene, ScriptDraft
from .producer.assembler import assemble

log = logging.getLogger(__name__)

AI_DISCLOSURE = "Video có sử dụng công nghệ AI (Google Flow) để minh hoạ."
# Chỉ thêm SAU KHI bác sĩ đã duyệt thật (xem PHIEU_DUYET.md) — không tự ghi lúc đăng "Chỉ mình tôi"
REVIEWED_NOTE = "Nội dung chuyên môn đã được Bác sĩ Phạm Sơn duyệt."


_SAY_AS = re.compile(r"(\S+)\s*\(\s*(?:đọc|doc|read)\s*:\s*([^)]+)\)", re.IGNORECASE)


def spoken(text: str) -> str:
    """'NIPT (đọc: níp-ti)' -> 'níp-ti': ghi chú cách đọc thay cho chữ viết, không bị đọc to cả ngoặc."""
    return _SAY_AS.sub(lambda m: m.group(2).strip(), text).strip()


def build_scene_prompt(scene: Scene, character_bible: str, aspect: str) -> str:
    prompt = scene.visual_prompt_en.strip()
    if character_bible and character_bible[:40].lower() not in prompt.lower():
        prompt = f"{character_bible.strip()} {prompt}"
    line = spoken(scene.dialogue_vi)
    if line and line[:15] not in prompt:
        prompt += f' The character speaks in Vietnamese, warm and calm voice: "{line}"'
    orientation = "Vertical 9:16 portrait framing." if aspect == "9:16" else f"Aspect ratio {aspect}."
    prompt += (f" {orientation} Camera: {scene.camera}. Clean, bright, trustworthy medical clinic look in neutral cream, "
               "beige and white tones (no pink or blue baby colours). No on-screen text, no captions, no subtitles, no logos, no watermark.")
    return prompt


def _backend(ctx: Ctx):
    backend = ctx.cfg.get_path("video.backend", "flow")
    debug = ctx.cfg.data_dir / "debug"
    if backend == "veo_api":
        from .producer.veo_api import VeoAPI

        return VeoAPI(ctx.cfg), contextlib.nullcontext()
    from .producer.flow_browser import FlowBrowser

    return FlowBrowser(ctx.cfg, debug), BROWSER_LOCK


def load_draft(ctx: Ctx, script_id: int) -> tuple[ScriptDraft, dict]:
    row = ctx.db.one("SELECT * FROM scripts WHERE id=?", (script_id,))
    if not row:
        raise ValueError(f"Không có kịch bản #{script_id}")
    return ScriptDraft.model_validate_json(row["draft_json"]), dict(row)


def produce(ctx: Ctx, script_id: int, retries: int = 2) -> int:
    draft, row = load_draft(ctx, script_id)
    if row["blocked"]:
        raise ValueError("Kịch bản vi phạm an toàn nội dung — không được sản xuất.")
    _, pb = ctx.playbook()
    bible = pb.get("character_bible", "")
    aspect = ctx.cfg.get_path("video.aspect_ratio", "9:16")
    backend_name = ctx.cfg.get_path("video.backend", "flow")
    cur = ctx.db.execute("INSERT INTO productions(script_id, created_at, backend, status) VALUES (?,?,?,?)",
                         (script_id, now_iso(), backend_name, "producing"))
    pid = int(cur.lastrowid)
    out_dir = ctx.cfg.data_dir / "productions" / f"{pid:04d}"
    clips: list[Path] = []
    try:
        backend, lock = _backend(ctx)
        with lock, backend as gen:
            for scene in sorted(draft.scenes, key=lambda s: s.idx):
                prompt = build_scene_prompt(scene, bible, aspect)
                path = out_dir / f"clip_{scene.idx:02d}.mp4"
                for attempt in range(retries + 1):
                    try:
                        gen.generate_clip(prompt, path)
                        break
                    except Exception as exc:  # noqa: BLE001
                        log.warning("Cảnh %d lỗi lần %d: %s", scene.idx, attempt + 1, exc)
                        if attempt == retries:
                            raise
                clips.append(path)
        subtitles = [s.on_screen_text_vi for s in sorted(draft.scenes, key=lambda s: s.idx)]
        video = assemble(
            clips, subtitles, out_dir / "final.mp4",
            width=int(ctx.cfg.get_path("video.width", 1080)), height=int(ctx.cfg.get_path("video.height", 1920)),
            font=ctx.cfg.get_path("video.font", "DejaVu Sans"),
            burn_subtitles=bool(ctx.cfg.get_path("video.burn_subtitles", True)),
            scene_seconds=[s.seconds for s in sorted(draft.scenes, key=lambda s: s.idx)],
        )
        ctx.db.execute("UPDATE productions SET status='produced', video_path=?, clips_json=? WHERE id=?",
                       (str(video), json.dumps([str(c) for c in clips]), pid))
        ctx.db.execute("UPDATE scripts SET status='produced' WHERE id=?", (script_id,))
        write_review_sheet(ctx, pid)
        return pid
    except Exception as exc:
        ctx.db.execute("UPDATE productions SET status='failed', error=? WHERE id=?", (str(exc)[:2000], pid))
        ctx.db.execute("UPDATE scripts SET status='failed' WHERE id=?", (script_id,))
        raise


def build_caption(ctx: Ctx, draft: ScriptDraft) -> str:
    tags = " ".join(h if h.startswith("#") else f"#{h}" for h in draft.hashtags)
    parts = [draft.caption.strip(), tags]
    if ctx.cfg.get_path("video.ai_disclosure", True):
        parts.append(AI_DISCLOSURE)
    return "\n\n".join(p for p in parts if p)


def upload(ctx: Ctx, production_id: int) -> str | None:
    prod = ctx.db.one("SELECT * FROM productions WHERE id=?", (production_id,))
    if not prod or prod["status"] not in ("produced", "uploaded"):
        raise ValueError(f"Sản phẩm #{production_id} chưa sẵn sàng để đăng")
    draft, _ = load_draft(ctx, prod["script_id"])
    caption = build_caption(ctx, draft)
    video_path = Path(prod["video_path"])
    url: str | None = None

    if ctx.cfg.get("own_channel_type") == "page":
        from .facebook.uploader import page_token, upload_page_video

        url = upload_page_video(ctx.cfg.get_path("facebook.graph.page_id"), page_token(ctx.cfg), video_path, caption,
                                ctx.cfg.get_path("facebook.graph.api_version", "v21.0"))
    else:
        from .facebook.scraper import collect_videos, ensure_login
        from .facebook.uploader import upload_profile_reel

        headless = bool(ctx.cfg.get_path("facebook.headless", False))
        with BROWSER_LOCK, persistent_context(ctx.cfg.path("facebook.browser_profile_dir"), headless,
                                              ctx.cfg.get_path("facebook.locale", "vi-VN")) as bctx:
            page = bctx.new_page()
            ensure_login(page, headless)
            before = {v.url for v in collect_videos(page, ctx.cfg["own_channel"], scroll_rounds=3)}
            upload_profile_reel(page, video_path, caption, ctx.cfg.data_dir / "debug", headless)
            page.wait_for_timeout(20000)
            after = collect_videos(page, ctx.cfg["own_channel"], scroll_rounds=3)
            new = [v.url for v in after if v.url not in before]
            url = new[0] if new else None
            if url:  # kiểm tra lại quyền riêng tư trên trang video vừa đăng
                page.goto(url, wait_until="domcontentloaded")
                page.wait_for_timeout(3000)
                marker = page.locator('[aria-label*="Chỉ mình tôi" i], [aria-label*="Only me" i]').count()
                if not marker:
                    ctx.db.log("privacy_warning", f"Không xác nhận được quyền 'Chỉ mình tôi' cho {url} — hãy kiểm tra tay")
                    log.warning("Không xác nhận được quyền 'Chỉ mình tôi' cho %s — hãy kiểm tra tay!", url)

    ctx.db.execute("UPDATE productions SET status='uploaded', upload_url=?, uploaded_at=?, privacy=? WHERE id=?",
                   (url, now_iso(), ctx.cfg.get_path("facebook.upload_privacy", "only_me"), production_id))
    ctx.db.execute("UPDATE scripts SET status='uploaded' WHERE id=?", (prod["script_id"],))
    if url:
        ctx.db.upsert_video("own", url, production_id=production_id, privacy="only_me")
    ctx.db.log("upload", f"Sản phẩm #{production_id} đã đăng chế độ riêng tư: {url or '(chưa xác định URL)'}")
    return url


def approve(ctx: Ctx, production_id: int, url: str | None = None) -> None:
    """Gọi SAU KHI Bác sĩ Phạm Sơn đã duyệt và bạn đã chuyển video sang Công khai trên Facebook.
    Từ lúc này video mới được tính vào vòng học (video 'Chỉ mình tôi' không có view thật)."""
    prod = ctx.db.one("SELECT * FROM productions WHERE id=?", (production_id,))
    if not prod:
        raise ValueError(f"Không có sản phẩm #{production_id}")
    url = url or prod["upload_url"]
    if not url:
        raise ValueError("Chưa biết URL video trên Facebook — truyền thêm --url")
    ts = now_iso()
    ctx.db.execute("UPDATE productions SET status='approved', approved_at=?, privacy='public', upload_url=? WHERE id=?",
                   (ts, url, production_id))
    ctx.db.execute("UPDATE scripts SET status='approved' WHERE id=?", (prod["script_id"],))
    ctx.db.upsert_video("own", url, production_id=production_id, privacy="public")


def write_review_sheet(ctx: Ctx, production_id: int) -> Path:
    prod = ctx.db.one("SELECT * FROM productions WHERE id=?", (production_id,))
    draft, row = load_draft(ctx, prod["script_id"])
    score = json.loads(row["score_json"] or "{}")
    lines = [
        f"# Phiếu duyệt video #{production_id} — {draft.title}",
        "",
        f"- Kịch bản #{row['id']} · điểm **{row['total_score']:.0f}/100** · hướng: {draft.angle}",
        f"- File: `{prod['video_path']}`",
        f"- Giả thuyết: {draft.hypothesis}",
        "",
        "## Điểm từng tiêu chí",
        "| Tiêu chí | Điểm |",
        "|---|---|",
        *[f"| {k} | {v} |" for k, v in (score.get("per_criterion") or {}).items()],
        "",
        "## ☐ Nội dung y khoa cần Bác sĩ Phạm Sơn duyệt",
        *([f"- [ ] {c}" for c in draft.medical_claims] or ["- (không có)"]),
        "",
        "## ☐ Kiểm tra bắt buộc trước khi công khai",
        "- [ ] Không gợi ý giới tính thai nhi (kể cả màu sắc, đồ vật)",
        "- [ ] Không có từ cấm, không hứa hẹn kết quả, không báo giá",
        "- [ ] Hình ảnh AI không giống bệnh nhân/người thật cụ thể, không cảnh y khoa gây sợ",
        "- [ ] Bật nhãn 'Thông tin do AI tạo' khi chuyển sang Công khai",
        f"- [ ] Sau khi bác sĩ duyệt: thêm vào caption dòng \"{REVIEWED_NOTE}\"",
        "",
        "## Lời thoại & phụ đề",
        *[f"{s.idx}. ({s.seconds}s) {s.dialogue_vi}  \n   _Chữ:_ {s.on_screen_text_vi}" for s in draft.scenes],
        "",
        "## Caption",
        build_caption(ctx, draft),
        "",
        "## Sau khi duyệt",
        "1. Mở video trên Facebook → đổi quyền từ **Chỉ mình tôi** sang **Công khai**.",
        f"2. Chạy: `python -m flow_agent approve {production_id}` (thêm `--url <link>` nếu agent chưa ghi được link).",
        "3. Từ đó agent tính view thật của video này vào vòng tự học.",
    ]
    path = Path(prod["video_path"]).parent / "PHIEU_DUYET.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
