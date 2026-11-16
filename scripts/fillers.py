"""Find speech mistakes to cut: Vietnamese fillers, stutters / repeated phrases, long pauses, (optional) false starts via Claude.

usage: python fillers.py <words.json | captions.json> [out.json] [--pause 0.7] [--keep 0.25] [--fillers "ờ,ừm,thì là"] [--claude] [--model sonnet]
Input: [{"w","s","e"}] (work/words.json) or captions [{"t0","t1","words":[…]}]. Times are kept as given (Studio sends output times).
Output: {"words": n, "cuts": [{"a","b","kind","text","reason","conf","i0","i1"}]}  kind ∈ filler | repeat | pause | false_start
A cut [a, b] is what to remove; the ripple (clips, captions, scenes, sfx) is done by the Studio (references/ai-edit.md).
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import unicodedata

HESITATE = ["ờ", "ơ", "ừ", "ừm", "ờm", "ưm", "ậm", "à", "á", "hừm", "hmm", "um", "uh", "ừa"]
PHRASES = ["thì là", "kiểu như", "kiểu là", "nói chung là", "đại loại là", "thực ra là", "cái kiểu", "là kiểu", "nói chung", "kiểu kiểu"]
# Reduplicatives that are real words, not stutters.
REDUP = {"từ", "dần", "ai", "đâu", "nhiều", "xa", "thường", "nhanh", "chầm", "lâu", "rất", "đi", "vâng", "có", "không", "hơi", "xinh", "đẹp", "cao", "nhỏ", "to", "khá", "mãi", "ngày", "năm",
         "người", "nhà", "đời", "chút", "tí", "lắm", "chậm", "dạ", "ừ", "ồ", "haha", "ha", "hi", "he", "đều", "luôn", "bé", "con", "mỗi", "khi", "nơi", "lúc", "giờ"}

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out", nargs="?")
ap.add_argument("--pause", type=float, default=0.7, help="pause longer than this (s) is flagged")
ap.add_argument("--keep", type=float, default=0.25, help="silence kept when shortening a pause (s)")
ap.add_argument("--gap", type=float, default=0.12, help="a filler must touch a pause at least this long (s)")
ap.add_argument("--fillers", default="", help="comma list replacing the default fillers")
ap.add_argument("--claude", action="store_true", help="also ask Claude for false starts (needs the claude CLI)")
ap.add_argument("--model", default="sonnet")
a = ap.parse_args()

src = json.load(open(a.src))
words = [w for c in src for w in c["words"]] if src and "words" in src[0] else src
words = sorted([w for w in words if str(w.get("w", "")).strip()], key=lambda w: w["s"])
norm = lambda s: unicodedata.normalize("NFC", re.sub(r"[^\w]+", "", str(s).lower()))
N = [norm(w["w"]) for w in words]
n = len(words)
if a.fillers.strip():
    lst = [unicodedata.normalize("NFC", x.strip().lower()) for x in a.fillers.split(",") if x.strip()]
    HESITATE, PHRASES = [x for x in lst if " " not in x], [x for x in lst if " " in x]
gap_before = lambda i: words[i]["s"] - words[i - 1]["e"] if i > 0 else 9
gap_after = lambda i: words[i + 1]["s"] - words[i]["e"] if i < n - 1 else 9
txt = lambda i, j: " ".join(w["w"] for w in words[i:j + 1])
cuts = []


def span(i, j, pad=0.03):
    # Remove words i..j plus a little air, never eating into the neighbours.
    lo = words[i - 1]["e"] if i > 0 else 0
    hi = words[j + 1]["s"] if j < n - 1 else words[j]["e"] + pad
    return round(max(lo, words[i]["s"] - pad), 3), round(min(hi, words[j]["e"] + pad), 3)


def add(i, j, kind, reason, conf, ab=None):
    x0, x1 = ab or span(i, j)
    if x1 - x0 > 0.04:
        cuts.append({"a": x0, "b": x1, "kind": kind, "text": txt(i, j) if i is not None else "", "reason": reason, "conf": conf, "i0": i, "i1": j})


# 1. fillers: hesitation sounds touching a pause, filler phrases surrounded by pauses
for i in range(n):
    if N[i] in [norm(h) for h in HESITATE]:
        gb, ga = gap_before(i), gap_after(i)
        if max(gb, ga) >= a.gap or words[i]["e"] - words[i]["s"] > 0.45:
            weak = N[i] in ("à", "á", "ừ")  # also real words ("à" = oh, "ừ" = yes)
            add(i, i, "filler", f"tiếng đệm “{words[i]['w']}”", 0.55 if weak else 0.9)
for ph in PHRASES:
    toks = [norm(t) for t in ph.split()]
    k = len(toks)
    for i in range(n - k + 1):
        if N[i:i + k] == toks and gap_before(i) >= a.gap and gap_after(i + k - 1) >= a.gap:
            add(i, i + k - 1, "filler", f"cụm đệm “{ph}”", 0.7)

# 2. repeats: the same 1–4 words said twice in a row → cut the first take
i = 0
while i < n:
    hit = False
    for k in (4, 3, 2, 1):
        if i + 2 * k <= n and N[i:i + k] == N[i + k:i + 2 * k] and all(N[i:i + k]):
            if k == 1 and (N[i] in REDUP or N[i] in [norm(h) for h in HESITATE]):
                continue
            pause = words[i + k]["s"] - words[i + k - 1]["e"]
            conf = 0.9 if k >= 2 else (0.8 if pause >= 0.08 else 0.6)
            add(i, i + k - 1, "repeat", f"lặp “{txt(i, i + k - 1)}”", conf, (round(words[i]["s"], 3), round(words[i + k]["s"], 3)))
            i += k
            hit = True
            break
    if not hit:
        i += 1

# 3. long pauses still left in the take: shorten to --keep seconds
for i in range(n - 1):
    g = words[i + 1]["s"] - words[i]["e"]
    if g > a.pause:
        x0 = round(words[i]["e"] + a.keep / 2, 3)
        x1 = round(words[i + 1]["s"] - a.keep / 2, 3)
        cuts.append({"a": x0, "b": x1, "kind": "pause", "text": "", "reason": f"ngắt quãng {g:.1f}s", "conf": 0.85, "i0": i, "i1": i + 1})

# 4. false starts (sentence restarted) — needs Claude
note = None
if a.claude:
    exe = shutil.which("claude")
    if not exe:
        note = "Không tìm thấy lệnh claude (Claude Code CLI) — bỏ qua phần câu nói hỏng."
    else:
        listing = " ".join(f"{k}:{w['w']}" for k, w in enumerate(words))
        prompt = ("Đây là lời nói tiếng Việt (chỉ số:từ) đã nhận dạng tự động từ video người nói. Tìm các chỗ NÓI HỎNG: người nói bắt đầu một câu/cụm rồi bỏ dở và "
                  "nói lại từ đầu (false start), hoặc nói vấp/sửa lời. Chỉ đánh dấu phần BỊ BỎ (lần nói hỏng), không đánh dấu lần nói lại. Không đánh dấu tiếng đệm hay "
                  "từ lặp liền nhau (đã xử lý riêng). Nếu không có, trả mảng rỗng.\nTrả về DUY NHẤT JSON: {\"false_starts\":[{\"i0\":số,\"i1\":số,\"reason\":\"…\"}]}\n\n" + listing)
        try:
            r = subprocess.run([exe, "-p", "--output-format", "json", "--model", a.model], input=prompt, capture_output=True, text=True, timeout=240)
            j = json.loads(r.stdout)
            res = str(j.get("result", ""))
            if r.returncode or j.get("is_error"):
                raise RuntimeError("Claude Code chưa đăng nhập (chạy lệnh claude một lần để đăng nhập)" if re.search(r"not logged in|/login|authenticat|api key", res, re.I) else res[:160])
            m = re.search(r"\{.*\}", res, re.S)
            if not m:
                raise RuntimeError("Claude trả lời không đúng định dạng")
            for f in json.loads(m.group(0)).get("false_starts", []):
                i0, i1 = int(f["i0"]), int(f["i1"])
                if 0 <= i0 <= i1 < n and i1 - i0 < 15:
                    x0, x1 = span(i0, i1)
                    if i1 < n - 1:
                        x1 = round(words[i1 + 1]["s"], 3)
                    add(i0, i1, "false_start", "nói hỏng: " + str(f.get("reason", ""))[:80], 0.55, (x0, x1))
        except Exception as e:  # CLI failure must not lose the local results
            note = f"Claude lỗi ({e if isinstance(e, RuntimeError) else type(e).__name__}) — chỉ có kết quả dò tự động."

# merge overlapping cuts (keep the first reason)
cuts.sort(key=lambda c: (c["a"], -c["b"]))
out = []
for c in cuts:
    if out and c["a"] < out[-1]["b"] - 1e-3:
        if c["b"] > out[-1]["b"]:
            out[-1]["b"] = c["b"]
            out[-1]["text"] = (out[-1]["text"] + " " + c["text"]).strip()
        continue
    out.append(c)
res = {"words": n, "cuts": out, **({"note": note} if note else {})}
s = json.dumps(res, ensure_ascii=False, indent=1)
if a.out:
    open(a.out, "w").write(s)
    print(f"{len(out)} chỗ cần cắt → {a.out}", file=sys.stderr)
else:
    print(s)
