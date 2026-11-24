import json
from datetime import datetime, timedelta, timezone

from conftest import make_draft, make_playbook

from flow_agent.learner import compute_stats, learn, spearman, views_at
from flow_agent.llm import FakeLLM
from flow_agent.models import CriterionScore, LearningUpdate, RubricChange, ScriptBatch, ScriptScore
from flow_agent.planner import run_daily_planning
from flow_agent.skillgen import write_skill

# điểm giám khảo cho từng kịch bản (theo title) — tổng = hook+formula+density+tone+cta+feasibility+safety
SCORES = {f"Kịch bản {i}": s for i, s in enumerate([99, 98, 97, 96, 95, 90, 80, 70, 60, 99])}


def _criteria(total):
    # phân bổ: trừ dần từ hook
    base = {"hook": 20, "formula": 20, "density": 15, "tone": 15, "cta": 10, "feasibility": 10, "safety": 10}
    base["hook"] -= 100 - total
    return [CriterionScore(key=k, score=v, reason="ok") for k, v in base.items()]


def make_handler(revise_to=None):
    def handler(schema, system, content):
        if schema is ScriptBatch:
            if "Sửa kịch bản" in content:
                d = make_draft(0, topic="đã sửa")
                d.title = revise_to or "Kịch bản 5"
                return ScriptBatch(scripts=[d])
            drafts = [make_draft(i) for i in range(10)]
            drafts[9] = make_draft(9, topic="chủ đề 0")              # trùng chủ đề với #0
            drafts[3] = make_draft(3, text="Biết ngay bé trai hay bé gái")  # vi phạm -> bị chặn
            return ScriptBatch(scripts=drafts)
        if schema is ScriptScore:
            title = json.loads(content.split("\n\n", 1)[1])["title"]
            return ScriptScore(criteria=_criteria(SCORES.get(title, 50)), safety_violations=[],
                               predicted_performance="cao", improvement_suggestions=["x"])
        raise AssertionError(schema)
    return handler


def test_daily_planning_selects_top3_above_95(ctx):
    llm = FakeLLM(make_handler())
    ctx.llm = ctx.judge = llm
    ctx.cfg["daily"]["revision_rounds"] = 0
    out = run_daily_planning(ctx)
    assert len(out["proposed"]) == 10
    titles = {r["id"]: r["title"] for r in ctx.db.all("SELECT id, title FROM scripts")}
    chosen = [titles[i] for i in out["selected"]]
    # 99 (#0), 99 (#9 trùng chủ đề #0 -> bỏ), 98 (#1), 97 (#2), 96 (#3 bị chặn vì giới tính) -> #0, #1, #2
    assert chosen == ["Kịch bản 0", "Kịch bản 1", "Kịch bản 2"]
    blocked = ctx.db.one("SELECT * FROM scripts WHERE title='Kịch bản 3'")
    assert blocked["blocked"] == 1 and blocked["status"] == "rejected"
    assert ctx.db.one("SELECT COUNT(*) n FROM scripts WHERE status='selected'")["n"] == 3


def test_revision_round_can_lift_script(ctx):
    llm = FakeLLM(make_handler(revise_to="Kịch bản 1"))  # bản sửa được chấm 98
    ctx.llm = ctx.judge = llm
    ctx.cfg["daily"]["revision_rounds"] = 1
    run_daily_planning(ctx)
    revised = ctx.db.all("SELECT * FROM scripts WHERE revision=1")
    assert revised and all(r["total_score"] == 98 for r in revised if not r["blocked"])


def test_revision_keeps_best_version_and_polishes_near_misses(ctx):
    llm = FakeLLM(make_handler(revise_to="Kịch bản 8"))  # mọi bản sửa đều tụt xuống 60
    ctx.llm = ctx.judge = llm
    ctx.cfg["daily"]["revision_rounds"] = 1
    ctx.cfg["daily"]["polish_rounds"] = 2
    run_daily_planning(ctx)
    # bản sửa tụt điểm bị bỏ: kịch bản gốc 90/80/70 vẫn giữ nguyên điểm, không bị thay bằng 60
    totals = sorted(r["total_score"] for r in ctx.db.all("SELECT total_score FROM scripts WHERE blocked=0"))
    assert 60 not in totals[1:] and 90 in totals
    polished = ctx.db.one("SELECT revision FROM scripts WHERE title='Kịch bản 5'")
    assert polished["revision"] >= 1


def test_views_at_and_spearman():
    series = [(2, 100), (6, 500), (26, 2500), (50, 4000)]
    assert views_at(series, 6) == 500
    assert views_at(series, 16) == 1500
    assert views_at(series, 48) == 2500 + (4000 - 2500) * 22 / 24
    assert views_at(series, 72) is None
    assert spearman([1, 2, 3, 4], [10, 20, 30, 40]) == 1.0
    assert spearman([1, 2, 3, 4], [40, 30, 20, 10]) == -1.0


