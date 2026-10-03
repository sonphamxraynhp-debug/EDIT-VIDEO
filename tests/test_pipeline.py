"""Kiểm thử nhanh: python3 -m pytest -q tests/"""
import json
import os
import subprocess
import sys

import numpy as np
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "editor"))

from vedit import cut, media  # noqa: E402
from vedit.captions import build_chunks, split_lines  # noqa: E402

STYLE = json.load(open(os.path.join(ROOT, "editor", "style.json"), encoding="utf-8"))
SR = 16000


def tone(sec, amp=0.3):
    t = np.arange(int(sec * SR)) / SR
    return (amp * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def noise(sec, amp=0.001):
    return (np.random.default_rng(0).standard_normal(int(sec * SR)) * amp).astype(np.float32)


def test_detect_speech_removes_long_silence_keeps_short_pause():
    audio = np.concatenate([noise(1.0), tone(1.0), noise(0.15), tone(1.0), noise(1.5), tone(1.0), noise(1.0)])
    segs, info = cut.detect_speech(audio[:, None], SR, STYLE["silence"])
    # Khoảng nghỉ 0.15 s được giữ (gộp), khoảng 1.5 s bị cắt -> 2 đoạn
    assert len(segs) == 2
    assert segs[0][0] == pytest.approx(0.9, abs=0.05)
    assert segs[0][1] == pytest.approx(3.15 + STYLE["silence"]["pad_after"], abs=0.05)
    kept = sum(b - a for a, b in segs)
    assert kept < len(audio) / SR - 3.0


def test_remove_range_and_frame_alignment():
    audio = np.concatenate([tone(2.0), noise(0.2), tone(2.0)])
    segs, _ = cut.detect_speech(audio[:, None], SR, STYLE["silence"], remove=[(0.5, 1.0)])
    assert all(not (a < 0.75 < b) for a, b in segs)
    frames = cut.to_frames(segs, 30)
    out = cut.assemble_audio(audio[:, None], SR, 30, frames, 12)
    n_frames = sum(e - s for s, e in frames)
    assert abs(len(out) - n_frames * SR / 30) <= len(frames)  # khớp hình-tiếng tới từng mẫu


def test_never_cut_inside_word():
    audio = np.concatenate([tone(1.0), noise(1.0), tone(1.0)])
    words = [{"w": "nhỏ", "s": 1.2, "e": 1.7}]  # từ nói rất nhỏ, dưới ngưỡng năng lượng
    segs, _ = cut.detect_speech(audio[:, None], SR, STYLE["silence"], words=words)
    assert any(a <= 1.2 and b >= 1.7 for a, b in segs)


def test_split_lines_balanced_top_heavy():
    assert split_lines("những lúc ấy ép mẹ ăn một bát đầy", 24) == ["những lúc ấy ép mẹ", "ăn một bát đầy"]
    assert split_lines("hồi nghén", 24) == ["hồi nghén"]


def test_build_chunks_style():
    text = "Bước lên cân, mẹ bầu hồi hộp. Như chờ điểm thi của Phạm Sơn"
    words, t = [], 0.0
    for i, w in enumerate(text.split()):
        words.append({"w": w, "s": t, "e": t + 0.25})
        t += 0.3 + (0.4 if w.endswith(".") else 0)
    chunks = build_chunks(words, STYLE["captions"], STYLE["glossary"])
    texts = [c["text"] for c in chunks]
    assert texts[0] == "bước lên cân"
    assert "mẹ bầu hồi hộp" in texts
    assert any("Phạm Sơn" in x for x in texts)
    assert all("," not in x and "." not in x for x in texts)
    for a, b in zip(chunks, chunks[1:]):
        assert a["end"] <= b["start"] + 1e-6


@pytest.mark.skipif(subprocess.run(["which", "ffmpeg"], capture_output=True).returncode != 0, reason="cần ffmpeg")
def test_end_to_end_render(tmp_path):
    src = tmp_path / "raw.mp4"
    # 6 s video: tiếng 0-2 s, lặng 2-4 s, tiếng 4-6 s
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=540x960:r=30:d=6",
        "-f", "lavfi", "-i", "sine=f=300:d=6:sample_rate=44100",
        "-af", "volume='if(between(t,2,4),0.0005,1)':eval=frame",
        "-c:v", "libx264", "-crf", "20", "-c:a", "aac", "-shortest", str(src)], check=True)
    transcript = tmp_path / "t.json"
    transcript.write_text(json.dumps({"segments": [
        {"start": 0.1, "end": 1.9, "text": "mẹ bầu nghén phải làm sao"},
        {"start": 4.1, "end": 5.9, "text": "chia nhỏ bữa ăn mẹ nhé"}]}, ensure_ascii=False), encoding="utf-8")
    work, out = tmp_path / "work", tmp_path / "out.mp4"
    cli = [sys.executable, os.path.join(ROOT, "editor", "edit_video.py")]
    subprocess.run(cli + ["prepare", str(src), "-w", str(work), "--transcript", str(transcript)], check=True)
    plan = json.loads((work / "edit_plan.json").read_text(encoding="utf-8"))
    assert 4.0 < plan["duration"] < 4.8
    assert plan["hook"]["text"].startswith("Mẹ bầu nghén")
    subprocess.run(cli + ["render", str(work / "edit_plan.json"), "-o", str(out), "--preview"], check=True)
    info = media.probe(out)
    assert (info["width"], info["height"]) == (540, 960)
    assert info["duration"] == pytest.approx(plan["duration"], abs=0.1)


