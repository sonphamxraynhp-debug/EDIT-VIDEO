"""Quy mô 100–1000 creative từ một bộ nguồn: thư viện hook, cổng đa dạng nguồn, biến số hình/tiếng,
điểm nguyên bản, ước tính kế hoạch, yếu tố thắng → lô kế tiếp.

Không có và sẽ không có: né fingerprint, lật/đổi tốc độ để qua bộ lọc trùng, đăng tự động, đa tài khoản.
Mục tiêu là nhiều creative KHÁC NHAU THẬT (kịch bản, hook, hình, tiếng) cho quảng cáo, không phải bản sao."""
from __future__ import annotations

import math
import random
import re
from collections import Counter, defaultdict
from pathlib import Path

from . import ai, config, creative, db, policy
from .errors import AppError

HOOK_SIM_MAX = 0.5          # hook mới phải khác mọi hook đã có
HOOK_REUSE_MAX = 5          # một hook dùng tối đa cho 5 biến thể
HOOK_WORDS = (3, 16)

# (mục tiêu lớn hơn, số video nguồn tối thiểu, số cảnh tối thiểu)
SOURCE_GATE = [(20, 3, 12), (100, 5, 25), (300, 8, 40)]

VOICE_RATES = [0.92, 1.0, 1.08]
def _has_vietnamese(path: str) -> bool:
    """Loại font thiếu glyph tiếng Việt (Verdana Bold trên macOS vẽ ô vuông): so mask ký tự với glyph .notdef."""
    try:
        from PIL import Image, ImageDraw, ImageFont
        f = ImageFont.truetype(path, 40)

        def render(ch: str) -> bytes:
            im = Image.new("L", (80, 80), 0)
            ImageDraw.Draw(im).text((5, 5), ch, font=f, fill=255)
            return im.tobytes()
        notdef = render("\ue000")
        return all(render(ch) != notdef for ch in "ắằẳặấẩậếềệốồổộớờởợứừửựỳỷỵđĐ")
    except Exception:  # noqa: BLE001
        return False


FONT_VARIANTS = [p for p in [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Verdana Bold.ttf",
    "/System/Library/Fonts/Supplemental/Trebuchet MS Bold.ttf",
    "/System/Library/Fonts/Supplemental/Tahoma Bold.ttf",
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/verdanab.ttf", "C:/Windows/Fonts/impact.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
] if Path(p).exists() and _has_vietnamese(p)] or list(config.FONT_CANDIDATES)

MUSIC_DIR = config.DATA_DIR / "music"
DEFAULT_DURATIONS = {"final": 45.0, "preview": 20.0, "script": 30.0, "voice": 8.0}
DEFAULT_FILE_MB = 12.0


def _ctx(campaign_id: str) -> dict:
    from . import pipeline  # tránh import vòng
    return pipeline.campaign_context(campaign_id)


# ---------------------------------------------------------------- nguồn: cổng đa dạng
def source_stats(project_id: str) -> dict:
    rows = db.q("SELECT s.asset_id, s.tags_json FROM scenes s JOIN assets a ON a.id=s.asset_id "
                "WHERE a.project_id=? AND s.review!='rejected'", (project_id,))
    tags = creative.scene_tag_counts([{"tags_json": r["tags_json"]} for r in rows])
    return {"assets": len({r["asset_id"] for r in rows}), "scenes": len(rows), "tags": dict(tags)}


def source_requirement(target: int) -> tuple[int, int]:
    need_a, need_s = 1, 1
    for thr, a, s in SOURCE_GATE:
        if target > thr:
            need_a, need_s = a, s
    return need_a, need_s


