"""Bốn chế độ dựng thêm, dùng chung kho tin (data/news), hàng đợi, bộ kênh, nhạc và sổ kết quả của chế độ Tin tức.

  review  Review có người thật: clip người nói → cắt khoảng lặng, phụ đề chạy chữ, chèn hình sản phẩm, màn chốt. Giữ giọng thật.
  clips   Cắt video dài: nghe cả video, chọn các đoạn đáng xem, cắt thành nhiều clip dọc có tiêu đề và phụ đề.
  story   Kể chuyện bằng ảnh: mỗi câu một cảnh, hình phủ kín, chữ của câu hiện bên dưới, giọng AI đọc.
  quote   Trích dẫn / bài học ngắn: chữ lớn hiện lần lượt trên nền màu hoặc hình mờ, nhạc là chính (giọng đọc tuỳ chọn).
"""
from __future__ import annotations

import json
import re
import shutil
import time
from pathlib import Path

from PIL import Image, ImageDraw

from . import ai, looks, media, news, tts
from .errors import AppError

W, H = news.W, news.H
KINDS = {"review": "Review người thật", "clips": "Cắt video dài", "story": "Kể chuyện bằng ảnh", "quote": "Trích dẫn"}
BOX_Y, BOX_H = 470, 810        # khung hình rõ nét khi clip nguồn nằm ngang
SUB_Y = 1310                   # mép trên dải phụ đề
MAX_CLIPS = 10


# ---------------------------------------------------------------- nghe lời
def talk_video(item: dict) -> dict:
    m = next((x for x in item["media"] if x["type"] == "video" and x.get("has_audio")), None)
    if not m:
        raise AppError("NEWS_NO_MEDIA", "Cần một video có người nói", status=422, hint="Thả vào một clip quay có tiếng nói.")
    return m


def transcript(item: dict, m: dict) -> list[dict]:
    """Lời trong clip kèm mốc thời gian; nghe một lần rồi lưu lại trong thư mục của tin."""
    f = news._dir(item["id"]) / "transcripts" / f"{m['id']}.json"
    if f.is_file():
        return json.loads(f.read_text("utf-8"))
    work = news._dir(item["id"]) / "asr"
    work.mkdir(parents=True, exist_ok=True)
    try:
        segs = media.transcribe(Path(m["path"]), work)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(segs, ensure_ascii=False), "utf-8")
    return segs


def word_fixes(item: dict) -> list[tuple[str, str]]:
    """Bảng sửa từ máy nghe sai do người dùng nhập, mỗi dòng "sai => đúng" (ví dụ tên riêng, tên sản phẩm)."""
    out = []
    for line in str(item.get("sub_fixes") or "").split("\n"):
        a, sep, b = line.partition("=>")
        if sep and a.strip():
            out.append((a.strip(), b.strip()))
    return out


def fixed(segs: list[dict], item: dict) -> list[dict]:
    """Lời đã áp bảng sửa từ; dùng cho phụ đề, tiêu đề clip và phần AI đọc lời."""
    fixes = word_fixes(item)
    if not fixes:
        return segs
    out = []
    for s in segs:
        text = s["text"]
        for a, b in fixes:
            text = re.sub(re.escape(a), b, text, flags=re.IGNORECASE)
        out.append({**s, "text": text})
    return out


def keep_ranges(segs: list[dict], t0: float, t1: float, cut: bool = True, gap: float = 0.45, pad: float = 0.12) -> list[tuple[float, float]]:
    """Các khoảng thời gian có tiếng nói trong [t0, t1]. Hai câu cách nhau dưới `gap` giây thì giữ liền, dài hơn thì cắt bỏ."""
    inside = [(s["start_ms"] / 1000, s["end_ms"] / 1000) for s in segs if s["end_ms"] / 1000 > t0 and s["start_ms"] / 1000 < t1]
    if not cut or not inside:
        return [(t0, t1)]
    out: list[tuple[float, float]] = []
    for a, b in inside:
        a, b = max(t0, a - pad), min(t1, b + pad)
        if out and a - out[-1][1] <= gap:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return [(a, b) for a, b in out if b - a > 0.2] or [(t0, t1)]


def remap(t: float, ranges: list[tuple[float, float]]) -> float:
    """Mốc thời gian trong clip gốc → mốc trong clip sau khi đã cắt bỏ khoảng lặng."""
    acc = 0.0
    for a, b in ranges:
        if t < a:
            return acc
        if t <= b:
            return acc + t - a
        acc += b - a
    return acc


def sub_chunks(segs: list[dict], ranges: list[tuple[float, float]], max_chars: int = 22) -> list[dict]:
    """Chia lời thành các cụm ngắn để chạy chữ; thời gian mỗi cụm chia theo số ký tự trong câu."""
    out = []
    lo, hi = ranges[0][0], ranges[-1][1]
    for s in segs:
        a, b = s["start_ms"] / 1000, s["end_ms"] / 1000
        if b <= lo or a >= hi:
            continue
        groups, cur = [], []
        for w in s["text"].split():
            if cur and len(" ".join(cur + [w])) > max_chars:
                groups.append(" ".join(cur))
                cur = [w]
            else:
                cur.append(w)
        if cur:
            groups.append(" ".join(cur))
        total = sum(len(g) for g in groups) or 1
        t = a
        for g in groups:
            d = (b - a) * len(g) / total
            x, y = remap(t, ranges), remap(t + d, ranges)
            if y - x > 0.08:
                out.append({"t0": round(x, 2), "t1": round(y, 2), "text": g})
            t += d
    return out


