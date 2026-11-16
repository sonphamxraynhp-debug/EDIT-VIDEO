"""M02/M04/M05/M06/M10: claim registry, creative matrix, script factory, storyboard, similarity.

Nguyên tắc: không bịa claim; tổ hợp tham số không mặc nhiên là khác biệt; thiếu footage → NEED_MORE_SOURCE.
"""
from __future__ import annotations

import itertools
import math
import random
import re
import unicodedata
from collections import Counter

# ---------------------------------------------------------------- trục ma trận
AUDIENCES = {
    "new_buyers": "Người mua lần đầu",
    "sensitive": "Người cần sự an toàn",
    "busy_professionals": "Người bận rộn",
    "ingredient_focused": "Quan tâm thành phần",
    "loyal": "Khách hàng trung thành",
}
ANGLES = {
    "how_to": {"label": "Hướng dẫn", "group": "Giáo dục", "needs": ["demonstration", "hand"]},
    "faq": {"label": "Giải đáp", "group": "FAQ", "needs": []},
    "demo": {"label": "Demo", "group": "Demo", "needs": ["demonstration"]},
    "comparison": {"label": "So sánh", "group": "So sánh", "needs": ["packshot"]},
    "mistakes": {"label": "Sai lầm thường gặp", "group": "Giáo dục", "needs": []},
    "feature": {"label": "Phân tích tính năng", "group": "Thông tin", "needs": ["packshot"]},
    "brand_story": {"label": "Câu chuyện thương hiệu", "group": "Thương hiệu", "needs": ["face"]},
    "checklist": {"label": "Checklist", "group": "Hướng dẫn", "needs": []},
    "qa": {"label": "Q&A", "group": "FAQ", "needs": ["face"]},
    "tips": {"label": "Mẹo ứng dụng", "group": "Hướng dẫn", "needs": ["hand"]},
}
NARRATIVES = {
    "problem_solution": "Vấn đề → Giải pháp",
    "how_to": "How-to 3 bước",
    "faq": "Hỏi – Đáp",
    "comparison": "So sánh",
    "product_story": "Câu chuyện sản phẩm",
}
FORMATS = {"full": "Toàn màn hình", "split": "Chia đôi", "packshot_text": "Packshot + chữ", "pip": "Picture-in-picture"}
DURATIONS = [15, 30, 45]
SHOT_TAGS = ["demonstration", "packshot", "face", "hand", "before_after", "cta", "close_up", "presenter",
             "packaging", "insert"]

RISKY_PHRASES = [
    "chữa khỏi", "điều trị", "trị dứt điểm", "khỏi hẳn", "100%", "cam kết", "tốt nhất", "số 1", "duy nhất",
    "thần kỳ", "thần thánh", "vĩnh viễn", "ngay lập tức", "bác sĩ khuyên", "chuyên gia khuyên", "không tác dụng phụ",
    "an toàn tuyệt đối", "giảm cân", "trắng bật tông", "hiệu quả sau 1 ngày",
]
BENEFIT_WORDS = ["giúp", "hiệu quả", "cải thiện", "làm sáng", "làm mờ", "giảm", "tăng cường", "ngăn ngừa", "phục hồi",
                 "an toàn", "chống", "căng bóng", "trắng", "mờ thâm", "se khít", "dưỡng ẩm sâu"]
CITE_BLOCK = 0.2      # độ khớp tối thiểu giữa câu và claim được trích (nội bộ, cần hiệu chỉnh bằng dữ liệu gán nhãn)
CITE_WARN = 0.35
WORDS_PER_SEC = 3.0   # tốc độ đọc tiếng Việt tự nhiên ~180 từ/phút


# ---------------------------------------------------------------- văn bản
def norm(text: str) -> str:
    text = unicodedata.normalize("NFC", text.lower())
    return re.sub(r"[^\w\s%]", " ", text)


def tokens(text: str) -> list[str]:
    return [t for t in norm(text).split() if t]


def _vec(text: str) -> Counter:
    t = tokens(text)
    return Counter(t + [a + "_" + b for a, b in zip(t, t[1:])])


def similarity(a: str, b: str) -> float:
    """Cosine trên unigram+bigram — chỉ là chỉ số nội bộ, không đại diện quyết định nền tảng."""
    va, vb = _vec(a), _vec(b)
    if not va or not vb:
        return 0.0
    dot = sum(va[k] * vb[k] for k in va.keys() & vb.keys())
    return round(dot / (math.sqrt(sum(v * v for v in va.values())) * math.sqrt(sum(v * v for v in vb.values()))), 3)


