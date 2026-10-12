"""Bước RENDER: giải mã các đoạn giữ lại -> ghép chữ/hiệu ứng từng khung hình (Python) -> mã hoá MỘT lần.

Không đổi độ phân giải / tốc độ khung; H.264 CRF 17 (gần như không mất chất lượng).
"""
import json
import os
import queue
import subprocess
import threading
import time

import cv2
import numpy as np

from . import cut, graphics, media
from .graphics import draw_lines, place, sanitize


# ----------------------------------------------------------------------------- tiện ích hoạt ảnh
def ease(x):
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


def fade_state(t, start, end, a_in, a_out):
    """(alpha, độ 'mờ' 0..1) của một phần tử hiện trong [start, end)."""
    if t < start or t >= end:
        return 0.0, 1.0
    pin = ease((t - start) / a_in) if a_in > 0 else 1.0
    pout = ease((end - t) / a_out) if a_out > 0 else 1.0
    p = min(pin, pout)
    return p, 1 - p


class Layer:
    """Một sprite + lịch hiện/ẩn + hiệu ứng."""

    def __init__(self, sprite, start, end, a_in, a_out, blur, z=0, ghost=None, xclip=None):
        self.sprite, self.start, self.end = sprite, start, end
        self.a_in, self.a_out, self.blur, self.z = a_in, a_out, blur, z
        self.ghost = ghost      # (delay, slide, dx, dy)
        self.xclip = xclip      # (t0, dur, x0, x1): lộ dần theo chiều ngang (gạch ngang)

    def states(self, t):
        a, b = fade_state(t, self.start, self.end, self.a_in, self.a_out)
        if a <= 0.003:
            return []
        dx = dy = 0
        clip = None
        if self.ghost:
            d, slide, gx, gy = self.ghost
            g = ease((t - self.start - d) / slide) if t >= self.start + d else 0.0
            if g <= 0:
                return []
            dx, dy = gx * g, gy * g
            a *= g
        if self.xclip:
            t0, dur, x0, x1 = self.xclip
            if t < t0:
                return []
            clip = x0 + (x1 - x0) * ease((t - t0) / dur)
        return [(self.sprite, a, self.blur * b, dx, dy, clip)]


def blend(frame, sprite, alpha, blur, dx=0, dy=0, xclip=None):
    rgb, a = sprite.rgb, sprite.alpha
    if blur > 0.4:
        rgb = cv2.GaussianBlur(rgb, (0, 0), blur)
        a = cv2.GaussianBlur(a, (0, 0), blur)
    if xclip is not None:
        cols = np.arange(a.shape[1]) < xclip
        a = a * cols[None, :]
        rgb = rgb * cols[None, :, None]
    if alpha < 0.999:
        a = a * alpha
        rgb = rgb * alpha
    H, W = frame.shape[:2]
    x, y = int(round(sprite.x + dx)), int(round(sprite.y + dy))
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + a.shape[1]), min(H, y + a.shape[0])
    if x1 <= x0 or y1 <= y0:
        return
    sa = a[y0 - y:y1 - y, x0 - x:x1 - x, None]
    sr = rgb[y0 - y:y1 - y, x0 - x:x1 - x]
    region = frame[y0:y1, x0:x1].astype(np.float32) * (1 / 255.0)
    out = region * (1 - sa) + sr
    frame[y0:y1, x0:x1] = np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8)


# ----------------------------------------------------------------------------- dựng các lớp từ plan
def fit_size(text, font_name, size, max_width, min_size, max_lines=1, no_end=(), glue=()):
    """Giảm cỡ chữ tới khi vừa khung (với số dòng cho phép)."""
    s = size
    while True:
        f = graphics.font(font_name, s)
        lines = graphics.wrap_balanced(text, f, max_width, max_lines, no_end, glue) if max_lines > 1 else [text]
        if all(graphics.text_width(l, f) <= max_width for l in lines) or s <= min_size:
            return s, lines
        s = max(min_size, s * 0.94)


