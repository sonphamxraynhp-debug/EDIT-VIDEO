"""Trình cài đặt từng bước (`python -m flow_agent setup`) và kiểm tra sức khoẻ (`python -m flow_agent doctor`).

Mục tiêu: người dùng chỉ chạy 1 lệnh, agent tự làm mọi bước còn lại — chỉ dừng ở những việc
bắt buộc phải là chủ tài khoản (dán khoá API, đăng nhập Facebook, đăng nhập Google).
"""
from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from getpass import getpass
from pathlib import Path

from .config import DEFAULT_CONFIG, EXAMPLE_CONFIG, ROOT


@dataclass
class Check:
    name: str
    ok: bool
    fix: str = ""
    required: bool = True


def _has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _profile_used(path: Path) -> bool:
    return path.exists() and any(path.iterdir())


def run_checks(cfg=None) -> list[Check]:  # noqa: ANN001
    from .config import load_config

    cfg = cfg or load_config()
    checks = [
        Check("Python ≥ 3.10", sys.version_info >= (3, 10), "Cài Python 3.10+ từ python.org"),
        Check("ffmpeg", bool(shutil.which("ffmpeg") and shutil.which("ffprobe")),
              "Windows: winget install Gyan.FFmpeg · macOS: brew install ffmpeg · Ubuntu: sudo apt install ffmpeg"),
        Check("Thư viện anthropic", _has_module("anthropic"), "pip install -r requirements.txt"),
        Check("Thư viện playwright", _has_module("playwright"), "pip install -r requirements.txt"),
        Check("Thư viện apscheduler", _has_module("apscheduler"), "pip install -r requirements.txt"),
        Check("yt-dlp (tải video kênh mẫu)", _has_module("yt_dlp") or bool(shutil.which("yt-dlp")),
              "pip install yt-dlp"),
        Check("faster-whisper (bóc lời thoại)", _has_module("faster_whisper"), "pip install faster-whisper",
              required=False),
        Check("Khoá Claude API", bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")),
              "Điền ANTHROPIC_API_KEY vào file .env (lấy ở console.anthropic.com)"),
        Check("File cấu hình config/config.yaml", DEFAULT_CONFIG.exists(), "python -m flow_agent setup"),
        Check("Đã đăng nhập Facebook (hồ sơ trình duyệt)", _profile_used(cfg.path("facebook.browser_profile_dir")),
              "python -m flow_agent login facebook"),
    ]
    if cfg.get_path("video.backend", "flow") == "flow":
        checks.append(Check("Đã đăng nhập Google Flow (hồ sơ trình duyệt)",
                            _profile_used(cfg.path("video.flow.browser_profile_dir")), "python -m flow_agent login flow"))
    else:
        key = cfg.get_path("video.veo_api.api_key_env", "GEMINI_API_KEY")
        checks.append(Check(f"Khoá {key} (backend veo_api)", bool(os.environ.get(key)), f"Điền {key} vào .env"))
        checks.append(Check("Thư viện google-genai", _has_module("google.genai"), "pip install google-genai"))
    if cfg.get("own_channel_type") == "page":
        env = cfg.get_path("facebook.graph.access_token_env", "FB_PAGE_TOKEN")
        checks.append(Check(f"Token fanpage {env}", bool(os.environ.get(env)), f"Điền {env} vào .env"))
    db = cfg.data_dir / "agent.db"
    has_playbook = False
    if db.exists():
        from .db import DB

        has_playbook = DB(db).latest_playbook() is not None
    checks.append(Check("Đã có công thức kênh mẫu (playbook)", has_playbook, "python -m flow_agent research",
                        required=False))
    return checks


def print_checks(checks: list[Check]) -> bool:
    all_ok = True
    for c in checks:
        mark = "✅" if c.ok else ("❌" if c.required else "⚠️ ")
        print(f"{mark} {c.name}" + ("" if c.ok else f"\n     → {c.fix}"))
        all_ok &= c.ok or not c.required
    print("\nSẵn sàng chạy!" if all_ok else "\nCòn mục ❌ cần xử lý (xem hướng dẫn → ở trên).")
    return all_ok


# ------------------------------------------------------------------------------------------- setup
def _ask(prompt: str, default: str = "") -> str:
    ans = input(f"{prompt}{f' [{default}]' if default else ''}: ").strip()
    return ans or default


def _yes(prompt: str, default: bool = True) -> bool:
    ans = input(f"{prompt} ({'C/k' if default else 'c/K'}): ").strip().lower()
    return default if not ans else ans in ("c", "co", "có", "y", "yes")


def _set_env(key: str, value: str) -> None:
    env = ROOT / ".env"
    lines = env.read_text(encoding="utf-8").splitlines() if env.exists() else []
    lines = [ln for ln in lines if not ln.startswith(f"{key}=")] + [f"{key}={value}"]
    env.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        env.chmod(0o600)
    except OSError:
        pass
    os.environ[key] = value


