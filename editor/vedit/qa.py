"""Kiểm tra chất lượng video đầu ra: thông số, khoảng lặng còn sót, ảnh tổng quan để agent xem lại."""
import json
import math
import subprocess

from . import cut, media


def check(output, style, sheet_path=None, max_pause=0.5, source=None):
    info = media.probe(output)
    report = {"file": output, "width": info["width"], "height": info["height"], "fps": round(info["fps"], 3),
              "duration": round(info["duration"], 2), "has_audio": info["has_audio"], "issues": []}

    streams = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,duration,bit_rate", "-of", "json", output],
        check=True, capture_output=True, text=True).stdout)["streams"]
    durs = {s["codec_type"]: float(s.get("duration") or 0) for s in streams}
    if "audio" in durs and abs(durs["video"] - durs["audio"]) > 0.1:
        report["issues"].append(f"Lệch độ dài hình/tiếng {durs['video']:.2f}s vs {durs['audio']:.2f}s")
    report["video_bitrate_kbps"] = int(float(next((s.get("bit_rate") or 0) for s in streams if s["codec_type"] == "video")) / 1000)

    if source:
        src = media.probe(source)
        if (src["width"], src["height"]) != (info["width"], info["height"]):
            report["issues"].append(f"Độ phân giải đổi {src['width']}x{src['height']} -> {info['width']}x{info['height']}")
        report["source_duration"] = round(src["duration"], 2)

    # Khoảng lặng còn sót
    samples = media.read_audio(output, 48000, 1)
    db, win = cut.frame_db(samples, 48000, 10)
    thr, _, _ = cut.auto_threshold(db, style["silence"])
    quiet = db <= thr
    step = win / 48000
    pauses = [((s * step), (e - s) * step) for s, e in cut._runs(quiet) if (e - s) * step > max_pause]
    pauses = [p for p in pauses if 0.2 < p[0] < info["duration"] - 0.6]
    report["long_pauses"] = [{"at": round(a, 2), "len": round(l, 2)} for a, l in pauses]
    if pauses:
        report["issues"].append(f"{len(pauses)} khoảng lặng > {max_pause}s còn sót")

    if sheet_path:
        n = 12
        step_t = info["duration"] / n
        cols = 6
        rows = math.ceil(n / cols)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", output, "-vf",
                        f"fps=1/{step_t:.3f},scale=270:-1,tile={cols}x{rows}:padding=4:color=white",
                        "-frames:v", "1", sheet_path], check=True)
        report["contact_sheet"] = sheet_path
    report["ok"] = not report["issues"]
    return report