def check_source_gate(stats: dict, target: int, brief: dict | None = None) -> list[dict]:
    """Trả danh sách cảnh báo; ném NEED_MORE_SOURCE nếu thiếu nguồn và brief không bật allow_low_source."""
    need_a, need_s = source_requirement(target)
    warnings = []
    if stats["assets"] < need_a or stats["scenes"] < need_s:
        w = {"code": "NEED_MORE_SOURCE", "message": f"Mục tiêu {target} bản cần ≥{need_a} video nguồn và ≥{need_s} cảnh "
                                                     f"(đang có {stats['assets']} video, {stats['scenes']} cảnh)",
             "hint": "Quay thêm clip khác góc máy/bối cảnh rồi nhập vào Nguồn video. Ít nguồn = nhiều bản trùng hình, "
                     "nền tảng sẽ coi là nội dung lặp.", "required": {"assets": need_a, "scenes": need_s}, "have": stats}
        if not (brief or {}).get("allow_low_source"):
            raise AppError("NEED_MORE_SOURCE", w["message"], details=w, hint=w["hint"], status=422, retryable=False)
        warnings.append({**w, "severity": "warning", "message": w["message"] + " — đã bỏ qua theo thiết lập chiến dịch"})
    return warnings


# ---------------------------------------------------------------- thư viện hook
HOOK_SYSTEM = (
    "Bạn viết câu mở đầu (hook) 1–2 giây cho video quảng cáo ngắn tiếng Việt. Chỉ dùng thông tin trong PRODUCT BRAIN. "
    "Hook không được nêu lợi ích/công dụng chưa có trong CLAIMS ĐÃ DUYỆT, không hứa kết quả, không so sánh trước/sau, "
    "không giật tít sai, không nói về ngoại hình hay tình trạng của người xem. Hook được phép: đặt câu hỏi, nêu tình huống "
    "sử dụng, nêu sai lầm khi dùng, nêu một điều ít người biết về cách dùng, kể trải nghiệm trung tính. "
    "Mỗi hook phải khác hẳn nhau về cấu trúc câu và ý. Trả về đúng JSON."
)
_HOOK_PATTERNS = [
    "Bạn đã biết cách dùng {name} đúng chưa?", "3 điều nên biết trước khi dùng {name}",
    "Đừng dùng {name} nếu chưa xem hết video này", "Sai lầm phổ biến nhất khi dùng {name}",
    "Nếu bạn là {aud}, đây là cách mình dùng {name}", "Câu hỏi mình nhận nhiều nhất về {name}",
    "Một ngày của mình với {name} trông như thế này", "{usp} — nghe đơn giản nhưng ít ai để ý",
    "Mình đã đổi cách dùng {name} sau khi biết điều này", "Checklist 30 giây trước khi chọn {name}",
    "Điều mình ước biết sớm hơn về {name}", "Thử trả lời nhanh: bạn dùng {name} lúc nào trong ngày?",
]


def _hook_ok(text: str) -> bool:
    n = len(text.split())
    return HOOK_WORDS[0] <= n <= HOOK_WORDS[1] and not re.search(r"https?://|@|#", text)


def list_hooks(campaign_id: str, angle: str | None = None, status: str = "active") -> list[dict]:
    sql, args = "SELECT * FROM hooks WHERE campaign_id=?", [campaign_id]
    if status:
        sql += " AND status=?"
        args.append(status)
    if angle:
        sql += " AND (angle=? OR angle IS NULL)"
        args.append(angle)
    return db.q(sql + " ORDER BY used_count, created_at", args)


def filter_hooks(cands: list[str], existing: list[str], ctx: dict, industry: str, platforms: set[str]) -> tuple[list[str], Counter]:
    from . import pipeline
    blocked = pipeline.blocked_phrases(ctx["product"])
    kept, rejected = [], Counter()
    pool = list(existing)
    for h in cands:
        h = " ".join(h.split()).strip(" \"'")
        if not _hook_ok(h):
            rejected["độ dài"] += 1
            continue
        beat = [{"text": h, "claim_ids": [], "on_screen": ""}]
        if any(f["severity"] == "critical" for f in creative.check_script_claims(beat, ctx["claims"], blocked)):
            rejected["claim gate"] += 1
            continue
        if any(f["severity"] == "critical" for f in policy.check_policy(beat, industry, platforms)):
            rejected["chính sách"] += 1
            continue
        if any(creative.similarity(h, e) >= HOOK_SIM_MAX for e in pool):
            rejected["trùng hook đã có"] += 1
            continue
        kept.append(h)
        pool.append(h)
    return kept, rejected