def build_layers(plan, style, W, H):
    k = min(W / style["reference_width"], H / style["reference_height"])
    look = style["look"]
    dur = plan["duration"]
    layers, warnings = [], []

    # --- phụ đề chạy
    c = style["captions"]
    for cap in sorted(plan.get("captions") or [], key=lambda x: x["start"]):
        text = sanitize(cap.get("text", ""))
        if not text or cap["end"] - cap["start"] < 0.05:
            continue
        size, lines = fit_size(text, c["font"], c["size"] * k, c["max_width"] * k, c["min_size"] * k,
                               c["max_lines"], set(c["no_end"]), set(c.get("compounds", [])))
        if len(lines) > c["max_lines"]:
            warnings.append(f"Phụ đề {cap['start']:.2f}s dài hơn {c['max_lines']} dòng: {text!r}")
        pitch = size * c["line_height"]
        d = draw_lines([{"text": l, "font": c["font"], "size": size, "dy": i * pitch} for i, l in enumerate(lines)],
                       k, look, align="center")
        place(d, W / 2, c["bottom_y"] * H - (len(lines) - 1) * pitch)
        s, e = cap["start"], min(cap["end"], dur)
        layers.append(Layer(d["text"], s, e, c["anim_in"], c["anim_out"], c["blur_in"] * k, z=30))
        if d["emoji"]:
            layers.append(Layer(d["emoji"], s, e, c["anim_in"], c["anim_out"], c["blur_in"] * k, z=31))

    # --- tiêu đề mở đầu (hook)
    hk = style["hook"]
    hook = plan.get("hook")
    if hook and hook.get("lines"):
        spec, prev = [], None
        cy = hook.get("center_y", hk["center_y"])
        for ln in hook["lines"]:
            main = ln.get("style", "main") == "main"
            fname = hk["main_font"] if main else hk["sub_font"]
            dx = (hk["main_dx"] if main else hk["sub_dx"]) * W
            dx = ln.get("dx", dx / W) * W
            avail = hk["max_width"] * W - 2 * abs(dx)
            size, _ = fit_size(sanitize(ln["text"]), fname, (hk["main_size"] if main else hk["sub_size"]) * k * ln.get("scale", 1.0),
                               avail, 40 * k)
            if prev is None:
                dy = 0.0
            elif prev[0]:
                dy = prev[1] + hk["sub_dy"] * prev[2]
            else:
                dy = prev[1] + hk["sub_gap"] * size
            spec.append({"text": sanitize(ln["text"]), "font": fname, "size": size, "dx": dx, "dy": dy})
            prev = (main, dy, size)
        d = draw_lines(spec, k, look, align="center")
        place(d, W / 2, cy * H)
        s, e = float(hook.get("start", hk["start"])), min(float(hook["end"]), dur)
        g = hk["ghost"]
        layers.append(Layer(d["ghost"], s, e, hk["anim_in"], hk["anim_out"], hk["blur_in"] * k, z=20,
                            ghost=(g["delay"], g["slide"], g["dx"] * k, g["dy"] * k)))
        layers.append(Layer(d["text"], s, e, hk["anim_in"], hk["anim_out"], hk["blur_in"] * k, z=21))
        if d["emoji"]:
            layers.append(Layer(d["emoji"], s, e, hk["anim_in"], hk["anim_out"], hk["blur_in"] * k, z=22))

    # --- tên mục góc trên trái
    hd = style["header"]
    secs = sorted(plan.get("sections") or [], key=lambda x: x["start"])
    for i, sec in enumerate(secs):
        title = sanitize(sec.get("title", ""))
        if not title:
            continue
        s = float(sec["start"])
        e = min(float(secs[i + 1]["start"]) if i + 1 < len(secs) else dur, float(sec.get("end", dur)))
        size, _ = fit_size(title, hd["font"], hd["size"] * k, hd["max_width"] * k, 40 * k)
        d = draw_lines([{"text": title, "font": hd["font"], "size": size, "dy": 0}], k, look, align="left")
        place(d, hd["x"] * k, hd["center_y"] * H)
        layers.append(Layer(d["text"], s, e, hd["anim_in"], hd["anim_out"], hd["blur_in"] * k, z=10))
        if d["emoji"]:
            layers.append(Layer(d["emoji"], s, e, hd["anim_in"], hd["anim_out"], hd["blur_in"] * k, z=11))

    # --- ghi chú giữa khung
    nt = style["notes"]
    for note in plan.get("notes") or []:
        s, e = float(note["start"]), min(float(note["end"]), dur)
        lines = [ln if isinstance(ln, dict) else {"text": ln} for ln in note.get("lines", [])]
        if not lines:
            continue
        if note.get("style") == "big":
            big = nt["big"]
            spec = []
            for i, ln in enumerate(lines):
                size, _ = fit_size(sanitize(ln["text"]), big["font"], big["size"] * k, 0.94 * W, 40 * k)
                spec.append({"text": sanitize(ln["text"]), "font": big["font"], "size": size, "dy": i * size * 1.15})
            d = draw_lines(spec, k, look, align="center", emoji_scale=big["emoji_scale"])
            place(d, W / 2, note.get("center_y", big["center_y"]) * H)
            g = hk["ghost"]
            layers.append(Layer(d["ghost"], s, e, nt["anim_in"], nt["anim_out"], nt["blur_in"] * k, z=20,
                                ghost=(g["delay"], g["slide"], g["dx"] * k * 0.3, g["dy"] * k)))
            layers.append(Layer(d["text"], s, e, nt["anim_in"], nt["anim_out"], nt["blur_in"] * k, z=21))
            if d["emoji"]:
                layers.append(Layer(d["emoji"], s, e, nt["anim_in"], nt["anim_out"], nt["blur_in"] * k, z=22))
            continue
        align = note.get("align") or ("left" if any(graphics.split_runs(l["text"])[0][0] for l in lines) else "center")
        size = nt["size"] * k * note.get("scale", 1.0)
        maxw = nt["max_width"] * k if align == "center" else W - nt["x_left"] * k - 30 * k
        for ln in lines:
            size = min(size, fit_size(sanitize(ln["text"]), nt["font"], size, maxw, 34 * k)[0])
        pitch = size * nt["line_pitch"]
        top = note.get("bottom_y", nt["bottom_y"]) * H - (len(lines) - 1) * pitch
        for i, ln in enumerate(lines):
            at = max(s, float(ln.get("at", s)))
            d = draw_lines([{"text": sanitize(ln["text"]), "font": nt["font"], "size": size, "dy": 0,
                             "strike": "strike_at" in ln}], k, look, align=align, emoji_scale=nt["emoji_scale"])
            place(d, W / 2 if align == "center" else nt["x_left"] * k, top + i * pitch)
            layers.append(Layer(d["text"], at, e, nt["anim_in"], nt["anim_out"], nt["blur_in"] * k, z=24))
            if d["emoji"]:
                layers.append(Layer(d["emoji"], at, e, nt["anim_in"], nt["anim_out"], nt["blur_in"] * k, z=25))
            for st in d["strikes"]:
                t0 = max(at, float(ln["strike_at"]))
                layers.append(Layer(st["sprite"], t0, e, 0.01, nt["anim_out"], 0, z=26,
                                    xclip=(t0, nt["strike_anim"], st["x0"], st["x1"])))

    # --- cảnh báo chồng lấn vùng hook / ghi chú
    if hook and hook.get("lines"):
        for note in plan.get("notes") or []:
            if note["start"] < hook["end"] and note["end"] > hook.get("start", 0):
                warnings.append(f"Ghi chú {note['start']:.2f}s trùng thời gian với tiêu đề mở đầu (cùng vùng giữa khung)")
    layers.sort(key=lambda l: l.z)
    return layers, warnings


