"""Xử lý media: tải video (yt-dlp), bóc lời (faster-whisper), trích khung hình, đo thời lượng (ffmpeg)."""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


def run(cmd: list[str], timeout: int = 1800) -> subprocess.CompletedProcess:
    log.debug("RUN %s", " ".join(cmd))
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=True)


def probe_duration(path: Path) -> float | None:
    try:
        out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)]).stdout
        return float(json.loads(out)["format"]["duration"])
    except Exception:  # noqa: BLE001
        return None


def has_audio(path: Path) -> bool:
    try:
        out = run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                   "-of", "csv=p=0", str(path)]).stdout
        return bool(out.strip())
    except Exception:  # noqa: BLE001
        return False


def download_video(url: str, out_dir: Path, cookies: Path | None = None) -> Path | None:
    """Tải video Facebook bằng yt-dlp (cần cookie đăng nhập với video hạn chế)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    exe = shutil.which("yt-dlp")
    cmd = [exe] if exe else ["python3", "-m", "yt_dlp"]
    cmd += ["-f", "mp4/bestvideo*+bestaudio/best", "--merge-output-format", "mp4",
            "-o", str(out_dir / "%(id)s.%(ext)s"), "--no-playlist", "--print", "after_move:filepath"]
    if cookies and cookies.exists():
        cmd += ["--cookies", str(cookies)]
    cmd.append(url)
    try:
        res = run(cmd, timeout=900)
        lines = [ln for ln in res.stdout.strip().splitlines() if ln.strip()]
        return Path(lines[-1]) if lines else None
    except subprocess.CalledProcessError as exc:
        log.warning("Không tải được %s: %s", url, (exc.stderr or "")[-300:])
        return None


def extract_frames(video: Path, out_dir: Path, n: int = 6) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    dur = probe_duration(video) or 0
    frames: list[Path] = []
    if dur <= 0:
        return frames
    # Luôn lấy khung 0.5s (hook) + các khung rải đều
    points = [min(0.5, dur / 2)] + [dur * (i + 1) / (n) for i in range(n - 1)]
    for i, t in enumerate(points):
        f = out_dir / f"{video.stem}_{i:02d}.jpg"
        try:
            run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{max(0, t - 0.05):.2f}", "-i", str(video),
                 "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", str(f)])
            if f.exists():
                frames.append(f)
        except subprocess.CalledProcessError:
            continue
    return frames


def transcribe(video: Path, model_size: str = "small") -> str | None:
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        log.info("Chưa cài faster-whisper — bỏ qua bóc lời.")
        return None
    model = WhisperModel(model_size, device="auto", compute_type="int8")
    segments, _ = model.transcribe(str(video), language="vi", vad_filter=True)
    return "\n".join(f"[{s.start:5.1f}s] {s.text.strip()}" for s in segments)


def scene_cut_rate(video: Path, threshold: float = 0.3) -> float | None:
    """Số lần cắt cảnh / 10 giây — đo nhịp dựng."""
    dur = probe_duration(video)
    if not dur:
        return None
    try:
        res = subprocess.run(
            ["ffmpeg", "-i", str(video), "-filter:v", f"select='gt(scene,{threshold})',showinfo", "-f", "null", "-"],
            capture_output=True, text=True, timeout=600,
        )
        cuts = res.stderr.count("pts_time:")
        return round(cuts / dur * 10, 2)
    except Exception:  # noqa: BLE001
        return None
