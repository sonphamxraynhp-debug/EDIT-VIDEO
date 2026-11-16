"""Mọi preset chuyển động phải dựng được với nguồn dọc, ngang và vuông (lỗi pan với nguồn ngang trước đây)."""
import subprocess

import pytest

from avf import media, render


@pytest.mark.parametrize("src", ["960x600", "1080x1920", "720x720"])
@pytest.mark.parametrize("motion", ["none", "zoom_in", "zoom_out", "pan_left", "pan_right"])
def test_motion_filters_any_source(tmp_path, src, motion):
    vf = render._motion_vf(motion, 540, 960, 1.0) + ",format=yuv420p"
    out = tmp_path / "o.mp4"
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=s={src}:d=1:r=30",
                        "-vf", vf, "-t", "1", str(out)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-300:]
    m = media.probe(out)
    assert (m["width"], m["height"]) == (540, 960)


def test_aspect_label():
    assert media.aspect_label(960, 600) == "16:10"
    assert media.aspect_label(1080, 1920) == "9:16"
    assert media.aspect_label(1000, 700) == "10:7"


def test_overlays_persist_after_first_segment(tmp_path):
    """Phụ đề/watermark phải còn ở các đoạn sau (trước đây biến mất sau đoạn cắt đầu tiên)."""
    from PIL import Image
    src = tmp_path / "black.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=540x960:d=6:r=60",
                    "-c:v", "libx264", str(src)], check=True)
    tl = {"canvas": {"width": 1080, "height": 1920, "fps": 30}, "duration_ms": 4000,
          "tracks": {"video": [{"asset_id": "a", "src_in_ms": 1033, "src_out_ms": 3033, "start_ms": 0, "end_ms": 2000},
                               {"asset_id": "a", "src_in_ms": 3000, "src_out_ms": 5000, "start_ms": 2000, "end_ms": 4000}],
                     "captions": [{"start_ms": 0, "end_ms": 2000, "text": "Câu một"},
                                  {"start_ms": 2000, "end_ms": 4000, "text": "Câu hai ở đoạn sau"}], "titles": []}}
    out = tmp_path / "o.mp4"
    render.render_timeline(tl, {"a": src}, out, tmp_path / "w", "preview")
    frame = tmp_path / "f.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "3.2", "-i", str(out), "-frames:v", "1", str(frame)], check=True)
    im = Image.open(frame).convert("L")
    caption_band = im.crop((0, int(im.height * 0.6), im.width, int(im.height * 0.8)))
    assert caption_band.getextrema()[1] > 150          # có chữ trắng trên nền đen
    watermark_band = im.crop((0, int(im.height * 0.4), im.width, int(im.height * 0.55)))
    assert watermark_band.getextrema()[1] > 30         # DRAFT vẫn còn