# ---------------------------------------------------------------- hình chữ
def _stroke(d, xy, text, f, anchor="mm", fill=(255, 255, 255, 255), width=6):
    d.text(xy, text, font=f, fill=fill, anchor=anchor, stroke_width=width, stroke_fill=(0, 0, 0, 255))


def sub_png(text: str, out: Path) -> None:
    """Một cụm phụ đề: chữ in hoa trắng viền đen trên dải trong suốt cao 200."""
    im = Image.new("RGBA", (W, 200), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    size = 76
    f = news._font(size)
    while size > 44 and d.textlength(text.upper(), font=f) > W - 110:
        size -= 4
        f = news._font(size)
    _stroke(d, (W // 2, 100), text.upper(), f)
    im.save(out)


def title_png(item: dict, title: str, out: Path, y: int = 170) -> None:
    """Tiêu đề nằm trong hộp màu ở đầu khung hình, kèm tên kênh ở dưới hộp."""
    top = news._rgb(news.THEMES[item["theme"]]["top"])
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, "RGBA")
    if title:
        size, f = 62, news._font(62)
        lines = news._wrap(d, title.upper(), f, W - 200)
        while len(lines) > 3 and size > 40:
            size -= 4
            f = news._font(size)
            lines = news._wrap(d, title.upper(), f, W - 200)
        lines = lines[:3]
        lh = int(size * 1.2)
        d.rounded_rectangle((56, y, W - 56, y + len(lines) * lh + 44), radius=26, fill=(*top, 240))
        for i, ln in enumerate(lines):
            d.text((W // 2, y + 22 + i * lh + lh // 2), ln, font=f, fill=(255, 255, 255, 255), anchor="mm")
        y += len(lines) * lh + 60
    if item.get("channel"):
        news._tag(d, 56, y, item["channel"].upper(), news._font(32), (0, 0, 0, 130), pad=(16, 8), radius=8)
    im.save(out)


def scene_png(item: dict, text: str, out: Path, title: bool = False) -> None:
    """Chữ của một cảnh kể chuyện: nền tối dần ở nửa dưới, câu đang đọc nằm trong vùng an toàn. title=True: cảnh mở đầu chữ lớn."""
    top = news._rgb(news.THEMES[item["theme"]]["top"])
    im = Image.new("RGBA", (W, H), (0, 0, 0, 90 if title else 0))
    raw = ImageDraw.Draw(im)
    y0 = 760 if title else 980
    for y in range(y0, H):
        raw.line([(0, y), (W, y)], fill=(6, 8, 12, min(225, (90 if title else 0) + int(225 * ((y - y0) / 420) ** 1.2))))
    d = ImageDraw.Draw(im, "RGBA")
    size = 88 if title else 62
    f = news._font(size)
    lines = news._wrap(d, text.upper() if title else text, f, W - 150)
    while len(lines) > (5 if title else 6) and size > 40:
        size -= 4
        f = news._font(size)
        lines = news._wrap(d, text.upper() if title else text, f, W - 150)
    lh = int(size * 1.25)
    y = H - 330 - len(lines) * lh
    if title:
        d.rounded_rectangle((W // 2 - 70, y - 46, W // 2 + 70, y - 34), radius=6, fill=(*top, 255))
    for ln in lines:
        _stroke(d, (W // 2, y + lh // 2), ln, f, width=5 if title else 4)
        y += lh
    if item.get("channel"):
        news._tag(d, W - 56, 136, item["channel"].upper(), news._font(40), (*top, 255), radius=10, pad=(22, 11), right=True)
    im.save(out)


def quote_layout(d, lines: list[str]) -> tuple[int, list[list[str]], int]:
    """Cỡ chữ lớn nhất để cả các dòng trích dẫn vừa vùng giữa màn hình. Trả (cỡ chữ, các dòng đã xuống hàng, chiều cao khối)."""
    size = 96 if len(lines) == 1 else 76
    while True:
        f = news._font(size)
        wrapped = [news._wrap(d, ln, f, W - 230) for ln in lines]
        lh = int(size * 1.22)
        height = sum(len(w) * lh for w in wrapped) + (len(lines) - 1) * int(size * 0.7)
        if height <= 1000 or size <= 44:
            return size, wrapped, height
        size -= 4


def quote_png(item: dict, lines: list[str], upto: int, out: Path) -> None:
    """Khung chữ của bước `upto`: các dòng trước đó mờ đi, dòng vừa hiện sáng rõ và có vạch màu bên trái."""
    top = news._rgb(news.THEMES[item["theme"]]["top"])
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, "RGBA")
    size, wrapped, height = quote_layout(d, lines)
    f, lh = news._font(size), int(size * 1.22)
    y = max(380, (H - 250 - height) // 2 + 60)
    if item.get("headline"):
        news._tag(d, 90, y - 130, item["headline"].upper()[:60], news._font(40), (*top, 255), radius=30, pad=(26, 13))
    if len(lines) == 1:
        d.text((90, y - 40), "“", font=news._font(220), fill=(*top, 255), anchor="ls")
        y += 70
    for i, w in enumerate(wrapped):
        if i > upto:
            break
        cur = i == upto
        if len(lines) > 1:
            d.rounded_rectangle((90, y + 8, 102, y + len(w) * lh - 14), radius=6, fill=(*top, 255 if cur else 120))
        for ln in w:
            d.text((130 if len(lines) > 1 else 90, y + lh // 2), ln, font=f, fill=(255, 255, 255, 255 if cur or len(lines) == 1 else 150), anchor="lm",
                   stroke_width=3, stroke_fill=(0, 0, 0, 200))
            y += lh
        y += int(size * 0.7)
    if item.get("channel"):
        tw = int(d.textlength(item["channel"].upper(), font=news._font(38)))
        news._tag(d, (W - tw) // 2 - 22, H - 400, item["channel"].upper(), news._font(38), (0, 0, 0, 130), pad=(22, 11), radius=10)
    im.save(out)


def gradient_png(item: dict, out: Path) -> None:
    th = news.THEMES[item["theme"]]
    top, bot = news._rgb(th["top"]), news._rgb(th["bottom"])
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] * 0.55 + (bot[i] * 0.6 - top[i] * 0.55) * t) for i in range(3)))
    im.save(out)


# ---------------------------------------------------------------- dựng clip người nói
def render_talk(item: dict, m: dict, t0: float, t1: float, segs: list[dict], title: str, work: Path, inserts: list[dict] | None = None) -> tuple[Path, Path, float]:
    """Cắt [t0, t1] của clip người nói thành video dọc: bỏ khoảng lặng, tiêu đề ở trên, phụ đề chạy chữ, chèn hình.
    Trả (video không tiếng, file tiếng nói, độ dài giây)."""
    ranges = keep_ranges(segs, t0, t1, cut=item.get("cut_silence", True))
    dur = sum(b - a for a, b in ranges)
    look = looks.item_look(item)
    off = max(0.0, ranges[0][0] - 1.0)                       # tua tới gần đoạn cần lấy để không phải giải mã cả video dài
    args = ["-ss", f"{off:.3f}", "-t", f"{ranges[-1][1] - off + 1.0:.3f}", "-i", m["path"]]
    fc = ""
    for i, (a, b) in enumerate(ranges):
        fc += (f"[0:v]trim={a - off:.3f}:{b - off:.3f},setpts=PTS-STARTPTS[v{i}];"
               f"[0:a]atrim={a - off:.3f}:{b - off:.3f},asetpts=PTS-STARTPTS[a{i}];")
    fc += "".join(f"[v{i}][a{i}]" for i in range(len(ranges))) + f"concat=n={len(ranges)}:v=1:a=1[cv0][ca];"
    fc += f"[cv0]null{looks.segment_vf(look, 0, W, H, frame_only=True)}[cv];"           # màu, hạt phim, viền tối của phong cách
    if (m.get("height") or 0) > (m.get("width") or 0) * 1.15:          # clip dọc: phủ kín khung
        fc += f"[cv]fps=30,scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1[f0];"
    else:                                                              # clip ngang: hình rõ ở giữa trên nền mờ
        fc += (f"[cv]fps=30,scale={W}:{BOX_H}:force_original_aspect_ratio=increase,crop={W}:{BOX_H},setsar=1,split[x1][x2];"
               f"[x1]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,boxblur=9:2,eq=brightness=-0.1,scale={W}:{H}[bg];"
               f"[bg][x2]overlay=0:{BOX_Y}[f0];")
    title_png(item, title, work / "title.png")
    args += ["-i", str(work / "title.png")]
    fc += "[f0][1:v]overlay=0:0[f1];"
    last, n = "f1", 2
    for k, ins in enumerate(inserts or []):
        args += ["-i", ins["path"]]
        fc += (f"[{n}:v]scale=900:900:force_original_aspect_ratio=increase,crop=900:900,pad=924:924:12:12:white[i{k}];"
               f"[{last}][i{k}]overlay=78:400:enable='between(t,{ins['t0']:.2f},{ins['t1']:.2f})'[g{k}];")
        last, n = f"g{k}", n + 1
    if item.get("subs", True):           # phụ đề theo kiểu đã chọn, chạy chữ theo từng từ, một luồng ảnh duy nhất
        caps = []
        for sg in segs:
            a, b = sg["start_ms"] / 1000, sg["end_ms"] / 1000
            if b <= ranges[0][0] or a >= ranges[-1][1]:
                continue
            ws = [{"w": w["w"], "start_ms": int(remap(w["s"], ranges) * 1000), "end_ms": int(remap(w["e"], ranges) * 1000)}
                  for w in looks.word_times(sg["text"], max(a, ranges[0][0]), min(b, ranges[-1][1]))]
            ws = [w for w in ws if w["end_ms"] > w["start_ms"]]
            if ws:
                caps.append({"start_ms": ws[0]["start_ms"], "end_ms": ws[-1]["end_ms"], "text": sg["text"], "words": ws})
        lst = looks.caption_track(caps, W, H, look, {}, 0.72, work / "caps", dur)
        if lst:
            args += ["-f", "concat", "-safe", "0", "-i", str(lst)]
            fc += f"[{n}:v]format=rgba[capv];[{last}][capv]overlay=0:0:eof_action=pass[subs];"
            last, n = "subs", n + 1
    fc += f"[{last}]format=yuv420p[o]"
    video, audio = work / "talk.mp4", work / "talk.wav"
    news._ff([*args, "-filter_complex", fc, "-map", "[o]", "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", str(video),
              "-map", "[ca]", "-ar", "48000", "-ac", "1", str(audio)])
    return video, audio, dur


def finish(item: dict, video: Path, voice: Path | None, total: float, work: Path, out: Path, thumb: Path, **extra) -> dict:
    """Trộn tiếng nói + nhạc, chuẩn độ lớn, ghép vào video, ghi ảnh bìa và file chữ đi kèm."""
    warning = extra.pop("warning", None)
    track = news.pick_music(item)
    if track and not Path(track["path"]).is_file():
        track = None
    if item.get("music") == "auto" and not track:
        warning = warning or "Thư viện nhạc chưa có bài nào nên video không có nhạc nền. Vào Thư viện nhạc để tải."
    args, fc, mix = [], "", ""
    if voice:
        args += ["-i", str(voice)]
        fc += "[0:a]aresample=48000[v];"
        mix += "[v]"
    if track:
        args += ["-stream_loop", "-1", "-i", track["path"]]
        fc += (f"[{args.count('-i') - 1}:a]aresample=48000,atrim=0:{total:.2f},volume={0.1 if voice else 0.8},afade=t=in:d=0.6,"
               f"afade=t=out:st={max(0, total - 1.2):.2f}:d=1.2[m];")
        mix += "[m]"
    if mix:
        fc += f"{mix}amix=inputs={mix.count('[')}:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur={total:.2f},atrim=0:{total:.2f}[o]"
        news._ff([*args, "-filter_complex", fc, "-map", "[o]", "-ar", "48000", "-ac", "2", str(work / "audio.wav")])
    else:                                 # không giọng, không nhạc: vẫn cần một đường tiếng im lặng để các nền tảng nhận file
        news._ff(["-f", "lavfi", "-t", f"{total:.2f}", "-i", "anullsrc=r=48000:cl=stereo", str(work / "audio.wav")])
    out.parent.mkdir(parents=True, exist_ok=True)
    news._ff(["-i", str(video), "-i", str(work / "audio.wav"), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)])
    thumb.parent.mkdir(parents=True, exist_ok=True)
    news._ff(["-ss", f"{min(1.0, total / 2):.2f}", "-i", str(out), "-frames:v", "1", "-vf", "scale=360:-2", str(thumb)])
    shutil.rmtree(work, ignore_errors=True)
    caption = news.caption_text(item)
    out.with_suffix(".txt").write_text(caption + "\n", "utf-8")
    return {"path": str(out), "thumb": str(thumb), "duration_ms": int(total * 1000), "headline_fit": None, "warning": warning,
            "caption": caption, "caption_file": str(out.with_suffix(".txt")), "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "script_hash": news.script_hash(item),
            "formula": {"kind": item["kind"], "theme": item["theme"], "style": None, "voice": extra.pop("voice_name", "Giọng thật"),
                        "mood": track["mood"] if track else "none", "platform": item.get("platform") if item["kind"] == "review" else None},
            "music": {"name": track["name"], "mood": track["mood"], "auto": item.get("music") == "auto"} if track else None,
            "layout": None, **extra}


def _fresh(work: Path) -> Path:
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    return work


def insert_plan(images: list[dict], dur: float) -> list[dict]:
    """Lịch chèn hình sản phẩm vào clip review: hình đầu ở giây thứ 4, sau đó cứ khoảng 7 giây một hình, mỗi hình 2,6 giây."""
    out, t, i = [], 4.0, 0
    while images and t + 2.6 < dur - 1.0:
        out.append({"path": images[i % len(images)]["path"], "t0": t, "t1": t + 2.6})
        t, i = t + 7.0, i + 1
    return out


def build_review(item: dict, work: Path, out: Path, thumb: Path, on) -> dict:
    m = talk_video(item)
    images = [x for x in item["media"] if x["type"] == "image"]
    on(5, "Đang nghe lời trong clip")
    segs = fixed(transcript(item, m), item)
    if not segs:
        raise AppError("NEWS_NO_SOURCE", "Không nghe được lời nói nào trong clip", status=422)
    _fresh(work)
    on(25, "Đang cắt khoảng lặng và chèn phụ đề")
    full = (m.get("duration_ms") or 0) / 1000 or segs[-1]["end_ms"] / 1000
    ranges = keep_ranges(segs, 0.0, full, cut=item.get("cut_silence", True))
    video, voice, dur = render_talk(item, m, 0.0, full, segs, item["headline"], work, insert_plan(images, sum(b - a for a, b in ranges)))
    on(70, "Đang dựng màn chốt")
    news.overlay_c(item, work / "c.png")
    card = work / "card.mp4"
    news._segment(images[0] if images else m, 0.0, 3.0, "C", work / "c.png", card, fx=looks.segment_vf(looks.item_look(item), 0, W, H, frame_only=True))
    (work / "list.txt").write_text(f"file '{video.name}'\nfile '{card.name}'\n", "utf-8")
    news._ff(["-f", "concat", "-safe", "0", "-i", str(work / "list.txt"), "-c", "copy", str(work / "video.mp4")])
    on(85, "Đang trộn âm thanh")
    return finish(item, work / "video.mp4", voice, dur + 3.0, work, out, thumb, cut_s=round(full - dur, 1), inserts=len(insert_plan(images, dur)))


# ---------------------------------------------------------------- cắt video dài
def candidates(segs: list[dict], target: int = 45) -> list[dict]:
    """Chia lời cả video thành các đoạn liền nhau dài quanh `target` giây, kết thúc ở cuối câu. Kèm điểm sơ bộ."""
    out, i = [], 0
    lo, hi = target * 0.6, target * 1.3
    while i < len(segs):
        j = i
        while j + 1 < len(segs):
            dur = (segs[j]["end_ms"] - segs[i]["start_ms"]) / 1000
            if (dur >= lo and segs[j]["text"].rstrip()[-1:] in ".?!…") or (segs[j + 1]["end_ms"] - segs[i]["start_ms"]) / 1000 > hi:
                break
            j += 1
        t0, t1 = segs[i]["start_ms"] / 1000, segs[j]["end_ms"] / 1000
        text = " ".join(s["text"] for s in segs[i:j + 1])
        if lo <= t1 - t0 <= hi * 1.1 and len(text.split()) >= 25:
            words = len(text.split())
            score = min(words / (t1 - t0), 4.0) + (0.6 if "?" in text else 0) + (0.4 if re.search(r"\d", text) else 0)
            out.append({"id": len(out) + 1, "t0": t0, "t1": t1, "text": text, "score": round(score, 2)})
        i = j + 1
    return out


def pick_clips(cands: list[dict], count: int) -> list[dict]:
    """Chọn `count` đoạn đáng xem nhất và đặt tiêu đề. Có AI thì AI chọn trong các đoạn điểm cao; không thì lấy theo điểm."""
    pool = sorted(cands, key=lambda c: c["score"], reverse=True)[:30]
    by_id = {c["id"]: c for c in pool}
    chosen: list[dict] = []
    count = min(count, len(pool))
    if ai.llm_available():
        def ok(o):
            out = []
            for x in o["clips"]:
                c, title = by_id.get(int(x["id"])), str(x.get("title") or "").strip()
                if c and 8 <= len(title) <= 110 and c["id"] not in [y["id"] for y in out] \
                        and not news.new_numbers(title, c["text"]) and not news.foreign_words(title, c["text"]):
                    out.append({**c, "title": title})
            if len(out) < count:
                raise ValueError("chọn chưa đủ đoạn")
            return out[:count]
        try:
            chosen = ai.generate_json(
                "Bạn là biên tập viên video ngắn tiếng Việt. Bạn chọn những đoạn nói đáng xem nhất trong một video dài và đặt tiêu đề. "
                "Tiêu đề chỉ được dùng ý có trong chính đoạn đó, không thêm con số hay tên riêng nào khác. Trả về JSON.",
                f"Dưới đây là {len(pool)} đoạn trích từ một video dài, mỗi đoạn có số thứ tự. Chọn đúng {count} đoạn đáng làm clip ngắn nhất: "
                "đoạn có một ý trọn vẹn, có bài học, ví dụ hoặc câu chuyện, người chưa xem phần trước vẫn hiểu.\n"
                'Khuôn JSON: {"clips": [{"id": số thứ tự, "title": "tiêu đề dưới 90 ký tự"}, ...]}\n\n'
                + "\n".join(f"[{c['id']}] {c['text'][:420]}" for c in sorted(pool, key=lambda c: c["id"])), ok, temperature=0.4, timeout=420)
        except (RuntimeError, ValueError):
            chosen = []
    if not chosen:
        chosen = [{**c, "title": (news._sentences(c["text"]) or [c["text"]])[0][:80].rstrip(" ,.")} for c in pool[:count]]
    return sorted(chosen, key=lambda c: c["t0"])


def make_clips(nid: str, count: int | None = None, prev_status: str = "draft") -> dict:
    item = news.load(nid)
    m = talk_video(item)
    for v in item.get("variants") or []:
        for f in ((v.get("output") or {}).get("path"), (v.get("output") or {}).get("thumb"), (v.get("output") or {}).get("caption_file")):
            if f and Path(f).is_file() and (news.OUT_DIR in Path(f).parents or news._dir(nid) in Path(f).parents):
                Path(f).unlink(missing_ok=True)
    count = max(1, min(MAX_CLIPS, int(count or item.get("clip_count") or 5)))
    news._patch(nid, status="rendering", progress=2, error=None, stage="Đang nghe cả video (video dài sẽ mất vài phút)", variants=[])
    segs = fixed(transcript(item, m), item)
    cands = candidates(segs, int(item.get("clip_len") or 45))
    if not cands:
        raise AppError("NEWS_NO_SOURCE", "Video quá ngắn hoặc quá ít lời nói để cắt thành clip", status=422)
    news._patch(nid, progress=30, stage="Đang chọn đoạn đáng xem")
    picks = pick_clips(cands, count)
    base = news.script_hash(item)
    rows = [{"k": i, "status": "waiting", "headline": c["title"], "theme": item["theme"], "style": None, "voice": "Giọng thật",
             "first_media": f"{int(c['t0'] // 60)}:{int(c['t0'] % 60):02d} đến {int(c['t1'] // 60)}:{int(c['t1'] % 60):02d}",
             "base_hash": base, "output": None, "error": None} for i, c in enumerate(picks)]
    news._patch(nid, variants=rows, progress=35)
    for i, c in enumerate(picks):
        rows[i]["status"] = "rendering"
        news._patch(nid, variants=rows, stage=f"Đang dựng clip {i + 1}/{len(picks)}", progress=35 + int(65 * i / len(picks)))
        try:
            work = _fresh(news._dir(nid) / "work")
            view = {**item, "headline": c["title"], "caption": c["title"], "variant_k": i}
            video, voice, dur = render_talk(view, m, c["t0"], c["t1"], segs, c["title"], work)
            res = finish(view, video, voice, dur, work, news._out_name({**item, "headline": item.get("headline") or m["name"]}, f"-clip{i + 1}"),
                         news._dir(nid) / "variants" / f"{i + 1}.jpg")
            rows[i].update(status="done", output=res)
        except AppError as e:
            rows[i].update(status="failed", error=e.message)
        except Exception as e:  # noqa: BLE001 — một clip hỏng không dừng các clip còn lại
            rows[i].update(status="failed", error=str(e)[:300])
        news._patch(nid, variants=rows)
    return news._patch(nid, status=prev_status if prev_status in ("draft", "done") else "draft", progress=100, stage=None, variants=rows)


# ---------------------------------------------------------------- kể chuyện bằng ảnh
def _scene(m: dict, start: float, dur: float, png: Path, out: Path, fx: str = "") -> None:
    news._ff([*news._src_args(m, start, dur), "-loop", "1", "-i", str(png), "-filter_complex",
              f"[0:v]{news._cover(m, W, H)}{fx}[v];[v][1:v]overlay=0:0,format=yuv420p[o]", "-map", "[o]", "-t", f"{dur:.3f}", "-an", "-r", "30",
              "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", str(out)])


def _say(lines: list[str], item: dict) -> tuple[list[tuple[Path, float]], str, str | None]:
    """Đọc từng dòng bằng giọng đã chọn; bộ giọng chưa chạy thì lùi về giọng máy. Trả ([(wav, giây)], tên giọng, cảnh báo)."""
    settings, warning = news._voice_settings(item), None
    try:
        first = tts.synth(lines[0], settings)
    except AppError as e:
        if e.code != "VOICE_SERVER_OFFLINE":
            raise
        settings = {"lufs": -16, "rate": 1.0, **tts.default_voice()}
        warning = "Bộ giọng chưa chạy nên video được đọc bằng giọng máy."
        first = tts.synth(lines[0], settings)
    wavs = [first] + [tts.synth(x, settings) for x in lines[1:]]
    name = settings.get("voice") if settings.get("provider") == "vieneu_preset" else "Giọng máy"
    return [(Path(w), ms / 1000) for w, ms in wavs], name, warning


def _voice_track(wavs: list[tuple[Path, float]], starts: list[float], out: Path) -> None:
    args, fc = [], ""
    for i, ((w, _), t) in enumerate(zip(wavs, starts)):
        args += ["-i", str(w)]
        fc += f"[{i}:a]aresample=48000,adelay={int(t * 1000)}:all=1[a{i}];"
    fc += "".join(f"[a{i}]" for i in range(len(wavs))) + f"amix=inputs={len(wavs)}:normalize=0:duration=longest[o]"
    news._ff([*args, "-filter_complex", fc, "-map", "[o]", "-ac", "1", str(out)])


def build_story(item: dict, work: Path, out: Path, thumb: Path, on) -> dict:
    if not item["media"]:
        raise AppError("NEWS_NO_MEDIA", "Cần ít nhất một ảnh hoặc video", status=422)
    lines = news._sentences(item["body"])[:30]
    if not lines:
        raise AppError("NEWS_NO_SCRIPT", "Chưa có lời kể", status=422, hint="Nhập lời kể, mỗi dòng một câu, hoặc bấm “AI viết lời”.")
    opening = item["hook"] or item["headline"]
    spoken = ([opening] if opening else []) + lines
    _fresh(work)
    on(5, "Đang đọc lời")
    wavs, voice, warning = _say(spoken, item)
    on(30, "Đang dựng từng cảnh")
    ms, parts, starts, t, used = item["media"], [], [], 0.0, {}
    for i, (text, (_, secs)) in enumerate(zip(spoken, wavs)):
        dur = secs + (0.6 if i == 0 and opening else 0.3)
        m = ms[(i - (1 if opening else 0)) % len(ms)] if not (i == 0 and opening) else ms[0]
        scene_png(item, item["headline"] or text if i == 0 and opening else text, work / f"t{i}.png", title=i == 0 and bool(opening))
        seg = work / f"seg{i}.mp4"
        _scene(m, used.get(m["id"], 0.0), dur, work / f"t{i}.png", seg, looks.segment_vf(looks.item_look(item), i, W, H))
        used[m["id"]] = used.get(m["id"], 0.0) + dur          # clip dùng lại ở cảnh sau thì chạy tiếp, không quay lại từ đầu
        parts.append(seg)
        starts.append(t + 0.12)
        t += dur
        on(30 + int(50 * (i + 1) / len(spoken)), None)
    (work / "list.txt").write_text("".join(f"file '{x.name}'\n" for x in parts), "utf-8")
    news._ff(["-f", "concat", "-safe", "0", "-i", str(work / "list.txt"), "-c", "copy", str(work / "video.mp4")])
    on(85, "Đang trộn âm thanh")
    _voice_track(wavs, starts, work / "voice.wav")
    return finish(item, work / "video.mp4", work / "voice.wav", t + 0.4, work, out, thumb, warning=warning, voice_name=voice, scenes=len(spoken))


# ---------------------------------------------------------------- trích dẫn
def quote_lines(item: dict) -> list[str]:
    return [x.strip() for x in str(item.get("body") or "").split("\n") if x.strip()][:6]


def build_quote(item: dict, work: Path, out: Path, thumb: Path, on) -> dict:
    lines = quote_lines(item)
    if not lines:
        raise AppError("NEWS_NO_SCRIPT", "Chưa có câu trích dẫn", status=422, hint="Nhập một câu, hoặc 3 đến 5 ý, mỗi ý một dòng.")
    _fresh(work)
    wavs, voice, warning = [], "Không đọc", None
    if item.get("speak"):
        on(5, "Đang đọc lời")
        wavs, voice, warning = _say(lines, item)
    durs = [(wavs[i][1] + 0.45) if wavs else max(1.8, len(ln.split()) * 0.38) for i, ln in enumerate(lines)]
    durs[-1] += 1.6                                         # giữ khung cuối đủ lâu để đọc lại cả ý
    total = 0.5 + sum(durs)
    on(30, "Đang dựng chữ")
    if item["media"]:
        m, look = item["media"][0], ",boxblur=14:2,eq=brightness=-0.22"
    else:
        gradient_png(item, work / "bg.png")
        m, look = {"type": "image", "path": str(work / "bg.png")}, ""
    args = [*news._src_args(m, 0.0, total)]
    fc, last, t, starts = f"[0:v]{news._cover(m, W, H)}{look}[b0];", "b0", 0.5, []
    for i in range(len(lines)):
        quote_png(item, lines, i, work / f"q{i}.png")
        args += ["-i", str(work / f"q{i}.png")]
        fc += f"[{last}][{i + 1}:v]overlay=0:0:enable='between(t,{t:.2f},{t + durs[i]:.2f})'[b{i + 1}];"
        last = f"b{i + 1}"
        starts.append(t + 0.1)
        t += durs[i]
    news._ff([*args, "-filter_complex", fc + f"[{last}]format=yuv420p[o]", "-map", "[o]", "-t", f"{total:.3f}", "-an", "-r", "30",
              "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", str(work / "video.mp4")])
    on(85, "Đang trộn âm thanh")
    track = None
    if wavs:
        _voice_track(wavs, starts, work / "voice.wav")
        track = work / "voice.wav"
    return finish(item, work / "video.mp4", track, total, work, out, thumb, warning=warning, voice_name=voice, lines=len(lines))


BUILDERS = {"review": build_review, "story": build_story, "quote": build_quote}


# ---------------------------------------------------------------- điều kiện và viết lời
def ready(item: dict) -> None:
    """Ném lỗi dễ hiểu nếu tin chưa đủ nguyên liệu để dựng theo chế độ của nó."""
    kind = item.get("kind")
    if kind in ("review", "clips"):
        talk_video(item)
    elif kind == "quote":
        if not quote_lines(item):
            raise AppError("NEWS_NO_SCRIPT", "Chưa có câu trích dẫn", status=422, hint="Nhập một câu, hoặc 3 đến 5 ý, mỗi ý một dòng.")
    else:
        if not item["media"]:
            raise AppError("NEWS_NO_MEDIA", "Cần ít nhất một ảnh hoặc video", status=422)
        if not item["body"] or (kind != "story" and not (item["hook"] or item["headline"])):
            raise AppError("NEWS_NO_SCRIPT", "Chưa có lời đọc", status=422, hint="Bấm “AI viết lời” hoặc tự nhập tiêu đề và lời đọc.")


def needs_script(item: dict) -> bool:
    """Hàng đợi có cần gọi AI viết lời trước khi dựng không."""
    kind = item.get("kind")
    if kind == "clips":
        return False
    if kind == "review":
        return not item["headline"]
    return not item["body"]


def write(item: dict) -> dict:
    """AI viết phần chữ cho ba chế độ review / story / quote. Trả các trường cần cập nhật vào tin."""
    kind = item["kind"]
    if kind == "clips":
        raise AppError("BAD_INPUT", "Chế độ cắt video dài không cần viết lời: máy tự đặt tiêu đề cho từng clip", status=422)
    if kind == "review":
        src = " ".join(s["text"] for s in fixed(transcript(item, talk_video(item)), item))[:5000]
    else:
        src = (item["source_text"] or item["body"])[:5000]
    if len(src) < 20:
        raise AppError("NEWS_NO_SOURCE", "Chưa có nội dung để viết", status=422,
                       hint="Dán bài viết hoặc ý chính vào ô Nội dung." if kind != "review" else "Clip chưa nghe được lời nói.")
    tail = news.CAPTION_RULE + news.MOOD_RULE
    rule = ("Chỉ dùng thông tin có trong nội dung được đưa, không thêm tên người, con số, công dụng hay chi tiết nào không có trong đó. "
            "Viết tên riêng và thuật ngữ đúng từng chữ như trong nội dung. Trả về JSON.")
    if kind == "review":
        system = "Bạn đặt tiêu đề cho video một người nói về sản phẩm. " + rule
        prompt = ('Khuôn JSON: {"headline": "...", "caption": "...", "hashtags": "...", "mood": "..."}\n'
                  "- headline: dòng chữ hiện ở đầu video, tối đa 90 ký tự, nêu đúng điều người nói đang chia sẻ.\n" + tail + "\nLỜI TRONG CLIP:\n" + src)
    elif kind == "story":
        system = "Bạn chuyển một bài viết thành lời kể cho video ngắn tiếng Việt, mỗi câu đi với một hình. " + rule
        prompt = ('Khuôn JSON: {"headline": "...", "body": ["câu 1", "câu 2", ...], "caption": "...", "hashtags": "...", "mood": "..."}\n'
                  "- headline: tên câu chuyện hiện ở cảnh mở đầu, tối đa 80 ký tự.\n"
                  "- body: 8 đến 14 câu kể lại nội dung theo đúng thứ tự, mỗi câu dưới 22 chữ, viết để đọc thành tiếng, câu cuối là lời kết.\n"
                  + tail + "\nNỘI DUNG:\n" + src)
    else:
        system = "Bạn rút ý chính của một nội dung thành vài dòng ngắn để hiện chữ lớn trên video. " + rule
        prompt = ('Khuôn JSON: {"headline": "...", "body": ["ý 1", "ý 2", ...], "caption": "...", "hashtags": "...", "mood": "..."}\n'
                  "- headline: nhãn chủ đề 2 đến 5 chữ.\n- body: 3 đến 5 ý, mỗi ý một dòng dưới 12 chữ, không đánh số.\n"
                  + tail + "\nNỘI DUNG:\n" + src)
    head, body, extra, engine = "", [], {}, "mau"
    if ai.llm_available():
        def ok(o):
            h = str(o["headline"]).strip()
            b = [str(x).strip() for x in (o.get("body") or [])] if kind != "review" else []
            b = [x for x in b if x]
            if not 4 <= len(h) <= 160 or (kind == "story" and not 5 <= len(b) <= 20) or (kind == "quote" and not 2 <= len(b) <= 6):
                raise ValueError("sai khuôn")
            if news.new_numbers(" ".join([h, *b]), src) or news.foreign_words(" ".join([h, *b]), src):
                raise ValueError("có con số hoặc từ lạ không nằm trong nội dung")
            return h, b, {x: str(o.get(x) or "").strip() for x in ("mood", "caption", "hashtags")}
        try:
            head, body, extra = ai.generate_json(system, prompt, ok, temperature=0.5)
            engine = "llm"
        except RuntimeError:
            pass
    if not head:                          # không có AI: dùng nguyên văn
        ss = news._sentences(src)
        head = (ss[0] if ss else src)[:90]
        body = ss[:16] if kind == "story" else ss[:5] if kind == "quote" else []
    mood = extra.get("mood", "").lower()
    patch = {"headline": head, "script_engine": engine, "mood_ai": mood if mood in news.NEWS_MOODS else None,
             "caption": (extra.get("caption") or head)[:2000], "hashtags": news._hashtags(extra.get("hashtags") or item["category"])}
    if kind != "review":
        patch.update(body="\n".join(body), hook="", source_text=item["source_text"] or src)
    return patch
