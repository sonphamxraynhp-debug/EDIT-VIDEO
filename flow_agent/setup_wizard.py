"""Trình cài đặt từng bước (`python -m flow_agent setup`) và kiểm tra sức khoẻ (`python -m flow_agent doctor`).

Mục tiêu: người dùng chỉ chạy 1 lệnh, agent tự làm mọi bước còn lại — chỉ dừng ở những việc
bắt buộc phải là chủ tài khoản (dán khoá API, đăng nhập Facebook, đăng nhập Google).
"""
from __future__ import annotations

import importlib.util
import json
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
        _claude_check(cfg),
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
        # Command Prompt trên Windows không hiển thị được emoji -> dùng nhãn chữ
        mark = "[OK]    " if c.ok else ("[THIẾU] " if c.required else "[NÊN CÓ]")
        print(f"{mark} {c.name}" + ("" if c.ok else f"\n     → {c.fix}"))
        all_ok &= c.ok or not c.required
    print("\nSẵn sàng chạy!" if all_ok else "\nCòn mục [THIẾU] cần xử lý (xem hướng dẫn → ở trên).")
    return all_ok


# ------------------------------------------------------------------------------------------- setup
AUTO = False  # True = không hỏi gì, tự chọn mặc định (python -m flow_agent setup --auto)


def _ask(prompt: str, default: str = "") -> str:
    if AUTO:
        return default
    ans = input(f"{prompt}{f' [{default}]' if default else ''}: ").strip()
    return ans or default


def _yes(prompt: str, default: bool = True) -> bool:
    if AUTO:
        print(f"{prompt} → {'Có' if default else 'Không'} (tự chọn)")
        return default
    ans = input(f"{prompt} ({'C/k' if default else 'c/K'}): ").strip().lower()
    return default if not ans else ans in ("c", "co", "có", "y", "yes")


# ------------------------------------------------------------------- Claude Code (gói Pro/Max, không tốn tiền API)
def claude_code_ready(timeout: int = 180) -> tuple[bool, str]:
    from .llm import find_claude_cli

    exe = find_claude_cli()
    if not exe:
        return False, "chưa cài Claude Code"
    try:
        res = subprocess.run([exe, "-p", "--output-format", "json", "--tools", ""], input="Chỉ trả lời: OK",
                             capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
        import json

        data = json.loads(res.stdout or "{}")
        if data.get("is_error") or data.get("subtype") != "success":
            return False, str(data.get("result") or res.stderr)[:200]
        return True, "ok"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:200]


def _claude_check(cfg) -> Check:  # noqa: ANN001
    from .llm import find_claude_cli, resolve_backend

    if resolve_backend(cfg) == "api":
        return Check("Khoá Claude API (backend api — trả phí)",
                     bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")),
                     "Điền ANTHROPIC_API_KEY vào .env, hoặc đổi llm.backend thành claude_code để dùng gói Max")
    if not find_claude_cli():
        return Check("Claude Code (dùng gói Max, không tốn tiền API)", False, "python -m flow_agent setup (tự cài)")
    ok, why = claude_code_ready()
    return Check("Claude Code (dùng gói Max, không tốn tiền API)", ok,
                 f"Gõ `claude`, đăng nhập tài khoản Claude Max rồi gõ /exit ({why})")


