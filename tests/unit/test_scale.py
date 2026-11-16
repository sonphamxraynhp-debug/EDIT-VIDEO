"""GĐ1–3: cổng chính sách, thư viện hook, cổng nguồn, điểm nguyên bản, trọng số ma trận, bố cục render."""
import subprocess

import pytest

from avf import creative, media, policy, render, scale
from avf.errors import AppError


def beats(*texts, claim=False):
    return [{"text": t, "on_screen": "", "claim_ids": ["c1"] if claim else []} for t in texts]


def test_policy_before_after_only_for_body_industries():
    f = policy.check_policy(beats("Nhìn da trước và sau 7 ngày"), "cosmetics")
    assert any(x["code"] == "POLICY-BEFORE-AFTER" and x["severity"] == "critical" for x in f)
    assert not any(x["code"] == "POLICY-BEFORE-AFTER" for x in policy.check_policy(beats("Nhìn da trước và sau 7 ngày"), "finance"))


def test_policy_guarantee_personal_and_number():
    f = policy.check_policy(beats("Cam kết hiệu quả 100%", "Bạn đang béo đúng không", "Giảm 40% thời gian"), "general")
    codes = {x["code"]: x["severity"] for x in f}
    assert codes["POLICY-GUARANTEE"] == "critical" and codes["POLICY-PERSONAL"] == "critical"
    assert codes["POLICY-NUMBER"] == "warning"
    assert not any(x["code"] == "POLICY-NUMBER" for x in policy.check_policy(beats("Giảm 40% thời gian", claim=True), "general"))


def test_policy_platform_scope_and_industry_detect():
    f = policy.check_policy(beats("Thưởng thức rượu vang"), "general", {"meta"})
    assert not any(x["code"] == "POLICY-ALCOHOL-TOBACCO" for x in f)
    assert any(x["code"] == "POLICY-ALCOHOL-TOBACCO" for x in policy.check_policy(beats("Thưởng thức rượu vang"), "general", {"tiktok"}))
    assert policy.detect_industry({"name": "Serum dưỡng ẩm", "attributes_json": {"category": "Chăm sóc da"}}) == "cosmetics"
    assert policy.detect_industry({"name": "X", "attributes_json": {}}, {"industry": "finance"}) == "finance"


def test_tiktok_ui_zone():
    assert policy.text_in_tiktok_ui(0.80, 0.90)          # chạm đáy
    assert policy.text_in_tiktok_ui(0.50, 0.60, 0.95)    # chạm phải
    assert not policy.text_in_tiktok_ui(0.55, 0.70, 0.80)


def test_source_gate_scales_with_target():
    assert scale.source_requirement(10) == (1, 1)
    assert scale.source_requirement(50) == (3, 12)
    assert scale.source_requirement(500) == (8, 40)
    with pytest.raises(AppError) as e:
        scale.check_source_gate({"assets": 1, "scenes": 8, "tags": {}}, 100)
    assert e.value.code == "NEED_MORE_SOURCE"
    w = scale.check_source_gate({"assets": 1, "scenes": 8, "tags": {}}, 100, {"allow_low_source": True})
    assert w and w[0]["severity"] == "warning"
    assert scale.check_source_gate({"assets": 6, "scenes": 30, "tags": {}}, 100) == []


def test_composite_similarity_rewards_real_differences():
    a = {"text": "ba bước dùng serum mỗi sáng", "hook": "Bạn đã dùng serum đúng chưa", "scenes": ["s1", "s2", "s3"],
         "motions": [], "alts": [], "format": "full", "voice": {"voice": "Linh", "provider": "os_say", "rate": 1.0},
         "music": None, "font": 0}
    same = scale.composite_similarity(a, dict(a))
    assert same["total"] >= 0.99
    b = {**a, "format": "split", "font": 2, "voice": {**a["voice"], "rate": 1.08}, "music": "/m/x.mp3",
         "scenes": ["s1", "s4", "s5"], "hook": "Sai lầm phổ biến khi dùng serum"}
    diff = scale.composite_similarity(a, b)
    assert diff["visual"] < same["visual"] and diff["audio"] < same["audio"] and diff["total"] < 0.6


def test_plan_matrix_weights_reorder():
    scenes = [{"tags_json": ["demonstration", "hand", "packshot", "face"], "review": "approved"}] * 4
    claims = [{"id": "c", "status": "approved", "text": "x"}]
    brief = {"audiences": ["new_buyers"], "creative_angles": ["faq", "checklist"], "narratives": ["faq"],
             "durations_sec": [15], "formats": ["full"]}
    plain = creative.plan_matrix(brief, scenes, claims, 1)["chosen"][0]["angle"]
    other = "checklist" if plain == "faq" else "faq"
    weighted = creative.plan_matrix(brief, scenes, claims, 1, weights={"angle": {other: 2.0, plain: 0.5}})["chosen"][0]["angle"]
    assert weighted == other


def _src(tmp_path, name, color, size):
    p = tmp_path / name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={color}:s={size}:d=3:r=30",
                    "-c:v", "libx264", str(p)], check=True)
    return p


@pytest.mark.parametrize("layout", ["split", "pip", "packshot_text"])
def test_layouts_render_with_alt_scene_and_outro(tmp_path, layout):
    a, b = _src(tmp_path, "a.mp4", "red", "540x960"), _src(tmp_path, "b.mp4", "blue", "960x540")
    tl = {"canvas": {"width": 1080, "height": 1920, "fps": 30}, "duration_ms": 2000, "layout": layout,
          "style": {"font": 1, "caption_position": "mid"},
          "tracks": {"video": [{"asset_id": "a", "src_in_ms": 0, "src_out_ms": 2000, "start_ms": 0, "end_ms": 2000,
                                "layout": layout, "motion": "zoom_in",
                                "alt": {"asset_id": "b", "scene_id": "sb", "src_in_ms": 0, "src_out_ms": 3000}}],
                     "captions": [{"start_ms": 0, "end_ms": 2000, "text": "Phụ đề thử bố cục"}],
                     "titles": [{"start_ms": 0, "end_ms": 1500, "text": "HOOK", "style": "hook"}]}}
    out = tmp_path / f"{layout}.mp4"
    style = {"font": scale.FONT_VARIANTS[0], "tiktok_safe": True, "dark": "#101010", "accent": "#7B56FF",
             "outro": {"enabled": True, "text": "Tìm hiểu thêm"}}
    res = render.render_timeline(tl, {"a": a, "b": b}, out, tmp_path / "w", "preview", style)
    assert out.exists() and res["outro_ms"] == 1800
    m = media.probe(out)
    assert m["duration_ms"] >= 3700 and (m["width"], m["height"]) == (540, 960)
    assert res["tiktok_ui_overlap"] == 0        # chữ đã được đẩy lên khỏi vùng UI TikTok
