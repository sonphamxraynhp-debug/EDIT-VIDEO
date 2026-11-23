"""Ghép các clip Flow thành 1 video dọc hoàn chỉnh + phụ đề tiếng Việt (ASS, đổi dòng ~2 giây)."""
from __future__ import annotations

import logging
import re
import subprocess
import textwrap
from pathlib import Path

from ..media import has_audio, probe_duration, run

log = logging.getLogger(__name__)


def _ass_time(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _ass_escape(text: str, width: int = 24) -> str:
    text = text.replace("\\", "/").replace("{", "(").replace("}", ")")
    text = "".join(ch for ch in text if ord(ch) <= 0xFFFF and ch != "\ufe0f").strip()  # bỏ emoji (font không có)
    if not text:
        return ""
    lines = textwrap.wrap(text, width=width)
    if len(lines) > 1:  # cân dòng: tránh dòng cuối chỉ còn 1 chữ
        lines = textwrap.wrap(text, width=max(8, -(-len(text) // len(lines)) + 3))
    return r"\N".join(lines)


def chunk_text(text: str, max_words: int = 7) -> list[str]:
    """Chia câu thành các dòng ngắn ~2 giây đọc, ưu tiên ngắt ở dấu câu."""
    words = text.split()
    if not words:
        return []
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= max_words or w.endswith((".", ",", "!", "?", ":", ";", "…")):
            chunks.append(" ".join(cur))
            cur = []
    if cur:
        chunks.append(" ".join(cur))
    return chunks


_TIMED = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)\s*s\s*:\s*(.+?)\s*$")


def parse_timed(text: str, dur: float) -> list[tuple[float, float, str]] | None:
    """Phụ đề dạng '0–3s: câu A | 3–5,5s: câu B' -> [(0,3,'câu A'), (3,5.5,'câu B')]; None nếu không có mốc giờ.
    Mốc giờ được co giãn theo độ dài thật của clip."""
    parts = [x for x in re.split(r"\s*\|\s*|\n+", text) if x.strip()]
    segs = []
    for part in parts:
        m = _TIMED.match(part)
        if not m:
            return None
        a, b = (float(m.group(i).replace(",", ".")) for i in (1, 2))
        segs.append((a, b, m.group(3)))
    if not segs:
        return None
    total = max(b for _, b, _ in segs) or dur
    k = dur / total if total > 0 else 1.0
    return [(a * k, b * k, t) for a, b, t in segs]


def build_ass(scenes: list[tuple[float, str]], width: int, height: int, font: str) -> str:
    """scenes: [(thời lượng cảnh, chữ hiển thị)] theo thứ tự."""
    # Màu ASS dạng &HAABBGGRR — nền hộp xanh thương hiệu #0B4EC6, chữ trắng
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,{font},{int(height * 0.036)},&H00FFFFFF,&H00FFFFFF,&H00C64E0B,&H00C64E0B,1,0,0,0,100,100,0,0,3,14,0,2,60,60,{int(height * 0.22)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events, t0 = [], 0.0
    for dur, text in scenes:
        timed = parse_timed(text, dur)
        if timed:
            for a, b, c in timed:
                events.append(f"Dialogue: 0,{_ass_time(t0 + a)},{_ass_time(t0 + b - 0.05)},Sub,,0,0,0,,{_ass_escape(c)}")
            t0 += dur
            continue
        chunks = chunk_text(text)
        if chunks:
            step = dur / len(chunks)
            for i, c in enumerate(chunks):
                start, end = t0 + i * step, t0 + (i + 1) * step - 0.05
                events.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Sub,,0,0,0,,{_ass_escape(c)}")
        t0 += dur
    return header + "\n".join(events) + "\n"


def normalize_clip(src: Path, dst: Path, width: int, height: int, fps: int = 30,
                   max_seconds: float | None = None) -> Path:
    """Đưa clip về đúng khung (vd 1080x1920). Clip lệch khung (Flow trả 16:9) được đặt giữa trên nền
    chính nó phóng to + làm mờ — kiểu Reels quen thuộc — thay vì viền trắng."""
    dur = probe_duration(src) or 8.0
    if max_seconds and 0 < max_seconds < dur:  # Veo luôn trả 8s; cảnh kịch bản ngắn hơn thì cắt đúng nhịp
        dur = float(max_seconds)
    fc = (f"[0:v]split=2[a][b];"
          f"[a]scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},boxblur=30:3,"
          f"eq=brightness=0.04[bg];"
          f"[b]scale={width}:{height}:force_original_aspect_ratio=decrease[fg];"
          f"[bg][fg]overlay=(W-w)/2:(H-h)/2,fps={fps},format=yuv420p,setsar=1[v]")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src)]
    if not has_audio(src):
        cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-filter_complex", fc,
                "-map", "[v]", "-map", "1:a:0"]
    else:
        cmd += ["-filter_complex", fc, "-map", "[v]", "-map", "0:a:0"]
    cmd += ["-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", str(dst)]
    run(cmd)
    return dst


def assemble(clips: list[Path], subtitles: list[str], out_path: Path, width: int = 1080, height: int = 1920,
             font: str = "DejaVu Sans", burn_subtitles: bool = True,
             scene_seconds: list[float] | None = None) -> Path:
    work = out_path.parent / f"{out_path.stem}_work"
    work.mkdir(parents=True, exist_ok=True)
    limits = scene_seconds or [None] * len(clips)
    norm = [normalize_clip(c, work / f"n{i:02d}.mp4", width, height, max_seconds=lim)
            for i, (c, lim) in enumerate(zip(clips, limits))]
    (work / "list.txt").write_text("".join(f"file '{p.name}'\n" for p in norm), encoding="utf-8")
    joined = work / "joined.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt",
                    "-c", "copy", joined.name], cwd=work, check=True, capture_output=True, text=True)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if burn_subtitles and any(s.strip() for s in subtitles):
        durations = [probe_duration(p) or 8.0 for p in norm]
        (work / "subs.ass").write_text(build_ass(list(zip(durations, subtitles)), width, height, font), encoding="utf-8")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", joined.name, "-vf", "ass=subs.ass",
                        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "copy",
                        "-movflags", "+faststart", str(out_path.resolve())],
                       cwd=work, check=True, capture_output=True, text=True)
    else:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", joined.name, "-c", "copy",
                        "-movflags", "+faststart", str(out_path.resolve())],
                       cwd=work, check=True, capture_output=True, text=True)
    return out_path
