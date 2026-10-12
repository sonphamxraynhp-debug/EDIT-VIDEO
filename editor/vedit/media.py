"""Đọc thông tin video/âm thanh bằng ffprobe và ffmpeg."""
import json
import subprocess
from fractions import Fraction

import numpy as np

HDR_TRANSFERS = {"arib-std-b67", "smpte2084"}


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
        check=True, capture_output=True, text=True,
    ).stdout
    info = json.loads(out)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    if v is None:
        raise SystemExit(f"Không tìm thấy luồng video trong {path}")

    w, h = int(v["width"]), int(v["height"])
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        if "rotation" in sd:
            rot = int(float(sd["rotation"]))
    rot = int(v.get("tags", {}).get("rotate", rot))
    if abs(rot) % 180 == 90:  # ffmpeg tự xoay khi giải mã
        w, h = h, w

    fps = Fraction(v.get("avg_frame_rate") or "0/1")
    if fps == 0:
        fps = Fraction(v.get("r_frame_rate") or "30/1")
    if float(fps) > 121 or float(fps) < 10:
        fps = Fraction(30, 1)
    # Video điện thoại thường là VFR (vd. 29.98) -> bắt về tốc độ khung chuẩn gần nhất
    common = [Fraction(24000, 1001), Fraction(24), Fraction(25), Fraction(30000, 1001), Fraction(30),
              Fraction(50), Fraction(60000, 1001), Fraction(60)]
    nearest = min(common, key=lambda c: abs(float(c) - float(fps)))
    fps = nearest if abs(float(nearest) - float(fps)) / float(nearest) < 0.02 else fps.limit_denominator(1001)

    v_start = float(v.get("start_time") or 0)
    a_start = float(a.get("start_time") or 0) if a else v_start
    transfer = v.get("color_transfer") or ""
    return {
        "av_offset": round(v_start - a_start, 4),
        "width": w,
        "height": h,
        "fps": float(fps),
        "fps_str": f"{fps.numerator}/{fps.denominator}",
        "duration": float(info["format"].get("duration") or v.get("duration") or 0),
        "codec": v.get("codec_name"),
        "pix_fmt": v.get("pix_fmt"),
        "bit_rate": int(v.get("bit_rate") or info["format"].get("bit_rate") or 0),
        "hdr": transfer in HDR_TRANSFERS,
        "color_transfer": transfer,
        "has_audio": a is not None,
        "sample_rate": int(a["sample_rate"]) if a else 48000,
        "channels": min(int(a.get("channels", 2)), 2) if a else 2,
    }


def read_audio(path, sample_rate, channels):
    """Mảng float32 (n_samples, channels) của luồng âm thanh đầu tiên."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-vn",
         "-ac", str(channels), "-ar", str(sample_rate), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, channels).copy()


def to_mono16k(samples, sample_rate):
    """Chuyển về mono 16 kHz float32 (đầu vào cho nhận dạng giọng nói)."""
    mono = samples.mean(axis=1).astype(np.float32)
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(sample_rate), "-ac", "1", "-i", "-",
         "-ar", "16000", "-ac", "1", "-f", "f32le", "-"],
        input=mono.tobytes(), check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def measure_loudness(path_f32, sample_rate, channels, highpass_hz):
    """Đo độ lớn (EBU R128) để chuẩn hoá tuyến tính ở lượt thứ hai, không làm 'bơm' âm thanh."""
    res = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-f", "f32le", "-ar", str(sample_rate), "-ac", str(channels),
         "-i", path_f32, "-af", f"highpass=f={highpass_hz},loudnorm=print_format=json", "-f", "null", "-"],
        check=True, capture_output=True, text=True,
    ).stderr
    start = res.rfind("{")
    try:
        return json.loads(res[start:res.rfind("}") + 1])
    except ValueError:
        return None
