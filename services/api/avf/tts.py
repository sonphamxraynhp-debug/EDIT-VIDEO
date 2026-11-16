"""M07: TTS local pluggable. Provider mặc định: giọng hệ điều hành (macOS `say` – Linh vi_VN,
Windows SAPI qua PowerShell). Cache theo hash(text + voice + settings)."""
from __future__ import annotations

import hashlib
import json
import platform
import re
import shutil
import subprocess
import time
import urllib.request
import uuid
from pathlib import Path

from . import config
from .errors import AppError

VOICE_DIR = config.DATA_DIR / "voice_cache"
VOICE_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_LEXICON = {
    "ml": "mi li lít", "mg": "mi li gam", "kg": "ki lô gam", "%": " phần trăm", "AI": "ây ai",
    "TikTok": "tích tốc", "USP": "u ét pê", "SKU": "ét ca u", "CTA": "xi ti ây",
}


_VS: dict = {"at": 0.0, "data": None}


def voice_server() -> dict:
    """Trạng thái máy chủ giọng nhái (VieNeu) — cache 10 giây để không gọi liên tục."""
    if time.time() - _VS["at"] > 10:
        try:
            with urllib.request.urlopen(config.VOICE_URL + "/health", timeout=2) as r:
                _VS["data"] = json.loads(r.read())
        except Exception:  # noqa: BLE001 — chưa cài / chưa chạy
            _VS["data"] = None
        _VS["at"] = time.time()
    return _VS["data"] or {"ready": False, "clone": False, "presets": []}