def ensure_claude_code() -> bool:
    """Cài Claude Code nếu thiếu, rồi mở cho người dùng đăng nhập tài khoản Claude Pro/Max (1 lần)."""
    from .llm import find_claude_cli

    if os.name == "nt" and not (shutil.which("git") or Path(r"C:\Program Files\Git\bin\bash.exe").exists()):
        print("• Claude Code trên Windows cần Git — đang cài Git…")
        subprocess.run(["winget", "install", "-e", "--id", "Git.Git", "--accept-source-agreements",
                        "--accept-package-agreements"], check=False)
    if not find_claude_cli():
        print("• Đang cài Claude Code (dùng gói Claude Max của bạn, không tốn tiền API)…")
        if os.name == "nt":
            subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
                            "irm https://claude.ai/install.ps1 | iex"], check=False)
        else:
            subprocess.run(["bash", "-c", "curl -fsSL https://claude.ai/install.sh | bash"], check=False)
    exe = find_claude_cli()
    if not exe:
        print("❗ Chưa cài được Claude Code. Cài tay theo hướng dẫn tại code.claude.com rồi chạy lại.")
        return False
    print("• Kiểm tra đăng nhập Claude Code…")
    ok, _ = claude_code_ready()
    tries = 0
    while not ok and tries < 2:
        tries += 1
        print("\n  Claude Code sẽ mở ngay trong cửa sổ này. Chọn đăng nhập bằng TÀI KHOẢN CLAUDE (gói Max),")
        print("  làm theo trình duyệt, khi thấy dấu nhắc > thì gõ  /exit  rồi Enter để quay lại.\n")
        if not AUTO:
            input("  Nhấn Enter để bắt đầu… ")
        subprocess.run([exe], check=False)
        ok, why = claude_code_ready()
        if not ok:
            print(f"  Chưa đăng nhập được: {why}")
    if ok:
        print("  ✓ Claude Code đã sẵn sàng — agent sẽ dùng gói Max, không tốn tiền API.")
    return ok


def _ask_api_key() -> str:
    """Hỏi khoá Claude API. Trên Windows, ô nhập ẩn (getpass) không nhận Ctrl+V nên dùng ô nhập thường."""
    print("• Cần khoá Claude API: vào console.anthropic.com → API Keys → Create Key, sao chép khoá (sk-ant-...).")
    while True:
        if os.name == "nt":
            key = input("  Dán khoá vào đây (chuột phải hoặc Ctrl+V) rồi Enter: ").strip()
        else:
            key = getpass("  Dán khoá vào đây (không hiện ra màn hình) rồi Enter: ").strip()
        key = "".join(ch for ch in key if ch.isprintable() and not ch.isspace())
        if key.startswith("sk-ant-") and len(key) > 30:
            if os.name == "nt":
                os.system("cls")  # xoá khoá khỏi màn hình
            return key
        print("  Khoá chưa đúng (phải bắt đầu bằng sk-ant-). Thử lại.")


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


def _chrome_installed() -> bool:
    cands = [Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe",
             Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Google/Chrome/Application/chrome.exe",
             Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
             Path("/Applications/Google Chrome.app"), Path("/usr/bin/google-chrome")]
    return any(c.exists() for c in cands)


def register_autostart() -> None:
    """Windows: tự bật agent mỗi khi đăng nhập máy (Task Scheduler). Gỡ: schtasks /Delete /TN FlowVideoAgent /F"""
    if os.name != "nt":
        print("  (macOS/Linux: thêm `python -m flow_agent run` vào mục khởi động nếu muốn tự chạy khi bật máy)")
        return
    bat = ROOT / "CHAY_TU_DONG.bat"
    res = subprocess.run(["schtasks", "/Create", "/F", "/SC", "ONLOGON", "/TN", "FlowVideoAgent",
                          "/TR", f'"{bat}"'], capture_output=True, text=True)
    if res.returncode == 0:
        print("  ✓ Đã cài tự khởi động: agent tự chạy mỗi khi bạn đăng nhập Windows.")
        print("    (Muốn gỡ: schtasks /Delete /TN FlowVideoAgent /F)")
    else:
        print(f"  ! Không tạo được lịch tự khởi động: {(res.stderr or res.stdout).strip()[:200]}")


def ensure_logins(cfg, need_facebook: bool = True) -> None:  # noqa: ANN001
    """Nếu hồ sơ trình duyệt chưa đăng nhập: mở cửa sổ để chủ tài khoản tự đăng nhập (chỉ lần đầu)."""
    from .browser import persistent_context

    targets = []
    if need_facebook:
        targets.append(("Facebook", "facebook.browser_profile_dir", "https://www.facebook.com/"))
    if cfg.get_path("video.backend", "flow") == "flow":
        targets.append(("Google Flow", "video.flow.browser_profile_dir", cfg.get_path("video.flow.url")))
    for target, key, url in targets:
        if _profile_used(cfg.path(key)):
            continue
        print(f"• Lần đầu: mở trình duyệt để bạn đăng nhập {target}…")
        with persistent_context(cfg.path(key), headless=False) as b:
            page = b.new_page()
            page.goto(url)
            input(f"  Đăng nhập {target} xong trong cửa sổ trình duyệt rồi nhấn Enter tại đây… ")