def cluster(items: list[tuple[str, str]], threshold: float = 0.6) -> dict[str, str]:
    """Gom cụm near-duplicate greedy. items=[(id, text)] → {id: cluster_id}."""
    reps: list[tuple[str, str]] = []
    out: dict[str, str] = {}
    for id_, text in items:
        for cid, rtext in reps:
            if similarity(text, rtext) >= threshold:
                out[id_] = cid
                break
        else:
            cid = f"K{len(reps) + 1:03d}"
            reps.append((cid, text))
            out[id_] = cid
    return out


def estimate_seconds(text: str) -> float:
    return round(len(tokens(text)) / WORDS_PER_SEC, 1)


# ---------------------------------------------------------------- claim check (M02-04, M05-07, M10-05)
def check_script_claims(beats: list[dict], claims: list[dict], blocked: list[str] | None = None) -> list[dict]:
    approved = {c["id"]: c for c in claims if c["status"] == "approved"}
    prohibited = [c for c in claims if c["status"] in ("prohibited", "expired")]
    blocked = [b.lower() for b in (blocked or []) if b.strip()]
    flags: list[dict] = []
    for i, beat in enumerate(beats):
        text = beat.get("text", "")
        low = norm(text)
        cited = [approved[c] for c in beat.get("claim_ids", []) or [] if c in approved]
        for cid in beat.get("claim_ids", []) or []:
            if cid not in approved:
                flags.append({"beat": i, "code": "BLOCK-01", "severity": "critical",
                              "message": f"Câu dẫn claim {cid[:8]} chưa được duyệt hoặc không tồn tại"})
        if cited:
            # Trích dẫn phải khớp nội dung: chặn việc gắn ID hợp lệ cho một câu lợi ích bịa thêm
            best = max(similarity(text, c["text"]) for c in cited)
            if best < CITE_BLOCK:
                flags.append({"beat": i, "code": "BLOCK-01", "severity": "critical",
                              "message": f"Câu không khớp nội dung claim được trích (độ khớp {best:.0%}): “{cited[0]['text']}”"})
            elif best < CITE_WARN:
                flags.append({"beat": i, "code": "WARN-CITE", "severity": "warning",
                              "message": f"Câu diễn đạt khác claim được trích (độ khớp {best:.0%}) – cần người kiểm tra"})
        elif beat.get("type") in ("hook", "body") and any(norm(w).strip() in low for w in BENEFIT_WORDS):
            flags.append({"beat": i, "code": "WARN-CLAIM", "severity": "warning",
                          "message": "Câu nêu lợi ích/công dụng nhưng không gắn claim đã duyệt"})
        for c in prohibited:
            if similarity(text, c["text"]) > 0.55:
                flags.append({"beat": i, "code": "BLOCK-01", "severity": "critical",
                              "message": f"Trùng claim bị cấm/hết hạn: “{c['text']}”"})
        for p in RISKY_PHRASES + blocked:
            if norm(p).strip() and norm(p).strip() in low:
                flags.append({"beat": i, "code": "BLOCK-01", "severity": "critical",
                              "message": f"Cụm từ rủi ro/không được dùng: “{p}”"})
        nums = re.findall(r"\d+[\d.,]*\s*(%|ngày|tuần|lần|đ|k|ml|mg)?", text)
        if nums and not beat.get("claim_ids"):
            supported = any(re.search(re.escape(n[0] if isinstance(n, tuple) else n), c["text"])
                            for c in approved.values() for n in re.findall(r"\d+", text))
            if not supported:
                flags.append({"beat": i, "code": "WARN-CLAIM", "severity": "warning",
                              "message": "Có số liệu nhưng không gắn evidence/claim đã duyệt"})
    return flags


# ---------------------------------------------------------------- ma trận (M04)
def scene_tag_counts(scenes: list[dict]) -> Counter:
    c: Counter = Counter()
    for s in scenes:
        for t in s.get("tags_json") or []:
            c[t] += 1
    return c