def test_load_srt(tmp_path):
    from vedit.asr import load_transcript
    srt = tmp_path / "a.srt"
    srt.write_text("1\n00:00:00,500 --> 00:00:02,000\nmẹ bầu nghén\n\n2\n00:00:02,100 --> 00:00:03,900\nphải làm sao\n",
                   encoding="utf-8")
    words = load_transcript(str(srt))
    assert [w["w"] for w in words] == ["mẹ", "bầu", "nghén", "phải", "làm", "sao"]
    assert words[0]["s"] == pytest.approx(0.5) and words[3]["seg"] == 1


def test_threshold_ignores_digital_silence():
    # Nền phòng ~-50 dB + đoạn số 0 tuyệt đối giữa hai clip ghép
    audio = np.concatenate([noise(1.0, 0.003), tone(1.0), np.zeros(2 * SR, np.float32),
                            noise(1.5, 0.003), tone(1.0), noise(1.0, 0.003)])
    segs, info = cut.detect_speech(audio[:, None], SR, STYLE["silence"])
    assert info["noise_db"] > -80
    assert len(segs) == 2 and sum(b - a for a, b in segs) < 2.8


def test_word_span_in_silence_is_trimmed():
    # Bộ nhận dạng đánh dấu từ bắt đầu từ 1.0 s nhưng tiếng thật bắt đầu ở 2.0 s
    audio = np.concatenate([tone(1.0), noise(1.0, 0.003), tone(1.0)])
    words = [{"w": "hôm", "s": 1.0, "e": 2.3}]
    segs, _ = cut.detect_speech(audio[:, None], SR, STYLE["silence"], words=words)
    assert len(segs) == 2


def test_from_lines_aligns_rewritten_captions():
    from vedit.captions import from_lines
    words = [{"w": w, "s": i * 0.4, "e": i * 0.4 + 0.3} for i, w in enumerate("người nhà thử đổi câu mệt gì thành".split())]
    caps = from_lines(["người nhà thử đổi câu", "mệt gì thành"], words, STYLE["captions"], STYLE["glossary"])
    assert [c["text"] for c in caps] == ["người nhà thử đổi câu", "mệt gì thành"]
    assert caps[1]["start"] == pytest.approx(2.0 - STYLE["captions"]["lead_in"], abs=1e-3)