def _publish_video(ctx, i, score, views_by_hour):
    d = make_draft(i)
    sid = ctx.db.execute(
        "INSERT INTO scripts(run_date, created_at, title, topic, angle, draft_json, score_json, total_score, status)"
        " VALUES ('2026-11-01','x',?,?,?,?,?,?, 'approved')",
        (d.title, d.topic, d.angle, d.model_dump_json(), json.dumps({"per_criterion": {"hook": score - 80}}), score),
    ).lastrowid
    t0 = datetime(2026, 11, 1, tzinfo=timezone.utc)
    pid = ctx.db.execute("INSERT INTO productions(script_id, created_at, status, approved_at) VALUES (?,?,?,?)",
                         (sid, t0.isoformat(), "approved", t0.isoformat())).lastrowid
    vid = ctx.db.upsert_video("own", f"https://www.facebook.com/reel/{1000000 + i}", production_id=pid, privacy="public")
    for h, v in views_by_hour:
        ctx.db.add_metrics(vid, v, ts=(t0 + timedelta(hours=h)).isoformat())


def test_learn_skips_without_data(ctx):
    ctx.llm = FakeLLM(lambda *a: (_ for _ in ()).throw(AssertionError("không được gọi LLM")))
    out = learn(ctx)
    assert "skipped" in out


def test_learn_updates_lessons_rubric_playbook_and_skill(ctx):
    for i, (score, v) in enumerate([(96, 9000), (97, 3000), (99, 1000), (98, 5000)]):
        _publish_video(ctx, i, score, [(2, v // 10), (24, v // 2), (50, v)])
    stats = compute_stats(__import__("flow_agent.learner", fromlist=["x"]).collect_samples(ctx))
    assert stats["n_mature"] == 4 and stats["corr_total_vs_views48h"] < 0  # giám khảo đang chấm lệch

    pb = make_playbook()
    pb.summary = "Playbook đã học từ số liệu thật"

    def handler(schema, system, content):
        assert schema is LearningUpdate
        assert "corr_total_vs_views48h" in content
        return LearningUpdate(observations=["Video điểm cao nhất lại ít view nhất"], new_lessons=["Hook phải nêu tuần thai cụ thể"],
                              retire_lesson_ids=[], rubric_changes=[RubricChange(key="hook", new_max=25, reason="hook quyết định view"),
                                                                    RubricChange(key="safety", new_max=0, reason="không được phép")],
                              topics_double_down=["mốc siêu âm"], topics_drop=[], experiments_next=["thử 60s"],
                              update_playbook=True, playbook=pb, confidence="trung bình")
    ctx.llm = FakeLLM(handler)
    out = learn(ctx)
    assert out["applied"]["lessons_added"] and out["applied"]["rubric_version"] and out["applied"]["playbook_version"]
    _, rubric = ctx.rubric()
    assert sum(c["max"] for c in rubric) == 100
    assert next(c for c in rubric if c["key"] == "safety")["max"] == 10
    assert next(c for c in rubric if c["key"] == "hook")["max"] == 25
    skill = (ctx.cfg.path("skill_dir") / "SKILL.md").read_text(encoding="utf-8")
    assert "Playbook đã học từ số liệu thật" in skill and "Hook phải nêu tuần thai cụ thể" in skill


def test_skill_written(ctx):
    path = write_skill(ctx)
    text = open(path, encoding="utf-8").read()
    assert text.startswith("---\nname: cong-thuc-kenh-mau")
    assert "Character bible" in text


def test_learn_from_judge_adds_capped_lessons(ctx):
    from flow_agent.models import JudgeLessons
    from flow_agent.planner import MAX_JUDGE_LESSONS, learn_from_judge
    from flow_agent.scoring import Scored

    raw = ScriptScore(criteria=_criteria(80), safety_violations=[], predicted_performance="cao", improvement_suggestions=["ngắn hơn"])
    calls = iter(range(100))
    ctx.llm = FakeLLM(lambda schema, s, c: JudgeLessons(rules=[f"Quy tắc {next(calls)}" for _ in range(5)]))
    for _ in range(3):
        learn_from_judge(ctx, [(1, "a", Scored(total=80, per_criterion={}, blocked=False, raw=raw))])
    rows = [r for r in ctx.db.active_lessons() if r["source"] == "judge"]
    assert len(rows) == MAX_JUDGE_LESSONS and rows[-1]["text"] == "[Giám khảo] Quy tắc 14"


def test_pass_needs_second_independent_judge(ctx):
    from flow_agent.planner import _improve
    calls = []

    def handler(schema, system, content):
        if schema is ScriptBatch:
            return ScriptBatch(scripts=[make_draft(1)])
        calls.append(1)
        total = 99 if len(calls) == 1 else 90  # lần chấm đầu may mắn, lần xác nhận thấp hơn
        return ScriptScore(criteria=_criteria(total), safety_violations=[], predicted_performance="cao",
                           improvement_suggestions=[])
    ctx.llm = ctx.judge = FakeLLM(handler)
    _, sc, _ = _improve(ctx, make_draft(0), rounds=0, threshold=95)
    assert sc.total == 90 and len(calls) == 2
