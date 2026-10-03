"""Bước RENDER: dựng toàn bộ video trong MỘT lần mã hoá (cắt + zoom + b-roll + tiêu đề + phụ đề + âm thanh)."""
import json
import os
import subprocess

from . import cut, graphics, media
from .captions import split_lines


def _even(x):
    return max(2, int(round(x / 2)) * 2)


def _ranges_expr(ranges, var="t"):
    return "+".join(f"between({var},{a:.4f},{b:.4f})" for a, b in ranges) or "0"


def _ov_prep(chain):
    """Chuyển lớp RGBA sang YUV theo chuẩn màu BT.709 để màu đồ hoạ không bị lệch."""
    return f"{chain},scale=out_color_matrix=bt709:out_range=tv,format=yuva420p"


def render(plan_path, output, style, keep_temp=False, preview=False):
    with open(plan_path, encoding="utf-8") as f:
        plan = json.load(f)
    info = plan["video"]
    W, H, fps = info["width"], info["height"], info["fps"]
    k = W / style["reference_width"]
    work = os.path.join(os.path.dirname(os.path.abspath(plan_path)), "render_tmp")
    os.makedirs(work, exist_ok=True)
    dur = plan["duration"]
    frame_segs = [tuple(s) for s in plan["segments_frames"]]

    # ---------------------------------------------------------------- âm thanh đã cắt
    samples = media.read_audio(plan["input"], info["sample_rate"], info["channels"])
    audio = cut.assemble_audio(samples, info["sample_rate"], fps, frame_segs, style["silence"]["audio_fade_ms"],
                               info.get("av_offset", 0.0))
    audio_path = os.path.join(work, "voice.f32")
    audio.astype("float32").tofile(audio_path)

    inputs = ["-i", plan["input"],
              "-f", "f32le", "-ar", str(info["sample_rate"]), "-ac", str(info["channels"]), "-i", audio_path]
    graph = []
    n_in = 2

    # ---------------------------------------------------------------- hình: cắt khoảng lặng
    sel = "+".join(f"between(n,{sf},{ef - 1})" for sf, ef in frame_segs)
    zoom = plan.get("zoom") or [{"start": 0, "end": dur, "level": 1.0}]
    levels = sorted({round(z["level"], 3) for z in zoom} | {1.0})
    graph.append(
        f"[0:v]setpts=PTS-STARTPTS,fps={info['fps_str']},select='{sel}',setpts=N/FRAME_RATE/TB,"
        f"scale={W}:{H}:flags=lanczos,setsar=1,format=yuv420p,split={len(levels)}"
        + "".join(f"[lv{i}]" for i in range(len(levels)))
    )

    # ---------------------------------------------------------------- punch-in zoom về phía khuôn mặt
    fx, fy = plan.get("face") or style["zoom"]["default_face"]
    cur = "lv0"
    for i, lv in enumerate(levels):
        if lv == 1.0:
            continue
        cw, ch = _even(W / lv), _even(H / lv)
        x, y = int(fx * (W - cw)), int(fy * (H - ch))
        ranges = [(z["start"], z["end"] - 0.5 / fps) for z in zoom if round(z["level"], 3) == lv]
        graph.append(f"[lv{i}]crop={cw}:{ch}:{x}:{y},scale={W}:{H}:flags=lanczos,setsar=1[zl{i}]")
        graph.append(f"[{cur}][zl{i}]overlay=0:0:enable='{_ranges_expr(ranges)}'[zo{i}]")
        cur = f"zo{i}"

    def add_png(img, name, start, end, fades):
        nonlocal n_in, cur
        path = os.path.join(work, name)
        img.save(path, optimize=False, compress_level=1)
        length = max(0.05, end - start)
        inputs.extend(["-loop", "1", "-framerate", info["fps_str"], "-t", f"{length:.4f}", "-i", path])
        chain = f"[{n_in}:v]format=rgba"
        for kind, st, d in fades:
            chain += f",fade=t={kind}:st={st:.3f}:d={d:.3f}:alpha=1"
        chain += f",setpts=PTS-STARTPTS+{start:.4f}/TB"
        graph.append(_ov_prep(chain) + f"[p{n_in}]")
        graph.append(f"[{cur}][p{n_in}]overlay=0:0:eof_action=pass:enable='between(t,{start:.4f},{end:.4f})'[o{n_in}]")
        cur = f"o{n_in}"
        n_in += 1

    # ---------------------------------------------------------------- ảnh minh hoạ dải trên
    bcfg = style["broll"]
    for j, b in enumerate(plan.get("broll") or []):
        if not os.path.exists(b["file"]):
            print(f"[render] Bỏ qua b-roll không tồn tại: {b['file']}")
            continue
        s, e = float(b["start"]), min(float(b["end"]), dur)
        f = min(bcfg["fade"], (e - s) / 3)
        add_png(graphics.broll_image(b["file"], W, H, bcfg), f"broll_{j}.png", s, e,
                [("in", 0, f), ("out", e - s - f, f)])

    # ---------------------------------------------------------------- tiêu đề bong bóng mở đầu
    hook = plan.get("hook")
    hcfg = style["hook"]
    if hook and hook.get("text"):
        bubble, sharp, blurred = graphics.hook_images(hook, W, H, hcfg, k, split_lines)
        hs, he = float(hook.get("start", 0)), float(hook["end"])
        a = hcfg["anim"]
        L = he - hs
        add_png(bubble, "hook_bubble.png", hs, he, [("in", 0, a["bubble_fade"]), ("out", L - a["fade_out"], a["fade_out"])])
        add_png(blurred, "hook_blur.png", hs, hs + a["blur_out"] + 0.02, [("out", 0, a["blur_out"])])
        add_png(sharp, "hook_text.png", hs, he, [("in", a["sharp_in_start"], a["sharp_in"]), ("out", L - a["fade_out"], a["fade_out"])])

    # ---------------------------------------------------------------- phụ đề chạy (1 luồng ảnh ghép)
    ccfg = style["captions"]
    caps = [c for c in plan.get("captions") or [] if c.get("text")]
    if hook and hook.get("text") and not hook.get("show_captions", False):
        caps = [dict(c, start=max(c["start"], hook["end"])) for c in caps if c["end"] > hook["end"] + 0.15]
    if caps:
        blank_path = os.path.join(work, "cap_blank.png")
        graphics.blank(W, H).save(blank_path)
        lines = ["ffconcat version 1.0"]
        t = 0.0
        for i, c in enumerate(sorted(caps, key=lambda c: c["start"])):
            start = max(c["start"], t)
            end = min(c["end"], dur)
            if end - start < 0.04:
                continue
            if start > t + 1e-3:
                lines += [f"file '{blank_path}'", f"duration {start - t:.4f}"]
            text_lines = graphics.caption_lines(c["text"], ccfg, k, split_lines)
            p = os.path.join(work, f"cap_{i:04d}.png")
            graphics.caption_image(text_lines, W, H, ccfg, k).save(p, compress_level=1)
            lines += [f"file '{p}'", f"duration {end - start:.4f}"]
            t = end
        lines += [f"file '{blank_path}'", f"duration {max(0.1, dur - t + 1):.4f}", f"file '{blank_path}'"]
        cpath = os.path.join(work, "captions.ffconcat")
        with open(cpath, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        inputs.extend(["-f", "concat", "-safe", "0", "-i", cpath])
        graph.append(_ov_prep(f"[{n_in}:v]format=rgba") + "[cap]")
        graph.append(f"[{cur}][cap]overlay=0:0:eof_action=repeat[ocap]")
        cur = "ocap"
        n_in += 1

    graph.append(f"[{cur}]format=yuv420p[vout]")

    # ---------------------------------------------------------------- âm thanh: lọc, nhạc nền, chuẩn âm lượng
    acfg = style["audio"]
    achain = f"[1:a]highpass=f={acfg['highpass_hz']}"
    music = plan.get("music")
    if music and os.path.exists(music.get("file", "")):
        inputs.extend(["-stream_loop", "-1", "-i", music["file"]])
        graph.append(achain + "[voice]")
        mdb = music.get("db", acfg["music_db"])
        graph.append(f"[{n_in}:a]aformat=sample_rates={info['sample_rate']}:channel_layouts=stereo,"
                     f"volume={mdb}dB,atrim=0:{dur:.3f},afade=t=out:st={max(0, dur - 1.5):.3f}:d=1.5[mus]")
        graph.append("[voice]asplit[v1][v2]")
        graph.append("[mus][v2]sidechaincompress=threshold=0.05:ratio=6:attack=20:release=400[duck]")
        graph.append("[v1][duck]amix=inputs=2:duration=first:normalize=0[mixed]")
        achain = "[mixed]anull"
        n_in += 1
    if acfg.get("loudnorm", True):
        achain += f",loudnorm=I={acfg['target_lufs']}:TP={acfg['true_peak']}:LRA=11"
    achain += ",aresample=48000[aout]"
    graph.append(achain)

    script = os.path.join(work, "filter_graph.txt")
    with open(script, "w", encoding="utf-8") as f:
        f.write(";\n".join(graph))

    enc = style["encode"]
    vcodec = ["-c:v", enc["codec"], "-crf", str(enc["crf"] + (8 if preview else 0)),
              "-preset", "veryfast" if preview else enc["preset"]]
    if enc["codec"] == "libx264":
        vcodec += ["-profile:v", "high"]
    elif enc["codec"] == "libx265":
        vcodec += ["-tag:v", "hvc1"]
    cmd = (["ffmpeg", "-hide_banner", "-y", "-loglevel", "error"] + inputs +
           ["-filter_complex_script", script, "-map", "[vout]", "-map", "[aout]"] + vcodec +
           ["-pix_fmt", "yuv420p", "-r", info["fps_str"],
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-c:a", "aac", "-b:a", enc["audio_bitrate"], "-t", f"{dur:.3f}",
            "-movflags", "+faststart", output])
    print(f"[render] Đang dựng {output} ({dur:.1f}s)...", flush=True)
    subprocess.run(cmd, check=True)
    if not keep_temp:
        for name in os.listdir(work):
            os.remove(os.path.join(work, name))
        os.rmdir(work)
    print(f"[render] Xong: {output}")
    return output
