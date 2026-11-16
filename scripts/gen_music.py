"""Generate royalty-free background music beds per mood (pure synthesis, no samples).

usage: python gen_music.py <out_dir> [--only hype,sad] [--seconds 64] [--variants 2]
Writes <out_dir>/<mood>.mp3 (+ <mood>_2.mp3 … when --variants > 1) and catalog.json.
Each track: intro (filtered) -> main -> lift -> main; length is a whole number of bars so it loops.
"""
import argparse
import json
import os
import subprocess
import sys
import zlib

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, bp, env_adsr, fm, hp, karplus, lp, noise, normalize, osc, place, reverb, soft_clip, supersaw, to_stereo, tt, write

N = lambda m: 440 * 2 ** ((m - 69) / 12)
CH = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11], "sus2": [0, 2, 7],
      "sus4": [0, 5, 7], "m9": [0, 3, 7, 10, 14], "add9": [0, 4, 7, 14], "dim": [0, 3, 6], "5": [0, 7, 12]}
NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def chord(sym, octave=4):
    name = sym[:2] if len(sym) > 1 and sym[1] in "#b" else sym[:1]
    q = sym[len(name):]
    r = NOTE[name.replace("b", "")] - (1 if "b" in name[1:] else 0)
    base = 12 * (octave + 1) + r
    return base, [base + i for i in CH[q]]


def rng(*k):
    return np.random.default_rng(zlib.crc32(repr(k).encode()))


# ------------------------------------------------------------------ instruments (return mono np arrays)
def kick(d=.45, punch=1.0):
    t = tt(d)
    x = np.sin(2 * np.pi * (48 * t + 110 * (1 - np.exp(-t * 28)) / 28)) * np.exp(-t * 6.5)
    x[:240] += hp(noise(.005, "white", rng("k")), 3000) * .3 * punch
    return x


def snare(d=.28, s=0):
    t = tt(d)
    return np.sin(2 * np.pi * 185 * t) * np.exp(-t * 28) * .5 + hp(noise(d, "white", rng("sn", s)), 1800) * np.exp(-t * 16) * .8


def clap(s=0):
    out = np.zeros(int(.25 * SR))
    for k in range(3):
        b = lp(hp(noise(.25, "white", rng("cl", s, k)), 900), 5000) * np.exp(-tt(.25) * (22 if k == 2 else 110))
        o = int(k * .011 * SR)
        out[o:] += b[:len(out) - o]
    return out * .6


def hat(open_=False, s=0):
    d = .22 if open_ else .05
    return hp(noise(d, "white", rng("h", s, open_)), 7500) * np.exp(-tt(d) * (14 if open_ else 70)) * .35


def shaker(s=0):
    d = .08
    return hp(noise(d, "white", rng("sh", s)), 5000) * np.sin(np.pi * tt(d) / d) ** 2 * .2


def tom(f=100, d=.5):
    t = tt(d)
    return np.sin(2 * np.pi * (f * t + f * .6 * (1 - np.exp(-t * 12)) / 12)) * np.exp(-t * 5)


def bass_saw(f, d, cutoff=700):
    x = lp(osc(f, d, "saw") + osc(f / 2, d, "sine") * .7, cutoff)
    return x * env_adsr(len(x), .005, .08, .8, .05)


def bass_sub(f, d):
    return osc(f, d, "sine") * env_adsr(int(d * SR), .01, .05, .9, .06) + osc(f * 2, d, "tri") * .1


def pad(fs, d, cutoff=2200, voices=5, s=0):
    x = sum(supersaw(f, d, voices, .011, rng("pad", s, round(f))) for f in fs) / len(fs)
    return lp(x, cutoff) * env_adsr(int(d * SR), .25, .3, .8, .5)


def warm_pad(fs, d, s=0):
    x = sum(osc(f, d, "tri", detune=.003) + osc(f, d, "tri", detune=-.003) for f in fs) / len(fs)
    return lp(x, 1500) * env_adsr(int(d * SR), .6, .4, .85, .8) * .8


def pluck(f, d=.5, bright=.6, s=0):
    return karplus(f, d, .997, bright, rng("pl", s, round(f)))


def saw_pluck(f, d=.25, cutoff=3000):
    x = lp(supersaw(f, d, 3, .008, rng("sp", round(f))), cutoff)
    return x * np.exp(-tt(d) * 9)


def epiano(f, d=1.2):
    x = fm(f, d, 1.0, 1.6, 3) * .7 + fm(f * 2, d, 1.0, .8, 5) * .2 + fm(f, d, 14, .3, 12) * .1
    return x * np.exp(-tt(d) * 2.2)


def piano(f, d=1.8):
    t = tt(d)
    x = sum(np.sin(2 * np.pi * f * k * t * (1 + .0004 * k * k)) / k ** 1.4 * np.exp(-t * (1.6 + .8 * k)) for k in range(1, 7))
    x[:96] += noise(.002, "white", rng("pn", round(f))) * .05
    return x * .8


def bell(f, d=1.5):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 3) + .4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6)) * .5


def strings(fs, d, s=0):
    x = sum(supersaw(f, d, 7, .006, rng("str", s, round(f))) for f in fs) / len(fs)
    vib = 1 + .004 * np.sin(2 * np.pi * 5 * tt(d))
    return lp(x * vib, 1800) * env_adsr(int(d * SR), .5, .3, .85, .6)


