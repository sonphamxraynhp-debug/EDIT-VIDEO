"""Dòng lệnh: python -m flow_agent <lệnh>  (xem README.md)."""
from __future__ import annotations

import argparse
import json
import logging
import sys


def _print(obj) -> None:  # noqa: ANN001
    print(json.dumps(obj, ensure_ascii=False, indent=2, default=str))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="flowagent", description="Agent làm video Google Flow tự học theo view thật")
    ap.add_argument("--config", help="đường dẫn config.yaml (mặc định config/config.yaml)")
    ap.add_argument("-v", "--verbose", action="store_true")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("setup", help="cài đặt từng bước + tự chạy các bước đầu tiên (khuyên dùng lần đầu)")
    sub.add_parser("doctor", help="kiểm tra máy đã sẵn sàng chưa")
    p = sub.add_parser("login", help="mở trình duyệt để đăng nhập 1 lần (facebook | flow)")
    p.add_argument("target", choices=["facebook", "flow"])

    p = sub.add_parser("scan-reference", help="quét toàn bộ video kênh mẫu + tải về")
    p.add_argument("--limit", type=int)
    p = sub.add_parser("analyze", help="phân tích từng video kênh mẫu bằng Claude")
    p.add_argument("--force", action="store_true")
    sub.add_parser("build-formula", help="rút công thức thành công (playbook) + sinh skill")
    sub.add_parser("research", help="= scan-reference + analyze + build-formula")

    sub.add_parser("propose", help="đề xuất 10 kịch bản, chấm điểm, chọn ≤3 bản > ngưỡng")
    p = sub.add_parser("produce", help="làm video từ kịch bản trên Google Flow")
    p.add_argument("script_id", type=int)
    p = sub.add_parser("upload", help="đăng video lên kênh ở chế độ Chỉ mình tôi")
    p.add_argument("production_id", type=int)
    p = sub.add_parser("approve", help="ghi nhận video đã được duyệt & chuyển Công khai → bắt đầu tính vào vòng học")
    p.add_argument("production_id", type=int)
    p.add_argument("--url")
    p = sub.add_parser("daily", help="chạy trọn quy trình 1 ngày")
    p.add_argument("--no-upload", action="store_true")

    sub.add_parser("track", help="quét view kênh mình 1 lần")
    sub.add_parser("learn", help="chạy vòng tự học 1 lần")
    sub.add_parser("skill", help="viết lại SKILL.md từ playbook hiện tại")
    sub.add_parser("report", help="viết báo cáo hôm nay")
    p = sub.add_parser("scripts", help="xem kịch bản")
    p.add_argument("--date")
    p = sub.add_parser("show", help="xem chi tiết 1 kịch bản")
    p.add_argument("script_id", type=int)
    sub.add_parser("run", help="chạy agent liên tục theo lịch (2 giờ quét view, mỗi ngày tạo video, tự học)")

    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if args.cmd == "setup":
        from .setup_wizard import run_setup
        return run_setup(args.config)
    if args.cmd == "doctor":
        from .config import load_config
        from .setup_wizard import print_checks, run_checks
        return 0 if print_checks(run_checks(load_config(args.config))) else 1

    from .context import build_ctx

    needs_llm = args.cmd in {"analyze", "build-formula", "research", "propose", "daily", "learn", "run"}
    ctx = build_ctx(args.config, with_llm=needs_llm)

    if args.cmd == "login":
        from .browser import persistent_context

        key = "facebook.browser_profile_dir" if args.target == "facebook" else "video.flow.browser_profile_dir"
        url = "https://www.facebook.com/" if args.target == "facebook" else ctx.cfg.get_path("video.flow.url")
        with persistent_context(ctx.cfg.path(key), headless=False) as b:
            page = b.new_page()
            page.goto(url)
            input("Đăng nhập xong trong cửa sổ trình duyệt rồi nhấn Enter tại đây... ")
        print("Đã lưu phiên đăng nhập.")
    elif args.cmd == "scan-reference":
        from .research import scan_reference
        print(f"Đã ghi nhận {scan_reference(ctx, args.limit)} video")
    elif args.cmd == "analyze":
        from .research import analyze_reference
        print(f"Đã phân tích {analyze_reference(ctx, args.force)} video")
    elif args.cmd == "build-formula":
        from .research import build_formula
        v, pb = build_formula(ctx)
        print(f"Playbook v{v}:\n{pb.summary}")
    elif args.cmd == "research":
        from .research import analyze_reference, build_formula, scan_reference
        scan_reference(ctx)
        analyze_reference(ctx)
        v, pb = build_formula(ctx)
        print(f"Playbook v{v}:\n{pb.summary}")
    elif args.cmd == "propose":
        from .planner import run_daily_planning
        _print(run_daily_planning(ctx))
    elif args.cmd == "produce":
        from .production import produce
        print(f"Sản phẩm #{produce(ctx, args.script_id)}")
    elif args.cmd == "upload":
        from .production import upload
        print(upload(ctx, args.production_id) or "Đã đăng (link sẽ được gắn ở lần quét view kế tiếp)")
    elif args.cmd == "approve":
        from .production import approve
        approve(ctx, args.production_id, args.url)
        print("Đã ghi nhận. Video sẽ được tính vào vòng tự học.")
    elif args.cmd == "daily":
        from .pipeline import run_daily
        _print(run_daily(ctx, do_upload=not args.no_upload))
    elif args.cmd == "track":
        from .tracker import track_once
        print(f"{track_once(ctx)} snapshot")
    elif args.cmd == "learn":
        from .learner import learn
        _print(learn(ctx))
    elif args.cmd == "skill":
        from .skillgen import write_skill
        print(write_skill(ctx))
    elif args.cmd == "report":
        from .pipeline import write_daily_report
        print(write_daily_report(ctx))
    elif args.cmd == "scripts":
        from datetime import date
        rows = ctx.db.all("SELECT id, run_date, title, angle, total_score, blocked, status FROM scripts WHERE run_date=? "
                          "ORDER BY total_score DESC", (args.date or date.today().isoformat(),))
        _print([dict(r) for r in rows])
    elif args.cmd == "show":
        row = ctx.db.one("SELECT * FROM scripts WHERE id=?", (args.script_id,))
        if not row:
            print("Không có kịch bản này")
            return 1
        _print({**dict(row), "draft_json": json.loads(row["draft_json"]),
                "score_json": json.loads(row["score_json"] or "{}")})
    elif args.cmd == "run":
        from .scheduler import run_forever
        run_forever(ctx)
    return 0


if __name__ == "__main__":
    sys.exit(main())
