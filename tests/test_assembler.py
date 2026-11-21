import shutil
import subprocess

import pytest

from flow_agent.media import has_audio, probe_duration
from flow_agent.producer.assembler import assemble, build_ass, chunk_text
from flow_agent.production import build_scene_prompt
from conftest import make_draft

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="cần ffmpeg")


def _clip(path, seconds, audio, size="720x1280"):
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"testsrc=size={size}:rate=24:duration={seconds}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:a", "aac"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest", str(path)]
    subprocess.run(cmd, check=True)
    return path


def test_chunk_and_ass():
    assert chunk_text("Mẹ bầu 12 tuần, nhớ đi siêu âm đo độ mờ da gáy nhé các mẹ ơi") == [
        "Mẹ bầu 12 tuần,", "nhớ đi siêu âm đo độ mờ", "da gáy nhé các mẹ ơi"]
    ass = build_ass([(8.0, "Một hai ba bốn"), (4.0, "")], 1080, 1920, "DejaVu Sans")
    assert "Dialogue: 0,0:00:00.00,0:00:07.95,Sub" in ass


def test_assemble_end_to_end(tmp_path):
    clips = [_clip(tmp_path / "a.mp4", 3, True), _clip(tmp_path / "b.mp4", 2, False, "1280x720")]
    out = assemble(clips, ["Mẹ bầu cần nhớ mốc 12 tuần", "Hẹn gặp chị ở phòng khám"], tmp_path / "final.mp4")
    assert out.exists()
    assert abs(probe_duration(out) - 5.0) < 0.4
    assert has_audio(out)
    w_h = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                          "-of", "csv=p=0", str(out)], capture_output=True, text=True).stdout.strip()
    assert w_h == "1080,1920"


def test_scene_prompt_has_bible_dialogue_and_no_text():
    d = make_draft(1)
    p = build_scene_prompt(d.scenes[0], "A friendly Vietnamese doctor in a white coat.", "9:16")
    assert p.startswith("A friendly Vietnamese doctor") and "Vertical 9:16" in p
    assert d.scenes[0].dialogue_vi in p and "No on-screen text" in p
