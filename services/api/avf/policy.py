"""Cổng chính sách quảng cáo Meta / TikTok (bổ sung cho claim gate).

Bộ quy tắc theo ngành, chạy trên lời thoại + chữ màn hình của từng beat. Quy tắc chỉ phát hiện ngôn ngữ
rủi ro theo chính sách công bố (Meta Advertising Standards: Personal Health & Appearance, Personal Attributes,
Misleading Claims; TikTok Ads Policy: Prohibited/Restricted content, before/after, exaggerated results).
Không phải tư vấn pháp lý và không thay cho kiểm duyệt của nền tảng — mục tiêu là chặn sớm những câu
chắc chắn bị từ chối hoặc gây rủi ro tài khoản."""
from __future__ import annotations

import re

INDUSTRIES = {
    "general": "Chung",
    "cosmetics": "Mỹ phẩm / chăm sóc da",
    "supplements": "Thực phẩm chức năng",
    "food": "Thực phẩm & đồ uống",
    "finance": "Tài chính",
    "health_device": "Thiết bị sức khoẻ",
}
PLATFORMS = {"meta": "Facebook / Instagram", "tiktok": "TikTok"}

# (code, regex, severity, ngành áp dụng (None = tất cả), nền tảng, thông điệp, tham chiếu chính sách)
_R = [
    ("POLICY-BEFORE-AFTER", r"\btrước\s*(và|&|/|-)\s*sau\b|before\s*(and|&|/)?\s*after|sau\s+\d+\s*(ngày|tuần|tháng)\s+(da|mặt|cân|vòng)",
     "critical", {"cosmetics", "supplements", "health_device"}, {"meta", "tiktok"},
     "So sánh trước/sau về cơ thể, da, cân nặng — Meta và TikTok từ chối quảng cáo dạng này",
     "Meta: Personal Health and Appearance · TikTok: Before-and-after imagery"),
    ("POLICY-GUARANTEE", r"\b(cam kết|đảm bảo|bảo đảm)\s+(hiệu quả|kết quả|hết|khỏi|trắng|giảm)|\b100\s*%\s*(hiệu quả|hết|khỏi|an toàn)|"
     r"\bchắc chắn\s+(hết|khỏi|giảm|trắng)|\b(hết|khỏi)\s+hẳn\b|\bhoàn toàn\s+(hết|khỏi)\b|\bvĩnh viễn\b",
     "critical", None, {"meta", "tiktok"},
     "Cam kết kết quả tuyệt đối — bị xếp vào 'misleading / exaggerated claims'",
     "Meta: Misleading Claims · TikTok: Exaggerated performance claims"),
    ("POLICY-MEDICAL", r"\b(chữa|điều trị|trị)\s+(khỏi|dứt|tận gốc|bệnh|mụn|nám|viêm|ung thư|tiểu đường|huyết áp)|\bkháng\s*(viêm|khuẩn)\b|"
     r"\bdiệt\s*khuẩn\b|\bthay thế\s+thuốc\b|\bkê\s*đơn\b|\bbác sĩ\s+khuyên\s+dùng\b",
     "critical", {"cosmetics", "supplements", "food", "general"}, {"meta", "tiktok"},
     "Công dụng y khoa (chữa/điều trị/kháng viêm) không được dùng cho mỹ phẩm, TPCN, thực phẩm",
     "Meta: Personal Health · TikTok: Medical claims for non-pharma"),
    ("POLICY-WEIGHT", r"\bgiảm\s+\d+\s*(kg|cân|ký)\b|\bgiảm\s+cân\s+(cấp tốc|thần tốc|nhanh chóng|siêu tốc)|\bđốt\s+mỡ\b|\bgiảm\s+mỡ\s+bụng\b",
     "critical", None, {"meta", "tiktok"},
     "Hứa hẹn giảm cân theo số kg / cấp tốc — nhóm bị hạn chế mạnh nhất trên cả hai nền tảng",
     "Meta: Weight loss products & claims · TikTok: Weight management (restricted)"),
    ("POLICY-PERSONAL", r"\b(bạn|chị|anh|em)\s+(đang\s+)?(béo|mập|xấu|già|lùn|đen|xấu xí|nhiều mụn|sạm)\b|\bda\s+(bạn|chị)\s+(xấu|tệ|sạm|đen)\b|"
     r"\bbạn\s+bị\s+(mụn|nám|hói|béo|tiểu đường)\b",
     "critical", None, {"meta", "tiktok"},
     "Ám chỉ đặc điểm cá nhân của người xem (ngoại hình, tình trạng sức khoẻ) — Meta cấm 'personal attributes'",
     "Meta: Personal Attributes · TikTok: Body shaming / negative self-perception"),
    ("POLICY-SUPERLATIVE", r"\b(số\s*1|số một|tốt nhất|duy nhất|đầu tiên|hàng đầu|độc quyền)\b(?!.*(theo|nguồn|khảo sát|chứng nhận))",
     "warning", None, {"meta", "tiktok"},
     "So sánh nhất ('số 1', 'tốt nhất', 'duy nhất') cần nguồn kiểm chứng, nếu không dễ bị từ chối",
     "Meta: Unsubstantiated claims · TikTok: Superlative claims require proof"),
    ("POLICY-URGENCY", r"\bchỉ\s+(hôm nay|trong\s+hôm nay|còn\s+\d+\s+(suất|chỗ|sản phẩm))|\bduy nhất\s+hôm nay\b|\bnhanh tay\s+kẻo\s+(hết|lỡ)\b|\bsắp\s+hết\s+hàng\b",
     "warning", None, {"meta", "tiktok"},
     "Khan hiếm/khẩn cấp không kiểm chứng được — Meta xếp vào 'misleading', TikTok yêu cầu đúng sự thật",
     "Meta: Misleading Claims (false urgency) · TikTok: Misleading promotions"),
    ("POLICY-PRICE", r"\b(giảm\s+giá|khuyến\s*mãi|ưu\s+đãi|miễn\s+phí|freeship|sale|giá\s+sốc|\d+\s*%\s*(off|giảm))\b",
     "warning", None, {"meta", "tiktok"},
     "Ưu đãi/giá nêu trong video phải khớp trang đích và còn hiệu lực lúc chạy quảng cáo",
     "Meta: Misleading Claims (offers) · TikTok: Price accuracy"),
    ("POLICY-TESTIMONIAL", r"\b(\d+|hàng\s+(nghìn|ngàn|triệu))\s+(khách|người|chị em)\s+(đã\s+)?(tin dùng|dùng|mua|hài lòng)\b|\bđánh giá\s+5\s*sao\b|\bchuyên gia\s+(khuyên|khuyến nghị)\b",
     "warning", None, {"meta", "tiktok"},
     "Số khách hàng / đánh giá / chuyên gia khuyên dùng cần bằng chứng kèm theo",
     "Meta: Unsubstantiated claims · TikTok: Fake testimonials"),
    ("POLICY-FINANCE", r"\b(lợi\s+nhuận|lãi\s+suất|x\d+\s*lần|nhân\s+\d+\s*lần|làm\s+giàu|thu\s+nhập\s+thụ\s+động)\b",
     "critical", {"finance"}, {"meta", "tiktok"},
     "Hứa hẹn lợi nhuận tài chính — bị cấm/ hạn chế theo giấy phép",
     "Meta: Financial products & services · TikTok: Financial services (restricted)"),
    ("POLICY-ALCOHOL-TOBACCO", r"\b(rượu|bia|thuốc\s+lá|vape|pod|cần\s+sa)\b",
     "critical", None, {"tiktok"},
     "TikTok cấm quảng cáo rượu bia, thuốc lá, vape",
     "TikTok: Prohibited industries"),
]
RULES = [{"code": c, "re": re.compile(r, re.IGNORECASE), "severity": s, "industries": i, "platforms": p, "message": m, "ref": ref}
         for c, r, s, i, p, m, ref in _R]

