#!/usr/bin/env python3
"""Công cụ edit video talking-head dọc theo phong cách Phòng khám Bác sĩ Phạm Sơn.

  prepare  video.mp4 -w work/   -> cắt khoảng lặng + nhận dạng giọng nói -> work/edit_plan.json
  render   work/edit_plan.json -o out.mp4
  recaption work/edit_plan.json cau.txt  -> thay phụ đề bằng câu đã sửa, tự căn thời gian
  auto     video.mp4 -o out.mp4  (prepare + render, không dừng để duyệt)
  qa       out.mp4 [--source video.mp4] [--sheet sheet.jpg]
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vedit import plan as plan_mod  # noqa: E402
from vedit import qa as qa_mod  # noqa: E402
from vedit import render as render_mod  # noqa: E402

DEFAULT_STYLE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "style.json")


def load_style(path):
    with open(path or DEFAULT_STYLE, encoding="utf-8") as f:
        return json.load(f)


def parse_ranges(values):
    out = []
    for v in values or []:
        a, b = v.split("-")
        out.append((float(a), float(b)))
    return out


def add_prepare_args(p):
    p.add_argument("input", help="Video gốc (chưa cắt, chưa phụ đề)")
    p.add_argument("--transcript", help="Transcript có sẵn (JSON) thay cho nhận dạng tự động")
    p.add_argument("--model", help="Mô hình Whisper (mặc định large-v3; máy yếu dùng medium/small)")
    p.add_argument("--asr", choices=["auto", "faster-whisper", "sherpa-onnx"],
                   help="Bộ nhận dạng giọng nói (mặc định auto: Whisper, lỗi thì tự dùng Zipformer tiếng Việt)")
    p.add_argument("--threshold-db", type=float, help="Ngưỡng lặng cố định (dB). Mặc định tự tính")
    p.add_argument("--remove", action="append", metavar="A-B",
                   help="Bỏ hẳn đoạn A-B giây (thời gian gốc), vd. câu nói hỏng. Dùng nhiều lần được")
    p.add_argument("--no-asr", action="store_true", help="Chỉ cắt lặng, không tạo phụ đề")
    p.add_argument("--hook", help="Chữ tiêu đề mở đầu (mặc định lấy câu nói đầu tiên)")
    p.add_argument("--hook-style", choices=["clean", "neon", "elegant"])
    p.add_argument("--hook-position", choices=["top", "middle", "bottom"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--style", help="File style.json khác (mặc định editor/style.json)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("prepare", help="Cắt lặng + nhận dạng giọng nói -> edit_plan.json")
    add_prepare_args(p)
    p.add_argument("-w", "--workdir", required=True)

    r = sub.add_parser("render", help="Dựng video từ edit_plan.json")
    r.add_argument("plan")
    r.add_argument("-o", "--output", required=True)
    r.add_argument("--preview", action="store_true", help="Bản xem nhanh (mã hoá nhanh, dung lượng nhỏ)")
    r.add_argument("--keep-temp", action="store_true")

    a = sub.add_parser("auto", help="prepare + render liền một mạch")
    add_prepare_args(a)
    a.add_argument("-o", "--output", required=True)
    a.add_argument("-w", "--workdir")

    rc = sub.add_parser("recaption", help="Thay phụ đề bằng các câu viết lại (mỗi dòng 1 câu), tự căn thời gian")
    rc.add_argument("plan")
    rc.add_argument("lines", help="File văn bản: mỗi dòng là một câu phụ đề")

    q = sub.add_parser("qa", help="Kiểm tra video đầu ra")
    q.add_argument("output")
    q.add_argument("--source")
    q.add_argument("--sheet", help="Ghi ảnh tổng quan 12 khung hình")

    args = ap.parse_args()
    style = load_style(args.style)

    if args.cmd in ("prepare", "auto"):
        workdir = args.workdir or os.path.splitext(args.output)[0] + "_work"
        plan_path = plan_mod.prepare(
            args.input, workdir, style, transcript=args.transcript, model=args.model, asr_backend=args.asr,
            threshold_db=args.threshold_db, remove=parse_ranges(args.remove), no_asr=args.no_asr,
            hook_text=args.hook, hook_style=args.hook_style, hook_position=args.hook_position)
        if args.cmd == "auto":
            render_mod.render(plan_path, args.output, style)
            rep = qa_mod.check(args.output, style, source=args.input)
            print(json.dumps(rep, ensure_ascii=False, indent=1))
    elif args.cmd == "render":
        render_mod.render(args.plan, args.output, style, keep_temp=args.keep_temp, preview=args.preview)
    elif args.cmd == "recaption":
        from vedit.captions import from_lines
        with open(args.plan, encoding="utf-8") as f:
            plan = json.load(f)
        with open(args.lines, encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]
        plan["captions"] = from_lines(lines, plan["words"], style["captions"], style["glossary"])
        with open(args.plan, "w", encoding="utf-8") as f:
            json.dump(plan, f, ensure_ascii=False, indent=1)
        for c in plan["captions"]:
            print(f"{c['start']:6.2f}-{c['end']:6.2f}  {c['text']}")
    elif args.cmd == "qa":
        rep = qa_mod.check(args.output, style, sheet_path=args.sheet, source=args.source)
        print(json.dumps(rep, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