def voice_call(path: str, body: dict, timeout: int = 900) -> dict:
    req = urllib.request.Request(config.VOICE_URL + path, data=json.dumps(body, ensure_ascii=False).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = json.loads(e.read() or b"{}").get("error") or str(e)
        raise AppError("VOICE_FAILED", f"Giọng nhái lỗi: {msg}", retryable=True)
    except OSError:
        raise AppError("VOICE_SERVER_OFFLINE", "Máy chủ giọng nhái chưa chạy", retryable=True,
                       hint="Cài một lần bằng scripts/setup-voice.sh rồi mở lại app bằng scripts/start.sh.")


def providers() -> list[dict]:
    out = []
    vs = voice_server()
    out.append({"id": "vieneu_clone", "name": "Giọng người nói trong clip (VieNeu)", "voices": [],
                "license": "VieNeu-TTS v3 Turbo — hỏi tác giả trước khi dùng thương mại", "ready": bool(vs.get("clone"))})
    out.append({"id": "vieneu_preset", "name": "Giọng có sẵn (VieNeu)", "voices": [x["name"] for x in vs.get("presets") or []],
                "license": "VieNeu-TTS v3 Turbo, Apache-2.0", "ready": bool(vs.get("presets"))})
    if platform.system() == "Darwin" and shutil.which("say"):
        voices = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
        vi = [line.split()[0] for line in voices.splitlines() if "vi_VN" in line]
        out.append({"id": "os_say", "name": "macOS Speech (local)", "voices": sorted(set(vi)),
                    "license": "Apple OS voice – dùng nội bộ", "ready": bool(vi)})
    if platform.system() == "Windows":
        out.append({"id": "os_sapi", "name": "Windows SAPI (local)", "voices": ["An"], "license": "OS voice", "ready": True})
    if shutil.which("piper"):
        out.append({"id": "piper", "name": "Piper TTS", "voices": [], "license": "MIT", "ready": True})
    return out


def normalize_text(text: str, lexicon: dict | None = None) -> str:
    """M05-03/M07-02: đọc số, đơn vị, viết tắt."""
    lex = {**DEFAULT_LEXICON, **(lexicon or {})}
    t = re.sub(r"(\d)\.(\d{3})", r"\1\2", text)                       # 299.000 → 299000
    t = re.sub(r"(\d+)\s*đ\b", r"\1 đồng", t)
    t = re.sub(r"(\d+)\s*k\b", r"\1 nghìn", t)
    for k, v in sorted(lex.items(), key=lambda kv: -len(kv[0])):
        t = re.sub(rf"(?<!\w){re.escape(k)}(?!\w)" if k[0].isalnum() else re.escape(k), v, t)
    return t


def cache_key(text: str, settings: dict) -> str:
    return hashlib.sha256(json.dumps([text, settings], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]


def default_voice() -> dict:
    """Giọng mặc định theo hệ điều hành: macOS `say` (Linh), Windows SAPI (An)."""
    if platform.system() == "Windows" or not shutil.which("say"):
        return {"provider": "os_sapi", "voice": "An"}
    return {"provider": "os_say", "voice": "Linh"}


def synth(text: str, settings: dict) -> tuple[Path, int]:
    """Trả (wav_path, duration_ms). Chuẩn hoá loudness về target LUFS (M07-04/08)."""
    settings = {"rate": 1.0, "lufs": -16, **default_voice(), **settings}
    if settings["provider"] == "os_say" and not shutil.which("say") and platform.system() == "Windows":
        settings.update(default_voice())          # cấu hình lưu từ máy Mac chạy trên Windows
    spoken = normalize_text(text, settings.get("lexicon"))
    key = cache_key(spoken, {k: settings[k] for k in ("provider", "voice", "rate", "lufs")})
    out = VOICE_DIR / f"{key}.wav"
    if out.exists():
        return out, _dur(out)
    uid = uuid.uuid4().hex[:8]                # file tạm riêng: tránh race giữa các job song song
    raw = VOICE_DIR / f"{key}.{uid}.raw.aiff"
    if settings["provider"] == "os_say":
        if not shutil.which("say"):
            raise AppError("TTS_UNAVAILABLE", "Không có engine TTS local", hint="Cài giọng tiếng Việt trong hệ điều hành hoặc Piper.")
        wpm = int(175 * float(settings["rate"]))
        r = subprocess.run(["say", "-v", settings["voice"], "-r", str(wpm), "-o", str(raw), spoken],
                           capture_output=True, text=True, timeout=300)
        if r.returncode != 0 or not raw.exists():
            raise AppError("TTS_FAILED", "Engine TTS lỗi", details={"stderr": r.stderr[-300:]}, retryable=True)
    elif settings["provider"] == "os_sapi":
        if platform.system() != "Windows":
            raise AppError("TTS_UNAVAILABLE", "Windows SAPI chỉ có trên Windows", hint="Chọn provider khác trong Cài đặt.")
        raw = raw.with_suffix(".wav")
        sapi_rate = max(-10, min(10, int(round((float(settings["rate"]) - 1.0) * 12))))   # 0.92→-1, 1.08→+1
        ps = ("Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
              f"try {{ $s.SelectVoice('Microsoft {settings['voice']}') }} catch {{ "
              f"$v=$s.GetInstalledVoices() | Where-Object {{ $_.VoiceInfo.Culture.Name -eq 'vi-VN' }} | Select-Object -First 1;"
              f"if ($v) {{ $s.SelectVoice($v.VoiceInfo.Name) }} }};"
              f"$s.Rate={sapi_rate}; $s.SetOutputToWaveFile('{str(raw).replace(chr(39), chr(39) * 2)}');"
              "$s.Speak([Console]::In.ReadToEnd()); $s.Dispose()")
        r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], input=spoken, text=True,
                           capture_output=True, timeout=300, encoding="utf-8")
        if r.returncode != 0 or not raw.exists():
            raise AppError("TTS_FAILED", "Windows SAPI lỗi", details={"stderr": (r.stderr or "")[-300:]},
                           hint="Cài giọng tiếng Việt: Settings → Time & Language → Speech → Add voices → Tiếng Việt.",
                           retryable=True)
    elif settings["provider"] in ("vieneu_clone", "vieneu_preset"):
        raw = raw.with_suffix(".wav")
        voice = ({"kind": "preset", "name": settings["voice"]} if settings["provider"] == "vieneu_preset" else
                 {"kind": "clone", "ref": settings["voice"]})
        voice_call("/tts", {"text": spoken, "out": str(raw), "voice": voice})
    else:
        raise AppError("TTS_PROVIDER", f"Provider {settings['provider']} chưa cấu hình")
    tmp = VOICE_DIR / f"{key}.{uid}.part.wav"
    # say tự đổi tốc độ; giọng nhái không có tham số tốc độ nên đổi bằng atempo (giữ cao độ)
    tempo = f"atempo={float(settings['rate']):.3f}," if settings["provider"].startswith("vieneu") and float(settings["rate"]) != 1.0 else ""
    r = subprocess.run([config.FFMPEG, "-y", "-v", "error", "-i", str(raw), "-af",
                        f"{tempo}loudnorm=I={settings['lufs']}:TP=-1.5:LRA=11,aresample=48000", "-ac", "1", str(tmp)],
                       capture_output=True, text=True, timeout=300)
    raw.unlink(missing_ok=True)
    if r.returncode != 0:
        raise AppError("TTS_FAILED", "Không chuẩn hoá được audio", details={"stderr": r.stderr[-300:]})
    tmp.replace(out)
    return out, _dur(out)


