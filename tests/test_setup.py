from flow_agent.setup_wizard import print_checks, run_checks


def test_doctor_reports_missing_items(ctx, monkeypatch, capsys):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    checks = {c.name: c for c in run_checks(ctx.cfg)}
    assert not checks["Khoá Claude API"].ok
    assert not checks["Đã đăng nhập Facebook (hồ sơ trình duyệt)"].ok
    assert print_checks(list(checks.values())) is False
    assert "Điền ANTHROPIC_API_KEY" in capsys.readouterr().out
