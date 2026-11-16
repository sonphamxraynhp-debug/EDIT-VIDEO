"""Pipeline D: timeline JSON → FFmpeg → MP4 atomic + SRT + thumbnail + manifest (M06/M07/M09).

Phụ đề/tiêu đề được vẽ thành PNG bằng Pillow rồi overlay, nên không phụ thuộc libass/freetype.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import textwrap
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

from . import config, looks
from .errors import AppError

PROFILES = {
    "preview": {"scale": 0.5, "crf": 30, "preset": "veryfast", "fps": 30, "watermark": "DRAFT"},
    "final": {"scale": 1.0, "crf": 20, "preset": "medium", "fps": 30, "watermark": None},
}
CANVAS = {"9:16": (1080, 1920), "1:1": (1080, 1080), "16:9": (1920, 1080), "4:5": (1080, 1350)}


def font(size: int, path: str | None = None) -> ImageFont.FreeTypeFont:
    if path and str(path).startswith("font:"):            # font trong thư viện phong cách (avf/fonts)
        return looks.font(str(path)[5:], size)
    for p in ([path] if path else []) + list(config.FONT_CANDIDATES):
        if p and Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()          # M08: fallback khi thiếu font


CAPTION_Y = {"low": 0.70, "mid": 0.58, "panel": 0.80}
TIKTOK_BOTTOM = 0.74       # chữ phải kết thúc trên mốc này để không bị caption/icon TikTok che


def _ui_overlap(w: int, h: int, y_top: int, y_bottom: int, x_right: int) -> bool:
    from . import policy
    return policy.text_in_tiktok_ui(y_top / h, y_bottom / h, x_right / w)


def _hex(c: str, alpha: int = 255) -> tuple:
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def safe_zone(w: int, h: int, pct: float) -> tuple[int, int, int, int]:
    """Vùng an toàn tránh UI TikTok/Reels: lề trái/phải pct, đáy 20%, đỉnh 12% (M06-08)."""
    mx = int(w * pct)
    return mx, int(h * 0.12), w - mx, int(h * 0.80)


def draw_text_png(out: Path, w: int, h: int, text: str, style: dict, kind: str) -> dict:
    """Vẽ một PNG trong suốt cỡ canvas. Trả về thông tin overflow để QC (M10-07 overflow text)."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = safe_zone(w, h, style.get("safe_margin", 0.08))
    if style.get("tiktok_safe"):
        x1 = min(x1, int(w * 0.85))          # chừa cột icon bên phải của TikTok
    max_lines = int(style.get("max_lines", 2))
    if kind == "caption":
        size = int(style.get("font_size", 54) * w / 1080)
        floor = int(size * 0.72)
        while True:                                  # câu dài: thu chữ dần, rồi cho thêm một dòng, cùng lắm mới cắt
            f = font(size, style.get("font"))
            avg = d.textlength("abcdefghij", font=f) / 10
            lines = textwrap.wrap(text, width=max(8, int((x1 - x0) / avg)))
            if len(lines) <= max_lines or size <= floor:
                break
            size = max(floor, int(size * 0.92))
        if len(lines) == max_lines + 1:
            max_lines += 1
        overflow = len(lines) > max_lines
        if overflow:
            lines = lines[:max_lines]
            lines[-1] = lines[-1].rstrip(" ,.") + "…"
        line_h = int(size * 1.25)
        cy = style.get("caption_y")
        cy = cy if isinstance(cy, (int, float)) else CAPTION_Y.get(str(cy or "low"), 0.70)
        y = int(h * cy) - line_h * len(lines) // 2
        y = max(y0, min(y, y1 - line_h * len(lines)))
        if style.get("tiktok_safe"):
            y = min(y, int(h * TIKTOK_BOTTOM) - line_h * len(lines))
        hl = [k.lower() for k in style.get("highlight_words", [])]
        top, max_right = y, 0
        for line in lines:
            lw = d.textlength(line, font=f)
            x = x0 + (x1 - x0 - lw) / 2
            if style.get("box"):
                pad = size * 0.25
                d.rounded_rectangle([x - pad, y - pad * 0.4, x + lw + pad, y + line_h - pad * 0.2], radius=int(pad),
                                    fill=_hex(style.get("box_color", "#000000"), 150))
            max_right = max(max_right, int(x + lw))
            for word in line.split(" "):
                color = style.get("highlight_color", "#FFD700") if word.lower().strip(",.!?") in hl else style.get("color", "#FFFFFF")
                d.text((x, y), word, font=f, fill=_hex(color), stroke_width=int(style.get("stroke", 3) * w / 1080),
                       stroke_fill=_hex(style.get("stroke_color", "#000000")))
                x += d.textlength(word + " ", font=f)
            y += line_h
        img.save(out)
        return {"overflow": overflow, "lines": len(lines), "ui_overlap": _ui_overlap(w, h, top, y, max_right)}
    # title/callout/cta
    size = int((64 if kind == "hook" else 46) * w / 1080)
    f = font(size, style.get("font"))
    lines = textwrap.wrap(text, width=18 if kind == "hook" else 24)[:3]
    accent = _hex(style.get("accent", "#7B56FF"))
    y = y0 + int(h * 0.04) if kind != "cta" else int(h * 0.56)
    top, max_right = y, 0
    for line in lines:
        lw = d.textlength(line, font=f)
        while lw > (x1 - x0) * 0.92 and size > 24:      # thu chữ cho vừa vùng an toàn
            size = int(size * 0.9)
            f = font(size, style.get("font"))
            lw = d.textlength(line, font=f)
        x = x0 + (x1 - x0 - lw) / 2
        pad = size * 0.35
        max_right = max(max_right, int(x + lw + pad))
        d.rounded_rectangle([x - pad, y - pad * 0.5, x + lw + pad, y + size * 1.15], radius=int(pad * 0.8), fill=accent)
        d.text((x, y), line, font=f, fill=(255, 255, 255, 255))
        y += int(size * 1.6)
    img.save(out)
    return {"overflow": False, "lines": len(lines), "ui_overlap": _ui_overlap(w, h, top, y, max_right)}