def plan_matrix(brief: dict, scenes: list[dict], claims: list[dict], target: int, seed: int = 42,
                weights: dict | None = None) -> dict:
    """weights: {dimension: {value: 0.5–2.0}} từ yếu tố thắng (lô kế tiếp) — nhân vào điểm xếp hạng."""
    audiences = brief.get("audiences") or list(AUDIENCES)[:2]
    angles = brief.get("creative_angles") or list(ANGLES)
    narratives = brief.get("narratives") or list(NARRATIVES)
    durations = brief.get("durations_sec") or [30]
    formats = brief.get("formats") or ["full", "packshot_text"]
    quota_ratio = float(brief.get("quota_ratio", 0.25))   # M04-09: ≤25% một góc

    tag_counts = scene_tag_counts(scenes)
    approved = [c for c in claims if c["status"] == "approved"]
    combos = list(itertools.product(audiences, angles, narratives, durations, formats))
    rng = random.Random(seed)
    rng.shuffle(combos)

    proposals, rejected = [], Counter()
    per_angle: Counter = Counter()
    quota = max(1, math.ceil(target * quota_ratio))
    for aud, ang, nar, dur, fmt in combos:
        info = ANGLES.get(ang, {"label": ang, "needs": []})
        missing = [t for t in info["needs"] if tag_counts[t] == 0]
        reason = None
        if not scenes:
            reason = "NEED_MORE_SOURCE: chưa có scene catalog"
        elif missing:
            reason = f"NEED_MORE_SOURCE: thiếu cảnh {', '.join(missing)}"
        elif not approved:
            reason = "Thiếu claim đã duyệt trong Product Brain"
        elif dur * WORDS_PER_SEC > 160:
            reason = "Thời lượng vượt khả năng kịch bản"
        if reason:
            rejected[reason.split(":")[0]] += 1
            proposals.append({"audience": aud, "angle": ang, "narrative": nar, "duration": dur, "format": fmt,
                              "feasible": False, "reason": reason, "score": 0})
            continue
        coverage = 1.0 if not info["needs"] else min(1.0, sum(tag_counts[t] for t in info["needs"]) / (2 * len(info["needs"])))
        novelty = 1 - per_angle[ang] / max(1, quota)
        score = round(100 * (0.45 * coverage + 0.35 * novelty + 0.2 * min(1, len(approved) / 3)), 1)
        if weights:
            vals = {"audience": aud, "angle": ang, "narrative": nar, "duration": str(dur), "format": fmt}
            ws = [weights[d][v] for d, v in vals.items() if d in weights and v in weights[d]]
            if ws:
                score = round(score * (sum(ws) / len(ws)), 1)
        proposals.append({"audience": aud, "angle": ang, "narrative": nar, "duration": dur, "format": fmt,
                          "feasible": True, "reason": None, "score": score, "coverage": round(coverage, 2)})
        per_angle[ang] += 1

    feasible = sorted([p for p in proposals if p["feasible"]], key=lambda p: -p["score"])
    chosen, used = [], Counter()
    for p in feasible:                               # áp quota đa dạng
        if len(chosen) >= target:
            break
        if used[p["angle"]] >= quota:
            continue
        chosen.append(p)
        used[p["angle"]] += 1
    for p in feasible:                               # lấp đầy nếu vẫn thiếu, có cảnh báo
        if len(chosen) >= target:
            break
        if p not in chosen:
            p = {**p, "quota_overflow": True}
            chosen.append(p)
    theoretical = len(combos)
    return {
        "theoretical": theoretical,
        "feasible_count": len(feasible),
        "rejected_count": theoretical - len(feasible),
        "rejected_reasons": dict(rejected),
        "chosen": chosen,
        "proposals": proposals,
        "angle_distribution": dict(Counter(p["angle"] for p in chosen)),
    }


def concept_text(c: dict) -> str:
    return f"{AUDIENCES.get(c['audience'], c['audience'])} {ANGLES.get(c['angle'], {}).get('label', c['angle'])} " \
           f"{NARRATIVES.get(c['narrative'], c['narrative'])}"


# ---------------------------------------------------------------- kịch bản (M05)
SCRIPT_SYSTEM = (
    "Bạn là biên kịch video ngắn tiếng Việt cho thương mại điện tử. Chỉ dùng thông tin trong PRODUCT BRAIN. "
    "Mọi câu nêu lợi ích/công dụng phải gắn claim_ids lấy từ danh sách CLAIMS ĐÃ DUYỆT và chỉ được diễn đạt lại "
    "đúng nội dung claim đó, không thêm tính từ hay lợi ích khác (ví dụ không viết 'hiệu quả', 'dưỡng da' nếu claim "
    "không nói vậy). Câu không có claim thì chỉ được nói về cách dùng/FAQ hoặc đặt câu hỏi. Tuyệt đối không bịa "
    "giá, ưu đãi, đánh giá khách hàng, khuyến nghị chuyên gia, kết quả y khoa. Trả về đúng JSON."
)


