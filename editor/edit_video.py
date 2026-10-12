#!/usr/bin/env python3
"""EDIT VIDEO – biên tập video talking-head dọc theo phong cách video mẫu "Sơn demo".

  prepare  video.mp4 -w work/          cắt lặng + nhận dạng giọng nói -> work/edit_plan.json
  still    work/edit_plan.json -t 1.5 4 9 -o check.jpg   xem nhanh vài khung hình (không render)
  render   work/edit_plan.json -o out.mp4 [--preview]
  auto     video.mp4 -o out.mp4        prepare + render liền một mạch (không dừng để soát)
  qa       out.mp4 --source video.mp4 --sheet sheet.jpg
  setup    kiểm tra ffmpeg/thư viện và tải trước mô hình nhận dạng tiếng Việt
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
    p.add_argument("--transcript", help="Transcript có sẵn (.srt hoặc .json) thay cho nhận dạng tự động")
    p.add_argument("--engine", choices=["sherpa", "whisper"], help="Bộ nhận dạng (mặc định sherpa)")
    p.add_argument("--threshold-db", type=float, help="Ngưỡng lặng cố định (dB). Mặc định tự tính")
    p.add_argument("--remove", action="append", metavar="A-B",
                   help="Bỏ hẳn đoạn A-B giây (thời gian GỐC), vd. câu nói hỏng/nói lại. Dùng nhiều lần được")
    p.add_argument("--no-asr", action="store_true", help="Chỉ cắt lặng, không tạo phụ đề")
    p.add_argument("--hook", help="Tiêu đề mở đầu, các dòng ngăn bởi '|', vd. 'Vợ chồng|có cần kể hết?'")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--style", help="File style.json khác (mặc định editor/style.json)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("prepare", help="Cắt lặng + nhận dạng giọng nói -> edit_plan.json")
    add_prepare_args(p)
    p.add_argument("-w", "--workdir", required=True)

    s = sub.add_parser("still", help="Ảnh xem nhanh tại các thời điểm (giây, sau cắt)")
    s.add_argument("plan")
    s.add_argument("-t", "--times", type=float, nargs="+", required=True)
    s.add_argument("-o", "--output", required=True)

    r = sub.add_parser("render", help="Dựng video từ edit_plan.json")
    r.add_argument("plan")
    r.add_argument("-o", "--output", required=True)
    r.add_argument("--preview", action="store_true", help="Bản xem nhanh (mã hoá nhanh)")
    r.add_argument("--keep-temp", action="store_true")

    a = sub.add_parser("auto", help="prepare + render liền một mạch")
    add_prepare_args(a)
    a.add_argument("-o", "--output", required=True)
    a.add_argument("-w", "--workdir")

    q = sub.add_parser("qa", help="Kiểm tra video đầu ra")
    q.add_argument("output")
    q.add_argument("--source")
    q.add_argument("--sheet", help="Ghi ảnh tổng quan 12 khung hình")

    sub.add_parser("setup", help="Kiểm tra môi trường + tải mô hình nhận dạng")

    args = ap.parse_args()
    style = load_style(args.style)

    if args.cmd == "setup":
        import shutil
        from vedit import asr
        for tool in ("ffmpeg", "ffprobe"):
            print(f"[setup] {tool}: {shutil.which(tool) or 'THIẾU – cài ffmpeg trước'}")
        for mod in ("numpy", "cv2", "PIL", "sherpa_onnx"):
            try:
                __import__(mod)
                print(f"[setup] python {mod}: ok")
            except ImportError:
                print(f"[setup] python {mod}: THIẾU – pip install -r editor/requirements.txt")
        print(f"[setup] Mô hình: {asr.ensure_sherpa_model(style['asr'])}")
        return

    if args.cmd in ("prepare", "auto"):
        workdir = args.workdir or os.path.splitext(args.output)[0] + "_work"
        plan_path = plan_mod.prepare(
            args.input, workdir, style, transcript=args.transcript, engine=args.engine,
            threshold_db=args.threshold_db, remove=parse_ranges(args.remove), no_asr=args.no_asr,
            hook_text=args.hook)
        if args.cmd == "auto":
            render_mod.render(plan_path, args.output, style)
            rep = qa_mod.check(args.output, source=args.input,
                               sheet_path=os.path.join(workdir, "sheet.jpg"))
            print(json.dumps(rep, ensure_ascii=False, indent=1))
    elif args.cmd == "still":
        render_mod.stills(args.plan, args.times, args.output, style)
        print(f"[still] Đã ghi {args.output}")
    elif args.cmd == "render":
        render_mod.render(args.plan, args.output, style, preview=args.preview, keep_temp=args.keep_temp)
    elif args.cmd == "qa":
        rep = qa_mod.check(args.output, source=args.source, sheet_path=args.sheet)
        print(json.dumps(rep, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
