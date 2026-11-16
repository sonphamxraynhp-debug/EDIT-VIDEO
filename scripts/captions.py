"""Karaoke caption chunks (3–6 words, avg ~4.3) from words.json.

usage: python captions.py <words.json> <out_captions.json> [--fix "chơi biết=chưa biết;rưu rương=du dương"]
Output: [{"t0", "t1", "words": [{"w","s","e"}]}]
--fix replaces word sequences (whisper mistakes) before chunking; keeps the original timings.
"""
import argparse
import json

ap = argparse.ArgumentParser()
ap.add_argument("words")
ap.add_argument("out")
ap.add_argument("--fix", default="")
ap.add_argument("--max", type=int, default=5)
ap.add_argument("--min", type=int, default=3)
ap.add_argument("--max-dur", type=float, default=1.6)
a = ap.parse_args()

words = json.load(open(a.words))

for pair in filter(None, a.fix.split(";")):
    src, dst = (x.strip().split() for x in pair.split("="))
    i = 0
    while i <= len(words) - len(src):
        if [w["w"].lower().strip(",.?!") for w in words[i:i + len(src)]] == [x.lower() for x in src]:
            s, e = words[i]["s"], words[i + len(src) - 1]["e"]
            step = (e - s) / len(dst)
            words[i:i + len(src)] = [{"w": d, "s": round(s + k * step, 3), "e": round(s + (k + 1) * step, 3)} for k, d in enumerate(dst)]
            i += len(dst)
        else:
            i += 1

# Glue "%", "-4" etc. onto the previous token so "100%" / "3-4" stay one word.
glued = []
for w in words:
    if glued and w["w"][:1] in "%-–":
        glued[-1] = {"w": glued[-1]["w"] + w["w"], "s": glued[-1]["s"], "e": w["e"]}
    else:
        glued.append(dict(w))
words = glued

# Whisper splits Vietnamese into syllables, so a fixed word count cuts compounds in half ("lựa | chọn").
# Line breaks are chosen for the whole clip at once (DP): breaking is cheap at pauses, punctuation and clause
# openers, expensive inside a known compound, and lines stay near the target length and under max-dur.
OPENERS = {"để", "nhưng", "tuy", "và", "hay", "thì", "khi", "cho", "với", "nếu", "thay", "bây", "tại", "ngày", "ngay", "mà",
           "sau", "trước", "rồi", "vì", "nên", "còn", "hoặc", "từ", "chúc", "chỉ", "thế"}
COMPOUNDS = set("""chúng ta|chúng tôi|các bạn|mọi người|bây giờ|hôm nay|ngày mai|sau đó|trước đó|trước kia|thế thì|vì vậy|cho nên|
tuy nhiên|nhưng mà|có thể|không thể|cần phải|phải làm|tự động|lựa chọn|hiệu ứng|công cụ|thời gian|video clip|đồng hồ|di chuyển|
hình ảnh|phông chữ|âm thanh|nội dung|sản phẩm|khách hàng|doanh nghiệp|công ty|thị trường|kinh doanh|bán hàng|dịch vụ|giá trị|
chất lượng|hướng dẫn|chia sẻ|kinh nghiệm|trải nghiệm|đơn giản|dễ dàng|nhanh chóng|hoàn toàn|thực sự|thật sự|quan trọng|
cảm ơn|cám ơn|tạm biệt|thành công|xin chào|việc làm|làm việc|học tập|kiến thức|khoá học|khóa học|bài học|ví dụ|tiến hoá|tiến hóa|
trí tuệ|nhân tạo|phần mềm|ứng dụng|điện thoại|máy tính|màn hình|tài khoản|mạng xã hội|xã hội|phụ đề|chỉnh sửa|xuất ra|tải về|
bắt đầu|kết thúc|tiếp theo|cuối cùng|đầu tiên|thứ hai|một số|nhiều người|ai cũng|như thế|như vậy|vì sao|tại sao|bao nhiêu|
dành cho|của mình|chính mình|biết rằng|rằng là|đã có|sẽ có|đang có|giúp bạn|giúp mình|bất động|động sản|căn hộ|nhà đất|
mỹ phẩm|làn da|sức khoẻ|sức khỏe|gia đình|cuộc sống|thế giới|việt nam|hà nội|sài gòn|thành phố|đặc biệt|ưu đãi|miễn phí|
giảm giá|liên hệ|đăng ký|theo dõi|bình luận|kéo thả|tiếng đồng""".replace("\n", "").split("|"))
# Function words that bind to the next word: a line never ends on them if it can help it.
CLINGY = {"các", "những", "một", "của", "cho", "với", "là", "được", "bị", "đã", "sẽ", "đang", "rất", "chưa", "cái",
          "vào", "lên", "xuống", "và", "hay", "thì", "mà", "để", "từ", "khi", "nếu", "như"}

def key(w):
    return w["w"].lower().strip(",.?!:;\"'")

def brk(i):
    """Cost of a line break between words[i-1] and words[i]."""
    a, b = words[i - 1], words[i]
    ka, kb = key(a), key(b)
    gap = b["s"] - a["e"]
    c = -min(gap, 0.6) * 6
    if a["w"][-1:] in ",.?!:;":
        c -= 3
    if b["w"][:1].isupper() and not b["w"].isupper():  # whisper capitalises each new segment ("AI" is not one)
        c -= 3
    if kb in OPENERS:
        c -= 1
    if f"{ka} {kb}" in COMPOUNDS:
        c += 6
    if ka[:1].isdigit() or (kb[:1].isdigit() and ka in ("đến", "tới", "từ")):  # "15 đến 30 phút", "3 bước" stay together
        c += 2.5
    if i + 1 < len(words) and f"{kb} {key(words[i + 1])}" in COMPOUNDS:
        c -= 0.5
    if ka in CLINGY:
        c += 2
    return c

def line(i, j):
    """Cost of words[i:j] as one caption line."""
    n, dur = j - i, words[j - 1]["e"] - words[i]["s"]
    c = 0.4 * abs(n - (a.min + a.max) / 2)
    if dur > a.max_dur:
        c += (dur - a.max_dur) * 3
    for k in range(i + 1, j):  # a long pause inside a line should have been a break
        g = words[k]["s"] - words[k - 1]["e"]
        if g > 0.45:
            c += (g - 0.45) * 8
    return c

N = len(words)
INF = float("inf")
best, back = [0.0] + [INF] * N, [0] * (N + 1)
for j in range(1, N + 1):
    for n in range(1, a.max + 1):
        i = j - n
        if i < 0:
            break
        if n == 1 and not (i == 0 or j == N or words[i]["s"] - words[i - 1]["e"] > 0.6):
            continue  # one-word lines only at the edges or around a real pause
        c = best[i] + line(i, j) + (brk(i) if i else 0) + (2 if n < a.min else 0)
        if c < best[j]:
            best[j], back[j] = c, i
chunks, j = [], N
while j > 0:
    chunks.append(words[back[j]:j])
    j = back[j]
chunks.reverse()

out = []
for i, c in enumerate(chunks):
    t1 = chunks[i + 1][0]["s"] if i + 1 < len(chunks) else c[-1]["e"] + 0.3
    out.append({"t0": round(c[0]["s"], 3), "t1": round(t1, 3),
                "words": [{"w": w["w"].strip(",.!"), "s": w["s"], "e": w["e"]} for w in c]})
json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=1)
print(f"{len(out)} chunks, avg {sum(len(c['words']) for c in out) / max(1, len(out)):.1f} words")