def transitions(plan, style):
    tr = style["transition"]
    times = [0.0] if plan.get("intro_blur", True) else []
    for sec in plan.get("sections") or []:
        if sec.get("transition", True) and float(sec["start"]) > 0.3:
            times.append(float(sec["start"]))
    return [(t, tr["duration"], tr["blur"], tr["zoom"]) for t in times]


def apply_transition(frame, t, trs, k):
    for t0, d, blur, zoom in trs:
        if t0 <= t < t0 + d:
            p = (t - t0) / d
            z = 1 + (zoom - 1) * (1 - ease(p))
            if z > 1.001:
                H, W = frame.shape[:2]
                cw, ch = int(W / z), int(H / z)
                x0, y0 = (W - cw) // 2, int((H - ch) * 0.42)
                frame = cv2.resize(frame[y0:y0 + ch, x0:x0 + cw], (W, H), interpolation=cv2.INTER_LINEAR)
            sigma = blur * k * (1 - p) ** 1.6
            if sigma > 0.4:
                frame = cv2.GaussianBlur(frame, (0, 0), sigma)
            return np.ascontiguousarray(frame)
    return frame


# ----------------------------------------------------------------------------- ffmpeg
def _has_filter(name):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return f" {name} " in out


def decoder_cmd(plan, W, H):
    info = plan["video"]
    sel = "+".join(f"between(n,{sf},{ef - 1})" for sf, ef in plan["segments_frames"])
    chain = ""
    if info.get("hdr"):
        if _has_filter("zscale"):
            chain = ("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,"
                     "zscale=t=bt709:m=bt709:r=tv,format=yuv420p,")
        else:
            print("[render] CẢNH BÁO: video HDR nhưng ffmpeg thiếu zscale – màu có thể bị nhạt.")
    chain += (f"setpts=PTS-STARTPTS,fps={info['fps_str']},select='{sel}',setpts=N/FRAME_RATE/TB,"
              f"scale={W}:{H}:in_color_matrix=bt709:out_color_matrix=bt709:"
              f"flags=lanczos+accurate_rnd+full_chroma_int,format=rgb24")
    return ["ffmpeg", "-v", "error", "-i", plan["input"], "-map", "0:v:0", "-filter_script:v", None,
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], chain