# ------------------------------------------------------------------ track builder
class Track:
    def __init__(self, bpm, bars, swing=0.0, seed=0):
        self.bpm, self.bars, self.swing, self.seed = bpm, bars, swing, seed
        self.beat = 60 / bpm
        self.bar = self.beat * 4
        self.len = int(self.bar * bars * SR)
        self.bus = {}
        self.kicks = []

    def at(self, bar, beat):
        b = beat
        if self.swing and abs(b * 2 % 2 - 1) < 1e-6:
            b += self.swing * .5
        return (bar * self.bar + b * self.beat) * SR

    def add(self, bus, x, bar, beat, gain=1.0, pan=0.0):
        if bus not in self.bus:
            self.bus[bus] = np.zeros((self.len + SR * 4, 2))
        place(self.bus[bus], to_stereo(np.asarray(x) * gain, pan), self.at(bar, beat))
        if bus == "kick":
            self.kicks.append(self.at(bar, beat))

    def sidechain(self, depth=.6, rel=.22):
        env = np.ones(self.len + SR * 4)
        r = int(rel * SR)
        shape = 1 - depth * (1 - np.linspace(0, 1, r)) ** 2
        for k in self.kicks:
            k = int(k)
            m = min(r, len(env) - k)
            env[k:k + m] = np.minimum(env[k:k + m], shape[:m])
        return env[:, None]

    def mix(self, levels, sc=None, verb=None, intro_bars=2, intro_lp=True):
        out = np.zeros((self.len + SR * 4, 2))
        scv = self.sidechain(*sc) if sc else None
        for name, buf in self.bus.items():
            g = levels.get(name, .5)
            if verb and name in verb:
                buf = reverb(buf, verb[name], 2.2)
            if scv is not None and name not in ("kick", "snare", "clap", "hat", "perc"):
                buf = buf * scv
            out += buf * g
        # wrap the reverb tail to the start so the loop point is seamless
        tail = out[self.len:]
        out = out[:self.len]
        out[:len(tail)] += tail
        if intro_bars and intro_lp:
            n = int(intro_bars * self.bar * SR)
            fil = np.stack([lp(out[:n + SR, c], 900) for c in (0, 1)], 1)[:n]
            k = np.linspace(0, 1, n)[:, None] ** 2
            out[:n] = fil * (1 - k) + out[:n] * k
        out = soft_clip(out * 1.2, 1.3)
        return normalize(out, .89)


def section(bar, bars):
    """intro / A / B(lift) / A2 -> 0..3"""
    q = bar / bars
    return 0 if q < 1 / 8 else 1 if q < 1 / 2 else 2 if q < 7 / 8 else 3


def drums_four(T, bar, sec, open_hats=True, clap_on=True, s=0):
    for b in range(4):
        T.add("kick", kick(), bar, b)
        if sec >= 1:
            T.add("hat", hat(False, s + b), bar, b + .5, .8)
            if open_hats and sec == 2:
                T.add("hat", hat(True, s + b), bar, b + .5, .5)
    if clap_on and sec >= 1:
        T.add("clap", clap(bar), bar, 1)
        T.add("clap", clap(bar + 1), bar, 3)
    if sec == 2:
        for b in range(8):
            T.add("hat", hat(False, 100 + b), bar, b * .5 + .25, .35)