def _pip(*pkgs: str) -> None:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *pkgs], check=True)


def run_setup(config_path: str | None = None) -> int:
    print("=== CÀI ĐẶT FLOW VIDEO AGENT ===\n")
    # 1. thư viện
    if not all(_has_module(m) for m in ("anthropic", "playwright", "apscheduler", "yt_dlp", "yaml")):
        print("• Đang cài thư viện…")
        _pip("-r", str(ROOT / "requirements.txt"))
    if not _has_module("faster_whisper") and _yes("• Cài faster-whisper để bóc lời thoại video kênh mẫu (nên có)?"):
        _pip("faster-whisper")
    if not os.environ.get("FLOWAGENT_BROWSER_CHANNEL") and not os.environ.get("FLOWAGENT_BROWSER_PATH"):
        if _yes("• Máy đã cài Google Chrome? (dùng Chrome thật giúp đăng nhập Google/Facebook ổn định)"):
            _set_env("FLOWAGENT_BROWSER_CHANNEL", "chrome")
        else:
            print("• Cài trình duyệt Chromium cho Playwright…")
            subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
    if not shutil.which("ffmpeg"):
        print("❌ Chưa có ffmpeg. Windows: `winget install Gyan.FFmpeg` · macOS: `brew install ffmpeg` — "
              "cài xong mở lại cửa sổ lệnh và chạy lại `python -m flow_agent setup`.")
        return 1

    # 2. cấu hình
    if not DEFAULT_CONFIG.exists():
        shutil.copy(EXAMPLE_CONFIG, DEFAULT_CONFIG)
        print(f"• Đã tạo {DEFAULT_CONFIG.relative_to(ROOT)}")
    from .config import load_config

    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        key = getpass("• Dán khoá Claude API (bắt đầu bằng sk-ant-, sẽ không hiện ra màn hình): ").strip()
        if key:
            _set_env("ANTHROPIC_API_KEY", key)
    cfg = load_config(config_path)

    # 3. đăng nhập (bắt buộc chủ tài khoản tự làm)
    from .browser import persistent_context

    for target, key, url in (
        ("Facebook", "facebook.browser_profile_dir", "https://www.facebook.com/"),
        ("Google Flow", "video.flow.browser_profile_dir", cfg.get_path("video.flow.url")),
    ):
        if target == "Google Flow" and cfg.get_path("video.backend") != "flow":
            continue
        if _profile_used(cfg.path(key)) and not _yes(f"• Đã có phiên đăng nhập {target}. Đăng nhập lại?", False):
            continue
        print(f"• Mở trình duyệt để bạn đăng nhập {target}…")
        with persistent_context(cfg.path(key), headless=False) as b:
            page = b.new_page()
            page.goto(url)
            input(f"  Đăng nhập {target} xong trong cửa sổ trình duyệt rồi nhấn Enter tại đây… ")

    print("\n=== KIỂM TRA ===")
    if not print_checks(run_checks(cfg)):
        return 1

    # 4. chạy các bước còn lại thay người dùng
    from .context import build_ctx

    ctx = build_ctx(config_path)
    if ctx.db.latest_playbook() is None or _yes("\n• Quét & học lại kênh mẫu ngay bây giờ?", False):
        from .research import analyze_reference, build_formula, scan_reference

        print("• Đang quét kênh mẫu (có thể mất 10–40 phút)…")
        scan_reference(ctx)
        analyze_reference(ctx)
        v, pb = build_formula(ctx)
        print(f"\n✅ Công thức kênh mẫu (playbook v{v}):\n{pb.summary}\n")

    if _yes("• Chạy ngay quy trình hôm nay (10 kịch bản → chấm điểm → làm ≤3 video → đăng Chỉ mình tôi)?"):
        from .pipeline import run_daily

        out = run_daily(ctx)
        print(f"\n✅ Xong. Báo cáo: {out['report']}")
        for p in out["productions"]:
            print(f"   - Kịch bản #{p['script_id']}: {p.get('url') or p.get('error') or 'đã làm, xem báo cáo'}")

    print("\nBước tiếp theo:")
    print("  1. Mở data/productions/<số>/PHIEU_DUYET.md, Bác sĩ Phạm Sơn duyệt nội dung.")
    print("  2. Duyệt xong: đổi video sang Công khai trên Facebook, rồi chạy: python -m flow_agent approve <số>")
    if _yes("\n• Bật chế độ tự chạy (quét view 2 giờ/lần, mỗi sáng làm video, mỗi tối tự học) ngay bây giờ?"):
        from .scheduler import run_forever

        run_forever(ctx)
    else:
        print("  Khi muốn chạy tự động: python -m flow_agent run")
    return 0