def build_script_prompt(product: dict, claims: list[dict], concept: dict, faq: list[dict]) -> str:
    attrs = product.get("attributes_json") or {}
    approved = [c for c in claims if c["status"] == "approved"]
    claim_lines = "\n".join(f'- id="{c["id"]}": {c["text"]}' for c in approved)
    faq_lines = "\n".join(f"- H: {f.get('q')} / Đ: {f.get('a')}" for f in faq[:6])
    n_words = int(concept["duration"] * WORDS_PER_SEC * 0.9)
    return f"""PRODUCT BRAIN
Tên: {product['name']} | Danh mục: {attrs.get('category', '')} | Giá tham khảo: {attrs.get('price', 'không nêu')}
Mô tả: {attrs.get('short_description', '')}
USP: {attrs.get('usp', '')}
Hướng dẫn: {attrs.get('usage', '')}
Giới hạn: {attrs.get('limitations', '')}
CTA được phép: {attrs.get('allowed_cta', 'Tìm hiểu thêm')}
Câu không được dùng: {', '.join(attrs.get('blocked_phrases', []))}
CLAIMS ĐÃ DUYỆT:
{claim_lines or '(chưa có)'}
FAQ:
{faq_lines or '(chưa có)'}

CONCEPT: khán giả={AUDIENCES.get(concept['audience'], concept['audience'])}; góc={ANGLES.get(concept['angle'], {}).get('label')};
cấu trúc={NARRATIVES.get(concept['narrative'])}; thời lượng={concept['duration']} giây (~{n_words} từ lời thoại).

Trả JSON: {{"title": str, "hooks": [3-5 câu hook ngắn, không giật tít sai],
"beats": [{{"type": "hook"|"body"|"cta", "text": lời thoại, "on_screen": chữ trên màn hình ≤ 8 từ,
"visual": mô tả cảnh, "shot_tags": [từ trong {SHOT_TAGS}], "claim_ids": [id claim dùng trong câu]}}]}}
Cần 1 hook, 2-5 body, 1 cta."""


def validate_script(obj: dict, approved_ids: set[str]) -> dict:
    if not isinstance(obj, dict) or not isinstance(obj.get("beats"), list) or not obj["beats"]:
        raise ValueError("schema: beats missing")
    beats = []
    for b in obj["beats"]:
        if not isinstance(b, dict) or not str(b.get("text", "")).strip():
            continue
        t = b.get("type") if b.get("type") in ("hook", "body", "cta") else "body"
        beats.append({
            "type": t, "text": str(b["text"]).strip(), "on_screen": str(b.get("on_screen", ""))[:60],
            "visual": str(b.get("visual", "")), "claim_ids": [c for c in b.get("claim_ids") or [] if isinstance(c, str)],
            "shot_tags": [s for s in b.get("shot_tags") or [] if s in SHOT_TAGS],
        })
    if len(beats) < 3:
        raise ValueError("schema: too few beats")
    hooks = [str(h) for h in obj.get("hooks") or [] if str(h).strip()][:5]
    return {"title": str(obj.get("title") or beats[0]["text"][:60]), "hooks": hooks or [beats[0]["text"]],
            "beats": beats}


