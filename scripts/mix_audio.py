"""Voice chain + mood music (ducked) + SFX hits + extra audio tracks + loudnorm -14 LUFS / -1 dBTP. Reads timeline.json "audio".

usage: python mix_audio.py <timeline.json> [--stems]      (--stems also writes .studio/stem_{voice,music}.wav for checks)
timeline.audio = {
  "voice": "work/aroll.mp4",
  "music": [{"t0": 0, "t1": 27.7, "mood": "hype", "gain": -16, "offset": 0, "fade_in": 0.5, "fade_out": 1.5}],   # or "file": "my.mp3"
  "sfx":   [{"t": 1.38, "name": "impact_3", "gain": -10}],
  "mix": "work/mix.wav",
  "duck": true | {"on": true, "amount_db": -10, "attack": 60, "release": 400},
  "clean": {"preset": "vua"},                       # voice enhance (scripts/voice_clean.py), cached in .studio/
  "tracks": [{"id": "t1", "name": "Ambience", "gain": 0, "mute": false, "solo": false, "duck": false,
              "items": [{"file": "media/rain.mp3", "t0": 2, "in": 0, "out": 8, "gain": -12, "fade_in": .5, "fade_out": 1,
                         "eq": {"low": 0, "mid": 0, "high": 0}}]}]
}
Paths are relative to the timeline file. "mood"/"name" resolve to the skill's own library
(assets/music/<mood>.mp3, assets/sfx/<name>.flac|wav) unless "music_dir"/"sfx_dir" point elsewhere.
Library beds are all -16 LUFS, so gain -16…-20 dB sits under the voice like the reference.
duck: true/absent = the original sidechain compressor (old projects sound unchanged); an object = VAD envelope
ducking by exactly amount_db while the voice speaks (attack/release in ms, lookahead = attack). See references/audio.md.
"""
import json
import os
import subprocess
import sys

import numpy as np

tl_path = sys.argv[1]
STEMS = '--stems' in sys.argv
base = os.path.dirname(os.path.abspath(tl_path))
tl = json.load(open(tl_path))
A = tl.setdefault("audio", {})  # projects made only of clips with sound have no "audio" block
P = lambda p: p if os.path.isabs(p) else os.path.join(base, p)
dur = tl["duration"]
SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def find(d, stem):
    for ext in ("", ".flac", ".wav", ".mp3", ".m4a"):
        f = os.path.join(d, stem + ext)
        if os.path.isfile(f):
            return f
    return None

# Main track made of clips (TL.clips, references/clips.md): build the voice by trimming each clip's audio
# (in/out, speed via atempo, volume, mute; stills and silent clips become silence) and concatenating.
def clips_voice(clips):
    parts, ins, fc = [], [], []
    for c in clips:
        if c.get("hidden"):
            continue
        sp = c.get("speed", 1) or 1
        d = max(1 / 30, (c.get("out", 3) - c.get("in", 0)) / sp)
        k = len(parts)
        src = c.get("audio")
        if src and not c.get("mute") and os.path.exists(P(src)):
            ins += ["-i", P(src)]
            tempo, chain = sp, []
            while tempo > 2.0:
                chain.append("atempo=2.0"); tempo /= 2.0
            while tempo < 0.5:
                chain.append("atempo=0.5"); tempo /= 0.5
            chain.append(f"atempo={tempo:.4f}")
            fc.append(f"[{len(ins) // 2 - 1}:a]atrim=start={c.get('in', 0)}:end={c.get('out', 3)},asetpts=PTS-STARTPTS,"
                      f"aresample=48000,aformat=channel_layouts=stereo,{','.join(chain)},volume={c.get('volume', 1)},apad,atrim=duration={d:.3f}[p{k}]")
        else:
            fc.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={d:.3f}[p{k}]")
        parts.append(f"[p{k}]")
    out = P(".studio/voice_clips.wav")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fc.append("".join(parts) + f"concat=n={len(parts)}:v=0:a=1[v]")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(fc), "-map", "[v]", "-ar", "48000", out], check=True)
    return out