def generate_hooks(campaign_id: str, angle: str | None = None, n: int = 10, use_llm: bool = True) -> dict:
    ctx = _ctx(campaign_id)
    if ctx["product"] is None:
        raise AppError("PRODUCT_MISSING", "Chiến dịch chưa gắn Product Brain", hint="Tạo hồ sơ sản phẩm trước.")
    brief = ctx["brief"]
    industry = policy.detect_industry(ctx["product"], brief)
    platforms = set(brief.get("platforms") or ["meta", "tiktok"])
    existing = [h["text"] for h in list_hooks(campaign_id, status=None)]
    cands: list[str] = []
    source = "template"
    if use_llm and ai.llm_available():
        approved = [c for c in ctx["claims"] if c["status"] == "approved"]
        attrs = ctx["product"].get("attributes_json") or {}
        prompt = (f"PRODUCT BRAIN\nTên: {ctx['product']['name']} | Danh mục: {attrs.get('category', '')}\n"
                  f"USP: {attrs.get('usp', '')}\nHướng dẫn: {attrs.get('usage', '')}\n"
                  f"CLAIMS ĐÃ DUYỆT:\n" + "\n".join(f"- {c['text']}" for c in approved) +
                  f"\nFAQ:\n" + "\n".join(f"- {f['q']}" for f in ctx["faqs"][:6]) +
                  (f"\nGÓC NỘI DUNG: {creative.ANGLES.get(angle, {}).get('label', angle)}" if angle else "") +
                  f"\nHOOK ĐÃ CÓ (phải khác hẳn):\n" + "\n".join(f"- {e}" for e in existing[-30:]) +
                  f"\n\nViết {n * 2} hook, mỗi hook ≤ {HOOK_WORDS[1]} từ. Trả JSON: {{\"hooks\": [str, ...]}}")

        def validate(o):
            hs = [str(h) for h in (o.get("hooks") if isinstance(o, dict) else []) or [] if str(h).strip()]
            if len(hs) < 3:
                raise ValueError("schema: hooks < 3")
            return hs
        try:
            cands = ai.generate_json(HOOK_SYSTEM, prompt, validate, temperature=0.9,
                                     seed=int(brief.get("seed", 42)) + len(existing))
            source = f"ollama:{config.OLLAMA_MODEL}"
        except RuntimeError as e:
            db.log_activity(f"LLM hook lỗi, dùng mẫu: {str(e)[:80]}", ctx["campaign"]["project_id"], "warning")
    if not cands:
        attrs = ctx["product"].get("attributes_json") or {}
        auds = [creative.AUDIENCES.get(a, a).lower() for a in (brief.get("audiences") or list(creative.AUDIENCES))]
        rng = random.Random(len(existing))
        cands = [p.format(name=ctx["product"]["name"], aud=rng.choice(auds), usp=attrs.get("usp") or ctx["product"]["name"])
                 for p in _HOOK_PATTERNS]
    kept, rejected = filter_hooks(cands, existing, ctx, industry, platforms)
    kept = kept[:n]
    rows = [db.insert("hooks", {"campaign_id": campaign_id, "angle": angle, "text": h, "source": source,
                                "created_at": db.now()}) for h in kept]
    db.log_activity(f"Thư viện hook +{len(rows)} ({source})", ctx["campaign"]["project_id"])
    return {"created": len(rows), "rejected": dict(rejected), "hooks": rows, "source": source,
            "total_active": len(list_hooks(campaign_id))}


def pick_hook(campaign_id: str, angle: str | None, seed: int, preferred: list[str] | None = None) -> dict | None:
    """Hook ít dùng nhất cho góc này (ưu tiên hook thắng nếu có), tôn trọng giới hạn tái sử dụng."""
    hooks = [h for h in list_hooks(campaign_id, angle) if h["used_count"] < HOOK_REUSE_MAX]
    if not hooks:
        return None
    if preferred:
        pref = [h for h in hooks if h["id"] in preferred]
        if pref:
            hooks = pref
    low = hooks[0]["used_count"]
    cands = [h for h in hooks if h["used_count"] == low]
    return random.Random(seed).choice(cands)


def mark_hook_used(hook_id: str, variant_id: str) -> None:
    db.conn().execute("UPDATE hooks SET used_count=used_count+1 WHERE id=?", (hook_id,))
    db.conn().execute("UPDATE variants SET hook_id=? WHERE id=?", (hook_id, variant_id))