def template_script(product: dict, claims: list[dict], concept: dict, faq: list[dict], seed: int) -> dict:
    """Engine dự phòng deterministic khi LLM không có: chỉ ghép từ dữ liệu đã duyệt."""
    rng = random.Random(seed)
    attrs = product.get("attributes_json") or {}
    name = product["name"]
    approved = [c for c in claims if c["status"] == "approved"]
    rng.shuffle(approved)
    n_body = 2 if concept["duration"] <= 15 else 3 if concept["duration"] <= 30 else 4
    ang = concept["angle"]
    hooks_by_angle = {
        "how_to": [f"Dùng {name} sao cho đúng? Xem {n_body} bước này.", f"{n_body} bước dùng {name} mà nhiều người bỏ qua."],
        "faq": [f"Câu hỏi nhiều nhất về {name} là gì?", f"Bạn đang thắc mắc về {name}? Mình trả lời nhanh."],
        "demo": [f"Xem {name} hoạt động thực tế trong 1 phút.", f"Thử {name} ngay trước camera."],
        "comparison": [f"Chọn {name} hay loại khác? Xem tiêu chí này.", f"Đặt {name} lên bàn cân."],
        "mistakes": [f"{n_body} sai lầm khi dùng {name}.", f"Đừng dùng {name} theo cách này."],
        "feature": [f"Bên trong {name} có gì đáng chú ý?", f"Phân tích nhanh {name}."],
        "brand_story": [f"Câu chuyện phía sau {name}.", f"Vì sao {name} được làm ra như vậy?"],
        "checklist": [f"Checklist trước khi chọn {name}.", f"Lưu lại checklist này trước khi mua."],
        "qa": [f"Hỏi nhanh – đáp gọn về {name}.", f"3 câu hỏi về {name}."],
        "tips": [f"Mẹo dùng {name} hiệu quả hơn.", f"Một mẹo nhỏ với {name}."],
    }
    hooks = hooks_by_angle.get(ang, [f"Tìm hiểu {name}."])
    beats = [{"type": "hook", "text": rng.choice(hooks), "on_screen": rng.choice(hooks)[:40], "visual": "Cận cảnh sản phẩm",
              "shot_tags": ["packshot", "face"], "claim_ids": []}]
    body_sources: list[tuple[str, list[str], list[str]]] = []
    for c in approved:
        body_sources.append((c["text"], [c["id"]], ["close_up", "packshot"]))
    if attrs.get("usage"):
        body_sources.append((f"Cách dùng: {attrs['usage']}", [], ["demonstration", "hand"]))
    if attrs.get("usp"):
        body_sources.append((f"Điểm khác biệt: {attrs['usp']}", [], ["packshot"]))
    for f in faq[:3]:
        if f.get("q") and f.get("a"):
            body_sources.append((f"{f['q']} {f['a']}", [], ["face", "presenter"]))
    if ang in ("how_to", "tips", "demo"):
        body_sources.sort(key=lambda s: 0 if "demonstration" in s[2] else 1)
    for i, (text, cids, tags) in enumerate(body_sources[:n_body], 1):
        prefix = f"Bước {i}: " if ang in ("how_to", "checklist") else f"Thứ {i}, " if ang == "mistakes" else ""
        beats.append({"type": "body", "text": prefix + text, "on_screen": text[:40], "visual": "Minh hoạ theo lời thoại",
                      "shot_tags": tags, "claim_ids": cids})
    cta = attrs.get("allowed_cta") or "Tìm hiểu thêm thông tin sản phẩm"
    beats.append({"type": "cta", "text": f"{cta.split('·')[0].strip()}.", "on_screen": cta[:30], "visual": "Packshot + CTA",
                  "shot_tags": ["cta", "packshot"], "claim_ids": []})
    return {"title": hooks[0], "hooks": hooks, "beats": beats}


def script_text(beats: list[dict]) -> str:
    return " ".join(b.get("text", "") for b in beats)


def timing(beats: list[dict]) -> list[dict]:
    t = 0.0
    out = []
    for b in beats:
        d = max(1.5, estimate_seconds(b["text"]))
        out.append({**b, "start": round(t, 2), "end": round(t + d, 2), "est_sec": d})
        t += d
    return out


