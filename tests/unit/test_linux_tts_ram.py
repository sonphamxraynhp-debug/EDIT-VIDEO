"""Giọng đọc trên Linux (Piper / espeak-ng) và giới hạn job theo RAM cho máy 16 GB."""
import shutil
import subprocess
from pathlib import Path

import pytest

from avf import tts, worker


def test_ram_cap_16gb_allows_three_renders():
    assert worker.ram_cap(16) == 3
    assert worker.ram_cap(8) == 1
    assert worker.ram_cap(4) == 1          # luôn ít nhất 1
    assert worker.ram_cap(32) == 7


def test_limits_never_exceed_ram_cap(monkeypatch):
    monkeypatch.setattr(worker, "ram_cap", lambda total_gb=None: 2)
    monkeypatch.setattr(worker.db, "get_setting", lambda k, d=None: {"performance_mode": "turbo", "parallel_jobs": 8}.get(k, d))
    lim = worker.limits()
    assert lim["render"] == 2 and lim["ai"] == 1 and lim["cpu"] == 3


def test_saved_mac_voice_falls_back_on_linux(monkeypatch):
    monkeypatch.setattr(tts.platform, "system", lambda: "Linux")
    monkeypatch.setattr(tts.shutil, "which", lambda n: "/usr/bin/espeak-ng" if n == "espeak-ng" else None)
    monkeypatch.setattr(tts, "piper_voices", lambda: [])
    assert not tts._os_provider_ok("os_say") and not tts._os_provider_ok("os_sapi")
    assert tts.default_voice()["provider"] == "espeak"


def test_default_prefers_piper_when_voice_downloaded(monkeypatch):
    monkeypatch.setattr(tts.platform, "system", lambda: "Linux")
    monkeypatch.setattr(tts, "piper_installed", lambda: True)
    monkeypatch.setattr(tts, "piper_voices", lambda: ["vi_VN-vais1000-medium"])
    assert tts.default_voice() == {"provider": "piper", "voice": "vi_VN-vais1000-medium"}


def test_piper_command(monkeypatch, tmp_path):
    """Gọi đúng CLI `python -m piper` (đọc chữ từ stdin, đổi tốc độ bằng --length-scale)."""
    monkeypatch.setattr(tts, "VOICE_DIR", tmp_path)
    monkeypatch.setattr(tts, "piper_installed", lambda: True)
    monkeypatch.setattr(tts, "piper_voices", lambda: ["vi_VN-vais1000-medium"])
    seen = {}
    real_run = subprocess.run

    def fake_run(cmd, **kw):
        if cmd[1:3] == ["-m", "piper"]:
            seen["cmd"], seen["input"] = cmd, kw.get("input")
            out = Path(cmd[cmd.index("-f") + 1])
            real_run([tts.config.FFMPEG, "-y", "-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=0.6", str(out)], check=True)
            return subprocess.CompletedProcess(cmd, 0, "", "")
        return real_run(cmd, **kw)

    monkeypatch.setattr(tts.subprocess, "run", fake_run)
    wav, dur = tts.synth("Giá 299.000đ", {"provider": "piper", "voice": "vi_VN-vais1000-medium", "rate": 1.08})
    assert wav.exists() and 500 < dur < 800
    assert seen["input"] == "Giá 299000 đồng"
    assert seen["cmd"][seen["cmd"].index("--length-scale") + 1] == f"{1 / 1.08:.3f}"


@pytest.mark.skipif(not shutil.which("espeak-ng"), reason="cần espeak-ng")
def test_espeak_real_synthesis():
    wav, dur = tts.synth("Xin chào các mẹ bầu", {"provider": "espeak", "voice": "Bắc (espeak)"})
    assert wav.exists() and dur > 500