# ---------------------------------------------------------------- biến số hình / tiếng cho concept
AUTO_MUSIC_MOODS = ("upbeat", "inspirational", "corporate", "calm", "mine")   # tâm trạng hợp video giới thiệu sản phẩm


def music_library() -> list[dict]:
    from . import music
    return music.library()


def voice_options() -> list[dict]:
    from . import tts
    out = []
    for p in tts.providers():
        # giọng VieNeu chỉ dùng khi người dùng chọn cho cả chiến dịch, không tự xoay vòng giữa các bản
        if p.get("ready") and not p["id"].startswith("vieneu"):
            for v in p.get("voices") or []:
                out.append({"provider": p["id"], "voice": v})
    return out or [tts.default_voice()]


def decorate_concept(concept: dict, idx: int, brief: dict) -> dict:
    """Gán biến số hình/tiếng theo chỉ số để các bản khác nhau cả khi cùng góc/khán giả."""
    rng = random.Random(1000 + idx)
    voices = voice_options()
    v = voices[idx % len(voices)]
    # tự xoay nhạc chỉ trong các tâm trạng hợp video sản phẩm; nhạc buồn, kịch tính, hài chỉ dùng khi người dùng tự chọn
    music = [m for m in music_library() if m.get("mood") in AUTO_MUSIC_MOODS]
    chosen_music = music[idx % (len(music) + 1) - 1] if music and idx % (len(music) + 1) else None
    return {**concept,
            "voice": {"provider": v["provider"], "voice": v["voice"], "rate": VOICE_RATES[idx % len(VOICE_RATES)]},
            "music": chosen_music["path"] if chosen_music else None,
            "font": idx % len(FONT_VARIANTS),
            "caption_position": rng.choice(["low", "mid"]) if "tiktok" not in (brief.get("platforms") or []) else "mid"}


# ---------------------------------------------------------------- điểm nguyên bản (hình + tiếng + chữ)
def variant_features(vid: str) -> dict | None:
    from . import pipeline
    v = db.q1("SELECT * FROM variants WHERE id=?", (vid,))
    s = pipeline.latest_script(vid)
    if not v or not s:
        return None
    sb = pipeline.latest_storyboard(vid)
    c = v["concept_json"]
    clips = (sb or {}).get("timeline_json", {}).get("tracks", {}).get("video", []) if sb else []
    return {"id": vid, "text": creative.script_text(s["beats_json"]["beats"]),
            "hook": (s["beats_json"]["beats"] or [{}])[0].get("text", ""),
            "scenes": [cl.get("scene_id") for cl in clips], "motions": [cl.get("motion") for cl in clips],
            "alts": [(cl.get("alt") or {}).get("scene_id") for cl in clips],
            "format": c.get("format", "full"), "voice": c.get("voice") or {}, "music": c.get("music"),
            "font": c.get("font", 0)}


def composite_similarity(a: dict, b: dict) -> dict:
    text = creative.similarity(a["text"], b["text"])
    hook = creative.similarity(a["hook"], b["hook"]) if a["hook"] and b["hook"] else text
    sa, sb_ = set(filter(None, a["scenes"])), set(filter(None, b["scenes"]))
    jac = len(sa & sb_) / len(sa | sb_) if (sa | sb_) else 0.0
    same_order = bool(a["scenes"]) and a["scenes"] == b["scenes"]
    visual = jac * (0.6 if a["format"] != b["format"] else 1.0) * (0.85 if a["font"] != b["font"] else 1.0)
    if same_order:
        visual = min(1.0, visual + 0.15)
    av, bv = a["voice"], b["voice"]
    audio = (0.6 if (av.get("voice"), av.get("provider")) == (bv.get("voice"), bv.get("provider")) else 0.0) \
        + (0.2 if av.get("rate") == bv.get("rate") else 0.0) + (0.2 if a["music"] == b["music"] else 0.0)
    total = 0.35 * text + 0.15 * hook + 0.35 * visual + 0.15 * audio
    return {"text": round(text, 3), "hook": round(hook, 3), "visual": round(visual, 3), "audio": round(audio, 3),
            "total": round(total, 3)}


