from flow_agent.facebook.parse import (
    canonical_video_url, channel_tab_urls, extract_stats, parse_count, video_id_from_url,
)


def test_parse_count_vi_en():
    assert parse_count("1,2K") == 1200
    assert parse_count("1.2K views") == 1200
    assert parse_count("3,4 Tr lượt xem") == 3_400_000
    assert parse_count("12 N") == 12_000
    assert parse_count("1.234") == 1234
    assert parse_count("987") == 987
    assert parse_count("2 triệu") == 2_000_000
    assert parse_count("") is None
    assert parse_count("không có số") is None


def test_extract_stats():
    text = "12 N lượt xem · Tất cả cảm xúc: 1,5K · 230 bình luận · 45 lượt chia sẻ"
    s = extract_stats(text)
    assert s == {"views": 12000, "reactions": 1500, "comments": 230, "shares": 45}


def test_urls():
    assert video_id_from_url("https://www.facebook.com/reel/1234567890123?s=1") == "1234567890123"
    assert video_id_from_url("https://www.facebook.com/watch/?v=998877665544") == "998877665544"
    assert canonical_video_url("https://www.facebook.com/abc/videos/112233445566/") == "https://www.facebook.com/watch/?v=112233445566"
    assert channel_tab_urls("https://www.facebook.com/profile.php?id=61594456071180")[0].endswith("id=61594456071180&sk=reels_tab")
    assert channel_tab_urls("https://www.facebook.com/bsphamson.cdha?locale=vi_VN")[0] == "https://www.facebook.com/bsphamson.cdha/reels/"