def _dur(p: Path) -> int:
    r = subprocess.run([config.FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True)
    try:
        return int(float(r.stdout.strip()) * 1000)
    except ValueError:
        return 0


def synth_beats(beats: list[dict], settings: dict, gap_ms: int = 180) -> tuple[list[dict], Path]:
    """Sinh VO theo beat, ghép lại thành một track và trả timing thực tế (forced timing theo beat)."""
    parts, timing, t = [], [], 0
    for b in beats:
        wav, dur = synth(b["text"], settings)
        timing.append({"uri": str(wav), "start_ms": t, "end_ms": t + dur, "text": b["text"]})
        parts.append(wav)
        t += dur + gap_ms
    key = cache_key("|".join(str(p) for p in parts), {"gap": gap_ms})
    full = VOICE_DIR / f"vo_{key}.wav"
    if not full.exists():
        uid = uuid.uuid4().hex[:8]
        lst = VOICE_DIR / f"vo_{key}.{uid}.txt"
        silence = VOICE_DIR / f"sil_{gap_ms}.wav"
        if not silence.exists():
            tmp_sil = VOICE_DIR / f"sil_{gap_ms}.{uuid.uuid4().hex[:8]}.wav"
            subprocess.run([config.FFMPEG, "-y", "-v", "error", "-f", "lavfi", "-i",
                            "anullsrc=r=48000:cl=mono", "-t", f"{gap_ms / 1000}", str(tmp_sil)], check=True)
            tmp_sil.replace(silence)
        lines = []
        for p in parts:
            lines += [f"file '{p}'", f"file '{silence}'"]
        lst.write_text("\n".join(lines), encoding="utf-8")
        tmp_full = VOICE_DIR / f"vo_{key}.{uid}.part.wav"
        subprocess.run([config.FFMPEG, "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-c:a", "pcm_s16le", "-ar", "48000", str(tmp_full)], check=True)
        tmp_full.replace(full)
        lst.unlink(missing_ok=True)
    return timing, full


def word_timing(seg: dict) -> list[dict]:
    """Phụ đề word-level ước lượng (chia đều theo số ký tự) cho preset karaoke."""
    words = seg["text"].split()
    total = sum(len(w) for w in words) or 1
    t, out = seg["start_ms"], []
    span = seg["end_ms"] - seg["start_ms"]
    for w in words:
        d = int(span * len(w) / total)
        out.append({"w": w, "start_ms": t, "end_ms": t + d})
        t += d
    return out