def logo_png(out: Path, w: int, h: int, logo: str) -> bool:
    """Logo thương hiệu góc trên trái, trong safe zone (rộng 16% khung)."""
    try:
        lg = Image.open(logo).convert("RGBA")
    except Exception:  # noqa: BLE001 — logo hỏng thì bỏ qua, không làm fail render
        return False
    tw = int(w * 0.16)
    lg = lg.resize((tw, max(1, int(lg.height * tw / lg.width))))
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img.paste(lg, (int(w * 0.06), int(h * 0.11)), lg)
    img.save(out)
    return True


def outro_png(out: Path, w: int, h: int, text: str, style: dict) -> None:
    """Thẻ kết 1.8s: nền màu thương hiệu, logo (nếu có), CTA."""
    img = Image.new("RGBA", (w, h), _hex(style.get("dark", "#1B2440")))
    d = ImageDraw.Draw(img)
    y = int(h * 0.40)
    if style.get("logo"):
        try:
            lg = Image.open(style["logo"]).convert("RGBA")
            tw = int(w * 0.34)
            lg = lg.resize((tw, max(1, int(lg.height * tw / lg.width))))
            img.paste(lg, ((w - tw) // 2, y - lg.height - int(h * 0.03)), lg)
        except Exception:  # noqa: BLE001
            pass
    f = font(int(w * 0.062), style.get("font"))
    for line in textwrap.wrap(text, width=20)[:3]:
        lw = d.textlength(line, font=f)
        pad = int(w * 0.03)
        d.rounded_rectangle([(w - lw) / 2 - pad, y - pad // 2, (w + lw) / 2 + pad, y + int(w * 0.075)], radius=pad,
                            fill=_hex(style.get("accent", "#7B56FF")))
        d.text(((w - lw) / 2, y), line, font=f, fill=(255, 255, 255, 255))
        y += int(w * 0.10)
    img.save(out)


def watermark_png(out: Path, w: int, h: int, text: str) -> None:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font(int(w * 0.16))
    tw = d.textlength(text, font=f)
    d.text(((w - tw) / 2, h * 0.42), text, font=f, fill=(255, 255, 255, 70), stroke_width=2, stroke_fill=(0, 0, 0, 70))
    img.save(out)


def srt_time(ms: int) -> str:
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(captions: list[dict]) -> str:
    return "\n".join(f"{i}\n{srt_time(c['start_ms'])} --> {srt_time(c['end_ms'])}\n{c['text']}\n"
                     for i, c in enumerate(captions, 1))


def _motion_vf(motion: str, W: int, H: int, dur: float) -> str:
    cover = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"
    # Tính cả w và h, làm tròn chẵn và không nhỏ hơn khung cắt: h=-2 có thể làm tròn xuống dưới H ở cuối cảnh
    # → swscale assert "desc" (gặp với khung 540×632 của bố cục packshot_text bản preview)
    def zoom(f: str) -> str:
        return (f",scale=w='max({W},trunc({W}*({f})/2)*2)':h='max({H},trunc({H}*({f})/2)*2)':eval=frame,"
                f"crop={W}:{H}:x='(iw-{W})/2':y='(ih-{H})/2'")
    if motion == "zoom_in":
        return cover + zoom(f"1+0.08*t/{dur:.2f}")
    if motion == "zoom_out":
        return cover + zoom(f"1.08-0.08*t/{dur:.2f}")
    if motion in ("pan_left", "pan_right"):
        big = int(W * 1.12) // 2 * 2
        direction = f"(iw-{W})*t/{dur:.2f}" if motion == "pan_left" else f"(iw-{W})*(1-t/{dur:.2f})"
        return f"scale={big}:{H}:force_original_aspect_ratio=increase,crop={big}:{H}," \
               f"crop={W}:{H}:x='{direction}':y=0"
    return cover


def _run_ffmpeg(cmd: list[str], total_ms: int, on_progress: Callable[[float], None] | None,
                should_stop: Callable[[], bool] | None) -> None:
    p = subprocess.Popen(cmd + ["-progress", "pipe:1", "-nostats"], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         text=True)
    err_tail: list[str] = []
    assert p.stdout
    for line in p.stdout:
        if should_stop and should_stop():
            p.kill()
            raise AppError("RENDER_CANCELLED", "Job đã bị dừng", retryable=False)
        m = re.match(r"out_time_us=(\d+)", line)
        if m and on_progress and total_ms:
            on_progress(min(1.0, int(m.group(1)) / 1000 / total_ms))
    p.wait()
    if p.stderr:
        err_tail = p.stderr.read().splitlines()[-8:]
    if p.returncode != 0:
        raise AppError("FFMPEG_FAILED", "FFmpeg dựng video lỗi", details={"stderr": "\n".join(err_tail)}, retryable=True)


def render_timeline(timeline: dict, assets: dict[str, Path], out_path: Path, work: Path, profile_name: str = "final",
                    style: dict | None = None, encoder: str = "libx264",
                    on_progress: Callable[[float], None] | None = None,
                    should_stop: Callable[[], bool] | None = None) -> dict:
    prof = PROFILES[profile_name]
    style = style or {}
    look = style.get("look")              # phong cách edit đã ghép (looks.resolve); None = cách dựng cũ
    cw, ch = timeline["canvas"]["width"], timeline["canvas"]["height"]
    W, H = int(cw * prof["scale"]) // 2 * 2, int(ch * prof["scale"]) // 2 * 2
    fps = prof["fps"]
    tracks = timeline["tracks"]
    total_ms = int(timeline["duration_ms"])
    if total_ms <= 0 or not tracks["video"]:
        raise AppError("TIMELINE_EMPTY", "Timeline chưa có cảnh để dựng", hint="Tạo storyboard trước.")
    if shutil.disk_usage(out_path.parent).free / 1e9 < config.MIN_FREE_DISK_GB:
        raise AppError("DISK_LOW", "Ổ đĩa sắp đầy, dừng render an toàn", retryable=True,
                       hint=f"Giải phóng ít nhất {config.MIN_FREE_DISK_GB} GB.")
    work.mkdir(parents=True, exist_ok=True)

    # 1) dựng từng segment video (không audio)
    seg_files = []
    for i, clip in enumerate(tracks["video"]):
        src = assets.get(clip["asset_id"])
        if not src or not Path(src).exists():
            raise AppError("ASSET_MISSING", f"Thiếu file nguồn cho cảnh {i + 1}", retryable=False,
                           hint="Kiểm tra lại thư viện tư liệu; job cần can thiệp thủ công.")
        dur = (clip["end_ms"] - clip["start_ms"]) / 1000
        seg = work / f"seg_{i:03d}.mp4"
        tail = (looks.segment_vf(look, i, W, H) if look else "") + f",fps={fps},setpts=PTS-STARTPTS,setsar=1,format=yuv420p"
        loop = ["-stream_loop", "-1"] if clip.get("loop") else []
        main_in = [*loop, "-ss", f"{clip['src_in_ms'] / 1000:.3f}", "-i", str(src)]
        layout = clip.get("layout", "full")
        alt = clip.get("alt")
        alt_src = assets.get(alt["asset_id"]) if alt else None
        if layout in ("split", "pip") and alt_src and Path(alt_src).exists():
            alt_in = ["-stream_loop", "-1", "-ss", f"{alt['src_in_ms'] / 1000:.3f}", "-i", str(alt_src)]
            if layout == "split":                      # trên: cảnh chính, dưới: cảnh phụ (một cảnh khác)
                hh = H // 2 // 2 * 2
                fc = (f"[0:v]{_motion_vf(clip.get('motion', 'none'), W, hh, dur)}[a];"
                      f"[1:v]scale={W}:{hh}:force_original_aspect_ratio=increase,crop={W}:{hh}[b];"
                      f"[a][b]vstack{tail}[v]")
            else:                                      # pip: cảnh phụ nhỏ góc trên phải, trong safe zone
                pw = int(W * 0.36) // 2 * 2
                fc = (f"[0:v]{_motion_vf(clip.get('motion', 'none'), W, H, dur)}[a];"
                      f"[1:v]scale={pw}:-2[b];[a][b]overlay=x={W - pw - int(W * 0.06)}:y={int(H * 0.11)}{tail}[v]")
            cmd = [config.FFMPEG, "-y", "-v", "error", *main_in, *alt_in, "-t", f"{dur:.3f}", "-an",
                   "-filter_complex", fc, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", str(seg)]
        elif layout == "packshot_text":                # video 66% trên, panel màu thương hiệu 34% dưới cho chữ
            ph = int(H * 0.66) // 2 * 2
            vf = _motion_vf(clip.get("motion", "none"), W, ph, dur) + \
                f",pad={W}:{H}:0:0:color={style.get('dark', '#1B2440')}" + tail
            cmd = [config.FFMPEG, "-y", "-v", "error", *main_in, "-t", f"{dur:.3f}", "-an", "-vf", vf,
                   "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", str(seg)]
        else:
            vf = _motion_vf(clip.get("motion", "none"), W, H, dur) + tail
            cmd = [config.FFMPEG, "-y", "-v", "error", *main_in, "-t", f"{dur:.3f}", "-an", "-vf", vf,
                   "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", str(seg)]
        _run_ffmpeg(cmd, 0, None, should_stop)
        seg_files.append(seg)
        if on_progress:
            on_progress(0.5 * (i + 1) / len(tracks["video"]))
    outro = style.get("outro") or {}
    outro_ms = 0
    if outro.get("enabled") and outro.get("text"):      # thẻ kết thương hiệu (Brand Kit)
        op = work / "outro.png"
        outro_png(op, W, H, outro["text"], style)
        seg = work / "seg_outro.mp4"
        outro_ms = 1800
        _run_ffmpeg([config.FFMPEG, "-y", "-v", "error", "-loop", "1", "-framerate", str(fps), "-i", str(op),
                     "-t", f"{outro_ms / 1000:.3f}", "-vf", f"fps={fps},format=yuv420p", "-c:v", "libx264",
                     "-preset", "veryfast", "-crf", "18", str(seg)], 0, None, should_stop)
        seg_files.append(seg)
    content_ms = total_ms
    total_ms += outro_ms
    lst = work / "concat.txt"
    lst.write_text("\n".join(f"file '{Path(s).as_posix().replace(chr(39), chr(39) + chr(92) + chr(39) * 2)}'"
                             for s in seg_files), encoding="utf-8")     # concat demuxer: đường dẫn kiểu POSIX kể cả trên Windows

    # 2) overlay PNG: tiêu đề, phụ đề, logo, watermark
    overlays: list[tuple[Path, int, int]] = []
    qc_text = {"overflow": 0, "ui_overlap": 0}
    layout = timeline.get("layout", "full")
    cap_pos = "panel" if layout == "packshot_text" else style.get("caption_position", "low")
    cap_style = {"safe_margin": style.get("safe_margin", 0.08), "font": style.get("font"), "caption_y": cap_pos,
                 "tiktok_safe": style.get("tiktok_safe", False), **style.get("caption", {})}
    title_style = {"accent": style.get("accent", "#7B56FF"), "font": style.get("font")}
    for j, t in enumerate(tracks.get("titles", [])):
        p = work / f"title_{j:03d}.png"
        info = draw_text_png(p, W, H, t["text"], title_style, t.get("style", "callout"))
        qc_text["ui_overlap"] += int(info.get("ui_overlap", False))
        overlays.append((p, t["start_ms"], t["end_ms"]))
    cap_list = None
    if look and tracks.get("captions"):     # phụ đề theo kiểu đã chọn: một luồng ảnh duy nhất, chạy chữ theo từng từ
        cy = cap_style.get("caption_y")
        cy = cy if isinstance(cy, (int, float)) else CAPTION_Y.get(str(cy or "low"), 0.70)
        if cap_style.get("tiktok_safe"):
            cy = min(cy, TIKTOK_BOTTOM - 0.06)
        colors = {k: v for k, v in (("hl", cap_style.get("highlight_color")), ("accent", style.get("accent")),
                                    ("size", (cap_style.get("font_size") or 0) / 54 or None)) if v}
        cap_list = looks.caption_track([{**c, "words": [{"w": w.get("w"), "start_ms": w["start_ms"], "end_ms": w["end_ms"]}
                                                        for w in c.get("words") or []]} for c in tracks["captions"]],
                                       W, H, look, colors, cy, work / "caps", total_ms / 1000)
    for j, c in enumerate([] if look else tracks.get("captions", [])):
        p = work / f"cap_{j:03d}.png"
        info = draw_text_png(p, W, H, c["text"], cap_style, "caption")
        qc_text["overflow"] += int(info["overflow"])
        qc_text["ui_overlap"] += int(info.get("ui_overlap", False))
        overlays.append((p, c["start_ms"], c["end_ms"]))
    if style.get("logo"):
        p = work / "logo.png"
        if logo_png(p, W, H, style["logo"]):
            overlays.append((p, 0, content_ms))
    if prof["watermark"]:
        p = work / "wm.png"
        watermark_png(p, W, H, prof["watermark"])
        overlays.append((p, 0, total_ms))

    inputs = ["-f", "concat", "-safe", "0", "-i", str(lst)]
    for p, _, _ in overlays:
        # PNG là luồng ảnh lặp suốt video: tránh lớp phủ "hết hạn" khi timestamp ở chỗ nối đoạn không liền
        inputs += ["-loop", "1", "-framerate", str(fps), "-t", f"{total_ms / 1000 + 0.5:.3f}", "-i", str(p)]
    if cap_list:
        inputs += ["-f", "concat", "-safe", "0", "-i", str(cap_list)]
    voice = tracks.get("voice_mix")
    music = tracks.get("music_mix")
    a_idx = len(overlays) + 1 + (1 if cap_list else 0)
    if voice:
        inputs += ["-i", voice]
    if music:
        inputs += ["-stream_loop", "-1", "-i", music]
    chain, last = [], "[0:v]"
    for k, (p, s, e) in enumerate(overlays, start=1):
        tag = f"[v{k}]"
        chain.append(f"{last}[{k}:v]overlay=0:0:eof_action=repeat:enable='between(t,{s / 1000:.3f},{e / 1000:.3f})'{tag}")
        last = tag
    if cap_list:                           # phủ luồng phụ đề lên trên ảnh tiêu đề, dưới logo và chữ DRAFT thì không cần
        chain.append(f"[{len(overlays) + 1}:v]format=rgba[capv];{last}[capv]overlay=0:0:eof_action=pass[vcap]")
        last = "[vcap]"
    fc = ";".join(chain) if chain else f"{last}null[vout]"
    vmap = last if chain else "[vout]"
    amap: list[str] = []
    if voice and music:   # M07-08: duck nhạc dưới giọng
        fc += f";[{a_idx + 1}:a]volume=0.25[m];[m][{a_idx}:a]sidechaincompress=threshold=0.03:ratio=8[md];" \
              f"[{a_idx}:a][md]amix=inputs=2:duration=first,alimiter=limit=0.75:level=0[aout]"
        amap = ["-map", "[aout]"]
    elif voice:
        fc += f";[{a_idx}:a]alimiter=limit=0.75:level=0[aout]"
        amap = ["-map", "[aout]"]
    tmp = out_path.with_name(out_path.stem + ".part.mp4")   # không sinh file partial tên final (M09)
    venc = ["-c:v", encoder] + (["-preset", prof["preset"], "-crf", str(prof["crf"])] if encoder == "libx264"
                                else ["-b:v", "8M" if profile_name == "final" else "2M"])
    cmd = [config.FFMPEG, "-y", "-v", "error", *inputs, "-filter_complex", fc, "-map", vmap, *amap,
           "-t", f"{total_ms / 1000:.3f}", *venc, "-pix_fmt", "yuv420p", "-r", str(fps),
           "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(tmp)]

    def prog(x: float) -> None:
        if on_progress:
            on_progress(0.5 + 0.5 * x)
    try:
        _run_ffmpeg(cmd, total_ms, prog, should_stop)
    except AppError:
        tmp.unlink(missing_ok=True)
        raise
    tmp.replace(out_path)

    srt = out_path.with_suffix(".srt")
    srt.write_text(to_srt(tracks.get("captions", [])), encoding="utf-8")
    thumb = out_path.with_suffix(".jpg")
    subprocess.run([config.FFMPEG, "-y", "-v", "error", "-ss", "1", "-i", str(out_path), "-frames:v", "1",
                    "-vf", "scale=360:-2", str(thumb)], capture_output=True)
    return {"video": str(out_path), "srt": str(srt), "thumbnail": str(thumb) if thumb.exists() else None,
            "width": W, "height": H, "duration_ms": total_ms, "caption_overflow": qc_text["overflow"],
            "tiktok_ui_overlap": qc_text["ui_overlap"], "layout": layout, "outro_ms": outro_ms}
