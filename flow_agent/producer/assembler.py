"""Ghép các clip Flow thành 1 video dọc hoàn chỉnh + phụ đề tiếng Việt (ASS, đổi dòng ~2 giây)."""
from __future__ import annotations

import logging
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
    text = text.replace("\\", "/").replace("{", "(").replace("}", ")").strip()
    return r"\N".join(textwrap.wrap(text, width=width)) if text else ""


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
        chunks = chunk_text(text)
        if chunks:
            step = dur / len(chunks)
            for i, c in enumerate(chunks):
                start, end = t0 + i * step, t0 + (i + 1) * step - 0.05
                events.append(f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Sub,,0,0,0,,{_ass_escape(c)}")
        t0 += dur
    return header + "\n".join(events) + "\n"


def normalize_clip(src: Path, dst: Path, width: int, height: int, fps: int = 30) -> Path:
    dur = probe_duration(src) or 8.0
    vf = (f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
          f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=white,fps={fps},format=yuv420p,setsar=1")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src)]
    if not has_audio(src):
        cmd += ["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        cmd += ["-map", "0:v:0", "-map", "1:a:0"]
    else:
        cmd += ["-map", "0:v:0", "-map", "0:a:0"]
    cmd += ["-vf", vf, "-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", str(dst)]
    run(cmd)
    return dst


def assemble(clips: list[Path], subtitles: list[str], out_path: Path, width: int = 1080, height: int = 1920,
             font: str = "DejaVu Sans", burn_subtitles: bool = True) -> Path:
    work = out_path.parent / f"{out_path.stem}_work"
    work.mkdir(parents=True, exist_ok=True)
    norm = [normalize_clip(c, work / f"n{i:02d}.mp4", width, height) for i, c in enumerate(clips)]
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
