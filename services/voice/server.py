"""Máy chủ giọng nhái local (VieNeu-TTS v3 Turbo) cho AI Video Factory. Chạy trong .venv-voice, chỉ bind 127.0.0.1.

  GET  /health    → {"ready", "clone", "presets": [10 giọng dựng sẵn]}
  POST /prepare   {"audio", "out", "windows": [[start_ms, end_ms], ...]?} → chọn đoạn mẫu giọng sạch 3–8 giây từ clip
  POST /tts       {"text", "out", "voice": {"kind": "clone", "ref": path} | {"kind": "preset", "name": tên}} → ghi WAV 48 kHz

Giọng sinh ra giữ watermark mặc định của VieNeu (đánh dấu là âm thanh AI).
Cài: scripts/setup-voice.sh.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import soundfile as sf

PORT = int(os.environ.get("AVF_VOICE_PORT", "8771"))
FFMPEG = os.environ.get("AVF_FFMPEG", "ffmpeg")
DATA_DIR = Path(os.environ.get("AVF_DATA_DIR", Path(__file__).resolve().parents[2] / "data")).resolve()
MIN_S, MAX_S, TARGET_S = 3.0, 8.0, 6.5


def _in_data(path: str, must_exist: bool = False) -> str:
    """Chỉ ghi/đọc file WAV trong thư mục dữ liệu của app (trang web lạ không lợi dụng được máy chủ này để ghi đè file)."""
    p = Path(path).resolve()
    if not p.is_relative_to(DATA_DIR) or p.suffix.lower() != ".wav" or (must_exist and not p.is_file()):
        raise ValueError("Đường dẫn không hợp lệ")
    return str(p)


def _local_file(path: str) -> str:
    if "://" in path or not os.path.isfile(path):          # không nhận URL: ffmpeg sẽ tự tải về
        raise ValueError("Không tìm thấy file âm thanh")
    return path

_lock = threading.Lock()          # VieNeu không an toàn khi gọi song song trên CPU
_base = None
_clones: dict[str, str] = {}
_presets: list[dict] | None = None
PRESET_MAX = 10


def presets() -> list[dict]:
    """Các giọng dựng sẵn được tác giả VieNeu đề cử (đọc từ file kèm gói cài, không cần nạp model)."""
    global _presets
    if _presets is None:
        try:
            import importlib.util
            origin = importlib.util.find_spec("vieneu").origin
            d = json.loads((Path(origin).parent / "assets" / "voices_v3_turbo.json").read_text("utf-8"))
            picks = sorted(((v["featured"], k) for k, v in d["presets"].items() if v.get("featured")))[:PRESET_MAX]
            _presets = [{"name": k, "gender": d["presets"][k].get("gender"), "region": d["presets"][k].get("region"),
                         "style": (d["presets"][k].get("description") or "").split("·")[-1].strip()} for _, k in picks]
        except Exception:  # noqa: BLE001 — bản vieneu cũ không có bộ giọng sẵn
            _presets = []
    return _presets


def base_model():
    global _base
    if _base is None:
        from vieneu import Vieneu
        _base = Vieneu()
    return _base


def clone_voice(ref: str) -> str:
    key = hashlib.sha1(f"{ref}:{os.path.getmtime(ref)}".encode()).hexdigest()[:12]
    if key not in _clones:
        base_model().add_voice(key, ref, use_ref_codes=True)
        _clones[key] = ref
    return key


# ---------------------------------------------------------------- chọn đoạn mẫu giọng
def _load_mono(path: str, sr: int = 24000) -> np.ndarray:
    r = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                       capture_output=True, timeout=300)
    if r.returncode != 0:
        raise ValueError("Không đọc được âm thanh của clip: " + r.stderr.decode(errors="ignore")[-200:])
    return np.frombuffer(r.stdout, dtype=np.float32)


def _score(seg: np.ndarray, sr: int) -> dict:
    """Điểm đoạn mẫu: nói liên tục, nền yên tĩnh, không vỡ tiếng."""
    hop = sr // 50                                             # khung 20 ms
    n = len(seg) // hop
    if n < 10:
        return {"score": -1e9}
    fr = seg[: n * hop].reshape(n, hop)
    db = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
    loud, quiet = np.percentile(db, 90), np.percentile(db, 10)
    speech = float((db > loud - 20).mean())                    # tỷ lệ khung có tiếng nói
    snr = float(loud - quiet)
    clip = float((np.abs(seg) > 0.98).mean())
    score = speech * 40 + min(snr, 40) - clip * 2000 - (15 if loud < -38 else 0)
    return {"score": score, "speech": round(speech, 2), "snr_db": round(snr, 1), "loud_db": round(float(loud), 1)}


def prepare(audio: str, out: str, windows: list | None) -> dict:
    sr = 24000
    x = _load_mono(audio, sr)
    dur = len(x) / sr
    if dur < MIN_S:
        raise ValueError(f"Clip chỉ dài {dur:.1f} giây, cần ít nhất {MIN_S:.0f} giây có tiếng nói")
    cands: list[tuple[float, float]] = []
    segs = sorted((float(a) / 1000, float(b) / 1000) for a, b in (windows or []) if b > a)
    for i in range(len(segs)):                                  # ghép các đoạn lời thoại liền nhau thành cửa sổ 3–8 giây
        s, e = segs[i]
        for j in range(i, len(segs)):
            if j > i and segs[j][0] - segs[j - 1][1] > 0.8:
                break
            e = segs[j][1]
            if e - s > MAX_S:
                break
            if e - s >= MIN_S:
                cands.append((s, e))
    if not cands:                                               # không có lời thoại tách sẵn: quét cửa sổ trượt
        w = min(TARGET_S, dur)
        cands = [(t, t + w) for t in np.arange(0, max(dur - w, 0) + 0.01, 1.0)]
    best = None
    for s, e in cands:
        sc = _score(x[int(s * sr): int(e * sr)], sr)
        sc["score"] += -abs((e - s) - TARGET_S) * 2               # ưu tiên độ dài gần 6,5 giây
        if best is None or sc["score"] > best[2]["score"]:
            best = (s, e, sc)
    s, e, sc = best
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    sf.write(out, x[int(s * sr): int(e * sr)], sr, subtype="PCM_16")
    return {"ref": out, "start_ms": int(s * 1000), "end_ms": int(e * 1000), **sc}


# ---------------------------------------------------------------- đọc
def tts(text: str, out: str, voice: dict) -> dict:
    with _lock:
        if voice.get("kind") == "preset":
            if voice.get("name") not in [x["name"] for x in presets()]:
                raise ValueError("Không có giọng dựng sẵn này")
            m = base_model()
            audio = m.infer(text, voice=voice["name"])
        else:
            ref = voice.get("ref")
            if not ref or not os.path.exists(ref):
                raise ValueError("Thiếu file mẫu giọng")
            m = base_model()
            audio = m.infer(text, voice=clone_voice(ref), use_ref_codes=True)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".wav", dir=str(Path(out).parent))
    os.close(fd)
    sf.write(tmp, np.asarray(audio, np.float32), m.sample_rate, subtype="PCM_16")
    os.replace(tmp, out)
    return {"out": out, "sample_rate": m.sample_rate, "duration_ms": int(len(audio) * 1000 / m.sample_rate)}


class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _json(self, code: int, obj: dict) -> None:
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ready": True, "clone": True, "presets": presets()})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        # Chỉ app gọi (không có Origin, gửi JSON). Trình duyệt mở trang lạ luôn kèm Origin → từ chối.
        if self.headers.get("Origin") or "application/json" not in (self.headers.get("Content-Type") or ""):
            return self._json(403, {"error": "forbidden"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            if self.path == "/prepare":
                return self._json(200, prepare(_local_file(body["audio"]), _in_data(body["out"]), body.get("windows")))
            if self.path == "/tts":
                voice = dict(body.get("voice") or {})
                if voice.get("ref"):
                    voice["ref"] = _in_data(voice["ref"], must_exist=True)
                return self._json(200, tts(body["text"], _in_data(body["out"]), voice))
            self._json(404, {"error": "not found"})
        except Exception as e:   # noqa: BLE001 — trả lỗi cho app hiển thị
            self._json(500, {"error": str(e)[:500]})


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    print(f"AVF voice: http://127.0.0.1:{PORT}", file=sys.stderr, flush=True)
    srv.serve_forever()