def originality_min() -> float:
    return float(db.get_setting("originality_min", 0.35) or 0.35)


def update_originality(campaign_id: str) -> dict:
    """Điểm nguyên bản = 1 − độ giống tổng hợp với bản gần nhất trong chiến dịch. Lưu vào variants.originality_json."""
    feats = [f for f in (variant_features(v["id"]) for v in db.q("SELECT id FROM variants WHERE campaign_id=? AND status!='REJECTED'", (campaign_id,))) if f]   # bản đã loại không tính
    out = {}
    thr = originality_min()
    for f in feats:
        best, nearest = None, None
        for g in feats:
            if g["id"] == f["id"]:
                continue
            sim = composite_similarity(f, g)
            if best is None or sim["total"] > best["total"]:
                best, nearest = sim, g["id"]
        score = round(1 - (best["total"] if best else 0.0), 3)
        rec = {"score": score, "nearest": nearest, **({k: v for k, v in best.items() if k != "total"} if best else {}),
               "pass": score >= thr, "min": thr, "computed_at": db.now()}
        db.update("variants", f["id"], {"originality_json": rec})
        out[f["id"]] = rec
    return out


def originality_for(variant_id: str) -> dict | None:
    """Chỉ tính cho một biến thể (O(n)) — dùng khi chiến dịch lớn."""
    f = variant_features(variant_id)
    if not f:
        return None
    v = db.q1("SELECT campaign_id FROM variants WHERE id=?", (variant_id,))
    best, nearest = None, None
    for o in db.q("SELECT id FROM variants WHERE campaign_id=? AND id!=? AND status!='REJECTED'", (v["campaign_id"], variant_id)):
        g = variant_features(o["id"])
        if not g:
            continue
        sim = composite_similarity(f, g)
        if best is None or sim["total"] > best["total"]:
            best, nearest = sim, o["id"]
    thr = originality_min()
    score = round(1 - (best["total"] if best else 0.0), 3)
    rec = {"score": score, "nearest": nearest, **({k: v2 for k, v2 in best.items() if k != "total"} if best else {}),
           "pass": score >= thr, "min": thr, "computed_at": db.now()}
    db.update("variants", variant_id, {"originality_json": rec})
    return rec


def originality_block(variant_id: str) -> dict | None:
    v = db.q1("SELECT originality_json FROM variants WHERE id=?", (variant_id,))
    o = (v or {}).get("originality_json") or {}
    if o and o.get("score") is not None and o["score"] < originality_min():
        return o
    return None


# ---------------------------------------------------------------- ước tính kế hoạch (cây)
def _avg_job_seconds(kind: str) -> float:
    r = db.q1("SELECT AVG((julianday(finished_at)-julianday(started_at))*86400) s FROM render_jobs "
              "WHERE kind=? AND status='COMPLETED' AND started_at IS NOT NULL AND finished_at IS NOT NULL", (kind,))
    s = r["s"] if r and r["s"] else None
    return float(s) if s and s > 0 else DEFAULT_DURATIONS[kind]


def _avg_file_mb() -> float:
    sizes = []
    for r in db.q("SELECT output_uri FROM exports ORDER BY created_at DESC LIMIT 30"):
        p = Path(r["output_uri"])
        if p.exists():
            sizes.append(p.stat().st_size / 1e6)
    return sum(sizes) / len(sizes) if sizes else DEFAULT_FILE_MB


