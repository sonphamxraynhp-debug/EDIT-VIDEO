"""Kiểm tra video đầu ra: thông số, khoảng lặng còn sót, độ lớn âm thanh, ảnh tổng quan để soát bằng mắt."""
import re
import subprocess

from PIL import Image, ImageDraw, ImageFont

from . import media


def _frame_at(path, t, width):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1",
                          "-vf", f"scale={width}:-2", "-f", "image2pipe", "-vcodec", "png", "-"],
                         capture_output=True, check=True).stdout
    from io import BytesIO
    return Image.open(BytesIO(raw)).convert("RGB")


def contact_sheet(path, out_path, duration, n=12, cols=6, width=300, times=None):
    times = times or [duration * (i + 0.5) / n for i in range(n)]
    frames = [_frame_at(path, t, width) for t in times]
    fw, fh = frames[0].size
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * fw, rows * (fh + 28)), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    try:
        f = ImageFont.truetype("DejaVuSans.ttf", 20)
    except OSError:
        f = ImageFont.load_default()
    for i, (t, im) in enumerate(zip(times, frames)):
        x, y = (i % cols) * fw, (i // cols) * (fh + 28)
        sheet.paste(im, (x, y + 28))
        d.text((x + 6, y + 3), f"{t:.2f}s", fill=(255, 255, 255), font=f)
    sheet.save(out_path, quality=88)
    return out_path


def check(output, source=None, sheet_path=None, pause_db=-38, pause_min=0.45):
    o = media.probe(output)
    rep = {"output": output, "width": o["width"], "height": o["height"], "fps": o["fps_str"],
           "duration": round(o["duration"], 2), "issues": []}
    if source:
        s = media.probe(source)
        rep["source_duration"] = round(s["duration"], 2)
        rep["removed_seconds"] = round(s["duration"] - o["duration"], 2)
        if (s["width"], s["height"]) != (o["width"], o["height"]):
            rep["issues"].append(f"Độ phân giải đổi: {s['width']}x{s['height']} -> {o['width']}x{o['height']}")
        if abs(s["fps"] - o["fps"]) > 0.05:
            rep["issues"].append(f"Tốc độ khung đổi: {s['fps_str']} -> {o['fps_str']}")
    if not o["has_audio"]:
        rep["issues"].append("Không có âm thanh")
    else:
        err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", output, "-af",
                              f"silencedetect=n={pause_db}dB:d={pause_min},ebur128", "-f", "null", "-"],
                             capture_output=True, text=True).stderr
        starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
        durs = [float(x) for x in re.findall(r"silence_duration: ([\d.]+)", err)]
        rep["long_pauses"] = [{"t": round(a, 2), "len": round(b, 2)} for a, b in zip(starts, durs)]
        m = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
        if m:
            rep["loudness_lufs"] = float(m[-1])
    if sheet_path:
        contact_sheet(output, sheet_path, o["duration"])
        rep["sheet"] = sheet_path
    return rep
