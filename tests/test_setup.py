from flow_agent.setup_wizard import print_checks, run_checks


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
