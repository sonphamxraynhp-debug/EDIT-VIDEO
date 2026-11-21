from conftest import make_draft

from flow_agent.models import CriterionScore, ScriptScore
from flow_agent.scoring import (
    DEFAULT_RUBRIC, Scored, compute_score, hard_safety_check, normalize_rubric, select_top,
)


def test_hard_safety_catches_violations():
    assert hard_safety_check(make_draft(1)) == []
    assert hard_safety_check(make_draft(1, text="Siêu âm chính xác 100% nhé"))
    assert hard_safety_check(make_draft(1, text="Đoán xem bé trai hay bé gái"))
    assert hard_safety_check(make_draft(1, text="Phòng khám tốt nhất Hưng Yên"))
    assert hard_safety_check(make_draft(1, text="Gói chỉ 2.190.000đ thôi"))
    d = make_draft(1)
    d.scenes[0].seconds = 12
    assert any("8s" in h for h in hard_safety_check(d))


def test_normalize_rubric_sums_100_and_fixes_safety():
    r = normalize_rubric([{**c, "max": (40 if c["key"] == "hook" else c["max"])} for c in DEFAULT_RUBRIC])
    assert sum(c["max"] for c in r) == 100
    assert next(c for c in r if c["key"] == "safety")["max"] == 10
    assert all(5 <= c["max"] <= 30 for c in r if c["key"] != "safety")


def _score(values: dict, violations=()):
    return ScriptScore(criteria=[CriterionScore(key=k, score=v, reason="") for k, v in values.items()],
                       safety_violations=list(violations), predicted_performance="cao", improvement_suggestions=[])


def test_compute_score_clamps_and_blocks():
    rubric = normalize_rubric(DEFAULT_RUBRIC)
    full = {c["key"]: c["max"] + 50 for c in rubric}  # giám khảo cho quá điểm tối đa -> bị kẹp lại
    s = compute_score(_score(full), rubric, [])
    assert s.total == 100 and not s.blocked
    s2 = compute_score(_score(full), rubric, ["Từ cấm"])
    assert s2.blocked and s2.per_criterion["safety"] == 0 and s2.total == 90


def test_select_top_strictly_above_threshold_and_unique_topics():
    def sc(t, blocked=False):
        return Scored(total=t, per_criterion={}, blocked=blocked)
    cands = [(1, "A", sc(99)), (2, "A", sc(98)), (3, "B", sc(97)), (4, "C", sc(95)),
             (5, "D", sc(100, blocked=True)), (6, "E", sc(96)), (7, "F", sc(96.5))]
    assert select_top(cands, 95, 3) == [1, 3, 7]
    assert select_top([(1, "A", sc(95))], 95, 3) == []
