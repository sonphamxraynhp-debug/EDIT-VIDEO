"""Translate captions (bilingual subtitles) and build a dubbed voice track. Spec: references/reframe-dub.md

usage: python dub.py <timeline.json> --lang en [--from vi] [--no-translate] [--no-tts] [--tts say|edge] [--voice NAME]
                     [--voice-gain 0.15] [--max-tempo 1.35] [--force]
       python dub.py --voices en            (list macOS `say` voices for a language)
1. Translation (claude -p, batched JSON): captions are grouped into phrases (gap < 0.45 s, ≤ 7 s), each phrase is
   translated as a whole and split back over its caption segments -> caption["tr"]; TL.sub2 = {lang, on, style}.
2. Dub: one TTS clip per phrase (macOS `say` offline, or edge-tts = Microsoft online voices, needs internet),
   sped up with atempo up to --max-tempo to fit until the next phrase; longer ones overrun (reported) and push the next.
   Written to work/dub_<lang>.wav (output time) -> track {id:"dub"} in TL.audio.tracks (+ TL.audio.dub = {file, lang, voice,
   engine} metadata); TL.audio.voice_gain dims the original voice in mix_audio.py (0 = mute, 1 = unchanged).
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

import numpy as np

LANGS = {"vi": "tiếng Việt", "en": "English", "zh": "简体中文 (Simplified Chinese)", "ja": "日本語 (Japanese)", "ko": "한국어 (Korean)",
         "th": "ภาษาไทย (Thai)", "fr": "Français", "de": "Deutsch", "es": "Español", "id": "Bahasa Indonesia", "ru": "Русский",
         "it": "Italiano", "pt": "Português"}
SAY_PREF = {"en": ["Samantha", "Daniel", "Karen"], "zh": ["Tingting", "Meijia"], "ja": ["Kyoko"], "ko": ["Yuna"], "th": ["Kanya"],
            "vi": ["Linh"], "fr": ["Thomas", "Amélie"], "de": ["Anna"], "es": ["Paulina", "Monica"], "id": ["Damayanti"],
            "ru": ["Milena"], "it": ["Alice"], "pt": ["Luciana"]}
EDGE = {"en": "en-US-AriaNeural", "zh": "zh-CN-XiaoxiaoNeural", "ja": "ja-JP-NanamiNeural", "ko": "ko-KR-SunHiNeural",
        "th": "th-TH-PremwadeeNeural", "vi": "vi-VN-HoaiMyNeural", "fr": "fr-FR-DeniseNeural", "de": "de-DE-KatjaNeural",
        "es": "es-ES-ElviraNeural", "id": "id-ID-GadisNeural", "ru": "ru-RU-SvetlanaNeural", "it": "it-IT-ElsaNeural", "pt": "pt-BR-FranciscaNeural"}
SR = 48000
NOVELTY = {"Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Wobble", "Good News", "Jester", "Organ", "Superstar",
           "Trinoids", "Whisper", "Zarvox", "Fred", "Junior", "Ralph", "Kathy"}


def say_voices(lang):
    out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout if shutil.which("say") else ""
    vs = []
    for l in out.splitlines():
        m = re.match(r"^(.+?)\s+([a-z]{2,3})_([A-Z]{2,3})\s+#", l)
        if m and m.group(2) == lang and m.group(1).strip() not in vs and m.group(1).strip() not in NOVELTY:
            vs.append(m.group(1).strip())
    pref = [v for p in SAY_PREF.get(lang, []) for v in sorted(vs, key=lambda v: v != p) if v == p or v.startswith(p + " (")]
    return pref + [v for v in vs if v not in pref]


def claude(prompt):
    exe = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
    if not os.path.exists(exe):
        raise SystemExit("Không tìm thấy Claude Code CLI (lệnh `claude`) để dịch. Cài Claude Code hoặc tự điền trường tr cho phụ đề.")
    r = subprocess.run([exe, "-p", "--output-format", "json", "--model", "sonnet"], input=prompt, capture_output=True, text=True, timeout=600)
    if r.returncode:
        raise SystemExit(f"Claude CLI lỗi khi dịch: {(r.stderr or r.stdout)[-300:]}")
    res = json.loads(r.stdout).get("result", "")
    m = re.search(r"\[[\s\S]*\]", res)
    if not m:
        raise ValueError("Claude không trả về JSON")
    return json.loads(m.group(0))


def group(caps, gap=0.45, maxlen=5.0, maxn=6):
    gs = []
    for i, c in enumerate(caps):
        if gs and c["t0"] - caps[gs[-1][-1]]["t1"] < gap and c["t1"] - caps[gs[-1][0]]["t0"] <= maxlen and len(gs[-1]) < maxn:
            gs[-1].append(i)
        else:
            gs.append([i])
    return gs


def split_like(text, weights):
    toks = text.split() if " " in text.strip() else list(text)  # CJK / Thai: split by characters
    sep = " " if " " in text.strip() else ""
    tot, out, k = sum(weights) or 1, [], 0
    for n, w in enumerate(weights):
        e = len(toks) if n == len(weights) - 1 else round(len(toks) * sum(weights[:n + 1]) / tot)
        out.append(sep.join(toks[k:e])); k = e
    return out


def translate(caps, groups, src, dst):
    text = lambda c: " ".join(w["w"] for w in c["words"])
    for b in range(0, len(groups), 40):
        batch = groups[b:b + 40]
        data = [[text(caps[i]) for i in g] for g in batch]
        prompt = (f"You translate spoken video subtitles from {LANGS.get(src, src)} to {LANGS.get(dst, dst)}.\n"
                  "Input: a JSON array of phrases; each phrase is an array of consecutive subtitle fragments (auto speech recognition, "
                  "lowercase, no punctuation, may contain small recognition errors).\n"
                  "Translate each phrase naturally and concisely as spoken language (keep it short enough to be spoken in about the same time), "
                  "then split your translation back into exactly as many fragments as the input phrase has, in the same order, "
                  "so each fragment roughly matches the meaning of its source fragment (a fragment may be empty \"\" only if unavoidable). "
                  "Keep brand / product names (ChatGPT, Claude, CapCut…) as is. Add normal punctuation and capitalization.\n"
                  f"Return ONLY the JSON array (same shape: {len(data)} arrays with lengths {[len(d) for d in data]}), no commentary.\n\n"
                  + json.dumps(data, ensure_ascii=False))
        for attempt in range(2):
            try:
                out = claude(prompt)
                if len(out) == len(data) and all(isinstance(o, list) for o in out):
                    break
            except ValueError:
                out = None
            print(f"  dịch lại lô {b // 40 + 1} (sai cấu trúc)", file=sys.stderr)
        else:
            raise SystemExit("Claude trả về bản dịch sai cấu trúc 2 lần — thử lại sau.")
        for g, parts in zip(batch, out):
            parts = [str(p).strip() for p in parts]
            if len(parts) != len(g):  # wrong fragment count: split the phrase proportionally to the source word counts
                parts = split_like(" ".join(parts), [len(caps[i]["words"]) for i in g])
            for i, p in zip(g, parts):
                caps[i]["tr"] = p
        print(f"dịch {min(b + 40, len(groups))}/{len(groups)} câu", flush=True)


def decode(f):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def tempo(x, k, tmp):
    if k <= 1.001:
        return x
    a, b = os.path.join(tmp, "a.f32"), os.path.join(tmp, "b.f32")
    x.astype(np.float32).tofile(a)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", a, "-af", f"atempo={k:.4f}", "-f", "f32le", b], check=True)
    return np.fromfile(b, np.float32)


def tts(text, engine, voice, tmp, n):
    if engine == "edge":
        f = os.path.join(tmp, f"{n}.mp3")
        r = subprocess.run([sys.executable, "-m", "edge_tts", "--voice", voice, "--text", text, "--write-media", f], capture_output=True, text=True)
        if r.returncode:
            raise SystemExit("edge-tts lỗi (cần Internet, `pip install edge-tts`): " + r.stderr[-200:])
    else:
        f = os.path.join(tmp, f"{n}.aiff")
        subprocess.run(["say", "-v", voice, "-o", f, text], check=True)
    x = decode(f)
    nz = np.where(np.abs(x) > 0.01)[0]  # trim leading/trailing silence
    return x[max(0, nz[0] - 240):nz[-1] + 480] if len(nz) else x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("timeline", nargs="?")
    ap.add_argument("--lang", default="en")
    ap.add_argument("--from", dest="src", default=None)
    ap.add_argument("--no-translate", action="store_true")
    ap.add_argument("--no-tts", action="store_true")
    ap.add_argument("--force", action="store_true", help="dịch lại cả khi đã có tr cùng ngôn ngữ")
    ap.add_argument("--tts", default="say", choices=["say", "edge"])
    ap.add_argument("--voice")
    ap.add_argument("--voice-gain", type=float)
    ap.add_argument("--max-tempo", type=float, default=1.35)
    ap.add_argument("--voices")
    a = ap.parse_args()
    if a.tts == "say" and not shutil.which("say"):  # Windows/Linux: no macOS voices → Microsoft online voices
        a.tts = "edge"
    if a.voices:
        print(json.dumps({"say": say_voices(a.voices), "edge": EDGE.get(a.voices)}, ensure_ascii=False))
        return
    tlp = os.path.abspath(a.timeline)
    base = os.path.dirname(tlp)
    tl = json.load(open(tlp))
    capf = tl.get("captions")
    caps = json.load(open(os.path.join(base, capf))) if isinstance(capf, str) else (capf or [])
    caps_live = [c for c in caps if not c.get("hidden") and c.get("words")]
    if not caps_live:
        raise SystemExit("Dự án chưa có phụ đề — tạo phụ đề trước rồi mới dịch / lồng tiếng.")
    src = a.src or tl.get("lang") or "vi"
    if src == a.lang:
        raise SystemExit("Ngôn ngữ đích trùng ngôn ngữ gốc.")
    groups = group(caps_live)
    sub2 = tl.get("sub2") or {}
    if not a.no_translate and (a.force or sub2.get("lang") != a.lang or any("tr" not in c for c in caps_live)):
        print(f"Dịch {len(caps_live)} đoạn phụ đề ({len(groups)} câu) {src} -> {a.lang} bằng Claude…", flush=True)
        translate(caps_live, groups, src, a.lang)
        tl["sub2"] = {"style": "plain", **sub2, "lang": a.lang, "on": True}
    report = {"lang": a.lang, "segments": len(caps_live), "phrases": len(groups)}
    if not a.no_tts:
        voice = a.voice or (EDGE.get(a.lang) if a.tts == "edge" else (say_voices(a.lang) or [None])[0])
        if not voice:
            raise SystemExit(f"macOS không có giọng `say` cho '{a.lang}'. Cài thêm giọng trong Cài đặt hệ thống › Trợ năng › Nội dung được đọc, hoặc chọn edge-tts.")
        dur = float(tl.get("duration") or caps_live[-1]["t1"] + 1)
        out = np.zeros(int((dur + 1) * SR), np.float32)
        tmp = tempfile.mkdtemp()
        cursor, over, fast = 0.0, [], 0
        for n, g in enumerate(groups):
            text = " ".join(caps_live[i].get("tr", "") for i in g).strip()
            if not text:
                continue
            t0 = caps_live[g[0]]["t0"]
            t_end = caps_live[groups[n + 1][0]]["t0"] if n + 1 < len(groups) else min(dur, caps_live[g[-1]]["t1"] + 0.8)
            x = tts(text, a.tts, voice, tmp, n)
            start = max(t0, cursor)
            slot = max(0.3, t_end - start - 0.06)
            k = len(x) / SR / slot
            if k > 1:
                x = tempo(x, min(k, a.max_tempo), tmp)
                fast += 1
                if k > a.max_tempo:
                    over.append({"t": round(t0, 2), "over": round(len(x) / SR - slot, 2), "text": text[:60]})
            i0 = int(start * SR)
            if i0 + len(x) > len(out):
                out = np.concatenate([out, np.zeros(i0 + len(x) - len(out), np.float32)])
            out[i0:i0 + len(x)] += x
            cursor = start + len(x) / SR + 0.05
            print(f"lồng tiếng {n + 1}/{len(groups)}", flush=True)
        shutil.rmtree(tmp, ignore_errors=True)
        out = out[:int(dur * SR)]
        peak = float(np.abs(out).max() or 1)
        out = out * (0.89 / peak)
        rel = f"work/dub_{a.lang}.wav"
        os.makedirs(os.path.join(base, "work"), exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-ac", "2", os.path.join(base, rel)],
                       input=out.astype(np.float32).tobytes(), check=True)
        A = tl.setdefault("audio", {})
        A["dub"] = {"file": rel, "lang": a.lang, "voice": voice, "engine": a.tts}
        # the dubbed voice is an extra audio track (TL.audio.tracks, mixed by mix_audio.py), id "dub", replaced on each run
        tracks = A.setdefault("tracks", [])
        tr = next((t for t in tracks if t.get("id") == "dub"), None)
        if not tr:
            tr = {"id": "dub", "gain": 0, "mute": False, "solo": False, "duck": False}
            tracks.append(tr)
        tr.update(name=f"Lồng tiếng {a.lang.upper()}", items=[{"file": rel, "t0": 0, "in": 0, "out": round(len(out) / SR, 3), "gain": 0}])
        if a.voice_gain is not None:
            A["voice_gain"] = a.voice_gain
        elif "voice_gain" not in A:
            A["voice_gain"] = 0.15
        report.update(file=rel, voice=voice, sped_up=fast, overruns=over)
    if isinstance(capf, str):
        json.dump(caps, open(os.path.join(base, capf), "w"), ensure_ascii=False, indent=1)
    else:
        tl["captions"] = caps
    json.dump(tl, open(tlp, "w"), ensure_ascii=False, indent=1)
    print("DUB " + json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