# ---------------------------------------------------------------- storyboard (M06-03/04)
def match_scenes(beats: list[dict], scenes: list[dict], campaign_usage: Counter | None = None,
                 seed: int = 0) -> tuple[list[dict], list[dict]]:
    """Gán cảnh cho từng beat theo tag + độ dài, ưu tiên cảnh ít dùng trong bản này VÀ ít dùng ở các bản khác
    cùng chiến dịch (campaign_usage), có nhiễu theo seed để các bản không chọn cùng một bộ cảnh. Trả (assignments, gaps)."""
    usage: Counter = Counter()
    campaign_usage = campaign_usage or Counter()
    rng = random.Random(seed)
    out, gaps = [], []
    usable = [s for s in scenes if s.get("review") != "rejected"]
    for i, b in enumerate(beats):
        need = set(b.get("shot_tags") or [])
        best, best_score = None, -1e9
        for s in usable:
            tags = set(s.get("tags_json") or [])
            q = (s.get("quality_json") or {}).get("score", 70)
            score = 10 * len(need & tags) + q / 20 - 6 * usage[s["id"]] - 2.5 * campaign_usage[s["id"]] + rng.uniform(0, 4)
            if s.get("locked"):
                score += 1
            if score > best_score:
                best, best_score = s, score
        if best is None:
            gaps.append({"beat": i, "code": "BLOCK-03", "message": "Không có cảnh nào trong thư viện"})
            out.append({"beat": i, "scene_id": None, "fallback": True})
            continue
        fallback = bool(need) and not (need & set(best.get("tags_json") or []))
        if fallback:
            gaps.append({"beat": i, "code": "WARN-02" if b["type"] != "body" else "BLOCK-03",
                         "message": f"Thiếu cảnh {', '.join(sorted(need))} — dùng cảnh thay thế",
                         "suggest_shot": f"Quay bổ sung: {', '.join(sorted(need))} cho câu “{b['text'][:50]}”"})
        usage[best["id"]] += 1
        out.append({"beat": i, "scene_id": best["id"], "asset_id": best["asset_id"], "fallback": fallback})
    return out, gaps


def build_timeline(beats_timed: list[dict], assignments: list[dict], scenes_by_id: dict, canvas: dict,
                   template: dict, voice: list[dict] | None, seed: int, concept: dict | None = None) -> dict:
    rng = random.Random(seed)
    motions = template.get("motions") or ["zoom_in", "zoom_out", "pan_left", "pan_right", "none"]
    concept = concept or {}
    layout = concept.get("format", "full")
    pool = [sc for sc in scenes_by_id.values() if sc.get("review") != "rejected"]
    video, captions, titles = [], [], []
    for i, (b, a) in enumerate(zip(beats_timed, assignments)):
        start_ms, end_ms = int(b["start"] * 1000), int(b["end"] * 1000)
        if voice and i < len(voice):
            start_ms, end_ms = voice[i]["start_ms"], voice[i]["end_ms"]
        dur = end_ms - start_ms
        sc = scenes_by_id.get(a.get("scene_id"))
        if sc:
            s_len = sc["end_ms"] - sc["start_ms"]
            src_in = sc["start_ms"] + (max(0, s_len - dur) // 2 if s_len > dur else 0)
            clip = {"beat": i, "scene_id": sc["id"], "asset_id": sc["asset_id"], "src_in_ms": src_in,
                    "src_out_ms": src_in + min(dur, s_len), "start_ms": start_ms, "end_ms": end_ms,
                    "loop": s_len < dur, "motion": rng.choice(motions), "fallback": a.get("fallback", False),
                    "layout": layout}
            if layout in ("split", "pip"):           # cảnh phụ: một cảnh KHÁC (không lặp/lật cảnh chính)
                others = [o for o in pool if o["id"] != sc["id"] and o["asset_id"] != sc["asset_id"]] or \
                         [o for o in pool if o["id"] != sc["id"]]
                if others:
                    alt = rng.choice(others)
                    clip["alt"] = {"scene_id": alt["id"], "asset_id": alt["asset_id"], "src_in_ms": alt["start_ms"],
                                   "src_out_ms": alt["end_ms"]}
                else:
                    clip["layout"] = "full"
            video.append(clip)
        captions.append({"beat": i, "start_ms": start_ms, "end_ms": end_ms, "text": b["text"]})
        if b.get("on_screen") and b["type"] != "body":
            titles.append({"beat": i, "start_ms": start_ms, "end_ms": min(end_ms, start_ms + 2500), "text": b["on_screen"],
                           "style": "hook" if b["type"] == "hook" else "cta" if b["type"] == "cta" else "callout"})
    total = max([v["end_ms"] for v in video] + [c["end_ms"] for c in captions] + [0])
    music = [{"path": concept["music"], "start_ms": 0, "end_ms": total}] if concept.get("music") else []
    return {"schema": "avf.timeline/1", "canvas": canvas, "duration_ms": total, "seed": seed,
            "template_id": template.get("id"), "template_version": template.get("version"), "layout": layout,
            "style": {"font": concept.get("font", 0), "caption_position": concept.get("caption_position", "low")},
            "tracks": {"video": video, "voice": voice or [], "captions": captions, "titles": titles, "music": music,
                       **({"music_mix": concept["music"]} if concept.get("music") else {})}}