_PCT = re.compile(r"\d+([.,]\d+)?\s*%")

_INDUSTRY_HINTS = [
    ("supplements", ("thực phẩm chức năng", "tpcn", "bổ sung", "viên uống", "collagen", "vitamin")),
    ("cosmetics", ("mỹ phẩm", "chăm sóc da", "skincare", "serum", "kem", "dưỡng", "son", "trang điểm", "tóc")),
    ("food", ("thực phẩm", "đồ uống", "trà", "cà phê", "bánh", "sữa", "gia vị")),
    ("finance", ("tài chính", "đầu tư", "bảo hiểm", "vay", "chứng khoán", "crypto")),
    ("health_device", ("máy massage", "thiết bị y tế", "máy đo", "đai lưng")),
]


def detect_industry(product: dict | None, brief: dict | None = None) -> str:
    if brief and brief.get("industry") in INDUSTRIES:
        return brief["industry"]
    text = " ".join(str(x) for x in [(product or {}).get("name", ""),
                                     ((product or {}).get("attributes_json") or {}).get("category", "")]).lower()
    for ind, words in _INDUSTRY_HINTS:
        if any(w in text for w in words):
            return ind
    return "general"


def check_policy(beats: list[dict], industry: str = "general", platforms: set[str] | None = None) -> list[dict]:
    """Trả flags cùng định dạng claim gate: {beat, code, severity, message, ref, platforms}."""
    platforms = platforms or {"meta", "tiktok"}
    flags: list[dict] = []
    for i, b in enumerate(beats):
        text = f"{b.get('text', '')} {b.get('on_screen', '')}"
        for r in RULES:
            if r["industries"] and industry not in r["industries"]:
                continue
            if not (r["platforms"] & platforms):
                continue
            if r["re"].search(text):
                flags.append({"beat": i, "code": r["code"], "severity": r["severity"], "message": r["message"],
                              "ref": r["ref"], "platforms": sorted(r["platforms"] & platforms)})
        if _PCT.search(text) and not b.get("claim_ids"):
            flags.append({"beat": i, "code": "POLICY-NUMBER", "severity": "warning",
                          "message": "Số liệu phần trăm không gắn claim/nguồn — cần dẫn chứng hoặc bỏ",
                          "ref": "Meta/TikTok: Unsubstantiated claims", "platforms": sorted(platforms)})
    return flags


# vùng UI của TikTok (tỷ lệ theo canvas 9:16): chữ nằm trong vùng này bị icon/caption của app che
TIKTOK_UI = {"bottom": 0.26, "right": 0.14, "top": 0.10}


def text_in_tiktok_ui(y_top: float, y_bottom: float, x_right: float = 0.5) -> bool:
    """Toạ độ tỷ lệ (0–1). Trả True nếu khối chữ chạm vùng UI TikTok."""
    return y_bottom > 1 - TIKTOK_UI["bottom"] or y_top < TIKTOK_UI["top"] or x_right > 1 - TIKTOK_UI["right"]
