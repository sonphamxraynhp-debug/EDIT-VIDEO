"""Nạp playbook khởi đầu và kịch bản viết sẵn (thư mục seed/) vào cơ sở dữ liệu của agent."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from .config import ROOT
from .context import Ctx
from .db import now_iso
from .models import CriterionScore, Playbook, ScriptDraft, ScriptScore
from .scoring import compute_score, hard_safety_check, select_top

SEED_PLAYBOOK = ROOT / "seed" / "playbook_khoi_dau.json"


def seed_playbook(ctx: Ctx, path: Path = SEED_PLAYBOOK, force: bool = False) -> int | None:
    """Chỉ nạp khi chưa có playbook (hoặc force) — playbook thật từ kênh mẫu luôn được ưu tiên."""
    if ctx.db.latest_playbook() and not force:
        return None
    pb = Playbook.model_validate_json(Path(path).read_text(encoding="utf-8"))
    v = ctx.db.save_playbook(pb.model_dump(), "seed", "Playbook khởi đầu — thay bằng `flowagent research`")
    from .skillgen import write_skill

    write_skill(ctx)
    return v


def import_scripts(ctx: Ctx, path: Path, rejudge: bool = False) -> dict:
    """Nạp file kịch bản. rejudge=True: giám khảo AI độc lập chấm lại (cần khoá Claude API);
    ngược lại dùng điểm có sẵn trong file. Cổng an toàn bằng code luôn chạy."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    run_date = data.get("run_date") or date.today().isoformat()
    pv = ctx.prompt_vars()
    threshold = float(ctx.cfg.get_path("daily.score_threshold", 95))
    k = int(ctx.cfg.get_path("daily.max_videos", 3))
    results = []
    for item in data["scripts"]:
        draft = ScriptDraft.model_validate(item["draft"])
        if ctx.db.one("SELECT id FROM scripts WHERE run_date=? AND title=?", (run_date, draft.title)):
            continue  # đã nạp rồi
        if rejudge:
            from .planner import judge_script

            scored = judge_script(ctx, draft)
        else:
            notes = item.get("notes", {})
            raw = ScriptScore(
                criteria=[CriterionScore(key=key, score=v, reason=notes.get(key, "đạt tối đa"))
                          for key, v in item["scores"].items()],
                safety_violations=[], predicted_performance="cao", improvement_suggestions=[])
            scored = compute_score(raw, pv["rubric_list"], hard_safety_check(draft))
        cur = ctx.db.execute(
            """INSERT INTO scripts(run_date, created_at, title, topic, angle, draft_json, score_json, total_score,
                                   blocked, revision, status, rubric_version, playbook_version)
               VALUES (?,?,?,?,?,?,?,?,?,0,'proposed',?,?)""",
            (run_date, now_iso(), draft.title, draft.topic, draft.angle, draft.model_dump_json(),
             json.dumps({"per_criterion": scored.per_criterion, "violations": scored.violations,
                         "raw": scored.raw.model_dump() if scored.raw else None,
                         "scored_by": "judge" if rejudge else data.get("scored_by", "file")}, ensure_ascii=False),
             scored.total, int(scored.blocked), pv["rubric_version"], pv["playbook_version"]))
        results.append((int(cur.lastrowid), draft.topic, scored))
    chosen = select_top(results, threshold, k)
    for sid, _, _ in results:
        ctx.db.execute("UPDATE scripts SET status=? WHERE id=?", ("selected" if sid in chosen else "rejected", sid))
    ctx.db.log("import_scripts", f"{path}: {len(results)} kịch bản, chọn {chosen}")
    return {"imported": [(sid, s.total, s.blocked) for sid, _, s in results], "selected": chosen}


def render_scripts_markdown(path: Path, threshold: float = 95, k: int = 3) -> str:
    """Bản đọc cho người (và bác sĩ duyệt) của một file kịch bản seed."""
    from .scoring import DEFAULT_RUBRIC, Scored

    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = []
    for i, item in enumerate(data["scripts"], 1):
        draft = ScriptDraft.model_validate(item["draft"])
        hits = hard_safety_check(draft)
        per = dict(item["scores"])
        if hits:
            per["safety"] = 0
        rows.append((i, draft, per, item.get("notes", {}), hits,
                     Scored(total=float(sum(per.values())), per_criterion=per, blocked=bool(hits))))
    chosen = select_top([(i, d.topic, s) for i, d, _, _, _, s in rows], threshold, k)
    names = {c["key"]: c["name"] for c in DEFAULT_RUBRIC}
    out = [f"# 10 kịch bản ngày {data.get('run_date')}", "",
           f"> Chấm bởi: {data.get('scored_by')}. Ngưỡng làm video: **> {threshold:g} điểm**, tối đa {k} kịch bản.", "",
           "| # | Kịch bản | Hướng | Điểm | Kết quả |", "|---|---|---|---|---|"]
    for i, d, per, _, hits, s in rows:
        res = "✅ LÀM VIDEO" if i in chosen else ("⛔ bị chặn (an toàn)" if hits else "— loại")
        out.append(f"| {i} | {d.title} | {d.angle} | {s.total:.0f} | {res} |")
    for i, d, per, notes, hits, s in rows:
        out += ["", "---", "", f"## {i}. {d.title} — {s.total:.0f}/100 {'✅' if i in chosen else ''}", "",
                f"**Hook:** {d.hook}  ", f"**Giả thuyết:** {d.hypothesis}  ", f"**Khán giả:** {d.target_audience}", "",
                "| Cảnh | Giây | Lời thoại | Chữ trên màn hình |", "|---|---|---|---|"]
        out += [f"| {sc.idx} | {sc.seconds} | {sc.dialogue_vi} | {sc.on_screen_text_vi} |" for sc in d.scenes]
        out += ["", f"**CTA:** {d.cta}  ", f"**Caption:** {d.caption} {' '.join(d.hashtags)}", "",
                "| Tiêu chí | Điểm | Ghi chú |", "|---|---|---|"]
        out += [f"| {names.get(key, key)} | {v} | {notes.get(key, '')} |" for key, v in per.items()]
        if hits:
            out += ["", f"⛔ **Cổng an toàn chặn:** {'; '.join(hits)}"]
        out += ["", "**Cần Bác sĩ Phạm Sơn duyệt:**", *[f"- [ ] {c}" for c in d.medical_claims]]
    return "\n".join(out) + "\n"


def export_scripts(ctx: Ctx, run_date: str, out_path: Path, scored_by: str) -> Path:
    """Xuất kịch bản một ngày (kèm điểm giám khảo) ra file JSON để máy khác `import-scripts` lại."""
    rows = ctx.db.all("SELECT * FROM scripts WHERE run_date=? ORDER BY id", (run_date,))
    items = []
    for r in rows:
        score = json.loads(r["score_json"] or "{}")
        raw = score.get("raw") or {}
        notes = {c["key"]: c["reason"] for c in raw.get("criteria", [])}
        if score.get("violations"):
            notes["safety"] = "; ".join(score["violations"])
        items.append({"draft": json.loads(r["draft_json"]), "scores": score.get("per_criterion", {}), "notes": notes,
                      "revision": r["revision"], "suggestions": raw.get("improvement_suggestions", [])})
    Path(out_path).write_text(json.dumps({"run_date": run_date, "scored_by": scored_by, "scripts": items},
                                         ensure_ascii=False, indent=2), encoding="utf-8")
    return Path(out_path)
