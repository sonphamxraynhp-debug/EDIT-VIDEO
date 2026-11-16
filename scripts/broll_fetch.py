"""Fetch real stock b-roll (video or photo) by keyword, normalised for the engine, with license credits.

usage: python broll_fetch.py "doanh thu tăng" <project>/broll [--n 4] [--kind video|photo] [--dur 4]
                             [--src pexels,pixabay,commons,openverse] [--frames] [--vertical]
Providers (all free-to-use licenses; keys are free from the provider's site):
  pexels    PEXELS_API_KEY      videos + photos, Pexels License (no attribution required)
  pixabay   PIXABAY_API_KEY     videos + photos, Pixabay Content License
  commons   no key              Wikimedia Commons videos/photos — CC BY / CC BY-SA / PD: keep credits.json
  openverse no key              CC photos — keep credits.json
Vietnamese queries are translated with assets/broll/keywords_vi_en.tsv (fallback: query as-is).
Output per clip: <out>/<slug>_<n>.mp4 (1280×720, 30 fps, <dur> s, no audio) [+ <slug>_<n>/%05d.jpg with --frames],
photos: <slug>_<n>.jpg (1280×720 crop). Appends to <out>/credits.json. Prints media JSON ready for timeline.json.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.parse
import urllib.request

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "video-edit-ai-hype-cam/2.0 (broll fetcher)"


def fold(s):
    s = unicodedata.normalize("NFD", s.lower()).replace("đ", "d")
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-")[:40]


def translate(q):
    """Longest-match Vietnamese -> English using the keyword table; untouched words pass through."""
    table = {}
    path = os.path.join(SKILL, "assets/broll/keywords_vi_en.tsv")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if "\t" in line and not line.startswith("#"):
                vi, en = line.rstrip("\n").split("\t", 1)
                table[fold(vi)] = en
    orig = q.lower().split()
    words, out, i = [fold(w) for w in orig], [], 0
    while i < len(words):
        for n in range(min(5, len(words) - i), 0, -1):
            k = " ".join(words[i:i + n])
            if k in table:
                out.append(table[k])
                i += n
                break
        else:
            if orig[i].isascii() and len(orig[i]) > 2:  # keep English words, drop untranslated Vietnamese
                out.append(words[i])
            i += 1
    return " ".join(dict.fromkeys(" ".join(out).split())) or q


def get_json(url, headers=None, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001 — network providers fail in many ways; retry then skip
            if k == tries - 1:
                print(f"  ! {urllib.parse.urlsplit(url).netloc}: {e}", file=sys.stderr)
            time.sleep(1.5 * (k + 1))
    return None


def download(url, dst):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r, open(dst, "wb") as f:
        while chunk := r.read(1 << 16):
            f.write(chunk)


# ------------------------------------------------------------------ providers -> [{url, kind, w, h, dur, title, author, license, page}]
def pexels(q, kind, n, vertical):
    key = os.environ.get("PEXELS_API_KEY")
    if not key:
        return []
    ori = "portrait" if vertical else "landscape"
    if kind == "video":
        d = get_json(f"https://api.pexels.com/videos/search?query={urllib.parse.quote(q)}&per_page={n * 2}&orientation={ori}", {"Authorization": key})
        out = []
        for v in (d or {}).get("videos", []):
            files = sorted((f for f in v["video_files"] if f.get("height") and f["height"] >= 720), key=lambda f: f["height"])
            if files:
                f = files[0]
                out.append({"url": f["link"], "kind": "video", "w": f["width"], "h": f["height"], "dur": v["duration"], "title": q,
                            "author": v["user"]["name"], "license": "Pexels License", "page": v["url"]})
        return out
    d = get_json(f"https://api.pexels.com/v1/search?query={urllib.parse.quote(q)}&per_page={n * 2}&orientation={ori}", {"Authorization": key})
    return [{"url": p["src"]["large2x"], "kind": "photo", "title": p.get("alt") or q, "author": p["photographer"],
             "license": "Pexels License", "page": p["url"]} for p in (d or {}).get("photos", [])]


def pixabay(q, kind, n, vertical):
    key = os.environ.get("PIXABAY_API_KEY")
    if not key:
        return []
    if kind == "video":
        d = get_json(f"https://pixabay.com/api/videos/?key={key}&q={urllib.parse.quote(q)}&per_page={max(3, n * 2)}&safesearch=true")
        return [{"url": (h["videos"].get("medium") or h["videos"]["small"])["url"], "kind": "video", "dur": h["duration"], "title": h["tags"],
                 "author": h["user"], "license": "Pixabay Content License", "page": h["pageURL"]} for h in (d or {}).get("hits", [])]
    d = get_json(f"https://pixabay.com/api/?key={key}&q={urllib.parse.quote(q)}&image_type=photo&orientation={'vertical' if vertical else 'horizontal'}&per_page={max(3, n * 2)}&safesearch=true")
    return [{"url": h["largeImageURL"], "kind": "photo", "title": h["tags"], "author": h["user"], "license": "Pixabay Content License",
             "page": h["pageURL"]} for h in (d or {}).get("hits", [])]


def commons(q, kind, n, vertical):
    ft = "video" if kind == "video" else "bitmap"
    u = ("https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&format=json"
         f"&gsrsearch={urllib.parse.quote(f'filetype:{ft} {q}')}&gsrlimit={n * 4}&prop=imageinfo&iiprop=url|size|extmetadata"
         + ("&iiurlwidth=1920" if kind == "photo" else ""))
    d = get_json(u)
    out = []
    for p in ((d or {}).get("query", {}).get("pages", {}) or {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        if not re.search(r"CC0|Public domain|CC BY|PD", lic, re.I) or "NC" in lic or "ND" in lic:
            continue
        if kind == "video" and (ii.get("height", 0) < 480 or ii.get("duration", 0) < 3):
            continue
        author = re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value", "unknown")).strip()
        out.append({"url": ii.get("thumburl") if kind == "photo" else ii.get("url"), "kind": kind, "w": ii.get("width"), "h": ii.get("height"),
                    "dur": ii.get("duration"), "title": p["title"], "author": author, "license": lic, "page": ii.get("descriptionurl")})
    return sorted(out, key=lambda x: -(x.get("h") or 0))


def openverse(q, kind, n, vertical):
    if kind == "video":
        return []
    d = get_json(f"https://api.openverse.org/v1/images/?q={urllib.parse.quote(q)}&license_type=commercial&page_size={n * 2}"
                 f"&aspect_ratio={'tall' if vertical else 'wide'}&size=large")
    return [{"url": r["url"], "kind": "photo", "title": r.get("title") or q, "author": r.get("creator") or "unknown",
             "license": f"CC {r.get('license', '').upper()} {r.get('license_version', '')}".strip(), "page": r.get("foreign_landing_url")}
            for r in (d or {}).get("results", [])]


PROVIDERS = {"pexels": pexels, "pixabay": pixabay, "commons": commons, "openverse": openverse}


def normalise_video(src, dst, dur, w, h, start=None):
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src], capture_output=True, text=True)
    total = float(probe.stdout.strip() or 0)
    ss = start if start is not None else max(0.0, total / 2 - dur / 2) if total > dur + 1 else 0
    vf = f"fps=30,scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{ss:.2f}", "-i", src, "-t", str(dur), "-an", "-vf", vf,
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst], check=True)


def normalise_photo(src, dst, w, h):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
                    "-q:v", "2", "-frames:v", "1", dst], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("query")
    ap.add_argument("out")
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--kind", default="video", choices=["video", "photo"])
    ap.add_argument("--dur", type=float, default=4)
    ap.add_argument("--src", default="pexels,pixabay,commons,openverse")
    ap.add_argument("--en", help="English query override (skip translation)")
    ap.add_argument("--frames", action="store_true", help="also write a JPEG sequence per clip")
    ap.add_argument("--vertical", action="store_true", help="1080×1920 output")
    a = ap.parse_args()
    q = a.en or translate(a.query)
    W, H = (1080, 1920) if a.vertical else (1280, 720)
    print(f"query: {a.query!r} -> {q!r}")
    os.makedirs(a.out, exist_ok=True)
    creds_path = os.path.join(a.out, "credits.json")
    creds = json.load(open(creds_path)) if os.path.exists(creds_path) else []
    seen = {c["page"] for c in creds}
    got, results = 0, []
    for name in a.src.split(","):
        if got >= a.n:
            break
        items = PROVIDERS[name](q, a.kind, a.n, a.vertical)
        if not items and name in ("pexels", "pixabay") and not os.environ.get(name.upper() + "_API_KEY"):
            print(f"  · {name}: set {name.upper()}_API_KEY to enable (free key)")
        for it in items:
            if got >= a.n or it["page"] in seen or not it.get("url"):
                continue
            base = f"{slug(a.query)}_{len(creds) + 1:02d}"
            with tempfile.TemporaryDirectory() as td:
                raw = os.path.join(td, "raw" + os.path.splitext(urllib.parse.urlsplit(it["url"]).path)[1][:6])
                try:
                    download(it["url"], raw)
                    if a.kind == "video":
                        dst = os.path.join(a.out, base + ".mp4")
                        normalise_video(raw, dst, a.dur, W, H)
                    else:
                        dst = os.path.join(a.out, base + ".jpg")
                        normalise_photo(raw, dst, W, H)
                except Exception as e:  # noqa: BLE001
                    print(f"  ! skip {it['page']}: {e}", file=sys.stderr)
                    continue
            media = os.path.relpath(dst, os.path.dirname(os.path.abspath(a.out)))
            if a.kind == "video" and a.frames:
                fd = os.path.join(a.out, base)
                os.makedirs(fd, exist_ok=True)
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", dst, "-q:v", "3", os.path.join(fd, "%05d.jpg")], check=True)
                n = len(os.listdir(fd))
                media = {"seq": os.path.relpath(fd, os.path.dirname(os.path.abspath(a.out))) + "/%05d.jpg", "fps": 30, "count": n}
            rec = {"file": os.path.basename(dst), "query": a.query, "en": q, "provider": name, **{k: it.get(k) for k in ("title", "author", "license", "page")}}
            creds.append(rec)
            seen.add(it["page"])
            results.append(media)
            got += 1
            print(f"  + {name}: {os.path.basename(dst)}  ({it.get('license')}, {it.get('author')})")
    json.dump(creds, open(creds_path, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(results, ensure_ascii=False))
    if not got:
        print("nothing fetched — add a free PEXELS_API_KEY / PIXABAY_API_KEY, try --en with simpler English words, "
              "or use procedural b-roll: node scripts/broll.mjs search \"…\"")


if __name__ == "__main__":
    main()