def duck_env(voice, d, amount_db=-10, attack=60, release=400, hold=250):
    """Gain envelope (1 kHz mono wav) that is amount_db while the voice speaks, 0 dB in pauses.
    Speech = 10 ms frames louder than floor + 40 % of (speech level − floor); hold bridges gaps between words."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", voice, "-ac", "1", "-ar", "16000", "-af", "highpass=f=100", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    n = int(np.ceil(d * 100))
    f = np.full(n, -120.0)
    m = min(n, len(x) // 160)
    if m:
        f[:m] = 20 * np.log10(np.sqrt((x[:m * 160].reshape(m, 160) ** 2).mean(1)) + 1e-9)
    act = f[:m][f[:m] > -90] if m else f[:0]
    if not len(act):
        return None
    lo, hi = np.percentile(act, 10), np.percentile(act, 95)
    speech = f > max(lo + 0.4 * (hi - lo), lo + 6, -60)
    look, hld = max(1, int(attack / 10)), int(hold / 10)
    idx = np.flatnonzero(speech)
    mask = np.zeros(n, bool)
    for i in idx:  # dilate: start `attack` early (lookahead) and hold after
        mask[max(0, i - look):i + hld + 1] = True
    target = np.where(mask, amount_db, 0.0)
    g, cur = np.empty(n), 0.0
    down, up = abs(amount_db) / max(1, attack / 10), abs(amount_db) / max(1, release / 10)
    for i, t in enumerate(target):
        cur = max(t, cur - down) if t < cur else min(t, cur + up)
        g[i] = cur
    env = np.repeat(10 ** (g / 20), 10).astype(np.float32)  # 100 Hz → 1 kHz
    from scipy.io import wavfile
    out = P(".studio/duck_env.wav")
    wavfile.write(out, 1000, env)
    print(f"duck: {mask.mean() * 100:.0f}% speech, {amount_db} dB, attack {attack} ms, release {release} ms")
    return out


if tl.get("clips"):
    A["voice"] = clips_voice(tl["clips"])
os.makedirs(P(".studio"), exist_ok=True)

# Voice enhance: the cleaned voice replaces the legacy chain (cached by settings + voice content).
voice_src, clean = (P(A["voice"]) if A.get("voice") else None), None
if voice_src:
    import voice_clean
    s = voice_clean.settings(A.get("clean"))
    if s:
        clean = P(f".studio/voice_clean_{voice_clean.key(s, voice_src)}.wav")
        if not os.path.exists(clean):
            for old in os.listdir(P(".studio")):
                if old.startswith("voice_clean_"):
                    os.remove(P(".studio/" + old))
            voice_clean.clean(voice_src, clean, s)
            print("clean voice ->", clean, s["preset"])
        else:
            print("clean voice (cache) ->", clean)
        voice_src = clean

# No voice (b-roll montage, music-only piece): a silent bed keeps the graph identical.
inputs = ["-i", voice_src] if voice_src else ["-f", "lavfi", "-t", str(dur), "-i", "anullsrc=r=48000:cl=stereo"]
n_in = 1
graph = [("[0:a]aresample=48000,aformat=channel_layouts=stereo[voice0]" if clean else
          "[0:a]highpass=f=80,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=4:attack=5:release=80:makeup=4,"
          "equalizer=f=3500:t=q:w=1:g=2.5,equalizer=f=250:t=q:w=1:g=-2,alimiter=limit=0.89,aresample=48000[voice0]")]
music_labels = []
for i, m in enumerate(A.get("music", [])):
    if m.get("hidden"):
        continue
    f = P(m["file"]) if "file" in m else find(P(A.get("music_dir", os.path.join(SKILL, "assets/music"))), m["mood"])
    if not f or not os.path.exists(f):
        print("skip missing music", m)
        continue
    inputs += ["-stream_loop", "-1", "-i", f]
    idx, n_in = n_in, n_in + 1
    d = m["t1"] - m["t0"]
    xf = m.get("xfade", 0.12)
    fi, fo = max(xf, m.get("fade_in") or 0), max(xf, m.get("fade_out") or 0)
    graph.append(f"[{idx}:a]atrim=start={m.get('offset', 0)}:duration={d + xf},asetpts=PTS-STARTPTS,aresample=48000,"
                 f"afade=t=in:d={fi},afade=t=out:st={max(0, d + xf - fo)}:d={fo},volume={m.get('gain', -20)}dB,adelay={int(m['t0'] * 1000)}:all=1[m{i}]")
    music_labels.append(f"[m{i}]")
sfx_labels = []
for i, s in enumerate(A.get("sfx", [])):
    if s.get("hidden"):
        continue
    f = find(P(A.get("sfx_dir", os.path.join(SKILL, "assets/sfx"))), s["name"]) or find(os.path.join(SKILL, "assets/sfx"), s["name"])
    if not f:
        print("skip missing sfx", s["name"])
        continue
    inputs += ["-i", f]
    idx, n_in = n_in, n_in + 1
    graph.append(f"[{idx}:a]aresample=48000,volume={s.get('gain', -14)}dB,adelay={int(max(0, s['t']) * 1000)}:all=1[s{i}]")
    sfx_labels.append(f"[s{i}]")

# Extra tracks (voice-over, extra music, ambience): per-item trim/fades/3-band EQ, track gain/mute/solo.
trk_labels, trk_duck = [], []
tracks = A.get("tracks") or []
solo = any(t.get("solo") for t in tracks)
for ti, tr in enumerate(tracks):
    if tr.get("mute") or (solo and not tr.get("solo")):
        continue
    for ii, it in enumerate(tr.get("items", [])):
        f = P(it["file"]) if it.get("file") else None
        if it.get("hidden") or not f or not os.path.exists(f):
            print("skip track item", it.get("file"))
            continue
        inputs += ["-i", f]
        idx, n_in = n_in, n_in + 1
        a, b = float(it.get("in", 0)), it.get("out")
        d = (float(b) - a) if b is not None else None
        ch = [f"atrim=start={a}" + (f":end={b}" if b is not None else ""), "asetpts=PTS-STARTPTS", "aresample=48000", "aformat=channel_layouts=stereo"]
        if it.get("fade_in"):
            ch.append(f"afade=t=in:d={it['fade_in']}")
        if it.get("fade_out") and d:
            ch.append(f"afade=t=out:st={max(0, d - it['fade_out'])}:d={it['fade_out']}")
        eq = it.get("eq") or {}
        if eq.get("low"):
            ch.append(f"bass=g={eq['low']}:f=120")
        if eq.get("mid"):
            ch.append(f"equalizer=f=1000:t=q:w=1:g={eq['mid']}")
        if eq.get("high"):
            ch.append(f"treble=g={eq['high']}:f=8000")
        ch += [f"volume={float(it.get('gain', 0)) + float(tr.get('gain', 0))}dB", f"adelay={int(max(0, it.get('t0', 0)) * 1000)}:all=1"]
        lab = f"[x{ti}_{ii}]"
        graph.append(f"[{idx}:a]{','.join(ch)}{lab}")
        (trk_duck if tr.get("duck") else trk_labels).append(lab)

mix_in = ["[voice]"]
dk = A.get("duck", True)
duck_labels = music_labels + trk_duck
env = None
if isinstance(dk, dict):
    if dk.get("on", True) and duck_labels and voice_src:
        env = duck_env(voice_src, dur, float(dk.get("amount_db", -10)), float(dk.get("attack", 60)), float(dk.get("release", 400)), float(dk.get("hold", 250)))
    legacy = False
else:
    legacy = bool(music_labels) and bool(dk) and bool(A.get("voice"))
    trk_labels += trk_duck  # legacy mode: only the music bed goes through the sidechain
    duck_labels = music_labels
graph.append("[voice0]asplit=2[voice][vkey]" if legacy else "[voice0]anull[voice]")
if duck_labels:
    graph.append(f"{''.join(duck_labels)}amix=inputs={len(duck_labels)}:normalize=0:duration=longest[mus]")
    if legacy:
        graph.append("[mus][vkey]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=300[musd]")
        mix_in.append("[musd]")
    elif env:
        inputs += ["-i", env]
        idx, n_in = n_in, n_in + 1
        graph.append(f"[{idx}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,apad[env]")
        graph.append("[mus][env]amultiply[musd]")
        mix_in.append("[musd]")
    else:
        mix_in.append("[mus]")
mix_in += sfx_labels + trk_labels
outs = []
if STEMS:  # debug stems: the voice and the (ducked) music bus as they enter the final mix
    last = mix_in[1] if len(mix_in) > 1 and duck_labels else None
    graph.append("[voice]asplit=2[voice_m][stv]"); mix_in[0] = "[voice_m]"; outs.append(("[stv]", ".studio/stem_voice.wav"))
    if last:
        graph.append(f"{last}asplit=2[mus_m][stm]"); mix_in[1] = "[mus_m]"; outs.append(("[stm]", ".studio/stem_music.wav"))
if A.get("voice_gain") is not None and float(A["voice_gain"]) != 1:  # dub (scripts/dub.py): dim / mute the original voice
    graph.append(f"{mix_in[0]}volume={float(A['voice_gain'])}[voiceg]"); mix_in[0] = "[voiceg]"
graph.append(f"{''.join(mix_in)}amix=inputs={len(mix_in)}:normalize=0:duration=longest,apad=whole_dur={dur},atrim=duration={dur},"
             "loudnorm=I=-14:TP=-1.0:LRA=4,aresample=48000[out]")
out = P(A.get("mix", "work/mix.wav"))
os.makedirs(os.path.dirname(out), exist_ok=True)
script = out + ".filter.txt"
open(script, "w").write(";\n".join(graph))
extra = [a for lab, f in outs for a in ("-map", lab, "-t", str(dur), P(f))]
subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-/filter_complex", script, "-map", "[out]", "-ac", "2", out, *extra], check=True)
print("mix ->", out)