def render(plan_path, output, style, preview=False, keep_temp=False):
    with open(plan_path, encoding="utf-8") as f:
        plan = json.load(f)
    info = plan["video"]
    W, H, fps = info["width"], info["height"], info["fps"]
    k = min(W / style["reference_width"], H / style["reference_height"])
    work = os.path.join(os.path.dirname(os.path.abspath(plan_path)), "render_tmp")
    os.makedirs(work, exist_ok=True)
    frame_segs = [tuple(s) for s in plan["segments_frames"]]
    n_frames = sum(ef - sf for sf, ef in frame_segs)
    dur = n_frames / fps
    plan["duration"] = dur

    t0 = time.time()
    layers, warnings = build_layers(plan, style, W, H)
    for w in warnings:
        print("[render] CẢNH BÁO:", w)
    trs = transitions(plan, style)

    # --- âm thanh đã cắt + đo độ lớn cho chuẩn hoá tuyến tính
    samples = media.read_audio(plan["input"], info["sample_rate"], info["channels"])
    audio = cut.assemble_audio(samples, info["sample_rate"], fps, frame_segs, style["silence"]["audio_fade_ms"],
                               info.get("av_offset", 0.0))
    audio_path = os.path.join(work, "voice.f32")
    audio.astype(np.float32).tofile(audio_path)
    acfg = style["audio"]
    af = f"highpass=f={acfg['highpass_hz']}"
    if acfg.get("loudnorm", True):
        m = media.measure_loudness(audio_path, info["sample_rate"], info["channels"], acfg["highpass_hz"])
        if m and m.get("input_i") not in (None, "-inf"):
            af += (f",loudnorm=I={acfg['target_lufs']}:TP={acfg['true_peak']}:LRA=11:"
                   f"measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
                   f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    af += ",aresample=48000"

    # --- giải mã / mã hoá
    dec, chain = decoder_cmd(plan, W, H)
    script = os.path.join(work, "decode_filter.txt")
    with open(script, "w") as f:
        f.write(chain)
    dec[dec.index(None)] = script
    enc_cfg = style["encode"]
    vcodec = ["-c:v", enc_cfg["codec"], "-crf", str(24 if preview else enc_cfg["crf"]),
              "-preset", "ultrafast" if preview else enc_cfg["preset"]]
    if enc_cfg["codec"] == "libx264":
        vcodec += ["-profile:v", "high"]
    enc = (["ffmpeg", "-hide_banner", "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", info["fps_str"], "-i", "-",
            "-f", "f32le", "-ar", str(info["sample_rate"]), "-ac", str(info["channels"]), "-i", audio_path,
            "-map", "0:v", "-map", "1:a",
            "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p"]
           + vcodec +
           ["-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-color_range", "tv", "-af", af, "-c:a", "aac", "-b:a", enc_cfg["audio_bitrate"],
            "-t", f"{dur:.4f}", "-movflags", "+faststart", output])

    print(f"[render] Dựng {output}: {W}x{H} @ {info['fps_str']}, {n_frames} khung ({dur:.1f}s), "
          f"{len(layers)} lớp chữ, {len(trs)} chuyển cảnh (gồm hiệu ứng mở đầu)", flush=True)
    pd = subprocess.Popen(dec, stdout=subprocess.PIPE)
    pe = subprocess.Popen(enc, stdin=subprocess.PIPE)
    fsize = W * H * 3
    q = queue.Queue(maxsize=8)

    def reader():
        while True:
            buf = pd.stdout.read(fsize)
            if len(buf) < fsize:
                q.put(None)
                return
            q.put(buf)

    threading.Thread(target=reader, daemon=True).start()
    last, ended, missing = None, False, 0
    try:
        for i in range(n_frames):
            buf = None if ended else q.get()
            if buf is not None:
                frame = np.frombuffer(buf, np.uint8).reshape(H, W, 3).copy()
                last = frame
            else:
                ended = True
                if last is None:
                    raise SystemExit("Không giải mã được khung hình nào từ video gốc.")
                frame = last.copy()  # thiếu khung cuối (hiếm) -> lặp khung trước
                missing += 1
            t = i / fps
            frame = apply_transition(frame, t, trs, k)
            for layer in layers:
                if layer.start <= t < layer.end:
                    for sp, a, b, dx, dy, clip in layer.states(t):
                        blend(frame, sp, a, b, dx, dy, clip)
            pe.stdin.write(frame.tobytes())
            if i % int(fps * 5) == 0:
                print(f"[render]   {t:5.1f}s / {dur:.1f}s", flush=True)
    finally:
        pe.stdin.close()
        pe.wait()
        pd.kill()
        pd.wait()
    if pe.returncode != 0:
        raise SystemExit(f"ffmpeg mã hoá lỗi (mã {pe.returncode}). Xem {work}")
    if missing:
        print(f"[render] CẢNH BÁO: thiếu {missing} khung cuối từ bộ giải mã – đã lặp khung trước đó.")
    if not keep_temp:
        for name in os.listdir(work):
            os.remove(os.path.join(work, name))
        os.rmdir(work)
    print(f"[render] Xong: {output} ({time.time() - t0:.0f}s)")
    return output


def stills(plan_path, times, out_path, style, width=360, cols=4):
    cols = max(1, min(cols, len(times)))
    """Ảnh xem nhanh tại các thời điểm (giây, sau cắt) – không cần render cả video."""
    from PIL import Image, ImageDraw

    with open(plan_path, encoding="utf-8") as f:
        plan = json.load(f)
    info = plan["video"]
    W, H, fps = info["width"], info["height"], info["fps"]
    k = min(W / style["reference_width"], H / style["reference_height"])
    frame_segs = [tuple(s) for s in plan["segments_frames"]]
    plan["duration"] = sum(ef - sf for sf, ef in frame_segs) / fps
    layers, warnings = build_layers(plan, style, W, H)
    for w in warnings:
        print("[still] CẢNH BÁO:", w)
    trs = transitions(plan, style)
    tiles = []
    for t in times:
        i = int(round(t * fps))
        src_n, acc = None, 0
        for sf, ef in frame_segs:
            if i < acc + (ef - sf):
                src_n = sf + (i - acc)
                break
            acc += ef - sf
        if src_n is None:
            continue
        _, chain = decoder_cmd(dict(plan, segments_frames=[(src_n, src_n + 1)]), W, H)
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", plan["input"], "-map", "0:v:0", "-vf", chain,
                              "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                             capture_output=True, check=True).stdout
        frame = np.frombuffer(raw[:W * H * 3], np.uint8).reshape(H, W, 3).copy()
        frame = apply_transition(frame, t, trs, k)
        for layer in layers:
            if layer.start <= t < layer.end:
                for sp, a, b, dx, dy, clip in layer.states(t):
                    blend(frame, sp, a, b, dx, dy, clip)
        im = Image.fromarray(frame)
        if len(times) == 1:
            im.save(out_path)
            return out_path
        im = im.resize((width, int(H * width / W)), Image.LANCZOS)
        ImageDraw.Draw(im).text((6, 4), f"{t:.2f}s", fill=(255, 0, 0))
        tiles.append(im)
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tiles[0].width, rows * tiles[0].height), (0, 0, 0))
    for j, im in enumerate(tiles):
        sheet.paste(im, ((j % cols) * im.width, (j // cols) * im.height))
    sheet.save(out_path, quality=90)
    return out_path
