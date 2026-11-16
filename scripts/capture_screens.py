"""Chụp ảnh các màn hình cho tài liệu (docs/huong-dan/img) bằng Chrome/Edge headless.

Cần API đang chạy tại 127.0.0.1:8765 với bản build giao diện (scripts/start.sh hoặc start.ps1) và dữ liệu mẫu.

    .venv/bin/python -I scripts/capture_screens.py --project <id> [--analytics-project <id>] [--asset <id>] [--qc-variant <id>]

Trình duyệt: biến CHROME, hoặc tự tìm Chrome/Edge/Chromium. Ảnh lưu JPEG 1440×900 (chất lượng 86)."""
from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "huong-dan" / "img"
BASE = "http://127.0.0.1:8765"


def find_browser() -> str:
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    cands = {
        "Darwin": ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                   "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                   "/Applications/Chromium.app/Contents/MacOS/Chromium"],
        "Windows": [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"],
    }.get(platform.system(), []) + [shutil.which(n) or "" for n in ("google-chrome", "chromium", "chromium-browser", "msedge")]
    for c in cands:
        if c and Path(c).exists():
            return c
    sys.exit("Không tìm thấy Chrome/Edge — đặt biến CHROME=<đường dẫn>")


def shots(a: argparse.Namespace) -> list[tuple[str, str, int]]:
    """(tên file, đường dẫn + query, chiều cao cửa sổ)."""
    p = f"project={a.project}&tour=off"
    pa = f"project={a.analytics_project or a.project}&tour=off"
    t = f"project={a.project}&tour=1&tourstep="
    out = [
        ("01-dashboard", f"/?{p}", 900),
        ("02-projects", f"/projects?{p}", 900),
        ("03-media", f"/media?{p}", 900),
        ("04-analyzer", f"/media/analyze?{p}" + (f"&asset={a.asset}" if a.asset else ""), 900),
        ("05-brain", f"/brain?{p}", 900),
        ("06-strategy", f"/creative/strategy?{p}", 1500),
        ("08-matrix", f"/creative/matrix?{p}", 900),
        ("09-scripts", f"/creative/scripts?{p}", 900),
        ("10-storyboard", f"/creative/storyboard?{p}", 900),
        ("11-voice", f"/creative/voice?{p}", 900),
        ("12-editor", f"/production/editor?{p}", 900),
        ("13-batch", f"/production/batch?{p}", 900),
        ("14-queue", f"/production/queue?{p}", 1300),
        ("15-qc", f"/review/qc?{p}" + (f"&v={a.qc_variant}" if a.qc_variant else ""), 1100),
        ("16-library", f"/library?{p}", 900),
        ("17-analytics", f"/analytics?{pa}", 1700),
        ("19-brand", f"/system/brand?{p}", 900),
        ("20-models", f"/system/models?{p}", 900),
        ("21-settings", f"/settings?{p}", 900),
        ("22-hardware", f"/system/hardware?{p}", 900),
        ("23-templates", f"/creative/templates?{p}", 900),
        ("24-subtitles", f"/production/subtitles?{p}", 900),
        # tutorial trong app
        ("tour-01-welcome", f"/?{t}0", 900),
        ("tour-02-sidebar", f"/?{t}1", 900),
        ("tour-04-media", f"/media?{t}3", 900),
        ("tour-07-hooks", f"/creative/strategy?{t}6", 900),
        ("tour-08-plan", f"/creative/strategy?{t}7", 900),
        ("tour-13-qc", f"/review/qc?{t}12", 900),
        ("tour-16-export", f"/library?{t}15", 900),
    ]
    return [s for s in out if not a.only or s[0] in a.only]


def capture_cdp(browser: str, url: str, png: Path, h: int, wait_s: float) -> None:
    """Chụp qua Chrome DevTools Protocol theo thời gian thật — cho màn giữ stream trực tiếp (hàng đợi)."""
    import base64
    import json
    import socket
    import time
    import urllib.request
    from websockets.sync.client import connect

    with socket.socket() as sk:
        sk.bind(("127.0.0.1", 0))
        port = sk.getsockname()[1]
    prof = tempfile.mkdtemp()
    proc = subprocess.Popen([browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={prof}",
                             f"--remote-debugging-port={port}", f"--window-size=1440,{h}", "about:blank"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try:
                tabs = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1).read())
                ws_url = next(t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page")
                break
            except Exception:  # noqa: BLE001 — trình duyệt chưa sẵn sàng
                time.sleep(0.2)
        with connect(ws_url, max_size=None) as ws:
            n = 0

            def call(method: str, **params):
                nonlocal n
                n += 1
                ws.send(json.dumps({"id": n, "method": method, "params": params}))
                while True:
                    m = json.loads(ws.recv())
                    if m.get("id") == n:
                        return m.get("result", {})
            call("Emulation.setDeviceMetricsOverride", width=1440, height=h, deviceScaleFactor=1, mobile=False)
            call("Page.navigate", url=url)
            time.sleep(wait_s)
            data = call("Page.captureScreenshot", format="png")["data"]
            png.write_bytes(base64.b64decode(data))
    finally:
        proc.terminate()
        shutil.rmtree(prof, ignore_errors=True)


STREAMING = {"14-queue"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--analytics-project")
    ap.add_argument("--asset")
    ap.add_argument("--qc-variant")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--wait-ms", type=int, default=7000)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    browser = find_browser()
    for name, path, h in shots(a):
        with tempfile.TemporaryDirectory() as prof:
            png = Path(prof) / "shot.png"
            base = [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={prof}",
                    "--force-device-scale-factor=1", f"--window-size=1440,{h}", f"--screenshot={png}"]
            if name in STREAMING:      # stream trực tiếp làm thời gian ảo không trôi: chụp theo thời gian thật
                capture_cdp(browser, BASE + path, png, h, a.wait_ms / 1000 + 3)
            else:
                subprocess.run(base + [f"--virtual-time-budget={a.wait_ms}", BASE + path], capture_output=True, timeout=90)
            if not png.exists():
                print(f"LỖI  {name}: không chụp được")
                continue
            dest = OUT / f"{name}.jpg"
            Image.open(png).convert("RGB").save(dest, "JPEG", quality=86, optimize=True, progressive=True)
            print(f"OK   {name}.jpg  {dest.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
