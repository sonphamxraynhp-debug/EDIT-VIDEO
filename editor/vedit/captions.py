"""Chia lời thoại thành các câu phụ đề ngắn theo nhịp nói (kiểu video mẫu)."""
import re

QUESTION_END = {"không", "chưa", "sao", "gì", "nào", "à", "hả", "nhỉ", "chứ"}


def apply_glossary(text, glossary):
    for k, v in sorted(((k, v) for k, v in glossary.items() if not k.startswith("_")), key=lambda kv: -len(kv[0])):
        text = re.sub(rf"(?<!\w){re.escape(k)}(?!\w)", v, text, flags=re.IGNORECASE)
    return text


def clean_text(text, glossary=None):
    """Chữ thường, bỏ dấu câu (giữ chữ hoa đầu câu và tên riêng do người soát quyết định)."""
    text = re.sub(r"[.,!?;:…\"“”]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if glossary:
        text = apply_glossary(text, glossary)
    return text


def capitalize_first(text):
    return text[:1].upper() + text[1:] if text else text


def build_captions(words, cfg, glossary=None):
    """words: [{w, s, e, gap}] theo thời gian SAU CẮT; gap = khoảng ngừng (giây gốc) trước từ đó.

    Chia cụm bằng quy hoạch động: ưu tiên ngắt ở chỗ ngừng nói, trước từ nối (nhưng, thì, khi...),
    không kết thúc bằng từ lửng (của, là, và...), không tách tiểu từ cuối câu (nhé, không, đâu...)
    khỏi câu, cụm dài ~target_words từ.
    """
    if not words:
        return []
    n = len(words)
    no_end = set(cfg["no_end"])
    attach = set(cfg.get("attach_prev", []))
    starters = [s.split() for s in cfg["break_before"]]
    toks = [w["w"].lower() for w in words]

    def starter_at(i):
        return any(toks[i:i + len(st)] == st for st in starters)

    def group_cost(i, j):
        """Chi phí cụm words[i..j] (gồm cả chi phí điểm ngắt sau j)."""
        cnt = j - i + 1
        chars = len(" ".join(toks[i:j + 1]))
        dur = words[j]["e"] - words[i]["s"]
        if cnt > 1 and (cnt > cfg["max_words"] or chars > cfg["max_chars"] or dur > cfg["max_duration"]):
            return None
        if any(words[m]["gap"] >= cfg["hard_gap"] for m in range(i + 1, j + 1)):
            return None  # không gộp qua chỗ ngừng dài (hết câu)
        c = 0.18 * (cnt - cfg["target_words"]) ** 2
        if cnt < cfg["min_words"]:
            c += 6.0
        if j + 1 < n:
            g = words[j + 1]["gap"]
            c -= min(g, 0.5) * 9
            if starter_at(j + 1):
                c -= 2.0
            if toks[j] in no_end:
                c += 4.0
            if toks[j + 1] in attach:
                c += 5.0
        return c

    best = [0.0] + [None] * n
    back = [0] * (n + 1)
    for j in range(n):
        for i in range(max(0, j - cfg["max_words"] + 1), j + 1):
            if best[i] is None:
                continue
            gc = group_cost(i, j)
            if gc is None:
                continue
            if best[j + 1] is None or best[i] + gc < best[j + 1]:
                best[j + 1], back[j + 1] = best[i] + gc, i
    groups, j = [], n
    while j > 0:
        i = back[j]
        groups.append(words[i:j])
        j = i
    groups.reverse()

    caps = []
    for gi, g in enumerate(groups):
        text = clean_text(" ".join(w["w"] for w in g), glossary)
        if cfg.get("capitalize_sentence", True) and (gi == 0 or g[0]["gap"] >= cfg["sentence_gap"]):
            text = capitalize_first(text)
        caps.append({"start": round(max(0.0, g[0]["s"] - cfg["lead_in"]), 3),
                     "end": round(g[-1]["e"] + cfg["hold_after"], 3), "text": text})
    for a, b in zip(caps, caps[1:]):
        a["end"] = round(min(a["end"], b["start"] - cfg["gap"]), 3)
    for c in caps:
        c["end"] = round(max(c["end"], c["start"] + cfg["min_duration"]), 3)
    return caps


def sentences(words, sentence_gap):
    """Gom từ thành câu (theo chỗ ngừng) – để agent đọc nhanh nội dung và chọn tiêu đề/mục."""
    out, cur = [], []
    for w in words:
        if cur and w["gap"] >= sentence_gap:
            out.append(cur)
            cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return [{"start": round(s[0]["s"], 2), "end": round(s[-1]["e"], 2),
             "src": [round(s[0]["src_s"], 2), round(s[-1]["src_e"], 2)],
             "text": " ".join(w["w"] for w in s)} for s in out]


def auto_hook(sents, cfg):
    """Tiêu đề mở đầu mặc định từ câu đầu: dòng to 1–3 từ + dòng nghiêng phần còn lại."""
    if not sents:
        return None
    words = sents[0]["text"].split()
    if len(words) > cfg["auto_max_words"]:
        words = words[:cfg["auto_max_words"]]
    if len(words) <= 3:
        lines = [{"text": capitalize_first(" ".join(words)), "style": "main"}]
    else:
        k = 2 if len(" ".join(words[:2])) <= 10 else 1
        sub = " ".join(words[k:])
        if words[-1] in QUESTION_END:
            sub += "?"
        lines = [{"text": capitalize_first(" ".join(words[:k])), "style": "main"},
                 {"text": sub, "style": "sub"}]
    start = cfg["start"]
    end = min(max(sents[0]["end"] + 0.4, start + cfg["min_duration"]), start + cfg["max_duration"])
    return {"auto": True, "start": round(start, 2), "end": round(end, 2), "lines": lines}
