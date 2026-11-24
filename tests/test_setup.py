import json
from pathlib import Path
from flow_agent.setup_wizard import print_checks, run_checks

ROOT = Path(__file__).resolve().parents[1]


def test_doctor_reports_missing_items(ctx, monkeypatch, capsys):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.setattr("flow_agent.llm.find_claude_cli", lambda: None)
    checks = {c.name: c for c in run_checks(ctx.cfg)}
    assert not checks["Claude Code (dùng gói Max, không tốn tiền API)"].ok
    assert not checks["Đã đăng nhập Facebook (hồ sơ trình duyệt)"].ok
    assert print_checks(list(checks.values())) is False
    assert "python -m flow_agent setup (tự cài)" in capsys.readouterr().out


def test_seed_files_import(tmp_path):
    from pathlib import Path

    from flow_agent.config import ROOT, load_config
    from flow_agent.context import Ctx
    from flow_agent.db import DB
    from flow_agent.seeding import import_scripts, seed_playbook

    cfg = load_config(tmp_path / "missing.yaml")
    cfg["data_dir"] = str(tmp_path / "data")
    cfg["skill_dir"] = str(tmp_path / "skill")
    c = Ctx(cfg=cfg, db=DB(tmp_path / "agent.db"))
    assert seed_playbook(c) == 1 and seed_playbook(c) is None
    res = import_scripts(c, ROOT / "seed" / "kich-ban-2026-11-21.json")
    assert len(res["imported"]) == 10 and len(res["selected"]) == 3
    titles = [c.db.one("SELECT title FROM scripts WHERE id=?", (i,))["title"] for i in res["selected"]]
    assert titles[0].startswith("8 mốc siêu âm")
    blocked = [b for _, _, b in res["imported"] if b]
    assert len(blocked) == 2
    assert import_scripts(c, ROOT / "seed" / "kich-ban-2026-11-21.json")["imported"] == []  # không nạp trùng
    assert Path(c.cfg.path("skill_dir") / "SKILL.md").exists()


def test_auto_mode_never_prompts(monkeypatch):
    import flow_agent.setup_wizard as sw

    monkeypatch.setattr("builtins.input", lambda *a: (_ for _ in ()).throw(AssertionError("không được hỏi")))
    monkeypatch.setattr(sw, "AUTO", True)
    assert sw._yes("x") is True and sw._yes("y", False) is False and sw._ask("z", "d") == "d"


def test_export_then_import_roundtrip(ctx, tmp_path):
    from conftest import make_draft
    from flow_agent.llm import FakeLLM
    from flow_agent.models import CriterionScore, ScriptBatch, ScriptScore
    from flow_agent.planner import run_daily_planning
    from flow_agent.seeding import export_scripts, import_scripts
    from datetime import date

    full = {"hook": 20, "formula": 20, "density": 15, "tone": 15, "cta": 10, "feasibility": 10, "safety": 10}

    def handler(schema, system, content):
        if schema is ScriptBatch:
            return ScriptBatch(scripts=[make_draft(i) for i in range(4)])
        return ScriptScore(criteria=[CriterionScore(key=k, score=v, reason="lý do " + k) for k, v in full.items()],
                           safety_violations=[], predicted_performance="cao", improvement_suggestions=["gợi ý"])

    ctx.llm = ctx.judge = FakeLLM(handler)
    run_daily_planning(ctx)
    out = export_scripts(ctx, date.today().isoformat(), tmp_path / "x.json", "test")
    ctx.db.execute("DELETE FROM scripts")
    res = import_scripts(ctx, out)
    assert len(res["imported"]) == 4 and len(res["selected"]) == 3
    assert all(t == 100 for _, t, _ in res["imported"])


def test_make_video_now_picks_best_unblocked_from_latest_seed(ctx, monkeypatch, tmp_path):
    import flow_agent.pipeline as pl

    made, uploaded = [], []

    def fake_produce(c, sid):
        made.append(sid)
        out = tmp_path / "prod" / "final.mp4"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"x")
        pid = c.db.execute("INSERT INTO productions(script_id, created_at, status, video_path) VALUES (?,?,?,?)",
                           (sid, "t", "produced", str(out))).lastrowid
        c.db.execute("UPDATE scripts SET status='produced' WHERE id=?", (sid,))
        return pid

    monkeypatch.setattr(pl, "produce", fake_produce)
    refs = []
    monkeypatch.setattr("flow_agent.facebook.avatar.fetch_own_avatar", lambda cfg, d: refs.append(d) or None)
    ctx.cfg["video"]["flow"]["reference_dir"] = str(tmp_path / "anh-trong")
    monkeypatch.setattr(pl, "upload", lambda c, pid: uploaded.append(pid) or "https://www.facebook.com/reel/1")
    out = pl.make_video_now(ctx)
    row = ctx.db.one("SELECT * FROM scripts WHERE id=?", (out["script_id"],))
    latest = json.loads(sorted((ROOT / "seed").glob("kich-ban-*.json"))[-1].read_text(encoding="utf-8"))
    best = max(sum(x["scores"].values()) for x in latest["scripts"])
    assert row["run_date"] == latest["run_date"] and row["total_score"] == best and not row["blocked"]
    assert uploaded == [out["production_id"]] and out["privacy"] == "Chỉ mình tôi"
    assert refs == [tmp_path / "anh-trong"]   # thư mục ảnh trống -> thử lấy ảnh đại diện Facebook
    assert "dưới ngưỡng" in ctx.db.one("SELECT * FROM events WHERE kind='manual_video'")["message"]
    # lần sau lấy bản kế tiếp, không làm lại bản đã làm
    assert pl.make_video_now(ctx, do_upload=False)["script_id"] != out["script_id"]


def test_wait_logged_in_detects_cookie_without_enter():
    from flow_agent.setup_wizard import _wait_logged_in

    class B:
        calls = 0

        def cookies(self, url):
            B.calls += 1
            return [{"name": "c_user"}] if B.calls >= 3 else [{"name": "datr"}]

    class P:
        def wait_for_timeout(self, ms):
            pass

    assert _wait_logged_in(B(), P(), "Facebook", timeout_s=60, poll_ms=1) is True
    B.calls = -10**9  # không bao giờ đăng nhập -> hết giờ thì trả False, không treo
    assert _wait_logged_in(B(), P(), "Google Flow", timeout_s=0, poll_ms=1) is False
