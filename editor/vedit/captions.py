"""Chia từ thành các câu phụ đề ngắn theo phong cách video mẫu."""
import re

PUNCT_END = re.compile(r"[.,!?;:…]+$")
PUNCT_ANY = re.compile(r"[\"“”‘’'()\[\]{}.,!?;:…]+")


def normalize(text, cfg, glossary):
    if cfg.get("strip_punctuation", True):
        text = PUNCT_ANY.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    if cfg.get("lowercase", True):
        text = text.lower()
    for key, val in sorted(glossary.items(), key=lambda kv: -len(kv[0])):
        if key.startswith("_"):
            continue
        text = re.sub(rf"(?<!\w){re.escape(key)}(?!\w)", val, text, flags=re.IGNORECASE)
    return text


def split_lines(text, limit, max_lines=2, measure=len, no_end=()):
    """Tách thành tối đa max_lines dòng, cân bằng độ dài (ưu tiên dòng trên dài hơn).

    limit/measure: giới hạn mỗi dòng theo ký tự (mặc định) hoặc theo pixel (truyền hàm đo chữ).
    """
    words = text.split()
    if measure(text) <= limit or len(words) < 2 or max_lines < 2:
        return [text]
    unit = measure(text) / max(1, len(text))  # độ rộng trung bình 1 ký tự
    best, best_score = None, None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        la, lb = measure(a), measure(b)
        over = max(0, la - limit) + max(0, lb - limit)
        score = over * 10 + abs(la - lb) + (4 * unit if lb > la else 0)
        if words[i - 1].lower() in no_end:  # tránh để từ nối treo cuối dòng ("vì / sợ")
            score += 8 * unit
        if best_score is None or score < best_score:
            best, best_score = [a, b], score
    return best


def build_chunks(words, cfg, glossary):
    """words: [{"w","s","e"}] theo thời gian sau cắt -> [{"text","lines","start","end"}]."""
    max_chars = cfg["max_line_chars"] * cfg["max_lines"]
    breakers = sorted(cfg.get("break_before", []), key=len, reverse=True)
    no_end = set(cfg.get("no_end", []))
    chunks, cur = [], []

    def flush(soft=False):
        """soft=True: ngắt do hết chỗ -> không để câu kết thúc bằng từ nối lơ lửng."""
        carry = []
        if soft:
            while len(cur) > 2 and PUNCT_ANY.sub("", cur[-1]["w"]).lower() in no_end:
                carry.insert(0, cur.pop())
        if cur:
            chunks.append(list(cur))
            cur.clear()
        cur.extend(carry)

    for i, w in enumerate(words):
        if cur:
            prev = cur[-1]
            text_now = " ".join(x["w"] for x in cur)
            gap = w["s"] - prev["e"]
            upcoming = " ".join(x["w"] for x in words[i:i + 2]).lower()
            hard = [
                gap >= cfg["break_gap"],
                bool(PUNCT_END.search(prev["w"])),
                "seg" in w and w.get("seg") != prev.get("seg"),
                len(cur) >= 5 and any(upcoming.startswith(b + " ") or upcoming == b for b in breakers),
            ]
            soft = [
                len(text_now) + 1 + len(w["w"]) > max_chars,
                len(cur) >= cfg["max_words"],
                w["e"] - cur[0]["s"] > cfg["max_duration"],
            ]
            if any(hard):
                flush()
            elif any(soft):
                flush(soft=True)
        cur.append(w)
    flush()

    # Gộp mẩu quá ngắn (1 từ, < min_duration) vào câu liền trước nếu còn chỗ
    merged = []
    for c in chunks:
        dur = c[-1]["e"] - c[0]["s"]
        if merged and (len(c) == 1 or dur < cfg["min_duration"] * 0.6):
            prev = merged[-1]
            joined = " ".join(x["w"] for x in prev + c)
            same_seg = c[0].get("seg") == prev[-1].get("seg")
            if same_seg and len(joined) <= max_chars and c[0]["s"] - prev[-1]["e"] < cfg["break_gap"] * 2:
                merged[-1] = prev + c
                continue
        merged.append(c)

    out = []
    for c in merged:
        text = normalize(" ".join(x["w"] for x in c), cfg, glossary)
        if not text:
            continue
        out.append({
            "text": text,
            "start": round(max(0.0, c[0]["s"] - cfg["lead_in"]), 3),
            "end": round(c[-1]["e"], 3),
        })

    # Nối liền các câu khi khoảng trống ngắn để phụ đề không nhấp nháy
    for a, b in zip(out, out[1:]):
        if b["start"] - a["end"] <= cfg["bridge_gap"]:
            a["end"] = b["start"]
        else:
            a["end"] = round(a["end"] + cfg["hold_after"], 3)
    if out:
        out[-1]["end"] = round(out[-1]["end"] + cfg["hold_after"], 3)
    for c in out:
        if c["end"] - c["start"] < cfg["min_duration"]:
            c["end"] = round(c["start"] + cfg["min_duration"], 3)
    for a, b in zip(out, out[1:]):
        a["end"] = min(a["end"], b["start"])
    return out


def pick_hook(chunks, hcfg):
    """Mặc định: câu mở đầu được nói trong ~1.8-4 giây đầu sẽ làm tiêu đề bong bóng."""
    if not chunks:
        return None
    first = chunks[0]
    text, end = first["text"], first["end"]
    for c in chunks[1:]:
        if c["end"] > hcfg["max_duration"] or end >= hcfg["min_duration"] + 0.6:
            break
        text, end = f"{text} {c['text']}", c["end"]
    end = min(max(end, hcfg["min_duration"]), hcfg["max_duration"])
    hook_text = text[:1].upper() + text[1:]
    return {"text": hook_text, "start": 0.0, "end": round(end, 3),
            "style": hcfg["default_style"], "position": hcfg["default_position"]}


def from_lines(lines, words, cfg, glossary):
    """Câu phụ đề do người/agent viết lại (mỗi dòng một câu) -> căn thời gian theo mốc từ nhận dạng.

    Dùng khi cần sửa chữ hoặc ngắt câu lại mà không phải đo thời gian bằng tay.
    """
    import difflib

    def key(t):
        return PUNCT_ANY.sub("", t).lower()

    src = [key(w["w"]) for w in words]
    tgt, owner = [], []
    for i, line in enumerate(lines):
        for tok in line.replace("\\n", " ").split():
            tgt.append(key(tok))
            owner.append(i)
    mapping = {}
    for a, b, n in difflib.SequenceMatcher(None, tgt, src, autojunk=False).get_matching_blocks():
        for k in range(n):
            mapping[a + k] = b + k

    out = []
    for i, line in enumerate(lines):
        idx = [mapping[j] for j, o in enumerate(owner) if o == i and j in mapping]
        if not idx:
            raise ValueError(f"Không khớp được câu với lời nói: {line!r}")
        # "\\n" gõ trong file = ép xuống dòng tại đó
        text = "\n".join(normalize(part, cfg, glossary) for part in line.split("\\n"))
        out.append({"text": text,
                    "start": round(max(0.0, words[min(idx)]["s"] - cfg["lead_in"]), 3),
                    "end": round(words[max(idx)]["e"], 3)})
    for a, b in zip(out, out[1:]):
        if b["start"] < a["end"]:
            b["start"] = a["end"]
        if b["start"] - a["end"] <= cfg["bridge_gap"]:
            a["end"] = b["start"]
        else:
            a["end"] = round(a["end"] + cfg["hold_after"], 3)
    if out:
        out[-1]["end"] = round(out[-1]["end"] + cfg["hold_after"], 3)
    return out