def estimate_plan(campaign_id: str, target: int) -> dict:
    ctx = _ctx(campaign_id)
    brief = ctx["brief"]
    stats = source_stats(ctx["campaign"]["project_id"])
    warnings: list[dict] = []
    try:
        warnings += check_source_gate(stats, target, brief)
    except AppError as e:
        warnings.append({"severity": "critical", **(e.details or {})})
    plan = creative.plan_matrix(brief, ctx["scenes"], ctx["claims"], target, seed=int(brief.get("seed", 42)))
    feasible = sum(1 for p in plan["proposals"] if p["feasible"]) if "proposals" in plan else plan.get("feasible", 0)
    approved = [c for c in ctx["claims"] if c["status"] == "approved"]
    hooks_have = len(list_hooks(campaign_id))
    hooks_need = math.ceil(target / HOOK_REUSE_MAX)
    if hooks_have < hooks_need:
        warnings.append({"severity": "warning", "code": "HOOKS_LOW",
                         "message": f"Cần ≥{hooks_need} hook cho {target} bản (đang có {hooks_have}) — sinh thêm ở Thư viện hook"})
    if len(approved) < min(5, 2 + target // 50):
        warnings.append({"severity": "warning", "code": "CLAIMS_LOW",
                         "message": f"Chỉ có {len(approved)} claim đã duyệt — kịch bản sẽ lặp ý. Nên có ≥{min(5, 2 + target // 50)}"})
    if feasible < target:
        warnings.append({"severity": "critical", "code": "COMBOS_LOW",
                         "message": f"Chỉ {feasible} tổ hợp khả thi cho {target} bản — thêm góc/khán giả/thời lượng/bố cục hoặc thêm cảnh"})
    parallel = int(db.get_setting("parallel_jobs", 2) or 2)
    t_script, t_voice, t_prev, t_final = (_avg_job_seconds(k) for k in ("script", "voice", "preview", "final"))
    llm_hours = target * t_script / 3600                               # LLM chạy tuần tự (1 luồng ai)
    render_hours = target * (t_voice + t_prev + t_final) / 3600 / max(1, parallel)
    voices, music = voice_options(), music_library()
    capacity = max(1, stats["scenes"]) * len(brief.get("formats") or ["full", "packshot_text"]) * len(voices) \
        * len(VOICE_RATES) * max(1, len(music)) * len(FONT_VARIANTS)
    return {"target": target, "source": stats, "requirement": dict(zip(("assets", "scenes"), source_requirement(target))),
            "hooks": {"have": hooks_have, "need": hooks_need, "reuse_max": HOOK_REUSE_MAX},
            "claims_approved": len(approved), "feasible_combos": feasible,
            "dimensions": {"audiences": len(brief.get("audiences") or list(creative.AUDIENCES)[:2]),
                           "angles": len(brief.get("creative_angles") or list(creative.ANGLES)),
                           "narratives": len(brief.get("narratives") or list(creative.NARRATIVES)),
                           "durations": len(brief.get("durations_sec") or [30]),
                           "formats": len(brief.get("formats") or ["full", "packshot_text"]),
                           "voices": len(voices), "voice_rates": len(VOICE_RATES), "music": len(music), "fonts": len(FONT_VARIANTS)},
            "visual_audio_capacity": capacity,
            "eta": {"script_hours": round(llm_hours, 1), "render_hours": round(render_hours, 1),
                    "total_hours": round(llm_hours + render_hours, 1), "parallel": parallel,
                    "per_job_s": {"script": round(t_script), "voice": round(t_voice), "preview": round(t_prev), "final": round(t_final)}},
            "disk_gb": round(target * _avg_file_mb() * 1.6 / 1000, 1),      # final + preview + cache giọng
            "warnings": warnings, "industry": policy.detect_industry(ctx["product"], brief),
            "platforms": brief.get("platforms") or ["meta", "tiktok"]}


# ---------------------------------------------------------------- yếu tố thắng → lô kế tiếp
KPIS = {"ctr": "CTR", "hold_3s": "Giữ chân 3s", "completion": "Xem hết", "views": "Lượt xem", "conversions": "Chuyển đổi"}
DIMS = ("hook", "angle", "audience", "narrative", "format", "duration", "voice_rate", "music")


def _dim_values(v: dict, hooks: dict) -> dict:
    c = v["concept_json"]
    return {"hook": hooks.get(v.get("hook_id"), "(tự do)"), "angle": c.get("angle"), "audience": c.get("audience"),
            "narrative": c.get("narrative"), "format": c.get("format"), "duration": c.get("duration"),
            "voice_rate": (c.get("voice") or {}).get("rate"), "music": Path(c["music"]).stem if c.get("music") else "(không)"}


def learnings(campaign_id: str, kpi: str = "ctr") -> dict:
    if kpi not in KPIS:
        raise AppError("BAD_KPI", f"KPI không hợp lệ, chọn một trong {list(KPIS)}", status=422)
    rows = db.q(f"SELECT v.*, AVG(m.{kpi}) kpi, SUM(m.views) views, COUNT(m.id) n_metrics FROM variants v "
                f"JOIN metrics m ON m.variant_id=v.id WHERE v.campaign_id=? AND m.{kpi} IS NOT NULL GROUP BY v.id", (campaign_id,))
    hooks = {h["id"]: h["text"] for h in list_hooks(campaign_id, status=None)}
    if not rows:
        return {"kpi": kpi, "variants_with_data": 0, "mean": None, "dimensions": {}, "winners": [],
                "note": "Chưa có số liệu hiệu suất — nhập CSV từ Ads Manager ở màn Phân tích."}
    mean = sum(r["kpi"] for r in rows) / len(rows)
    agg: dict[str, dict] = {d: defaultdict(list) for d in DIMS}
    for r in rows:
        for d, val in _dim_values(r, hooks).items():
            agg[d][str(val)].append(r["kpi"])
    dims, winners = {}, []
    for d in DIMS:
        items = []
        for val, xs in agg[d].items():
            m = sum(xs) / len(xs)
            lift = (m / mean - 1) if mean else 0.0
            items.append({"value": val, "n": len(xs), "mean": round(m, 4), "lift": round(lift, 3),
                          "label": _label(d, val, hooks)})
        items.sort(key=lambda x: -x["mean"])
        dims[d] = items
        winners += [{"dimension": d, **it} for it in items if it["n"] >= 2 and it["lift"] > 0.1]
    winners.sort(key=lambda w: -w["lift"])
    return {"kpi": kpi, "kpi_label": KPIS[kpi], "variants_with_data": len(rows), "mean": round(mean, 4),
            "dimensions": dims, "winners": winners[:12],
            "note": "Tương quan ≠ nhân quả. Yếu tố có n<2 không được tính là thắng. Số liệu do bạn nhập từ Ads Manager."}


def _label(d: str, val: str, hooks: dict) -> str:
    if d == "angle":
        return creative.ANGLES.get(val, {}).get("label", val)
    if d == "audience":
        return creative.AUDIENCES.get(val, val)
    if d == "narrative":
        return creative.NARRATIVES.get(val, val)
    if d == "format":
        return creative.FORMATS.get(val, val)
    if d == "duration":
        return f"{val}s"
    if d == "voice_rate":
        return f"tốc độ {val}" if val not in (None, "None", "") else "tốc độ mặc định"
    return val


def weights_from_learnings(learn: dict) -> dict[str, dict[str, float]]:
    """Trọng số 0.5–2.0 cho từng giá trị theo lift; chỉ dùng giá trị có n≥2."""
    w: dict[str, dict[str, float]] = {}
    for d, items in learn.get("dimensions", {}).items():
        w[d] = {it["value"]: max(0.5, min(2.0, 1 + it["lift"])) for it in items if it["n"] >= 2}
    return w


def next_batch(campaign_id: str, target: int, kpi: str = "ctr", explore: float = 0.2, use_llm: bool = True) -> dict:
    """Lô kế tiếp: ma trận có trọng số theo yếu tố thắng, hook thắng được ưu tiên, một phần khám phá hook mới."""
    from . import pipeline
    learn = learnings(campaign_id, kpi)
    weights = weights_from_learnings(learn)
    winning_hooks = [h["id"] for h in list_hooks(campaign_id, status=None)
                     if any(w["dimension"] == "hook" and w["value"] == h["text"] for w in learn["winners"])]
    n_new_hooks = max(2, math.ceil(target * explore / HOOK_REUSE_MAX))
    fresh = generate_hooks(campaign_id, None, n_new_hooks, use_llm) if use_llm else {"created": 0}
    res = pipeline.generate_variants(campaign_id, target=target, weights=weights, preferred_hooks=winning_hooks,
                                     new_batch=True)
    return {**res, "kpi": kpi, "weights_used": {d: len(v) for d, v in weights.items()}, "winning_hooks": len(winning_hooks),
            "fresh_hooks": fresh["created"], "learnings": learn}