def run_setup(config_path: str | None = None, auto: bool = False) -> int:
    global AUTO
    AUTO = auto
    print("=== CÀI ĐẶT FLOW VIDEO AGENT ===\n")
    # 1. thư viện
    if not all(_has_module(m) for m in ("anthropic", "playwright", "apscheduler", "yt_dlp", "yaml")):
        print("• Đang cài thư viện…")
        _pip("-r", str(ROOT / "requirements.txt"))
    if not _has_module("faster_whisper") and _yes("• Cài faster-whisper để bóc lời thoại video kênh mẫu (nên có)?"):
        _pip("faster-whisper")
    if not os.environ.get("FLOWAGENT_BROWSER_CHANNEL") and not os.environ.get("FLOWAGENT_BROWSER_PATH"):
        if _chrome_installed() if AUTO else _yes("• Máy đã cài Google Chrome? (dùng Chrome thật giúp đăng nhập ổn định)"):
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

    cfg = load_config(config_path)
    from .llm import resolve_backend

    if resolve_backend(cfg) == "api":
        if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
            _set_env("ANTHROPIC_API_KEY", _ask_api_key())
    elif not ensure_claude_code():
        return 1

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
        try:
            scan_reference(ctx)
            analyze_reference(ctx)
            v, pb = build_formula(ctx)
            print(f"\n✅ Công thức kênh mẫu (playbook v{v}):\n{pb.summary}\n")
        except Exception as exc:  # noqa: BLE001
            from .seeding import seed_playbook

            print(f"⚠️  Chưa quét được kênh mẫu ({exc}). Tạm dùng playbook khởi đầu; xem ảnh lỗi trong data/debug/ "
                  "rồi chạy lại `python -m flow_agent research` sau.")
            seed_playbook(ctx)

    from .seeding import import_scripts

    seeds = sorted((ROOT / "seed").glob("kich-ban-*.json"))
    if seeds and _yes(f"• Có sẵn kịch bản viết trước ({seeds[-1].name}). Giám khảo AI chấm lại rồi làm video từ bản đó?"):
        try:
            res = import_scripts(ctx, seeds[-1], rejudge=True)
        except Exception as exc:  # noqa: BLE001 — giám khảo AI không chạy được (vd chạm giới hạn) -> dùng điểm có sẵn
            print(f"  ! Giám khảo AI chưa chấm được ({exc}). Dùng điểm có sẵn trong file.")
            res = import_scripts(ctx, seeds[-1], rejudge=False)
        run_date = json.loads(seeds[-1].read_text(encoding="utf-8")).get("run_date")
        todo = [r["id"] for r in ctx.db.all(
            "SELECT id FROM scripts WHERE run_date=? AND status IN ('selected','failed') ORDER BY total_score DESC",
            (run_date,))]
        print(f"  Kịch bản sẽ làm video: {todo or res['selected']}")
        from .production import produce, upload

        for sid in todo:
            try:
                pid = produce(ctx, sid)
                print(f"  ✅ Kịch bản #{sid} → video #{pid}: {upload(ctx, pid) or 'đã đăng Chỉ mình tôi'}")
            except Exception as exc:  # noqa: BLE001
                print(f"  ❌ Kịch bản #{sid}: {exc}")
    elif _yes("• Chạy ngay quy trình hôm nay (10 kịch bản → chấm điểm → làm ≤3 video → đăng Chỉ mình tôi)?"):
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

        register_autostart()
        print("\n=== AGENT ĐANG TỰ CHẠY — để nguyên cửa sổ này (có thể thu nhỏ) ===\n")
        run_forever(ctx)
    else:
        print("  Khi muốn chạy tự động: python -m flow_agent run")
    return 0