# ------------------------------------------------------------------ moods
def m_hype(v=0, seconds=64):
    bpm = 128 if v == 0 else 124
    prog = [["Am", "F", "C", "G"], ["F#m", "D", "A", "E"]][v % 2]
    T = Track(bpm, int(seconds / (240 / bpm) // 4 * 4) or 16, seed=v)
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        drums_four(T, bar, sec, s=bar)
        for b in range(4):  # off-beat bass, ducked by the kick
            T.add("bass", bass_saw(N(root - 12), T.beat * .45, 500 + 300 * (sec == 2)), bar, b + .5, .8)
        T.add("pad", pad([N(n) for n in notes], T.bar, 1800 if sec < 2 else 3200, s=bar % 4), bar, 0, .5)
        if sec >= 1:
            arp = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[1] + 24]
            for k in range(8 if sec == 2 else 4):
                st = k * (.5 if sec == 2 else 1)
                T.add("lead", saw_pluck(N(arp[k % 4]), .3, 2800 + 2000 * (sec == 2)), bar, st, .45, pan=(-.3, .3)[k % 2])
        if bar % 8 == 7:
            T.add("fx", hp(noise(T.bar, "white", rng("rise", bar)), 3000) * tt(T.bar) / T.bar * .25, bar, 0)
    return T.mix({"kick": .95, "clap": .5, "hat": .5, "bass": .6, "pad": .45, "lead": .4, "fx": .5}, sc=(.65, .25),
                 verb={"pad": .3, "lead": .3, "clap": .15}), bpm


def m_tech(v=0, seconds=64):
    bpm = 110 if v == 0 else 116
    prog = [["Dm", "Dm", "Bb", "C"], ["Em", "C", "Am", "B"]][v % 2]
    T = Track(bpm, int(seconds / (240 / bpm) // 4 * 4) or 16)
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        T.add("kick", kick(), bar, 0)
        T.add("kick", kick(), bar, 2.5 if bar % 2 else 2)
        if sec >= 1:
            T.add("snare", snare(s=bar), bar, 1, .5)
            T.add("snare", snare(s=bar + 9), bar, 3, .5)
        for b in range(16):
            if sec >= 1 or b % 4 == 2:
                T.add("hat", hat(False, b), bar, b * .25, .25 + .25 * (b % 2 == 0))
            T.add("arp", saw_pluck(N(notes[b % 3] + 12 * (1 + (b // 3) % 2)), .18, 1800 + 1400 * (sec == 2)) * (1 if b % 4 else 1.3),
                  bar, b * .25, .35, pan=np.sin(b) * .5)
        for b in range(4):
            T.add("bass", bass_saw(N(root - 12), T.beat * .9, 420), bar, b, .8)
        if sec >= 2:
            T.add("pad", pad([N(n + 12) for n in notes], T.bar, 1500, 3, bar % 4), bar, 0, .3)
        if bar % 4 == 0:
            T.add("fx", bell(N(notes[0] + 24), 2.0), bar, 0, .2)
    return T.mix({"kick": .9, "snare": .45, "hat": .4, "arp": .45, "bass": .55, "pad": .4, "fx": .4}, sc=(.4, .2),
                 verb={"arp": .25, "fx": .5, "pad": .3}), bpm


def m_sad(v=0, seconds=64):
    bpm = 70 if v == 0 else 66
    prog = [["Cm", "Ab", "Eb", "Bb"], ["Am", "F", "C", "Em"]][v % 2]
    T = Track(bpm, max(8, int(seconds / (240 / bpm) // 2 * 2)))
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        T.add("bass", bass_sub(N(root - 12), T.bar * .95), bar, 0, .5)
        for b, idx in enumerate([0, 2, 1, 2, 0, 2, 1, 2]):
            T.add("piano", piano(N(notes[idx] + 12), 2.2), bar, b * .5, .45 if b else .6, pan=-.2)
        if sec >= 1:
            mel = [notes[2] + 24, notes[1] + 24, notes[0] + 24, notes[1] + 24]
            T.add("lead", piano(N(mel[bar % 4]), 3.0), bar, 0, .5, .2)
            T.add("lead", piano(N(mel[(bar + 1) % 4]), 2.0), bar, 2.5, .35, .2)
        if sec >= 2:
            T.add("pad", strings([N(n + 12) for n in notes], T.bar, bar), bar, 0, .35)
    return T.mix({"piano": .6, "lead": .55, "bass": .45, "pad": .4}, verb={"piano": .45, "lead": .5, "pad": .4}, intro_lp=False), bpm


def m_happy(v=0, seconds=64):
    bpm = 118 if v == 0 else 122
    prog = [["C", "G", "Am", "F"], ["G", "D", "Em", "C"]][v % 2]
    T = Track(bpm, int(seconds / (240 / bpm) // 4 * 4) or 16, swing=.12)
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 4)
        T.add("kick", kick(.35), bar, 0)
        T.add("kick", kick(.35), bar, 2)
        if sec >= 1:
            T.add("kick", kick(.3), bar, 2.75, .6)
            T.add("clap", clap(bar), bar, 1, .8)
            T.add("clap", clap(bar + 50), bar, 3, .8)
        for b in range(8):
            T.add("hat", shaker(b + bar), bar, b * .5, .8 if b % 2 else .5)
        strum = [0, .5, 1.5, 2, 2.5, 3.5]
        for st in strum:
            for k, n in enumerate(notes):
                T.add("uke", pluck(N(n), .6, .7, k), bar, st + k * .012, .35 if st % 1 else .45, pan=-.25)
        for b, off in enumerate([0, 1.5, 2, 3]):
            T.add("bass", bass_sub(N(root - 24 + (7 if b == 2 else 0)), T.beat * .5), bar, off, .7)
        if sec >= 2:
            mel = [notes[2] + 12, notes[1] + 12, notes[0] + 12, notes[1] + 12]
            for k in range(4):
                T.add("bell", bell(N(mel[(k + bar) % 4]), 1.0), bar, k, .3, pan=.3)
    return T.mix({"kick": .85, "clap": .45, "hat": .35, "uke": .55, "bass": .55, "bell": .35}, sc=(.3, .18),
                 verb={"uke": .2, "bell": .4, "clap": .15}), bpm


def m_mellow(v=0, seconds=64):
    bpm = [80, 76, 84, 72][v % 4]
    prog = [["Fmaj7", "Em7", "Dm7", "Cmaj7"], ["Ebmaj7", "Dm7", "Cm7", "Bbmaj7"],
            ["Am7", "Dm7", "G7", "Cmaj7"], ["Dm9", "G7", "Cmaj7", "Am7"]][v % 4]
    T = Track(bpm, max(8, int(seconds / (240 / bpm) // 4 * 4)), swing=.18)
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        for st, n in [(0, notes), (1.5, notes[1:]), (2.5, notes)]:
            for k, m in enumerate(n):
                T.add("ep", epiano(N(m + 12), 1.6), bar, st + k * .02, .3)
        T.add("bass", bass_sub(N(root - 12), T.beat * 1.8), bar, 0, .55)
        T.add("bass", bass_sub(N(root - 12 + 7), T.beat * .9), bar, 2.5, .45)
        if sec >= 1:
            T.add("kick", kick(.4, .3), bar, 0, .7)
            T.add("kick", kick(.4, .3), bar, 2.5, .55)
            T.add("snare", lp(snare(.25, bar), 4000), bar, 1, .35)
            T.add("snare", lp(snare(.25, bar + 3), 4000), bar, 3, .35)
            for b in range(8):
                T.add("hat", lp(hat(False, b), 9000), bar, b * .5, .45 if b % 2 else .25)
        if sec == 2:
            T.add("lead", bell(N(notes[-1] + 24), 2.0), bar, 1, .2, .4)
    T.add("crackle", (noise(T.len / SR, "white", rng("vc")) * (rng("vc2").random(T.len) > .9992)) * .5
          + lp(noise(T.len / SR, "pink", rng("vc3")), 2500) * .02, 0, 0)
    return T.mix({"ep": .6, "bass": .55, "kick": .7, "snare": .45, "hat": .35, "lead": .3, "crackle": .35},
                 verb={"ep": .3, "lead": .5}), bpm


def m_lofi(v=0, seconds=64):
    return m_mellow(v + 2, seconds)


def m_epic(v=0, seconds=64):
    bpm = 90
    prog = [["Dm", "Bb", "F", "C"], ["Cm", "Ab", "Eb", "Bb"]][v % 2]
    T = Track(bpm, max(8, int(seconds / (240 / bpm) // 4 * 4)))
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        T.add("str", strings([N(n) for n in notes] + [N(notes[0] + 12)], T.bar, bar), bar, 0, .6)
        T.add("bass", lp(supersaw(N(root - 12), T.bar * .98, 3, .005, rng("eb", bar)), 300) * env_adsr(int(T.bar * .98 * SR), .05, .2, .9, .3), bar, 0, .6)
        if sec >= 1:
            for b in (0, 1.5, 2, 3):
                T.add("perc", tom(70 if b == 0 else 95, .7), bar, b, .8 if b == 0 else .5)
            T.add("snare", snare(.4, bar), bar, 2, .5)
        if sec >= 2:
            for b in range(8):
                T.add("perc", tom(130, .25), bar, b * .5 + .25, .25)
            T.add("brass", lp(supersaw(N(notes[0] + 12), T.beat * 1.8, 5, .008), 1400) * env_adsr(int(T.beat * 1.8 * SR), .08, .2, .8, .3), bar, 0, .4)
        for b in range(8):
            T.add("ost", saw_pluck(N(notes[b % 2 * 2] + 12), .2, 1600), bar, b * .5, .25, pan=(-.4, .4)[b % 2])
    return T.mix({"str": .55, "bass": .55, "perc": .75, "snare": .4, "brass": .45, "ost": .35}, verb={"str": .4, "perc": .3, "brass": .3, "snare": .35}), bpm


def m_suspense(v=0, seconds=64):
    bpm = 100
    T = Track(bpm, max(8, int(seconds / (240 / bpm) // 4 * 4)))
    roots = [[45, 45, 46, 44], [40, 40, 41, 39]][v % 2]
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        r = roots[bar % 4]
        T.add("drone", lp(supersaw(N(r - 12), T.bar, 5, .02, rng("dr", bar)), 260), bar, 0, .6)
        for b in range(8):
            T.add("ost", lp(osc(N(r + 12 + (3 if b % 4 == 3 else 0)), .18, "saw"), 1200) * np.exp(-tt(.18) * 10), bar, b * .5, .3)
        T.add("tick", hp(noise(.03, "white", rng("tk", bar)), 4000) * np.exp(-tt(.03) * 150), bar, 0, .5)
        T.add("tick", hp(noise(.03, "white", rng("tk2", bar)), 4000) * np.exp(-tt(.03) * 150), bar, 2, .5)
        if sec >= 1:
            T.add("kick", kick(.6, .2), bar, 0, .8)
            T.add("kick", kick(.6, .2), bar, .75, .5)
        if sec >= 2:
            T.add("high", osc(N(r + 36), T.bar, "sine") * env_adsr(int(T.bar * SR), 1, .2, .8, 1) * .15 * (1 + .5 * np.sin(2 * np.pi * 6 * tt(T.bar))), bar, 0)
    return T.mix({"drone": .55, "ost": .45, "tick": .45, "kick": .8, "high": .35}, verb={"ost": .35, "high": .5, "tick": .3}), bpm


def m_corporate(v=0, seconds=64):
    bpm = 112
    prog = [["C", "Am", "F", "G"], ["D", "Bm", "G", "A"]][v % 2]
    T = Track(bpm, int(seconds / (240 / bpm) // 4 * 4) or 16)
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 4)
        for b in range(8):
            T.add("piano", piano(N(notes[b % 3]), .9), bar, b * .5, .35, -.2)
        T.add("bass", bass_sub(N(root - 24), T.bar * .9), bar, 0, .6)
        if sec >= 1:
            for b in range(4):
                T.add("kick", kick(.35), bar, b, .75)
            T.add("clap", clap(bar), bar, 1, .5)
            T.add("clap", clap(bar + 1), bar, 3, .5)
            for b in range(8):
                T.add("hat", hat(False, b), bar, b * .5 + .25, .4)
            for b in range(16):
                T.add("gtr", pluck(N(notes[(b * 2) % 3] + 12), .25, .9, b), bar, b * .25, .22, .35)
        if sec >= 2:
            T.add("pad", warm_pad([N(n) for n in notes], T.bar, bar), bar, 0, .4)
    return T.mix({"piano": .55, "bass": .5, "kick": .75, "clap": .4, "hat": .3, "gtr": .4, "pad": .4}, sc=(.25, .15),
                 verb={"piano": .25, "gtr": .2, "pad": .3}), bpm


def m_inspire(v=0, seconds=64):
    bpm = 96
    prog = [["G", "D", "Em", "C"], ["Ab", "Eb", "Fm", "Db"]][v % 2]
    T = Track(bpm, max(8, int(seconds / (240 / bpm) // 4 * 4)))
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 4)
        for b in range(8):
            T.add("piano", piano(N(notes[[0, 1, 2, 1][b % 4]] + (12 if b >= 4 else 0)), 1.6), bar, b * .5, .4)
        T.add("bass", bass_sub(N(root - 24), T.bar), bar, 0, .5)
        if sec >= 1:
            T.add("str", strings([N(n - 12) for n in notes], T.bar, bar), bar, 0, .45)
            T.add("kick", kick(.5, .4), bar, 0, .7)
            T.add("kick", kick(.5, .4), bar, 2, .7)
        if sec >= 2:
            T.add("snare", snare(.35, bar), bar, 1, .4)
            T.add("snare", snare(.35, bar + 2), bar, 3, .4)
            for b in range(4):
                T.add("hat", hat(True, b), bar, b + .5, .3)
            T.add("bell", bell(N(notes[2] + 12), 2.0), bar, 0, .25)
    return T.mix({"piano": .55, "bass": .5, "str": .45, "kick": .75, "snare": .45, "hat": .3, "bell": .3},
                 verb={"piano": .35, "str": .4, "bell": .5, "snare": .3}, intro_lp=False), bpm


# ------------------------------------------------------------------ v4 moods (10 more beds)
def rim(s=0):
    return (bp(noise(.04, "white", rng("rim", s)), 1500, 6000) * np.exp(-tt(.04) * 90) + np.sin(2 * np.pi * 1700 * tt(.04)) * np.exp(-tt(.04) * 120) * .5) * .6


def sub808(f, d, glide_from=None):
    t = tt(d)
    fr = f if glide_from is None else f + (glide_from - f) * np.exp(-t * 18)
    return soft_clip(np.sin(2 * np.pi * np.cumsum(np.full(len(t), 1.0) * fr) / SR) * env_adsr(len(t), .005, .1, .85, .08), 1.6)


def glock(f, d=1.0):
    t = tt(d)
    return (np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * f * 4.07 * t) * np.exp(-t * 8)) * np.exp(-t * 3.5) * .5


def bars_for(seconds, bpm, mult=4):
    return max(8, int(seconds / (240 / bpm) // mult * mult))


def m_lofi_hiphop(v=0, seconds=64):
    bpm = 84
    prog = ["Dm9", "G7", "Cmaj7", "Am7"]
    T = Track(bpm, bars_for(seconds, bpm), swing=.22)
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        for st in (0, 2.5):
            for k, m in enumerate(notes):
                T.add("ep", lp(epiano(N(m + 12), 1.8), 2600), bar, st + k * .03, .28)
        T.add("bass", lp(bass_sub(N(root - 12), T.beat * 1.6), 500), bar, 0, .6)
        T.add("bass", lp(bass_sub(N(root - 12 + 7), T.beat * .8), 500), bar, 2.75, .45)
        if sec >= 1:
            for b in (0, 1.75, 2.5):
                T.add("kick", kick(.4, .4), bar, b, .8 if b == 0 else .6)
            for b in (1, 3):
                T.add("snare", lp(snare(.25, bar + b), 3500), bar, b, .5)
            for b in range(8):
                T.add("hat", lp(hat(False, b + bar), 8000), bar, b * .5, .4 if b % 2 else .22)
        if sec == 2 and bar % 2:
            T.add("lead", bell(N(notes[-1] + 12), 1.6), bar, 1.5, .25, .3)
    T.add("crackle", (noise(T.len / SR, "white", rng("lhc")) * (rng("lhc2").random(T.len) > .9993)) * .5 + lp(noise(T.len / SR, "pink", rng("lhc3")), 2500) * .025, 0, 0)
    return T.mix({"ep": .6, "bass": .55, "kick": .75, "snare": .45, "hat": .3, "lead": .3, "crackle": .4}, verb={"ep": .3, "lead": .5, "snare": .15}), bpm


def m_cinematic_epic(v=0, seconds=64):
    bpm = 80
    prog = ["Am", "F", "C", "G"]
    T = Track(bpm, bars_for(seconds, bpm))
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        T.add("str", strings([N(n) for n in notes] + [N(notes[0] + 12), N(notes[2] + 12)], T.bar, bar), bar, 0, .6)
        T.add("bass", lp(supersaw(N(root - 24), T.bar * .98, 3, .004, rng("ceb", bar)), 250) * env_adsr(int(T.bar * .98 * SR), .1, .2, .9, .3), bar, 0, .7)
        for b in range(8):
            T.add("ost", lp(saw_pluck(N(notes[[0, 2, 1, 2][b % 4]] + 12), .22, 1400), 2000), bar, b * .5, .22 + .1 * (sec >= 2), pan=(-.4, .4)[b % 2])
        if sec >= 1:
            T.add("perc", tom(55, 1.0), bar, 0, 1.0)
            T.add("perc", tom(75, .6), bar, 1.5, .55)
            T.add("perc", tom(60, .8), bar, 2.5, .7)
        if sec >= 2:
            for b in range(16):
                T.add("perc", tom(150, .15), bar, b * .25, .18 + .1 * (b % 4 == 0))
            T.add("brass", lp(supersaw(N(notes[0]), T.bar * .9, 5, .008, rng("cbr", bar)), 1200) * env_adsr(int(T.bar * .9 * SR), .15, .3, .8, .4), bar, 0, .45)
            T.add("choir", lp(sum(osc(N(n + 12), T.bar, "tri", detune=.003 * k) for k, n in enumerate(notes)) / 3, 1600) * env_adsr(int(T.bar * SR), .5, .3, .8, .5), bar, 0, .35)
    return T.mix({"str": .55, "bass": .55, "ost": .35, "perc": .8, "brass": .45, "choir": .35}, verb={"str": .45, "perc": .35, "brass": .35, "choir": .5}, intro_lp=False), bpm


def m_corporate_upbeat(v=0, seconds=64):
    bpm = 120
    prog = ["C", "G", "Am", "F"]
    T = Track(bpm, bars_for(seconds, bpm))
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 4)
        for b in range(8):
            T.add("pluck", saw_pluck(N(notes[b % 3] + 12), .2, 3500), bar, b * .5, .3, pan=(-.35, .35)[b % 2])
        T.add("piano", sum(piano(N(n), 1.2) for n in notes) / 2, bar, 0, .35)
        T.add("piano", sum(piano(N(n), 1.0) for n in notes) / 2, bar, 2.5, .3)
        T.add("bass", bass_sub(N(root - 24), T.beat * .9), bar, 0, .6)
        T.add("bass", bass_sub(N(root - 24), T.beat * .45), bar, 1.5, .5)
        T.add("bass", bass_sub(N(root - 24 + 12), T.beat * .45), bar, 2.5, .45)
        if sec >= 1:
            drums_four(T, bar, sec, open_hats=True, clap_on=True, s=bar)
        if sec == 2:
            T.add("bell", glock(N(notes[2] + 24), 1.0), bar, 0, .25)
            T.add("bell", glock(N(notes[1] + 24), 1.0), bar, 2, .25)
    return T.mix({"pluck": .45, "piano": .5, "bass": .55, "kick": .8, "clap": .45, "hat": .35, "bell": .35}, sc=(.35, .18),
                 verb={"pluck": .25, "piano": .25, "bell": .4, "clap": .15}), bpm


def m_real_estate_luxury(v=0, seconds=64):
    bpm = 100
    prog = ["Fmaj7", "Em7", "Dm7", "Cmaj7"]
    T = Track(bpm, bars_for(seconds, bpm))
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        T.add("pad", warm_pad([N(n + 12) for n in notes], T.bar, bar), bar, 0, .5)
        T.add("bass", lp(bass_sub(N(root - 12), T.beat * 1.5), 400), bar, 0, .6)
        T.add("bass", lp(bass_sub(N(root - 12), T.beat * .5), 400), bar, 2.5, .45)
        if sec >= 1:
            for b in range(4):
                T.add("kick", kick(.35, .3), bar, b, .6)
            T.add("perc", rim(bar), bar, 1, .45)
            T.add("perc", rim(bar + 1), bar, 3, .45)
            for b in range(8):
                T.add("hat", hat(b % 4 == 2, b + bar), bar, b * .5 + .25, .25)
        mel = [notes[3] + 24, notes[2] + 24, notes[1] + 24, notes[2] + 24]
        if sec >= 1 and bar % 2 == 0:
            for k, st in enumerate((0, .75, 1.5, 3)):
                T.add("bell", bell(N(mel[k]), 1.4), bar, st, .22, pan=.3)
        if sec == 2:
            T.add("ep", lp(epiano(N(notes[0] + 24), 2.0), 3000), bar, 0, .2, -.3)
    return T.mix({"pad": .5, "bass": .55, "kick": .7, "perc": .35, "hat": .25, "bell": .35, "ep": .3}, sc=(.25, .2),
                 verb={"pad": .35, "bell": .5, "perc": .2, "ep": .4}), bpm


def m_tiktok_trap(v=0, seconds=64):
    bpm = 140
    prog = ["Cm", "Ab", "Eb", "Bb"]
    T = Track(bpm, bars_for(seconds, bpm, 4))
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        for k, st in enumerate((0, .75, 1.5, 2.25, 3)):
            T.add("bell", glock(N([notes[0], notes[2], notes[1], notes[2], notes[0] + 12][k] + 24), .6), bar, st, .28, pan=(-.3, .3)[k % 2])
        if sec >= 1:
            T.add("kick", kick(.5), bar, 0, .9)
            T.add("kick", kick(.4), bar, 2.75 if bar % 2 else 1.75, .7)
            T.add("snare", clap(bar) + snare(.25, bar) * .5, bar, 2, .7)
            T.add("bass", sub808(N(root - 24), T.beat * 1.6, N(root - 12) if bar % 4 == 0 else None), bar, 0, .75)
            T.add("bass", sub808(N(root - 24), T.beat * .9), bar, 2.75 if bar % 2 else 1.75, .6)
            for b in range(8 if sec == 1 else 16):
                st = b * (.5 if sec == 1 else .25)
                T.add("hat", hat(False, b + bar * 3), bar, st, .3 + .1 * (b % 2 == 0))
            if sec == 2 and bar % 2:
                for b in range(6):
                    T.add("hat", hat(False, 200 + b), bar, 3.25 + b / 8, .25)
        else:
            T.add("pad", pad([N(n + 12) for n in notes], T.bar, 1200, s=bar), bar, 0, .35)
    return T.mix({"bell": .45, "kick": .9, "snare": .55, "bass": .7, "hat": .35, "pad": .4}, sc=(.3, .15),
                 verb={"bell": .35, "snare": .2, "pad": .35}), bpm


def m_acoustic_warm(v=0, seconds=64):
    bpm = 100
    prog = ["G", "Em", "C", "D"]
    T = Track(bpm, bars_for(seconds, bpm), swing=.08)
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        pat = [notes[0] - 12, notes[2], notes[1] + 12, notes[2], notes[0], notes[2], notes[1] + 12, notes[2]]
        for b, m in enumerate(pat):
            T.add("gtr", pluck(N(m + 12), 1.2, .55, b + bar * 8), bar, b * .5, .4 if b % 2 == 0 else .3, pan=-.2)
        if sec >= 1:
            T.add("kick", kick(.35, .2), bar, 0, .55)
            T.add("kick", kick(.35, .2), bar, 2, .5)
            for b in range(8):
                T.add("hat", shaker(b + bar), bar, b * .5, .6 if b % 2 else .4)
            T.add("perc", clap(bar) * .6, bar, 3, .3)
        if sec >= 2:
            mel = [notes[2] + 24, notes[1] + 24, notes[0] + 24, notes[1] + 24]
            T.add("lead", pluck(N(mel[bar % 4]), 1.6, .8, 900 + bar), bar, 0, .3, .3)
            T.add("lead", pluck(N(mel[(bar + 1) % 4]), 1.2, .8, 950 + bar), bar, 2.5, .25, .3)
            T.add("pad", warm_pad([N(n) for n in notes], T.bar, bar), bar, 0, .3)
    return T.mix({"gtr": .6, "kick": .6, "hat": .3, "perc": .3, "lead": .4, "pad": .35}, verb={"gtr": .25, "lead": .3, "pad": .3}, intro_lp=False), bpm


def m_ambient_calm(v=0, seconds=64):
    bpm = 60
    prog = ["Cmaj7", "Am7", "Fmaj7", "G"]
    T = Track(bpm, max(8, int(seconds / (240 / bpm) // 2 * 2)))
    for bar in range(T.bars):
        root, notes = chord(prog[bar % 4], 3)
        T.add("pad", warm_pad([N(n) for n in notes] + [N(notes[1] + 12)], T.bar * 1.2, bar), bar, 0, .55)
        T.add("bass", osc(N(root - 12), T.bar, "sine") * env_adsr(int(T.bar * SR), 1, .5, .8, 1), bar, 0, .3)
        r = rng("amb", bar)
        for k in range(3):
            T.add("bell", bell(N(notes[int(r.integers(len(notes)))] + 24), 3.0), bar, float(r.uniform(0, 3.5)), .18, pan=float(r.uniform(-.6, .6)))
    T.add("air", lp(noise(T.len / SR, "pink", rng("air")), 1200) * .04, 0, 0)
    return T.mix({"pad": .55, "bass": .4, "bell": .45, "air": .3}, verb={"pad": .5, "bell": .6}, intro_lp=False), bpm


def m_news_bg(v=0, seconds=64):
    bpm = 120
    prog = ["Dm", "Bb", "F", "C"]
    T = Track(bpm, bars_for(seconds, bpm))
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        for b in range(16):
            T.add("pulse", lp(osc(N(notes[0] + 12 + (12 if b % 4 == 3 else 0)), .1, "square"), 1800) * np.exp(-tt(.1) * 22), bar, b * .25, .22 + .1 * (b % 4 == 0))
        T.add("pad", pad([N(n + 12) for n in notes], T.bar, 1400, 3, bar), bar, 0, .3)
        T.add("bass", bass_saw(N(root - 12), T.beat * .9, 380), bar, 0, .55)
        T.add("bass", bass_saw(N(root - 12), T.beat * .9, 380), bar, 2, .5)
        T.add("tick", hp(noise(.02, "white", rng("ntk", bar)), 5000) * np.exp(-tt(.02) * 200), bar, 0, .5)
        T.add("tick", hp(noise(.02, "white", rng("ntk2", bar)), 5000) * np.exp(-tt(.02) * 200), bar, 2, .4)
        if sec >= 1:
            T.add("kick", kick(.4, .3), bar, 0, .7)
            T.add("kick", kick(.4, .3), bar, 2.5, .55)
            T.add("snare", snare(.25, bar), bar, 1, .35)
            T.add("snare", snare(.25, bar + 5), bar, 3, .35)
        if bar % 8 == 0:
            T.add("timp", tom(65, 1.4), bar, 0, .7)
    return T.mix({"pulse": .45, "pad": .35, "bass": .5, "tick": .4, "kick": .7, "snare": .35, "timp": .6}, sc=(.2, .15),
                 verb={"pulse": .2, "pad": .3, "timp": .4}), bpm


def m_kids_playful(v=0, seconds=64):
    bpm = 126
    prog = ["F", "C", "Dm", "Bb"]
    T = Track(bpm, bars_for(seconds, bpm), swing=.15)
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 4)
        for b in range(8):  # pizzicato
            T.add("pizz", pluck(N(notes[[0, 1, 2, 1][b % 4]]), .3, .9, b + bar * 8) * np.exp(-tt(.3) * 8), bar, b * .5, .35, pan=(-.3, .3)[b % 2])
        T.add("bass", bass_sub(N(root - 24), T.beat * .4), bar, 0, .55)
        T.add("bass", bass_sub(N(root - 24 + 7), T.beat * .4), bar, 2, .5)
        if sec >= 1:
            T.add("kick", kick(.3), bar, 0, .6)
            T.add("kick", kick(.3), bar, 2, .6)
            T.add("clap", clap(bar), bar, 1, .4)
            T.add("clap", clap(bar + 7), bar, 3, .4)
            for b in range(4):
                T.add("hat", shaker(b + bar), bar, b + .5, .5)
        mel = [notes[2] + 12, notes[1] + 12, notes[0] + 12, notes[2] + 12, notes[1] + 12, notes[0] + 12]
        if sec >= 1:
            for k, st in enumerate((0, .5, 1, 2, 2.5, 3)):
                T.add("glock", glock(N(mel[(k + bar) % 6]), .8), bar, st, .3 if sec == 2 else .2)
    return T.mix({"pizz": .55, "bass": .5, "kick": .7, "clap": .4, "hat": .3, "glock": .45}, verb={"pizz": .2, "glock": .35, "clap": .1}), bpm


def m_piano_minimal(v=0, seconds=64):
    bpm = 90
    prog = ["Am", "F", "C", "G"]
    T = Track(bpm, bars_for(seconds, bpm))
    for bar in range(T.bars):
        sec = section(bar, T.bars)
        root, notes = chord(prog[bar % 4], 3)
        for b in range(8):
            T.add("piano", piano(N([notes[0], notes[2], notes[1] + 12, notes[2]][b % 4] + 12), 1.4), bar, b * .5, .35 + .1 * (b == 0))
        T.add("low", piano(N(root - 12), 3.0), bar, 0, .45)
        if sec >= 1:
            mel = [notes[2] + 24, notes[1] + 24, notes[0] + 24, notes[1] + 24]
            T.add("lead", piano(N(mel[bar % 4]), 2.5), bar, 0, .45, .2)
        if sec >= 2:
            T.add("str", strings([N(n) for n in notes], T.bar, bar), bar, 0, .3)
            T.add("kick", kick(.5, .2), bar, 0, .45)
    return T.mix({"piano": .55, "low": .45, "lead": .5, "str": .4, "kick": .5}, verb={"piano": .4, "lead": .45, "str": .4, "low": .3}, intro_lp=False), bpm


MOODS = {
    "hype": (m_hype, "năng lượng cao, EDM 128bpm — hook, tuyên bố, recap, chốt"),
    "tech": (m_tech, "arp điện tử 110bpm — hậu trường, công cụ, AI, dashboard"),
    "sad": (m_sad, "piano buồn 70bpm — nỗi đau, quá khứ, thất bại"),
    "happy": (m_happy, "ukulele + clap 118bpm — vui, kết quả tốt, đời thường"),
    "mellow": (m_mellow, "lofi electric piano 80bpm — du dương, thư giãn, kể chuyện"),
    "lofi": (m_lofi, "lofi biến thể — hoài niệm, chill"),
    "epic": (m_epic, "dây + trống trận 90bpm — tầm nhìn, tuyên bố lớn"),
    "suspense": (m_suspense, "ostinato căng 100bpm — vấn đề, rủi ro, bí mật"),
    "corporate": (m_corporate, "piano + guitar sáng 112bpm — doanh nghiệp, giới thiệu, hướng dẫn"),
    "inspire": (m_inspire, "piano + strings 96bpm — truyền cảm hứng, câu chuyện vượt khó"),
    "lofi_hiphop": (m_lofi_hiphop, "lofi hip-hop 84bpm, trống boom-bap + vinyl — chill, học tập, vlog đời thường"),
    "cinematic_epic": (m_cinematic_epic, "dây + kèn + trống taiko 80bpm — tuyên bố lớn, hành trình, trailer"),
    "corporate_upbeat": (m_corporate_upbeat, "pop doanh nghiệp tươi 120bpm — giới thiệu công ty, sản phẩm, khoá học"),
    "real_estate_luxury": (m_real_estate_luxury, "deep house sang trọng 100bpm — bất động sản, nội thất, khách sạn"),
    "tiktok_trap": (m_tiktok_trap, "trap 140bpm, 808 + hi-hat roll — TikTok, hook nhanh, giới trẻ"),
    "acoustic_warm": (m_acoustic_warm, "guitar mộc ấm 100bpm — câu chuyện, gia đình, ẩm thực"),
    "ambient_calm": (m_ambient_calm, "ambient pad + chuông 60bpm, không trống — thiền, sức khoẻ, spa"),
    "news_bg": (m_news_bg, "nền bản tin 120bpm, nhịp xung + timpani — tin tức, cập nhật, phân tích"),
    "kids_playful": (m_kids_playful, "pizzicato + glockenspiel 126bpm — vui nhộn, trẻ em, mẹo hay"),
    "piano_minimal": (m_piano_minimal, "piano tối giản 90bpm — tâm sự, cảm xúc, chiêm nghiệm"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--only", default="")
    ap.add_argument("--seconds", type=float, default=64)
    ap.add_argument("--variants", type=int, default=2)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    only = set(filter(None, a.only.split(",")))
    cat = []
    for mood, (fn, desc) in MOODS.items():
        if only and mood not in only:
            continue
        for v in range(a.variants):
            name = mood if v == 0 else f"{mood}_{v + 1}"
            x, bpm = fn(v, a.seconds)
            tmp = os.path.join(a.out, name + ".tmp.wav")
            write(tmp, x)
            # Same loudness for every bed so timeline "gain" means the same thing for all moods.
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", "loudnorm=I=-16:TP=-1.5:LRA=7",
                            "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "128k", os.path.join(a.out, name + ".mp3")], check=True)
            os.remove(tmp)
            cat.append({"name": name, "file": name + ".mp3", "mood": mood, "bpm": bpm, "dur": round(len(x) / SR, 2), "use": desc})
            print(name, bpm, round(len(x) / SR, 1), "s", flush=True)
    cpath = os.path.join(a.out, "catalog.json")
    if only and os.path.exists(cpath):  # --only: merge into the existing catalog (keeps the other moods' rows)
        new = {c["name"] for c in cat}
        order = list(MOODS)
        cat = sorted([c for c in json.load(open(cpath)) if c["name"] not in new] + cat, key=lambda c: (order.index(c["mood"]) if c["mood"] in order else 99, c["name"]))
    json.dump(cat, open(cpath, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
